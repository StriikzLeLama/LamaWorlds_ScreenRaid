use axum::{
    extract::{Path, State},
    Json,
};
use screenraid_types::{ConsentState, RoomConsentRequest};
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub async fn get_consent(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<ConsentState>, AppError> {
    Ok(Json(state.consent.get_state(auth.user_id).await?))
}

pub async fn grant_consent(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<ConsentState>, AppError> {
    Ok(Json(state.consent.grant(auth.user_id).await?))
}

pub async fn revoke_consent(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<ConsentState>, AppError> {
    Ok(Json(state.consent.revoke(auth.user_id).await?))
}

pub async fn pause_consent(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<ConsentState>, AppError> {
    Ok(Json(state.consent.pause(auth.user_id).await?))
}

pub async fn resume_consent(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<ConsentState>, AppError> {
    Ok(Json(state.consent.resume(auth.user_id).await?))
}

pub async fn room_consent(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<RoomConsentRequest>,
) -> Result<Json<ConsentState>, AppError> {
    Ok(Json(
        state
            .consent
            .set_room(auth.user_id, room_id, req)
            .await?,
    ))
}

pub async fn check_can_receive(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let allowed = state
        .consent
        .can_receive(auth.user_id, Some(room_id))
        .await?;
    Ok(Json(serde_json::json!({ "can_receive": allowed })))
}
