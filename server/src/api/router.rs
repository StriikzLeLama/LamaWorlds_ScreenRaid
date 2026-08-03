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
        .route("/security-policy", get(handlers::security_policy))
        .route("/register", post(handlers::register))
        .route("/login", post(handlers::login))
        .route("/2fa/verify", post(handlers::verify_2fa))
        .route("/refresh", post(handlers::refresh))
        .route("/logout", post(handlers::logout))
        .route("/logout-all", post(handlers::logout_all))
        .route("/me", get(handlers::me))
        .route("/sessions", get(handlers::list_sessions))
        .route("/sessions/{id}", delete(handlers::revoke_session))
        .route("/2fa/setup", post(handlers::setup_2fa))
        .route("/2fa/enable", post(handlers::enable_2fa))
        .route("/2fa/disable", post(handlers::disable_2fa))
        .route("/change-password", post(handlers::change_password))
        .route("/change-username", post(handlers::change_username))
        .route("/change-display-name", post(handlers::change_display_name));

    let room_routes = Router::new()
        .route("/", get(handlers::list_rooms).post(handlers::create_room))
        .route("/join", post(handlers::join_room))
        .route("/{id}", get(handlers::get_room).delete(handlers::delete_room))
        .route("/{id}/leave", post(handlers::leave_room))
        .route(
            "/{id}/members/{user_id}",
            delete(handlers::kick_member).patch(handlers::change_member_role),
        )
        .route("/{id}/security", get(handlers::get_room_security).patch(handlers::update_room_security))
        .route("/{id}/pranks", post(handlers::send_prank).get(handlers::list_pranks))
        .route(
            "/{id}/scheduled",
            post(handlers::schedule_prank).get(handlers::list_scheduled_pranks),
        )
        .route("/{id}/scheduled/{sched_id}", delete(handlers::cancel_scheduled_prank))
        .route(
            "/{id}/invites",
            post(handlers::create_room_invite).get(handlers::list_room_invites),
        )
        .route("/{id}/invites/{invite_id}", delete(handlers::deactivate_room_invite))
        .route("/{id}/activity", get(handlers::get_room_activity));

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
        .route("/storage", get(handlers::media_storage))
        .route("/", get(handlers::list_media))
        .route("/{id}/file", get(handlers::download_media))
        .route("/{id}", delete(handlers::delete_media));

    // KLIPY-backed GIF search — key stays on the server.
    let gif_routes = Router::new()
        .route("/search", get(handlers::search_gifs))
        .route("/import", post(handlers::import_gif));

    let admin_routes = Router::new()
        .route("/users", get(handlers::list_admin_users))
        .route("/users/{id}", delete(handlers::deactivate_user))
        .route("/users/{id}/reactivate", post(handlers::reactivate_user))
        .route("/users/{id}/password", post(handlers::admin_set_password))
        .route("/users/{id}/revoke-sessions", post(handlers::admin_revoke_sessions))
        .route("/users/{id}/disable-2fa", post(handlers::admin_disable_2fa))
        .route("/stats", get(handlers::admin_stats))
        .route("/media", get(handlers::list_admin_media))
        .route("/media/{id}", delete(handlers::delete_media_admin))
        .route("/rooms", get(handlers::list_admin_rooms))
        .route("/rooms/{id}", delete(handlers::force_delete_room))
        .route("/presence", get(handlers::list_admin_presence))
        .route("/audit", get(handlers::list_admin_audit));

    let static_path = state.config.static_path.clone();

    let router = Router::new()
        .route("/health", get(handlers::health))
        .route("/health/ready", get(handlers::ready))
        .route("/v1/health", get(handlers::health))
        .route("/v1/health/ready", get(handlers::ready))
        .route("/v1/invites/{token}/preview", get(handlers::get_invite_preview))
        .route("/v1/ws", get(ws_handler))
        .route("/v1/pranks/self-test", post(handlers::self_test_prank))
        .nest("/v1/auth", auth_routes)
        .nest("/v1/rooms", room_routes)
        .nest("/v1/friends", friend_routes)
        .nest("/v1/consent", consent_routes)
        .nest("/v1/media", media_routes)
        .nest("/v1/gifs", gif_routes)
        .nest("/v1/admin", admin_routes)
        .route("/v1/rooms/{id}/media", get(handlers::list_room_media))
        .route("/v1/rooms/{id}/pranks/{prank_id}/ack", post(handlers::ack_prank))
        .route("/v1/users/me/monitors", get(handlers::get_my_monitors).put(handlers::update_my_monitors))
        .route("/v1/users/me/security", get(handlers::get_my_security_prefs).patch(handlers::update_my_security_prefs))
        .route("/v1/audit/me", get(handlers::list_my_audit))
        .route("/v1/users/{id}/monitors", get(handlers::get_user_monitors))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    static_files::attach_static_fallback(router, &static_path)
}
