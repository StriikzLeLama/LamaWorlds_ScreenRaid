use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{CreateRoomInviteRequest, RoomInviteResponse, RoomInvitesListResponse};
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub async fn create_room_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<CreateRoomInviteRequest>,
) -> Result<(StatusCode, Json<RoomInviteResponse>), AppError> {
    let invite = state.rooms.create_invite(auth.user_id, room_id, req).await?;
    Ok((StatusCode::CREATED, Json(invite)))
}

pub async fn list_room_invites(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<RoomInvitesListResponse>, AppError> {
    Ok(Json(state.rooms.list_invites(auth.user_id, room_id).await?))
}

pub async fn deactivate_room_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((room_id, invite_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    state
        .rooms
        .deactivate_invite(auth.user_id, room_id, invite_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
