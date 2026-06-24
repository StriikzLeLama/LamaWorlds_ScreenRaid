use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{PresenceStatus, RoomRole};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub owner_id: Uuid,
    pub max_members: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomSummary {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub role: RoomRole,
    pub member_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomRequest {
    pub invite_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConsentStatus {
    Consented,
    Paused,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomMember {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: RoomRole,
    pub consent_status: ConsentStatus,
    pub presence: PresenceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomDetail {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub owner_id: Uuid,
    pub max_members: i32,
    pub members: Vec<RoomMember>,
}
