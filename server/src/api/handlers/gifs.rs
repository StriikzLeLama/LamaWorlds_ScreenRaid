//! Authenticated KLIPY search / import endpoints (gifs, stickers, memes).

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::service::gif_service::GifSearchResponse;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct GifSearchQuery {
    pub q: Option<String>,
    /// `gifs` | `stickers` | `memes`
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_per_page")]
    pub per_page: u32,
}

fn default_kind() -> String {
    "gifs".into()
}

fn default_page() -> u32 {
    1
}

fn default_per_page() -> u32 {
    24
}

#[derive(Debug, Deserialize)]
pub struct ImportGifRequest {
    pub url: String,
    pub title: Option<String>,
    pub slug: Option<String>,
    pub room_id: Option<Uuid>,
    pub kind: Option<String>,
}

pub async fn search_gifs(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(query): Query<GifSearchQuery>,
) -> Result<Json<GifSearchResponse>, AppError> {
    Ok(Json(
        state
            .gifs
            .search(
                &query.kind,
                query.q.as_deref(),
                query.page,
                query.per_page,
            )
            .await?,
    ))
}

pub async fn import_gif(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<ImportGifRequest>,
) -> Result<(StatusCode, Json<screenraid_types::Media>), AppError> {
    let media = state
        .gifs
        .import_url(
            auth.user_id,
            body.room_id,
            &body.url,
            body.title.as_deref(),
            body.slug.as_deref(),
            body.kind.as_deref(),
        )
        .await?;
    Ok((StatusCode::CREATED, Json(media)))
}
