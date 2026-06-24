use std::env;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub storage_path: PathBuf,
    pub cors_origins: Vec<String>,
    pub admin_usernames: HashSet<String>,
    /// Dev/solo testing: allow sending pranks to yourself.
    pub allow_self_prank: bool,
    /// Directory with built web UI (`index.html` + assets). Served at `/` when present.
    pub static_path: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        let static_path = resolve_static_path();
        Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite://./data/screenraid.db".into()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "dev-secret-change-in-production".into()),
            storage_path: PathBuf::from(
                env::var("STORAGE_PATH").unwrap_or_else(|_| "./data/media".into()),
            ),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:1420,tauri://localhost".into())
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect(),
            admin_usernames: env::var("ADMIN_USERNAMES")
                .unwrap_or_default()
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_ascii_lowercase())
                .collect(),
            allow_self_prank: env::var("ALLOW_SELF_PRANK")
                .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false),
            static_path,
        }
    }

    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

/// Pick the first path that contains a built `index.html` (Docker vs local dev).
fn resolve_static_path() -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(from_env) = env::var("STATIC_PATH") {
        if !from_env.trim().is_empty() {
            candidates.push(PathBuf::from(from_env.trim()));
        }
    }
    candidates.push(PathBuf::from("/app/web"));
    candidates.push(PathBuf::from("./web"));

    for path in &candidates {
        if has_spa_index(path) {
            return path.clone();
        }
    }

    candidates
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from("./web"))
}

fn has_spa_index(path: &Path) -> bool {
    path.join("index.html").is_file() || path.join("index.web.html").is_file()
}
