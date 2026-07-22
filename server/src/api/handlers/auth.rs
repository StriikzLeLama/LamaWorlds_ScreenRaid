use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};
use screenraid_types::{
    AuthResponse, ChangeDisplayNameRequest, ChangePasswordRequest, ChangeUsernameRequest,
    LoginRequest, LoginResponse, RefreshRequest, RegisterRequest, SecurityPolicyResponse,
    SessionsListResponse, TotpDisableRequest, TotpEnableRequest, TotpEnableResponse,
    TotpSetupResponse, TotpVerifyRequest, UserProfile,
};

use crate::api::middleware::auth::AuthUser;
use crate::api::middleware::rate_limit::client_ip;
use crate::error::AppError;
use crate::service::ClientMeta;
use crate::state::AppState;

fn client_meta(headers: &HeaderMap) -> ClientMeta {
    ClientMeta {
        ip: Some(client_ip(headers)),
        user_agent: headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .map(String::from),
    }
}

pub async fn security_policy(
    State(state): State<AppState>,
) -> Result<Json<SecurityPolicyResponse>, AppError> {
    Ok(Json(state.auth.security_policy(&state.config)))
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    if !state.register_limiter.check(&client_ip(&headers)) {
        return Err(AppError::RateLimited);
    }
    let response = state.auth.register(req, client_meta(&headers)).await?;
    Ok(Json(response))
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let ip = client_ip(&headers);
    // Per username+IP so one locked account / typo spam doesn't block everyone
    // behind the same NAT or a mis-forwarded proxy IP.
    let user_key = format!(
        "login:{}:{}",
        ip,
        req.username.trim().to_lowercase()
    );
    if !state.login_limiter.check(&format!("login-ip:{ip}"))
        || !state.login_limiter.check(&user_key)
    {
        return Err(AppError::RateLimited);
    }
    let response = state.auth.login(req, client_meta(&headers)).await?;
    Ok(Json(response))
}

pub async fn verify_2fa(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<TotpVerifyRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let response = state.auth.verify_2fa(req, client_meta(&headers)).await?;
    Ok(Json(response))
}

pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    if !state.refresh_limiter.check(&client_ip(&headers)) {
        return Err(AppError::RateLimited);
    }
    let response = state.auth.refresh(req, client_meta(&headers)).await?;
    Ok(Json(response))
}

pub async fn logout(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<RefreshRequest>,
) -> Result<axum::http::StatusCode, AppError> {
    let _ = auth;
    state.auth.logout(&req.refresh_token).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn logout_all(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<axum::http::StatusCode, AppError> {
    state.auth.logout_all(auth.user_id).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn me(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<UserProfile>, AppError> {
    let profile = state.auth.me(auth.user_id).await?;
    Ok(Json(profile))
}

pub async fn list_sessions(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<SessionsListResponse>, AppError> {
    let sessions = state
        .auth
        .list_sessions(auth.user_id, Some(auth.session_id))
        .await?;
    Ok(Json(sessions))
}

pub async fn revoke_session(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(session_id): Path<uuid::Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    state.auth.revoke_session(auth.user_id, session_id).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn setup_2fa(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<TotpSetupResponse>, AppError> {
    Ok(Json(state.auth.setup_2fa(auth.user_id).await?))
}

pub async fn enable_2fa(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<TotpEnableRequest>,
) -> Result<Json<TotpEnableResponse>, AppError> {
    Ok(Json(state.auth.enable_2fa(auth.user_id, req).await?))
}

pub async fn disable_2fa(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<TotpDisableRequest>,
) -> Result<axum::http::StatusCode, AppError> {
    state.auth.disable_2fa(auth.user_id, req).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    auth: AuthUser,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let ip = client_ip(&headers);
    if !state.account_limiter.check(&format!("pwd:{ip}"))
        || !state.account_limiter.check(&format!("pwd:{}", auth.user_id))
    {
        return Err(AppError::RateLimited);
    }
    let response = state
        .auth
        .change_password(auth.user_id, req, client_meta(&headers))
        .await?;
    Ok(Json(response))
}

pub async fn change_username(
    State(state): State<AppState>,
    headers: HeaderMap,
    auth: AuthUser,
    Json(req): Json<ChangeUsernameRequest>,
) -> Result<Json<UserProfile>, AppError> {
    let ip = client_ip(&headers);
    if !state.account_limiter.check(&format!("user:{ip}"))
        || !state.account_limiter.check(&format!("user:{}", auth.user_id))
    {
        return Err(AppError::RateLimited);
    }
    let profile = state.auth.change_username(auth.user_id, req).await?;
    Ok(Json(profile))
}

pub async fn change_display_name(
    State(state): State<AppState>,
    headers: HeaderMap,
    auth: AuthUser,
    Json(req): Json<ChangeDisplayNameRequest>,
) -> Result<Json<UserProfile>, AppError> {
    let ip = client_ip(&headers);
    if !state.account_limiter.check(&format!("dn:{ip}"))
        || !state.account_limiter.check(&format!("dn:{}", auth.user_id))
    {
        return Err(AppError::RateLimited);
    }
    let profile = state.auth.change_display_name(auth.user_id, req).await?;
    Ok(Json(profile))
}

#[derive(Debug, serde::Deserialize)]
pub struct AuditQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

pub async fn list_my_audit(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<screenraid_types::AuditListResponse>, AppError> {
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20);
    Ok(Json(
        state.security.list_audit(auth.user_id, page, limit).await?,
    ))
}

#[derive(Debug, serde::Deserialize)]
pub struct SecurityPrefsQuery {}

pub async fn get_my_security_prefs(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<screenraid_types::UserSecurityPrefs>, AppError> {
    Ok(Json(state.security.get_user_prefs(auth.user_id).await?))
}

pub async fn update_my_security_prefs(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<screenraid_types::UpdateUserSecurityPrefsRequest>,
) -> Result<Json<screenraid_types::UserSecurityPrefs>, AppError> {
    Ok(Json(
        state.security.update_user_prefs(auth.user_id, req).await?,
    ))
}

pub async fn get_room_security(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<uuid::Uuid>,
) -> Result<Json<screenraid_types::RoomSecuritySettings>, AppError> {
    let _ = state.rooms.get_detail(auth.user_id, room_id).await?;
    Ok(Json(state.security.get_room_security(room_id).await?))
}

pub async fn update_room_security(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<uuid::Uuid>,
    Json(req): Json<screenraid_types::UpdateRoomSecurityRequest>,
) -> Result<Json<screenraid_types::RoomSecuritySettings>, AppError> {
    let detail = state.rooms.get_detail(auth.user_id, room_id).await?;
    let role = detail
        .members
        .iter()
        .find(|m| m.user_id == auth.user_id)
        .map(|m| m.role.clone())
        .ok_or(AppError::Forbidden)?;
    if !role.can_moderate() {
        return Err(AppError::Forbidden);
    }
    Ok(Json(
        state
            .security
            .update_room_security(room_id, auth.user_id, req)
            .await?,
    ))
}
