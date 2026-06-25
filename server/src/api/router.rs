use axum::{
    http::HeaderValue,
    routing::{delete, get, patch, post},
    Router,
};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

use crate::api::handlers;
use crate::api::static_files;
use crate::state::AppState;
use crate::websocket::ws_handler;

pub fn create_router(state: AppState) -> Router {
    // Build a CORS layer from the configured origins. Falls back to `Any`
    // only when no origins are configured (bare dev with no .env).
    let cors = if state.config.cors_origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        let origins: Vec<HeaderValue> = state
            .config
            .cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    let auth_routes = Router::new()
        .route("/register", post(handlers::register))
        .route("/login", post(handlers::login))
        .route("/refresh", post(handlers::refresh))
        .route("/logout", post(handlers::logout))
        .route("/me", get(handlers::me));

    let room_routes = Router::new()
        .route("/", get(handlers::list_rooms).post(handlers::create_room))
        .route("/join", post(handlers::join_room))
        .route("/{id}", get(handlers::get_room).delete(handlers::delete_room))
        .route("/{id}/leave", post(handlers::leave_room))
        .route(
            "/{id}/members/{user_id}",
            delete(handlers::kick_member).patch(handlers::change_member_role),
        )
        .route("/{id}/pranks", post(handlers::send_prank).get(handlers::list_pranks));

    let friend_routes = Router::new()
        .route("/", get(handlers::list_friends))
        .route("/requests", get(handlers::list_requests))
        .route("/request", post(handlers::send_request))
        .route("/{id}/accept", post(handlers::accept_request))
        .route("/{id}/decline", post(handlers::decline_request))
        .route("/{id}/block", post(handlers::block_friend))
        .route("/{id}", delete(handlers::remove_friend));

    let consent_routes = Router::new()
        .route("/", get(handlers::get_consent))
        .route("/grant", post(handlers::grant_consent))
        .route("/revoke", post(handlers::revoke_consent))
        .route("/pause", post(handlers::pause_consent))
        .route("/resume", post(handlers::resume_consent))
        .route("/rooms/{room_id}", patch(handlers::room_consent))
        .route("/rooms/{room_id}/check", get(handlers::check_can_receive));

    let media_routes = Router::new()
        .route("/upload", post(handlers::upload_media))
        .route("/", get(handlers::list_media))
        .route("/{id}/file", get(handlers::download_media))
        .route("/{id}", delete(handlers::delete_media));

    let admin_routes = Router::new()
        .route("/users", get(handlers::list_admin_users))
        .route("/users/{id}", delete(handlers::deactivate_user))
        .route("/media", get(handlers::list_admin_media))
        .route("/media/{id}", delete(handlers::delete_media_admin));

    let static_path = state.config.static_path.clone();

    let router = Router::new()
        .route("/health", get(handlers::health))
        .route("/health/ready", get(handlers::ready))
        .route("/v1/health", get(handlers::health))
        .route("/v1/health/ready", get(handlers::ready))
        .route("/v1/ws", get(ws_handler))
        .nest("/v1/auth", auth_routes)
        .nest("/v1/rooms", room_routes)
        .nest("/v1/friends", friend_routes)
        .nest("/v1/consent", consent_routes)
        .nest("/v1/media", media_routes)
        .nest("/v1/admin", admin_routes)
        .route("/v1/rooms/{id}/media", get(handlers::list_room_media))
        .route("/v1/rooms/{id}/pranks/{prank_id}/ack", post(handlers::ack_prank))
        .route("/v1/users/me/monitors", get(handlers::get_my_monitors).put(handlers::update_my_monitors))
        .route("/v1/users/{id}/monitors", get(handlers::get_user_monitors))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    static_files::attach_static_fallback(router, &static_path)
}
