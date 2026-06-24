use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoomRole {
    Owner,
    Admin,
    Member,
    Guest,
}

impl RoomRole {
    pub fn can_send_pranks(self) -> bool {
        matches!(self, Self::Owner | Self::Admin | Self::Member)
    }

    pub fn can_moderate(self) -> bool {
        matches!(self, Self::Owner | Self::Admin)
    }

    pub fn can_manage_room(self) -> bool {
        matches!(self, Self::Owner)
    }
}
