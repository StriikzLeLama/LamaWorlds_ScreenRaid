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
