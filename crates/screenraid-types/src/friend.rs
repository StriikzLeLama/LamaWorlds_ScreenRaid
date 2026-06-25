use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{PresenceStatus, UserSummary};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FriendshipStatus {
    Pending,
    Accepted,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendSummary {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status: PresenceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendRequestItem {
    pub id: Uuid,
    pub user: UserSummary,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendRequestsResponse {
    pub incoming: Vec<FriendRequestItem>,
    pub outgoing: Vec<FriendRequestItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendFriendRequest {
    pub user_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendsListResponse {
    pub friends: Vec<FriendSummary>,
}
