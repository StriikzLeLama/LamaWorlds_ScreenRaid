use std::path::Path;

use axum::{
    routing::get_service,
    Router,
};
use tower_http::services::{ServeDir, ServeFile};

/// SPA static assets with `index.html` fallback for client-side routes.
pub fn attach_static_fallback(router: Router, static_path: &Path) -> Router {
    let index = static_path.join("index.html");
    if !index.is_file() {
        return router;
    }

    let serve = ServeDir::new(static_path).not_found_service(ServeFile::new(index.clone()));

    router
        .route_service("/", get_service(ServeFile::new(index)))
        .fallback_service(serve)
}
