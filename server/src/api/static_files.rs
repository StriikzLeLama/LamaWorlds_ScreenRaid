use std::path::{Path, PathBuf};

use axum::{
    routing::get_service,
    Router,
};
use tower_http::services::{ServeDir, ServeFile};

/// `index.html`, or Vite output `index.web.html` before finalize step.
pub fn spa_index_path(static_path: &Path) -> Option<PathBuf> {
    let index = static_path.join("index.html");
    if index.is_file() {
        return Some(index);
    }
    let alt = static_path.join("index.web.html");
    if alt.is_file() {
        return Some(alt);
    }
    None
}

/// SPA static assets with `index.html` fallback for client-side routes.
pub fn attach_static_fallback(router: Router, static_path: &Path) -> Router {
    let Some(index) = spa_index_path(static_path) else {
        return router;
    };

    let serve = ServeDir::new(static_path).not_found_service(ServeFile::new(index.clone()));

    router
        .route_service("/", get_service(ServeFile::new(index.clone())))
        .fallback_service(serve)
}
