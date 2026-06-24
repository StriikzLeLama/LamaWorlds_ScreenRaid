use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{
    FriendRequestsResponse, FriendsListResponse, SendFriendRequest,
};
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub async fn list_friends(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<FriendsListResponse>, AppError> {
    Ok(Json(state.friends.list(auth.user_id).await?))
}

pub async fn list_requests(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<FriendRequestsResponse>, AppError> {
    Ok(Json(state.friends.requests(auth.user_id).await?))
}

pub async fn send_request(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<SendFriendRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let id = state.friends.send_request(auth.user_id, req).await?;
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": id, "status": "pending" })),
    ))
}

pub async fn accept_request(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.friends.accept(auth.user_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn decline_request(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.friends.decline(auth.user_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_friend(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(friend_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.friends.remove(auth.user_id, friend_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn block_friend(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.friends.block(auth.user_id, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
