use axum::{
    extract::State,
    http::HeaderMap,
    Json,
};
use screenraid_types::{
    AuthResponse, ChangeDisplayNameRequest, ChangePasswordRequest, ChangeUsernameRequest,
    LoginRequest, RefreshRequest, RegisterRequest, UserProfile,
};

use crate::api::middleware::auth::AuthUser;
use crate::api::middleware::rate_limit::client_ip;
use crate::error::AppError;
use crate::state::AppState;

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    if !state.register_limiter.check(&client_ip(&headers)) {
        return Err(AppError::RateLimited);
    }
    let response = state.auth.register(req).await?;
    Ok(Json(response))
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    if !state.login_limiter.check(&client_ip(&headers)) {
        return Err(AppError::RateLimited);
    }
    let response = state.auth.login(req).await?;
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
    let response = state.auth.refresh(req).await?;
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

pub async fn me(auth: AuthUser, State(state): State<AppState>) -> Result<Json<UserProfile>, AppError> {
    let profile = state.auth.me(auth.user_id).await?;
    Ok(Json(profile))
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
    let response = state.auth.change_password(auth.user_id, req).await?;
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
