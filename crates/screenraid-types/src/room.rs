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
    /// False when the caller can see the room but has not joined yet.
    #[serde(default = "default_true")]
    pub is_member: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRoomRequest {
    /// One-click join (friends app — no invite code needed).
    #[serde(default)]
    pub room_id: Option<Uuid>,
    #[serde(default)]
    pub invite_code: Option<String>,
    /// When set, join via a guest/member invite link instead of the room's
    /// 8-char invite code.
    #[serde(default)]
    pub invite_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRoomInviteRequest {
    /// Must be `guest` or `member`; defaults to `guest`.
    #[serde(default)]
    pub role: Option<RoomRole>,
    #[serde(default)]
    pub expires_in_hours: Option<i32>,
    #[serde(default)]
    pub max_uses: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInviteResponse {
    pub id: Uuid,
    pub room_id: Uuid,
    pub token: String,
    pub role: RoomRole,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_uses: i32,
    pub use_count: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub room_name: String,
    pub created_by_username: String,
    pub created_by_display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitePreviewResponse {
    pub room_name: String,
    pub created_by_username: String,
    pub created_by_display_name: String,
    pub role: RoomRole,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_uses: i32,
    pub use_count: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInvitesListResponse {
    pub invites: Vec<RoomInviteResponse>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomsListResponse {
    pub rooms: Vec<RoomSummary>,
}
