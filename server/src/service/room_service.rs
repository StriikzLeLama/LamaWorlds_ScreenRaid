use std::sync::Arc;

use screenraid_types::{
    ConsentState, CreateRoomRequest, JoinRoomRequest, PresenceStatus, RoomDetail,
    RoomMember, RoomRole, RoomSummary, RoomsListResponse, UserSummary,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{RoomRepository, UserRepository};
use crate::repository::room_repo::{parse_role, role_to_str};
use crate::service::ConsentService;
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct RoomService {
    rooms: RoomRepository,
    users: UserRepository,
    consent: ConsentService,
    hub: Arc<WsHub>,
}

impl RoomService {
    pub fn new(
        rooms: RoomRepository,
        users: UserRepository,
        consent: ConsentService,
        hub: Arc<WsHub>,
    ) -> Self {
        Self {
            rooms,
            users,
            consent,
            hub,
        }
    }

    pub async fn is_member(&self, room_id: Uuid, user_id: Uuid) -> Result<bool, AppError> {
        Ok(self.rooms.is_member(room_id, user_id).await?.is_some())
    }

    pub async fn create(&self, user_id: Uuid, req: CreateRoomRequest) -> Result<RoomSummary, AppError> {
        if req.name.is_empty() || req.name.len() > 64 {
            return Err(AppError::Validation("room name must be 1-64 characters".into()));
        }

        let room_id = Uuid::new_v4();
        let (_, invite_code) = self.rooms.create_room(room_id, &req.name, user_id).await?;

        Ok(RoomSummary {
            id: room_id,
            name: req.name,
            invite_code,
            role: RoomRole::Owner,
            member_count: 1,
        })
    }

    pub async fn list(&self, user_id: Uuid) -> Result<RoomsListResponse, AppError> {
        let rows = self.rooms.list_for_user(user_id).await?;
        let rooms = rows
            .into_iter()
            .map(|(room, role_str, count)| RoomSummary {
                id: Uuid::parse_str(&room.id).unwrap_or_default(),
                name: room.name,
                invite_code: room.invite_code,
                role: parse_role(&role_str),
                member_count: count,
            })
            .collect();
        Ok(RoomsListResponse { rooms })
    }

    pub async fn get_detail(&self, user_id: Uuid, room_id: Uuid) -> Result<RoomDetail, AppError> {
        if self
            .rooms
            .is_member(room_id, user_id)
            .await?
            .is_none()
        {
            return Err(AppError::Forbidden);
        }

        let room = self
            .rooms
            .find_by_id(room_id)
            .await?
            .ok_or_else(|| AppError::NotFound("room".into()))?;

        let members = self.build_member_list(room_id).await?;

        Ok(RoomDetail {
            id: room_id,
            name: room.name,
            invite_code: room.invite_code,
            owner_id: Uuid::parse_str(&room.owner_id).unwrap_or_default(),
            max_members: room.max_members,
            members,
        })
    }

    pub async fn join(&self, user_id: Uuid, req: JoinRoomRequest) -> Result<RoomSummary, AppError> {
        let code = req.invite_code.trim().to_uppercase();
        if code.len() != 8 {
            return Err(AppError::Validation("invalid invite code".into()));
        }

        let room = self
            .rooms
            .find_by_invite(&code)
            .await?
            .ok_or_else(|| AppError::NotFound("room".into()))?;

        let room_id = Uuid::parse_str(&room.id).unwrap_or_default();

        if self.rooms.is_member(room_id, user_id).await?.is_some() {
            return Err(AppError::Conflict("already in room".into()));
        }

        let count = self.rooms.member_count(room_id).await?;
        if count >= room.max_members {
            return Err(AppError::Validation("room is full".into()));
        }

        self.rooms
            .add_member(room_id, user_id, RoomRole::Member)
            .await?;

        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or(AppError::Internal("user missing".into()))?;

        self.hub
            .broadcast_room(
                room_id,
                "room:member_joined",
                serde_json::json!({
                    "room_id": room_id,
                    "user": UserSummary {
                        id: user.id,
                        username: user.username,
                        display_name: user.display_name,
                        avatar_url: user.avatar_url,
                    }
                }),
            )
            .await;

        Ok(RoomSummary {
            id: room_id,
            name: room.name,
            invite_code: room.invite_code,
            role: RoomRole::Member,
            member_count: count + 1,
        })
    }

    pub async fn leave(&self, user_id: Uuid, room_id: Uuid) -> Result<(), AppError> {
        let role = self
            .rooms
            .is_member(room_id, user_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if role == RoomRole::Owner {
            return Err(AppError::Validation(
                "owner must transfer ownership or delete room".into(),
            ));
        }

        self.rooms.remove_member(room_id, user_id).await?;

        self.hub
            .broadcast_room(
                room_id,
                "room:member_left",
                serde_json::json!({ "room_id": room_id, "user_id": user_id }),
            )
            .await;

        Ok(())
    }

    pub async fn delete(&self, user_id: Uuid, room_id: Uuid) -> Result<(), AppError> {
        let role = self
            .rooms
            .is_member(room_id, user_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !role.can_manage_room() {
            return Err(AppError::Forbidden);
        }

        self.rooms.delete_room(room_id).await
    }

    pub async fn kick(
        &self,
        actor_id: Uuid,
        room_id: Uuid,
        target_id: Uuid,
    ) -> Result<(), AppError> {
        let actor_role = self
            .rooms
            .is_member(room_id, actor_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !actor_role.can_moderate() {
            return Err(AppError::Forbidden);
        }

        let target_role = self
            .rooms
            .is_member(room_id, target_id)
            .await?
            .ok_or(AppError::NotFound("member".into()))?;

        if target_role == RoomRole::Owner {
            return Err(AppError::Forbidden);
        }

        if target_role == RoomRole::Admin && actor_role != RoomRole::Owner {
            return Err(AppError::Forbidden);
        }

        self.rooms.remove_member(room_id, target_id).await?;

        self.hub
            .broadcast_room(
                room_id,
                "room:member_left",
                serde_json::json!({ "room_id": room_id, "user_id": target_id }),
            )
            .await;

        Ok(())
    }

    pub async fn change_role(
        &self,
        actor_id: Uuid,
        room_id: Uuid,
        target_id: Uuid,
        new_role: RoomRole,
    ) -> Result<(), AppError> {
        let actor_role = self
            .rooms
            .is_member(room_id, actor_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !actor_role.can_moderate() {
            return Err(AppError::Forbidden);
        }

        if new_role == RoomRole::Owner {
            return Err(AppError::Validation("use transfer for ownership".into()));
        }

        self.rooms
            .update_member_role(room_id, target_id, new_role)
            .await?;

        self.hub
            .broadcast_room(
                room_id,
                "room:member_role_changed",
                serde_json::json!({
                    "room_id": room_id,
                    "user_id": target_id,
                    "role": role_to_str(new_role)
                }),
            )
            .await;

        Ok(())
    }

    pub async fn admin_list_rooms(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<(Vec<screenraid_types::AdminRoomItem>, i64), AppError> {
        let (rows, total) = self.rooms.admin_list_rooms(page, limit).await?;
        let rooms = rows
            .into_iter()
            .filter_map(|(r, owner_username, member_count)| {
                Some(screenraid_types::AdminRoomItem {
                    id: Uuid::parse_str(&r.id).ok()?,
                    name: r.name,
                    invite_code: r.invite_code,
                    owner_id: Uuid::parse_str(&r.owner_id).ok()?,
                    owner_username,
                    member_count,
                    is_active: r.is_active != 0,
                    created_at: r.created_at,
                })
            })
            .collect();
        Ok((rooms, total))
    }

    pub async fn admin_force_delete(&self, room_id: Uuid) -> Result<(), AppError> {
        self.rooms.delete_room(room_id).await?;
        Ok(())
    }

    async fn build_member_list(&self, room_id: Uuid) -> Result<Vec<RoomMember>, AppError> {
        let rows = self.rooms.list_members(room_id).await?;
        let mut members = Vec::new();

        for row in rows {
            let uid = Uuid::parse_str(&row.user_id).unwrap_or_default();
            let presence = if self.hub.is_online(uid) {
                PresenceStatus::Online
            } else {
                PresenceStatus::Offline
            };

            let consent_state = self.consent.get_state(uid).await.unwrap_or(ConsentState {
                global_consent: false,
                is_paused: false,
                room_consents: std::collections::HashMap::new(),
                consented_at: None,
                updated_at: chrono::Utc::now(),
            });
            let consent_status = ConsentService::consent_status(&consent_state, room_id);

            members.push(RoomMember {
                user_id: uid,
                username: row.username,
                display_name: row.display_name,
                role: parse_role(&row.role),
                consent_status,
                presence,
            });
        }
        Ok(members)
    }
}
