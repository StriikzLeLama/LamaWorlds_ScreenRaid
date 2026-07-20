//! KLIPY GIF search proxy + remote GIF import.
//!
//! Docs: https://docs.klipy.com/gifs-api
//! Base: `GET https://api.klipy.com/api/v1/{key}/gifs/search?q=...`

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::config::Config;
use crate::error::AppError;
use crate::service::MediaService;

const KLIPY_BASE: &str = "https://api.klipy.com/api/v1";
const MAX_IMPORT_BYTES: usize = 15 * 1024 * 1024;

/// Normalized GIF card for the web composer (never leaks the API key).
#[derive(Debug, Clone, Serialize)]
pub struct GifSearchItem {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub preview_url: String,
    pub gif_url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct GifSearchResponse {
    pub enabled: bool,
    pub items: Vec<GifSearchItem>,
    pub page: u32,
    pub per_page: u32,
    pub has_next: bool,
    pub attribution: String,
}

#[derive(Clone)]
pub struct GifService {
    config: Arc<Config>,
    media: Arc<MediaService>,
    http: reqwest::Client,
}

impl GifService {
    pub fn new(config: Arc<Config>, media: Arc<MediaService>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("ScreenRaid/0.1 (+https://github.com/screenraid)")
            .build()
            .expect("reqwest client");
        Self { config, media, http }
    }

    pub fn enabled(&self) -> bool {
        self.config.klipy_enabled()
    }

    /// Search KLIPY (or return trending when `q` is empty).
    pub async fn search(
        &self,
        q: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<GifSearchResponse, AppError> {
        let page = page.max(1);
        let per_page = per_page.clamp(8, 48);

        if !self.enabled() {
            return Ok(GifSearchResponse {
                enabled: false,
                items: vec![],
                page,
                per_page,
                has_next: false,
                attribution: "Powered by KLIPY".into(),
            });
        }

        let key = &self.config.klipy_api_key;
        let endpoint = match q.map(str::trim).filter(|s| !s.is_empty()) {
            Some(_) => format!("{KLIPY_BASE}/{key}/gifs/search"),
            None => format!("{KLIPY_BASE}/{key}/gifs/trending"),
        };

        let mut req = self
            .http
            .get(&endpoint)
            .query(&[("page", page.to_string()), ("per_page", per_page.to_string())]);
        if let Some(query) = q.map(str::trim).filter(|s| !s.is_empty()) {
            req = req.query(&[("q", query)]);
        }

        let response = req
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("klipy request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            tracing::warn!(%status, %body, "klipy search failed");
            return Err(AppError::Internal(format!(
                "klipy returned {status}"
            )));
        }

        let raw: Value = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("klipy json: {e}")))?;

        let (items, has_next) = parse_klipy_page(&raw);
        Ok(GifSearchResponse {
            enabled: true,
            items,
            page,
            per_page,
            has_next,
            attribution: "Powered by KLIPY".into(),
        })
    }

    /// Download a remote GIF URL and store it in the user's media library.
    pub async fn import_url(
        &self,
        user_id: Uuid,
        room_id: Option<Uuid>,
        url: &str,
        title: Option<&str>,
        slug: Option<&str>,
    ) -> Result<screenraid_types::Media, AppError> {
        let url = url.trim();
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err(AppError::Validation("gif url must be http(s)".into()));
        }
        // Only allow known KLIPY CDN hosts (avoid SSRF via arbitrary URLs).
        if !is_allowed_gif_host(url) {
            return Err(AppError::Validation(
                "gif url host not allowed (expected static.klipy.com)".into(),
            ));
        }

        let response = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("gif download failed: {e}")))?;

        if !response.status().is_success() {
            return Err(AppError::Validation(format!(
                "gif download HTTP {}",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| AppError::Internal(format!("gif body: {e}")))?;

        if bytes.len() > MAX_IMPORT_BYTES {
            return Err(AppError::Validation(format!(
                "gif too large (max {} MB)",
                MAX_IMPORT_BYTES / (1024 * 1024)
            )));
        }

        // Trust magic bytes — KLIPY URLs may say .gif while serving webp.
        let mime = screenraid_validation::detect_mime_from_bytes(&bytes)
            .unwrap_or("image/gif")
            .to_string();
        if !matches!(
            mime.as_str(),
            "image/gif" | "image/webp" | "image/png" | "image/jpeg"
        ) {
            return Err(AppError::Validation(format!(
                "unsupported gif content type: {mime}"
            )));
        }

        let ext = match mime.as_str() {
            "image/webp" => "webp",
            "image/png" => "png",
            "image/jpeg" => "jpg",
            _ => "gif",
        };
        let name = title
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| slug.map(str::trim).filter(|s| !s.is_empty()))
            .map(|s| format!("{s}.{ext}"))
            .unwrap_or_else(|| format!("klipy.{ext}"));

        let media = self
            .media
            .upload(user_id, room_id, &name, &mime, &bytes)
            .await?;

        // Best-effort analytics ping so KLIPY can attribute shares.
        if let Some(slug) = slug.map(str::trim).filter(|s| !s.is_empty()) {
            if self.enabled() {
                let key = self.config.klipy_api_key.clone();
                let client = self.http.clone();
                let slug = slug.to_string();
                tokio::spawn(async move {
                    let url = format!("{KLIPY_BASE}/{key}/gifs/share/{slug}");
                    let _ = client.post(url).send().await;
                });
            }
        }

        Ok(media)
    }
}

fn is_allowed_gif_host(url: &str) -> bool {
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return false;
    };
    let host = rest
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    host.ends_with(".klipy.com") || host == "klipy.com"
}

#[derive(Debug, Deserialize)]
struct KlipyRendition {
    url: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

fn parse_klipy_page(raw: &Value) -> (Vec<GifSearchItem>, bool) {
    // Response shape: { result, data: { data: [...], has_next, ... } }
    let page = raw.get("data").unwrap_or(raw);
    let list = page
        .get("data")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let has_next = page
        .get("has_next")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut items = Vec::with_capacity(list.len());
    for entry in list {
        if let Some(item) = map_klipy_item(&entry) {
            items.push(item);
        }
    }
    (items, has_next)
}

fn map_klipy_item(entry: &Value) -> Option<GifSearchItem> {
    let slug = entry.get("slug")?.as_str()?.to_string();
    let id = entry
        .get("id")
        .map(|v| v.to_string().trim_matches('"').to_string())
        .unwrap_or_else(|| slug.clone());
    let title = entry
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Prefer `file` (official SDK); fall back to `files` if present.
    let file = entry.get("file").or_else(|| entry.get("files"))?;

    let preview = pick_rendition(file, &["sm", "xs", "md", "hd"]);
    let full = pick_rendition(file, &["md", "hd", "sm", "xs"]);

    let preview_url = preview
        .as_ref()
        .and_then(|r| r.url.clone())
        .or_else(|| entry.get("blur_preview").and_then(|v| v.as_str()).map(str::to_string))?;
    let gif_url = full
        .as_ref()
        .and_then(|r| r.url.clone())
        .unwrap_or_else(|| preview_url.clone());

    Some(GifSearchItem {
        id,
        slug,
        title,
        preview_url,
        gif_url,
        width: full.as_ref().and_then(|r| r.width).unwrap_or(0),
        height: full.as_ref().and_then(|r| r.height).unwrap_or(0),
    })
}

fn pick_rendition(file: &Value, sizes: &[&str]) -> Option<KlipyRendition> {
    for size in sizes {
        let bucket = file.get(size)?;
        // Prefer animated gif, then webp.
        for fmt in ["gif", "webp"] {
            if let Some(r) = bucket.get(fmt) {
                let parsed: KlipyRendition = serde_json::from_value(r.clone()).ok()?;
                if parsed.url.as_ref().is_some_and(|u| !u.is_empty()) {
                    return Some(parsed);
                }
            }
        }
    }
    None
}
