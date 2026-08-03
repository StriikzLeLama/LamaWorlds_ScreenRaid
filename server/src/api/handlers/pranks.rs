use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{PrankAckPayload, PrankResponse, SendPrankRequest};
use serde::Deserialize;
use uuid::Uuid;

use crate::api::middleware::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct PrankHistoryQuery {
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    20
}

#[derive(serde::Serialize)]
pub struct PrankHistoryItem {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub target_id: Option<Uuid>,
    pub overlay_type: String,
    pub status: String,
    pub created_at: String,
}

#[derive(serde::Serialize)]
pub struct PrankHistoryResponse {
    pub items: Vec<PrankHistoryItem>,
}

pub async fn send_prank(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<SendPrankRequest>,
) -> Result<(StatusCode, Json<PrankResponse>), AppError> {
    let response = state.pranks.send(room_id, auth.user_id, req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn list_pranks(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Query(query): Query<PrankHistoryQuery>,
) -> Result<Json<PrankHistoryResponse>, AppError> {
    if state
        .rooms
        .get_detail(auth.user_id, room_id)
        .await
        .is_err()
    {
        return Err(AppError::Forbidden);
    }

    let limit = query.limit.clamp(1, 50);
    let rows = state.pranks.list_room_history(room_id, limit).await?;
    let items = rows
        .into_iter()
        .map(|r| PrankHistoryItem {
            id: Uuid::parse_str(&r.id).unwrap_or_default(),
            sender_id: Uuid::parse_str(&r.sender_id).unwrap_or_default(),
            target_id: r
                .target_id
                .as_deref()
                .and_then(|s| Uuid::parse_str(s).ok()),
            overlay_type: r.overlay_type,
            status: r.status,
            created_at: r.created_at,
        })
        .collect();

    Ok(Json(PrankHistoryResponse { items }))
}

pub async fn ack_prank(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((_room_id, prank_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<PrankAckPayload>,
) -> Result<StatusCode, AppError> {
    if payload.prank_id != prank_id {
        return Err(AppError::Validation("prank_id mismatch".into()));
    }
    state
        .pranks
        .ack(auth.user_id, prank_id, payload.rendered)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Overlay self-test without a room. Always allowed for the authenticated user.
pub async fn self_test_prank(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<SendPrankRequest>,
) -> Result<(StatusCode, Json<PrankResponse>), AppError> {
    let response = state.pranks.send_self_test(auth.user_id, req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}
