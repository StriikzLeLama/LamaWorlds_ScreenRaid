use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{SchedulePrankRequest, ScheduledPrankListResponse, ScheduledPrankResponse};
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub async fn schedule_prank(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<SchedulePrankRequest>,
) -> Result<(StatusCode, Json<ScheduledPrankResponse>), AppError> {
    let response = state.pranks.schedule(room_id, auth.user_id, req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn list_scheduled_pranks(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<ScheduledPrankListResponse>, AppError> {
    Ok(Json(state.pranks.list_scheduled(room_id, auth.user_id).await?))
}

pub async fn cancel_scheduled_prank(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((room_id, sched_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    state
        .pranks
        .cancel_scheduled(room_id, auth.user_id, sched_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
