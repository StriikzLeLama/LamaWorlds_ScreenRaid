use std::sync::Arc;

use chrono::{Duration, Utc};
use screenraid_types::{
    ActivityItem, ActivityKind, MediaRef, OverlayType, PrankIncomingPayload, PrankResponse,
    PrankStatus, SchedulePrankRequest, ScheduleTriggerType, ScheduledPrankItem,
    ScheduledPrankListResponse, ScheduledPrankResponse, ScheduledPrankStatus, SendPrankRequest,
    UserSummary,
};
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::prank_repo::{parse_trigger_type, ScheduledPrankRow};
use crate::repository::{
    media_repo::row_to_media, AuditRepository, MediaRepository, PrankRepository, RoomRepository,
    SecurityRepository, UserRepository,
};
use crate::service::ConsentService;
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct PrankService {
    pranks: PrankRepository,
    rooms: RoomRepository,
    users: UserRepository,
    media: MediaRepository,
    security: SecurityRepository,
    audit: AuditRepository,
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
        security: SecurityRepository,
        audit: AuditRepository,
        consent: ConsentService,
        hub: Arc<WsHub>,
        allow_self_prank: bool,
    ) -> Self {
        Self {
            pranks,
            rooms,
            users,
            media,
            security,
            audit,
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
        let room_security = self.security.get_room_security(room_id).await?;
        if room_security.muted_senders.contains(&sender_id) {
            return Err(AppError::Forbidden);
        }

        let user_prefs = self.security.get_user_prefs(sender_id).await?;
        let limits = SecurityRepository::resolve_limits(&room_security, &user_prefs);

        let recent = self.pranks.count_recent_by_sender(sender_id).await?;
        if recent >= limits.max_pranks_per_minute as i64 {
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
            } else if media_room.is_none() {
                // Share personal uploads with the room so targets can download the file.
                self.media.set_room_id(media_id, room_id).await?;
            }

            let row = self
                .media
                .find_by_id(media_id)
                .await?
                .ok_or_else(|| AppError::NotFound("media".into()))?;
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

        for target_id in &targets {
            if let Some(ms) = self
                .pranks
                .ms_since_last_to_target(sender_id, *target_id, room_id)
                .await?
            {
                if ms < limits.target_cooldown_ms as i64 {
                    return Err(AppError::RateLimited);
                }
            }
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
        let duration = req
            .duration_ms
            .clamp(1000, limits.max_duration_ms as i32);
        let mut config = req.config.clone();
        config.volume = config.volume.min(limits.max_volume);
        let expires_at = now + Duration::milliseconds(duration as i64 + 30_000);
        let config_json = serde_json::to_string(&config)
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
                );

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
            config: config.clone(),
            expires_at,
            self_test: false,
        };

        for target_id in &deliverable {
            self.hub
                .send_to_user(
                    *target_id,
                    "prank:incoming",
                    serde_json::to_value(&incoming).unwrap_or_default(),
                );
            let _ = self
                .audit
                .insert(
                    Some(sender_id),
                    "prank_sent",
                    Some("prank"),
                    Some(&prank_id.to_string()),
                    Some(json!({
                        "target_id": target_id,
                        "room_id": room_id,
                        "overlay_type": overlay_type_str,
                    })),
                    None,
                )
                .await;
            let _ = self
                .audit
                .insert(
                    Some(*target_id),
                    "prank_received",
                    Some("prank"),
                    Some(&prank_id.to_string()),
                    Some(json!({
                        "sender_id": sender_id,
                        "sender_name": sender.display_name,
                        "room_id": room_id,
                        "overlay_type": overlay_type_str,
                    })),
                    None,
                )
                .await;
        }

        let online = deliverable
            .iter()
            .filter(|id| self.hub.is_online(**id))
            .count();
        if online == 0 {
            tracing::warn!(
                %prank_id,
                targets = deliverable.len(),
                "prank delivered to hub but no target has an active WS session — restart the Tauri receiver"
            );
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
            );

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

    /// Deliver an overlay to the sender only — no room membership required.
    pub async fn send_self_test(
        &self,
        user_id: Uuid,
        req: SendPrankRequest,
    ) -> Result<PrankResponse, AppError> {
        self.validate_request(&req)?;
        let mut config = req.config.clone();
        let duration = req.duration_ms.clamp(500, 60_000);
        config.volume = config.volume.clamp(0.0, 1.0);

        let media_ref = if let Some(media_id) = req.media_id {
            let row = self
                .media
                .find_by_id(media_id)
                .await?
                .ok_or_else(|| AppError::NotFound("media".into()))?;
            if row.uploader_id != user_id.to_string() {
                return Err(AppError::Forbidden);
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

        let prank_id = Uuid::new_v4();
        let now = Utc::now();
        let expires_at = now + Duration::milliseconds(duration as i64 + 30_000);
        let room_id = Uuid::nil();
        let sender = self.user_summary(user_id).await?;
        let text = req
            .text_content
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                if matches!(req.overlay_type, OverlayType::Text) {
                    Some("ScreenRaid self-test".into())
                } else {
                    None
                }
            });

        let incoming = PrankIncomingPayload {
            prank_id,
            room_id,
            sender,
            overlay_type: req.overlay_type,
            media: media_ref,
            text_content: text,
            duration_ms: duration,
            config,
            expires_at,
            self_test: true,
        };

        self.hub.send_to_user(
            user_id,
            "prank:incoming",
            serde_json::to_value(&incoming).unwrap_or_default(),
        );

        Ok(PrankResponse {
            id: prank_id,
            room_id,
            status: PrankStatus::Delivered,
            expires_at,
            created_at: now,
        })
    }

    pub async fn schedule(
        &self,
        room_id: Uuid,
        sender_id: Uuid,
        req: SchedulePrankRequest,
    ) -> Result<ScheduledPrankResponse, AppError> {
        let sender_role = self
            .rooms
            .is_member(room_id, sender_id)
            .await?
            .ok_or(AppError::Forbidden)?;

        if !sender_role.can_send_pranks() {
            return Err(AppError::Forbidden);
        }

        let send_req = SendPrankRequest {
            target_id: req.target_id,
            media_id: req.media_id,
            overlay_type: req.overlay_type,
            text_content: req.text_content.clone(),
            duration_ms: req.duration_ms,
            config: req.config.clone(),
        };
        self.validate_request(&send_req)?;

        let members = self.rooms.list_members(room_id).await?;
        self.resolve_targets(&members, sender_id, req.target_id)?;

        let (run_at, online_user_id) = match req.trigger_type {
            ScheduleTriggerType::AtTime => {
                let run_at = req.run_at.ok_or_else(|| {
                    AppError::Validation("run_at required for at_time trigger".into())
                })?;
                if run_at <= Utc::now() {
                    return Err(AppError::Validation("run_at must be in the future".into()));
                }
                (Some(run_at), None)
            }
            ScheduleTriggerType::OnOnline => {
                let online_user_id = req.online_user_id.ok_or_else(|| {
                    AppError::Validation("online_user_id required for on_online trigger".into())
                })?;
                let is_member = members
                    .iter()
                    .any(|m| m.user_id == online_user_id.to_string());
                if !is_member {
                    return Err(AppError::Validation(
                        "online_user_id must be a room member".into(),
                    ));
                }
                (None, Some(online_user_id))
            }
        };

        let payload_json =
            serde_json::to_string(&send_req).map_err(|e| AppError::Internal(e.to_string()))?;

        let id = Uuid::new_v4();
        let now = Utc::now();
        self.pranks
            .insert_scheduled(
                id,
                room_id,
                sender_id,
                req.target_id,
                req.trigger_type,
                run_at,
                online_user_id,
                &payload_json,
            )
            .await?;

        Ok(ScheduledPrankResponse {
            id,
            room_id,
            trigger_type: req.trigger_type,
            run_at,
            online_user_id,
            status: ScheduledPrankStatus::Pending,
            created_at: now,
        })
    }

    pub async fn list_scheduled(
        &self,
        room_id: Uuid,
        user_id: Uuid,
    ) -> Result<ScheduledPrankListResponse, AppError> {
        if self.rooms.is_member(room_id, user_id).await?.is_none() {
            return Err(AppError::Forbidden);
        }

        let rows = self.pranks.list_pending_for_room(room_id).await?;
        let items = rows.into_iter().filter_map(scheduled_row_to_item).collect();
        Ok(ScheduledPrankListResponse { items })
    }

    pub async fn cancel_scheduled(
        &self,
        room_id: Uuid,
        actor_id: Uuid,
        sched_id: Uuid,
    ) -> Result<(), AppError> {
        let row = self
            .pranks
            .find_scheduled_by_id(sched_id)
            .await?
            .ok_or_else(|| AppError::NotFound("scheduled prank".into()))?;

        if row.room_id != room_id.to_string() {
            return Err(AppError::NotFound("scheduled prank".into()));
        }

        if row.status != "pending" {
            return Err(AppError::Conflict(
                "scheduled prank already resolved".into(),
            ));
        }

        let sender_id = Uuid::parse_str(&row.sender_id).unwrap_or_default();
        if sender_id != actor_id {
            let actor_role = self
                .rooms
                .is_member(room_id, actor_id)
                .await?
                .ok_or(AppError::Forbidden)?;
            if !actor_role.can_moderate() {
                return Err(AppError::Forbidden);
            }
        }

        self.pranks
            .update_scheduled_status(sched_id, "cancelled", None)
            .await?;
        Ok(())
    }

    /// Called by the periodic background worker (see `main.rs`) to fire any
    /// `at_time` schedules whose `run_at` has passed.
    pub async fn fire_due_at_time(&self) -> Result<(), AppError> {
        let rows = self.pranks.list_due_at_time(Utc::now()).await?;
        for row in rows {
            self.fire_scheduled_row(row).await;
        }
        Ok(())
    }

    /// Called from the WebSocket handler when a user's presence flips to
    /// online, to fire any `on_online` schedules waiting on that user.
    pub async fn fire_due_on_online(&self, online_user_id: Uuid) -> Result<(), AppError> {
        let rows = self.pranks.list_due_on_online(online_user_id).await?;
        for row in rows {
            self.fire_scheduled_row(row).await;
        }
        Ok(())
    }

    async fn fire_scheduled_row(&self, row: ScheduledPrankRow) {
        let id = Uuid::parse_str(&row.id).unwrap_or_default();
        let room_id = Uuid::parse_str(&row.room_id).unwrap_or_default();
        let sender_id = Uuid::parse_str(&row.sender_id).unwrap_or_default();

        let result: Result<(), AppError> = match serde_json::from_str::<SendPrankRequest>(&row.payload_json)
        {
            Ok(req) => self.send(room_id, sender_id, req).await.map(|_| ()),
            Err(e) => Err(AppError::Internal(e.to_string())),
        };

        match result {
            Ok(()) => {
                let _ = self
                    .pranks
                    .update_scheduled_status(id, "fired", Some(Utc::now()))
                    .await;
            }
            Err(e) => {
                tracing::warn!(%id, error = %e, "scheduled prank failed to fire");
                let _ = self
                    .pranks
                    .update_scheduled_status(id, "failed", Some(Utc::now()))
                    .await;
            }
        }
    }

    /// Simple room activity feed derived from prank history, enriched with
    /// sender/target display names.
    pub async fn list_activity(
        &self,
        room_id: Uuid,
        user_id: Uuid,
        limit: u32,
    ) -> Result<Vec<ActivityItem>, AppError> {
        if self.rooms.is_member(room_id, user_id).await?.is_none() {
            return Err(AppError::Forbidden);
        }

        let rows = self.pranks.list_by_room(room_id, limit).await?;
        let mut items = Vec::with_capacity(rows.len());

        for row in rows {
            let sender_id = Uuid::parse_str(&row.sender_id).ok();
            let target_id = row
                .target_id
                .as_deref()
                .and_then(|s| Uuid::parse_str(s).ok());

            let actor_name = match sender_id {
                Some(id) => self
                    .users
                    .find_by_id(id)
                    .await
                    .ok()
                    .flatten()
                    .map(|u| u.display_name),
                None => None,
            };
            let target_name = match target_id {
                Some(id) => self
                    .users
                    .find_by_id(id)
                    .await
                    .ok()
                    .flatten()
                    .map(|u| u.display_name),
                None => None,
            };

            items.push(ActivityItem {
                id: Uuid::parse_str(&row.id).unwrap_or_default(),
                kind: ActivityKind::Prank,
                at: crate::repository::room_repo::parse_dt(&row.created_at),
                actor_name,
                target_name,
                overlay_type: Some(row.overlay_type),
                status: Some(row.status),
                text: row.text_content,
            });
        }

        Ok(items)
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
                // Optional caption (text_content) is allowed with media overlays.
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
        // Explicit self-target is always allowed (solo testing). Broadcast-to-self
        // still requires ALLOW_SELF_PRANK or a solo room.
        let allow_self = self.allow_self_prank || solo_room;

        if let Some(tid) = target_id {
            if tid == sender_id {
                let is_member = members.iter().any(|m| m.user_id == tid.to_string());
                if !is_member {
                    return Err(AppError::NotFound("target not in room".into()));
                }
                return Ok(vec![tid]);
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

fn parse_scheduled_status(s: &str) -> ScheduledPrankStatus {
    match s {
        "fired" => ScheduledPrankStatus::Fired,
        "cancelled" => ScheduledPrankStatus::Cancelled,
        "failed" => ScheduledPrankStatus::Failed,
        _ => ScheduledPrankStatus::Pending,
    }
}

fn scheduled_row_to_item(row: ScheduledPrankRow) -> Option<ScheduledPrankItem> {
    let payload: SendPrankRequest = serde_json::from_str(&row.payload_json).ok()?;
    Some(ScheduledPrankItem {
        id: Uuid::parse_str(&row.id).ok()?,
        room_id: Uuid::parse_str(&row.room_id).ok()?,
        sender_id: Uuid::parse_str(&row.sender_id).ok()?,
        target_id: row.target_id.as_deref().and_then(|s| Uuid::parse_str(s).ok()),
        trigger_type: parse_trigger_type(&row.trigger_type),
        run_at: row
            .run_at
            .as_deref()
            .map(crate::repository::room_repo::parse_dt),
        online_user_id: row
            .online_user_id
            .as_deref()
            .and_then(|s| Uuid::parse_str(s).ok()),
        status: parse_scheduled_status(&row.status),
        created_at: crate::repository::room_repo::parse_dt(&row.created_at),
        fired_at: row
            .fired_at
            .as_deref()
            .map(crate::repository::room_repo::parse_dt),
        overlay_type: payload.overlay_type,
        text_content: payload.text_content,
    })
}
