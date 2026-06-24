use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{
    CreateRoomRequest, JoinRoomRequest, RoomDetail, RoomRole, RoomSummary, RoomsListResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ChangeRoleBody {
    pub role: String,
}

pub async fn list_rooms(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<RoomsListResponse>, AppError> {
    Ok(Json(state.rooms.list(auth.user_id).await?))
}

pub async fn create_room(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<CreateRoomRequest>,
) -> Result<(StatusCode, Json<RoomSummary>), AppError> {
    let room = state.rooms.create(auth.user_id, req).await?;
    Ok((StatusCode::CREATED, Json(room)))
}

pub async fn get_room(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<RoomDetail>, AppError> {
    Ok(Json(state.rooms.get_detail(auth.user_id, room_id).await?))
}

pub async fn join_room(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<JoinRoomRequest>,
) -> Result<Json<RoomSummary>, AppError> {
    Ok(Json(state.rooms.join(auth.user_id, req).await?))
}

pub async fn leave_room(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.rooms.leave(auth.user_id, room_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_room(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.rooms.delete(auth.user_id, room_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn kick_member(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((room_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    state.rooms.kick(auth.user_id, room_id, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn change_member_role(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((room_id, user_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ChangeRoleBody>,
) -> Result<StatusCode, AppError> {
    let role = match body.role.as_str() {
        "admin" => RoomRole::Admin,
        "guest" => RoomRole::Guest,
        _ => RoomRole::Member,
    };
    state
        .rooms
        .change_role(auth.user_id, room_id, user_id, role)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
