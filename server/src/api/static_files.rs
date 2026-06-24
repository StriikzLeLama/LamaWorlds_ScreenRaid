use std::path::Path;

use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

/// SPA static assets with `index.html` fallback when `STATIC_PATH/index.html` exists.
pub fn static_fallback_router(static_path: &Path) -> Option<Router> {
    let index = static_path.join("index.html");
    if !index.is_file() {
        return None;
    }

    let service = ServeDir::new(static_path).not_found_service(ServeFile::new(index));
    Some(Router::new().fallback_service(service))
}
