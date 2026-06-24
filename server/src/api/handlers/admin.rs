use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use screenraid_types::{AdminMediaListResponse, AdminUsersResponse};
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
        return Err(AppError::Validation("cannot deactivate your own admin account".into()));
    }

    let changed = state.auth.deactivate_user(user_id).await?;
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
