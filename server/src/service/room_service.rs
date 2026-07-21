use std::sync::Arc;

use chrono::{Duration, Utc};
use screenraid_types::{
    ConsentState, CreateRoomInviteRequest, CreateRoomRequest, JoinRoomRequest, PresenceStatus,
    RoomDetail, RoomInviteResponse, RoomInvitesListResponse, RoomMember, RoomRole, RoomSummary,
    RoomsListResponse, UserSummary,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{RoomRepository, UserRepository};
use crate::repository::room_repo::{parse_dt, parse_role, role_to_str, RoomInviteRow};
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
        if let Some(token) = req.invite_token.as_deref().filter(|t| !t.is_empty()) {
            return self.join_via_invite(user_id, token).await;
        }

        let code = req
            .invite_code
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_uppercase();
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

        self.broadcast_member_joined(room_id, user_id).await?;

        Ok(RoomSummary {
            id: room_id,
            name: room.name,
            invite_code: room.invite_code,
            role: RoomRole::Member,
            member_count: count + 1,
        })
    }

    async fn join_via_invite(&self, user_id: Uuid, token: &str) -> Result<RoomSummary, AppError> {
        let invite = self
            .rooms
            .find_invite_by_token(token)
            .await?
            .ok_or_else(|| AppError::NotFound("invite".into()))?;

        if invite.is_active == 0 {
            return Err(AppError::Validation("invite is no longer active".into()));
        }

        if let Some(expires_at) = invite.expires_at.as_deref() {
            if parse_dt(expires_at) <= Utc::now() {
                let invite_id = Uuid::parse_str(&invite.id).unwrap_or_default();
                self.rooms.deactivate_invite(invite_id).await?;
                return Err(AppError::Validation("invite has expired".into()));
            }
        }

        if invite.use_count >= invite.max_uses {
            return Err(AppError::Validation("invite has reached its use limit".into()));
        }

        let room_id = Uuid::parse_str(&invite.room_id).unwrap_or_default();
        let room = self
            .rooms
            .find_by_id(room_id)
            .await?
            .ok_or_else(|| AppError::NotFound("room".into()))?;

        if self.rooms.is_member(room_id, user_id).await?.is_some() {
            return Err(AppError::Conflict("already in room".into()));
        }

        let count = self.rooms.member_count(room_id).await?;
        if count >= room.max_members {
            return Err(AppError::Validation("room is full".into()));
        }

        let role = parse_role(&invite.role);
        self.rooms.add_member(room_id, user_id, role).await?;

        let invite_id = Uuid::parse_str(&invite.id).unwrap_or_default();
        self.rooms.increment_invite_use(invite_id).await?;
        let new_use_count = invite.use_count + 1;
        if new_use_count >= invite.max_uses {
            self.rooms.deactivate_invite(invite_id).await?;
        }

        self.broadcast_member_joined(room_id, user_id).await?;

        Ok(RoomSummary {
            id: room_id,
            name: room.name,
            invite_code: room.invite_code,
            role,
            member_count: count + 1,
        })
    }

    async fn broadcast_member_joined(&self, room_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
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
        Ok(())
    }

    pub async fn create_invite(
        &self,
        actor_id: Uuid,
        room_id: Uuid,
        req: CreateRoomInviteRequest,
    ) -> Result<RoomInviteResponse, AppError> {
        let actor_role = self
            .rooms
            .is_member(room_id, actor_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !actor_role.can_moderate() {
            return Err(AppError::Forbidden);
        }

        let role = req.role.unwrap_or(RoomRole::Guest);
        if !matches!(role, RoomRole::Guest | RoomRole::Member) {
            return Err(AppError::Validation(
                "invite role must be guest or member".into(),
            ));
        }

        let max_uses = req.max_uses.unwrap_or(1).clamp(1, 1000);
        let expires_at = req
            .expires_in_hours
            .map(|h| Utc::now() + Duration::hours(h.clamp(1, 24 * 365) as i64));

        let id = Uuid::new_v4();
        let token = RoomRepository::generate_invite_token();
        self.rooms
            .create_invite(id, room_id, &token, role, actor_id, expires_at, max_uses)
            .await?;

        Ok(RoomInviteResponse {
            id,
            room_id,
            token,
            role,
            expires_at,
            max_uses,
            use_count: 0,
            is_active: true,
            created_at: Utc::now(),
        })
    }

    pub async fn list_invites(
        &self,
        actor_id: Uuid,
        room_id: Uuid,
    ) -> Result<RoomInvitesListResponse, AppError> {
        let actor_role = self
            .rooms
            .is_member(room_id, actor_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !actor_role.can_moderate() {
            return Err(AppError::Forbidden);
        }

        let rows = self.rooms.list_active_invites(room_id).await?;
        Ok(RoomInvitesListResponse {
            invites: rows.into_iter().map(invite_row_to_response).collect(),
        })
    }

    pub async fn deactivate_invite(
        &self,
        actor_id: Uuid,
        room_id: Uuid,
        invite_id: Uuid,
    ) -> Result<(), AppError> {
        let actor_role = self
            .rooms
            .is_member(room_id, actor_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !actor_role.can_moderate() {
            return Err(AppError::Forbidden);
        }

        let changed = self
            .rooms
            .deactivate_invite_in_room(room_id, invite_id)
            .await?;
        if !changed {
            return Err(AppError::NotFound("invite".into()));
        }
        Ok(())
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

fn invite_row_to_response(row: RoomInviteRow) -> RoomInviteResponse {
    RoomInviteResponse {
        id: Uuid::parse_str(&row.id).unwrap_or_default(),
        room_id: Uuid::parse_str(&row.room_id).unwrap_or_default(),
        token: row.token,
        role: parse_role(&row.role),
        expires_at: row.expires_at.as_deref().map(parse_dt),
        max_uses: row.max_uses,
        use_count: row.use_count,
        is_active: row.is_active != 0,
        created_at: parse_dt(&row.created_at),
    }
}
