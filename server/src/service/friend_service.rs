use std::sync::Arc;

use chrono::{DateTime, Utc};
use screenraid_types::{
    FriendRequestItem, FriendRequestsResponse, FriendSummary, FriendsListResponse,
    PresenceStatus, SendFriendRequest, UserSummary,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{FriendRepository, UserRepository};
use crate::repository::friend_repo::FriendshipRow;
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct FriendService {
    friends: FriendRepository,
    users: UserRepository,
    hub: Arc<WsHub>,
}

impl FriendService {
    pub fn new(friends: FriendRepository, users: UserRepository, hub: Arc<WsHub>) -> Self {
        Self {
            friends,
            users,
            hub,
        }
    }

    pub async fn list(&self, user_id: Uuid) -> Result<FriendsListResponse, AppError> {
        let pairs = self.friends.list_accepted_friends(user_id).await?;
        let mut friends = Vec::new();

        for (_, friend_id) in pairs {
            if let Some(user) = self.users.find_by_id(friend_id).await? {
                friends.push(FriendSummary {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    status: if self.hub.is_online(user.id) {
                        PresenceStatus::Online
                    } else {
                        PresenceStatus::Offline
                    },
                });
            }
        }

        Ok(FriendsListResponse { friends })
    }

    pub async fn requests(&self, user_id: Uuid) -> Result<FriendRequestsResponse, AppError> {
        let rows = self.friends.list_pending(user_id).await?;
        let mut incoming = Vec::new();
        let mut outgoing = Vec::new();

        for row in rows {
            let item = self.row_to_request_item(&row, user_id).await?;
            if row.addressee_id == user_id.to_string() {
                incoming.push(item);
            } else {
                outgoing.push(item);
            }
        }

        Ok(FriendRequestsResponse { incoming, outgoing })
    }

    pub async fn send_request(
        &self,
        requester_id: Uuid,
        req: SendFriendRequest,
    ) -> Result<Uuid, AppError> {
        if requester_id == req.user_id {
            return Err(AppError::Validation("cannot friend yourself".into()));
        }

        self.users
            .find_by_id(req.user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("user".into()))?;

        if let Some(existing) = self.friends.find_between(requester_id, req.user_id).await? {
            match existing.status.as_str() {
                "accepted" => return Err(AppError::Conflict("already friends".into())),
                "blocked" => return Err(AppError::Forbidden),
                "pending" => return Err(AppError::Conflict("request already pending".into())),
                _ => {}
            }
        }

        let id = Uuid::new_v4();
        self.friends
            .create_request(id, requester_id, req.user_id)
            .await?;

        let requester = self
            .users
            .find_by_id(requester_id)
            .await?
            .ok_or(AppError::Internal("user missing".into()))?;

        self.hub
            .send_to_user(
                req.user_id,
                "friend:request",
                serde_json::json!({
                    "request_id": id,
                    "from": UserSummary {
                        id: requester.id,
                        username: requester.username,
                        display_name: requester.display_name,
                        avatar_url: requester.avatar_url,
                    }
                }),
            );

        Ok(id)
    }

    pub async fn accept(&self, user_id: Uuid, request_id: Uuid) -> Result<(), AppError> {
        let row = self
            .friends
            .find_by_id(request_id)
            .await?
            .ok_or_else(|| AppError::NotFound("request".into()))?;

        if row.addressee_id != user_id.to_string() || row.status != "pending" {
            return Err(AppError::Forbidden);
        }

        self.friends.set_status(request_id, "accepted").await?;

        let requester_id = Uuid::parse_str(&row.requester_id).unwrap_or_default();
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::Internal("user missing".into()))?;

        self.hub
            .send_to_user(
                requester_id,
                "friend:accepted",
                serde_json::json!({
                    "user": UserSummary {
                        id: user.id,
                        username: user.username,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url,
                    }
                }),
            );

        Ok(())
    }

    pub async fn decline(&self, user_id: Uuid, request_id: Uuid) -> Result<(), AppError> {
        let row = self
            .friends
            .find_by_id(request_id)
            .await?
            .ok_or_else(|| AppError::NotFound("request".into()))?;

        if row.addressee_id != user_id.to_string() {
            return Err(AppError::Forbidden);
        }

        self.friends.delete(request_id).await
    }

    pub async fn remove(&self, user_id: Uuid, friend_id: Uuid) -> Result<(), AppError> {
        let row = self.friends.find_between(user_id, friend_id).await?;
        let Some(row) = row else {
            return Err(AppError::NotFound("friendship".into()));
        };

        if row.status != "accepted" {
            return Err(AppError::NotFound("friendship".into()));
        }

        self.friends
            .delete(Uuid::parse_str(&row.id).unwrap_or_default())
            .await
    }

    pub async fn block(&self, user_id: Uuid, target_id: Uuid) -> Result<(), AppError> {
        if let Some(row) = self.friends.find_between(user_id, target_id).await? {
            self.friends
                .set_status(Uuid::parse_str(&row.id).unwrap_or_default(), "blocked")
                .await
        } else {
            let id = Uuid::new_v4();
            self.friends
                .insert_blocked(id, user_id, target_id)
                .await
        }
    }

    async fn row_to_request_item(
        &self,
        row: &FriendshipRow,
        viewer_id: Uuid,
    ) -> Result<FriendRequestItem, AppError> {
        let other_id = if row.requester_id == viewer_id.to_string() {
            Uuid::parse_str(&row.addressee_id).unwrap_or_default()
        } else {
            Uuid::parse_str(&row.requester_id).unwrap_or_default()
        };

        let user = self
            .users
            .find_by_id(other_id)
            .await?
            .ok_or(AppError::Internal("user missing".into()))?;

        let created_at: DateTime<Utc> = DateTime::parse_from_rfc3339(&row.created_at)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        Ok(FriendRequestItem {
            id: Uuid::parse_str(&row.id).unwrap_or_default(),
            user: UserSummary {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
            },
            created_at,
        })
    }
}
