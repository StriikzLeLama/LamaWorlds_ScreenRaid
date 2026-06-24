use std::path::Path;

use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

/// SPA static assets with `index.html` fallback for client-side routes.
pub fn attach_static_fallback(router: Router, static_path: &Path) -> Router {
    let index = static_path.join("index.html");
    if !index.is_file() {
        return router;
    }

    router.fallback_service(
        ServeDir::new(static_path).not_found_service(ServeFile::new(index)),
    )
}
