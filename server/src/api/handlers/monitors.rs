use axum::{
    extract::{Path, State},
    Json,
};
use screenraid_types::{MonitorLayoutResponse, UpdateMonitorLayoutRequest};
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub async fn get_my_monitors(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<MonitorLayoutResponse>, AppError> {
    state
        .monitors
        .get_layout(auth.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("monitor layout".into()))
        .map(Json)
}

pub async fn update_my_monitors(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<UpdateMonitorLayoutRequest>,
) -> Result<Json<MonitorLayoutResponse>, AppError> {
    Ok(Json(
        state.monitors.update_my_layout(auth.user_id, req).await?,
    ))
}

pub async fn get_user_monitors(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<MonitorLayoutResponse>, AppError> {
    Ok(Json(
        state.monitors.get_user_layout(auth.user_id, user_id).await?,
    ))
}
