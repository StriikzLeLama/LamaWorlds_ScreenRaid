use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{
    AdminAuditItem, AdminAuditResponse, AdminMediaListResponse, AdminPresenceResponse,
    AdminPresenceUser, AdminRoomsResponse, AdminUsersResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::api::middleware::auth::AdminUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct AdminListQuery {
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_page() -> u32 {
    1
}

fn default_limit() -> u32 {
    50
}

pub async fn list_admin_users(
    _admin: AdminUser,
    State(state): State<AppState>,
    Query(query): Query<AdminListQuery>,
) -> Result<Json<AdminUsersResponse>, AppError> {
    Ok(Json(state.auth.list_users(query.page, query.limit).await?))
}

pub async fn list_admin_media(
    _admin: AdminUser,
    State(state): State<AppState>,
    Query(query): Query<AdminListQuery>,
) -> Result<Json<AdminMediaListResponse>, AppError> {
    Ok(Json(state.media.admin_list(query.page, query.limit).await?))
}

pub async fn deactivate_user(
    admin: AdminUser,
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if admin.user_id == user_id {
        return Err(AppError::Validation(
            "cannot deactivate your own admin account".into(),
        ));
    }

    let changed = state.auth.deactivate_user(user_id).await?;
    if !changed {
        return Err(AppError::NotFound("user".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reactivate_user(
    admin: AdminUser,
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let _ = admin;
    let changed = state.auth.reactivate_user(user_id).await?;
    if !changed {
        return Err(AppError::NotFound("user".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_media_admin(
    _admin: AdminUser,
    State(state): State<AppState>,
    Path(media_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.media.admin_delete(media_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_admin_rooms(
    _admin: AdminUser,
    State(state): State<AppState>,
    Query(query): Query<AdminListQuery>,
) -> Result<Json<AdminRoomsResponse>, AppError> {
    let (rooms, total) = state
        .rooms
        .admin_list_rooms(query.page, query.limit)
        .await?;
    Ok(Json(AdminRoomsResponse {
        rooms,
        total,
        page: query.page.max(1),
        limit: query.limit.clamp(1, 100),
    }))
}

pub async fn force_delete_room(
    _admin: AdminUser,
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    state.rooms.admin_force_delete(room_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_admin_presence(
    _admin: AdminUser,
    State(state): State<AppState>,
) -> Result<Json<AdminPresenceResponse>, AppError> {
    let sessions = state.ws_hub.online_sessions();
    let mut online = Vec::new();
    for (user_id, session_count) in sessions {
        if let Some(user) = state.auth.me(user_id).await.ok() {
            online.push(AdminPresenceUser {
                user_id,
                username: user.username,
                display_name: user.display_name,
                session_count,
            });
        }
    }
    online.sort_by(|a, b| a.username.cmp(&b.username));
    let online_count = online.len() as u32;
    Ok(Json(AdminPresenceResponse {
        online,
        online_count,
    }))
}

pub async fn list_admin_audit(
    _admin: AdminUser,
    State(state): State<AppState>,
    Query(query): Query<AdminListQuery>,
) -> Result<Json<AdminAuditResponse>, AppError> {
    let (rows, total) = state
        .security
        .list_audit_all(query.page, query.limit)
        .await?;
    Ok(Json(AdminAuditResponse {
        items: rows
            .into_iter()
            .map(|r| AdminAuditItem {
                id: r.id,
                action: r.action,
                resource_type: r.resource_type,
                resource_id: r.resource_id,
                actor_username: r.actor_username,
                created_at: r.created_at,
            })
            .collect(),
        total,
        page: query.page.max(1),
        limit: query.limit.clamp(1, 100),
    }))
}
