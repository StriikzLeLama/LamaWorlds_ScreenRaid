use std::sync::Arc;

use chrono::{Duration, Utc};
use screenraid_types::{
    MediaRef, OverlayType, PrankIncomingPayload, PrankResponse, PrankStatus, SendPrankRequest,
    UserSummary,
};
use screenraid_validation::MAX_PRANKS_PER_MINUTE;
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{
    media_repo::row_to_media, MediaRepository, PrankRepository, RoomRepository, UserRepository,
};
use crate::service::ConsentService;
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct PrankService {
    pranks: PrankRepository,
    rooms: RoomRepository,
    users: UserRepository,
    media: MediaRepository,
    consent: ConsentService,
    hub: Arc<WsHub>,
    allow_self_prank: bool,
}

impl PrankService {
    pub fn new(
        pranks: PrankRepository,
        rooms: RoomRepository,
        users: UserRepository,
        media: MediaRepository,
        consent: ConsentService,
        hub: Arc<WsHub>,
        allow_self_prank: bool,
    ) -> Self {
        Self {
            pranks,
            rooms,
            users,
            media,
            consent,
            hub,
            allow_self_prank,
        }
    }

    pub async fn send(
        &self,
        room_id: Uuid,
        sender_id: Uuid,
        req: SendPrankRequest,
    ) -> Result<PrankResponse, AppError> {
        let recent = self.pranks.count_recent_by_sender(sender_id).await?;
        if recent >= MAX_PRANKS_PER_MINUTE as i64 {
            return Err(AppError::RateLimited);
        }

        let sender_role = self
            .rooms
            .is_member(room_id, sender_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !sender_role.can_send_pranks() {
            return Err(AppError::Forbidden);
        }

        self.validate_request(&req)?;

        let media_ref = if let Some(media_id) = req.media_id {
            let row = self
                .media
                .find_by_id(media_id)
                .await?
                .ok_or_else(|| AppError::NotFound("media".into()))?;

            let media_room = row
                .room_id
                .as_deref()
                .and_then(|s| Uuid::parse_str(s).ok());
            let uploader = Uuid::parse_str(&row.uploader_id).unwrap_or_default();

            if uploader != sender_id {
                if media_room != Some(room_id) {
                    return Err(AppError::Forbidden);
                }
            }

            let m = row_to_media(row, "");
            Some(MediaRef {
                id: m.id,
                url: m.url,
                mime_type: m.mime_type,
                hash_sha256: m.hash_sha256,
            })
        } else {
            None
        };

        let members = self.rooms.list_members(room_id).await?;
        let targets = self.resolve_targets(&members, sender_id, req.target_id)?;

        if targets.is_empty() {
            return Err(AppError::Validation("no valid targets".into()));
        }

        let mut deliverable = Vec::new();
        let mut blocked_count = 0u32;

        for target_id in &targets {
            if self.consent.can_receive(*target_id, Some(room_id)).await? {
                deliverable.push(*target_id);
            } else {
                blocked_count += 1;
            }
        }

        let prank_id = Uuid::new_v4();
        let now = Utc::now();
        let duration = req.duration_ms.clamp(1000, 60_000);
        let expires_at = now + Duration::milliseconds(duration as i64 + 30_000);
        let config_json = serde_json::to_string(&req.config)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let overlay_type_str = overlay_type_str(req.overlay_type);

        let sender = self.user_summary(sender_id).await?;

        if deliverable.is_empty() {
            self.pranks
                .insert(
                    prank_id,
                    room_id,
                    sender_id,
                    req.target_id,
                    req.media_id,
                    overlay_type_str,
                    req.text_content.as_deref(),
                    &config_json,
                    duration,
                    PrankStatus::Blocked,
                    expires_at,
                )
                .await?;

            self.hub
                .send_to_user(
                    sender_id,
                    "prank:blocked",
                    json!({
                        "prank_id": prank_id,
                        "reason": "CONSENT_BLOCKED",
                        "blocked_count": blocked_count,
                    }),
                )
                .await;

            return Ok(PrankResponse {
                id: prank_id,
                room_id,
                status: PrankStatus::Blocked,
                expires_at,
                created_at: now,
            });
        }

        self.pranks
            .insert(
                prank_id,
                room_id,
                sender_id,
                req.target_id,
                req.media_id,
                overlay_type_str,
                req.text_content.as_deref(),
                &config_json,
                duration,
                PrankStatus::Pending,
                expires_at,
            )
            .await?;

        let incoming = PrankIncomingPayload {
            prank_id,
            room_id,
            sender: sender.clone(),
            overlay_type: req.overlay_type,
            media: media_ref.clone(),
            text_content: req.text_content.clone(),
            duration_ms: duration,
            config: req.config.clone(),
            expires_at,
        };

        for target_id in &deliverable {
            self.hub
                .send_to_user(
                    *target_id,
                    "prank:incoming",
                    serde_json::to_value(&incoming).unwrap_or_default(),
                )
                .await;
        }

        self.pranks
            .update_status(prank_id, PrankStatus::Delivered, Some(now))
            .await?;

        self.hub
            .send_to_user(
                sender_id,
                "prank:sent",
                json!({
                    "prank_id": prank_id,
                    "status": "delivered",
                    "delivered_count": deliverable.len(),
                }),
            )
            .await;

        Ok(PrankResponse {
            id: prank_id,
            room_id,
            status: PrankStatus::Delivered,
            expires_at,
            created_at: now,
        })
    }

    pub async fn list_room_history(
        &self,
        room_id: Uuid,
        limit: u32,
    ) -> Result<Vec<crate::repository::prank_repo::PrankRow>, AppError> {
        self.pranks.list_by_room(room_id, limit).await
    }

    pub async fn ack(&self, user_id: Uuid, prank_id: Uuid, _rendered: bool) -> Result<(), AppError> {
        let row = self
            .pranks
            .find_by_id(prank_id)
            .await?
            .ok_or_else(|| AppError::NotFound("prank".into()))?;

        let target_id = row
            .target_id
            .as_deref()
            .and_then(|s| Uuid::parse_str(s).ok());

        let is_broadcast = row.target_id.is_none();
        if !is_broadcast && target_id != Some(user_id) {
            let in_room = self.rooms.is_member(
                Uuid::parse_str(&row.room_id).unwrap_or_default(),
                user_id,
            ).await?.is_some();
            if !in_room {
                return Err(AppError::Forbidden);
            }
        } else if is_broadcast {
            let room_id = Uuid::parse_str(&row.room_id).unwrap_or_default();
            if self.rooms.is_member(room_id, user_id).await?.is_none() {
                return Err(AppError::Forbidden);
            }
        }

        self.pranks
            .update_status(prank_id, PrankStatus::Acked, None)
            .await?;

        Ok(())
    }

    fn validate_request(&self, req: &SendPrankRequest) -> Result<(), AppError> {
        match req.overlay_type {
            OverlayType::Text => {
                if req.text_content.as_ref().map(|t| t.trim().is_empty()).unwrap_or(true) {
                    return Err(AppError::Validation("text_content required for text pranks".into()));
                }
                if req.media_id.is_some() {
                    return Err(AppError::Validation("text pranks cannot include media".into()));
                }
            }
            OverlayType::Sound => {
                if req.media_id.is_none() {
                    return Err(AppError::Validation("media_id required for sound pranks".into()));
                }
            }
            OverlayType::Image | OverlayType::Gif | OverlayType::Video => {
                if req.media_id.is_none() {
                    return Err(AppError::Validation("media_id required for media pranks".into()));
                }
            }
        }
        Ok(())
    }

    fn resolve_targets(
        &self,
        members: &[crate::repository::room_repo::MemberRow],
        sender_id: Uuid,
        target_id: Option<Uuid>,
    ) -> Result<Vec<Uuid>, AppError> {
        let solo_room = members.len() == 1;
        let allow_self = self.allow_self_prank || solo_room;

        if let Some(tid) = target_id {
            if tid == sender_id && !allow_self {
                return Err(AppError::Validation("cannot prank yourself".into()));
            }
            let is_member = members.iter().any(|m| m.user_id == tid.to_string());
            if !is_member {
                return Err(AppError::NotFound("target not in room".into()));
            }
            return Ok(vec![tid]);
        }

        Ok(members
            .iter()
            .filter_map(|m| {
                let uid = Uuid::parse_str(&m.user_id).ok()?;
                if uid == sender_id {
                    if allow_self {
                        Some(uid)
                    } else {
                        None
                    }
                } else {
                    Some(uid)
                }
            })
            .collect())
    }

    async fn user_summary(&self, user_id: Uuid) -> Result<UserSummary, AppError> {
        let user = self
            .users
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("user".into()))?;
        Ok(UserSummary {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
        })
    }
}

fn overlay_type_str(t: OverlayType) -> &'static str {
    match t {
        OverlayType::Image => "image",
        OverlayType::Gif => "gif",
        OverlayType::Video => "video",
        OverlayType::Text => "text",
        OverlayType::Sound => "sound",
    }
}
