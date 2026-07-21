use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::Media;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminUserItem {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminUsersResponse {
    pub users: Vec<AdminUserItem>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminMediaItem {
    #[serde(flatten)]
    pub media: Media,
    pub uploader_username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminMediaListResponse {
    pub items: Vec<AdminMediaItem>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminRoomItem {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub owner_id: Uuid,
    pub owner_username: String,
    pub member_count: i64,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminRoomsResponse {
    pub rooms: Vec<AdminRoomItem>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminPresenceUser {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: String,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminPresenceResponse {
    pub online: Vec<AdminPresenceUser>,
    pub online_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminAuditItem {
    pub id: Uuid,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub actor_username: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminAuditResponse {
    pub items: Vec<AdminAuditItem>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}
