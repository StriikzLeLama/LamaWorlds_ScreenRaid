use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{AuditRepository, SecurityRepository};
use screenraid_types::{
    AuditEntry, AuditListResponse, RoomSecuritySettings, UpdateRoomSecurityRequest,
    UpdateUserSecurityPrefsRequest, UserSecurityPrefs,
};

#[derive(Clone)]
pub struct SecurityService {
    security: SecurityRepository,
    audit: AuditRepository,
}

impl SecurityService {
    pub fn new(security: SecurityRepository, audit: AuditRepository) -> Self {
        Self { security, audit }
    }

    pub async fn get_user_prefs(&self, user_id: Uuid) -> Result<UserSecurityPrefs, AppError> {
        self.security.get_user_prefs(user_id).await
    }

    pub async fn update_user_prefs(
        &self,
        user_id: Uuid,
        req: UpdateUserSecurityPrefsRequest,
    ) -> Result<UserSecurityPrefs, AppError> {
        let mut prefs = self.security.get_user_prefs(user_id).await?;
        if let Some(v) = req.preset {
            prefs.preset = v;
        }
        if let Some(v) = req.allow_sound {
            prefs.allow_sound = v;
        }
        if let Some(v) = req.allow_video {
            prefs.allow_video = v;
        }
        if let Some(v) = req.allow_fullscreen {
            prefs.allow_fullscreen = v;
        }
        if let Some(v) = req.local_cooldown_ms {
            prefs.local_cooldown_ms = v;
        }
        if let Some(v) = req.max_pranks_per_minute {
            prefs.max_pranks_per_minute = Some(v);
        }
        if let Some(v) = req.target_cooldown_ms {
            prefs.target_cooldown_ms = Some(v);
        }
        if let Some(v) = req.max_duration_ms {
            prefs.max_duration_ms = Some(v);
        }
        if let Some(v) = req.max_volume {
            prefs.max_volume = Some(v);
        }
        self.security.upsert_user_prefs(user_id, &prefs).await?;
        self.audit
            .insert(
                Some(user_id),
                "security_prefs_updated",
                Some("user"),
                Some(&user_id.to_string()),
                None,
                None,
            )
            .await?;
        Ok(prefs)
    }

    pub async fn get_room_security(&self, room_id: Uuid) -> Result<RoomSecuritySettings, AppError> {
        self.security.get_room_security(room_id).await
    }

    pub async fn update_room_security(
        &self,
        room_id: Uuid,
        actor_id: Uuid,
        req: UpdateRoomSecurityRequest,
    ) -> Result<RoomSecuritySettings, AppError> {
        let mut settings = self.security.get_room_security(room_id).await?;
        if let Some(v) = req.preset {
            settings.preset = v;
        }
        if let Some(v) = req.max_pranks_per_minute {
            settings.max_pranks_per_minute = Some(v);
        }
        if let Some(v) = req.target_cooldown_ms {
            settings.target_cooldown_ms = Some(v);
        }
        if let Some(v) = req.max_duration_ms {
            settings.max_duration_ms = Some(v);
        }
        if let Some(v) = req.max_volume {
            settings.max_volume = Some(v);
        }
        if let Some(uid) = req.mute_user_id {
            if !settings.muted_senders.contains(&uid) {
                settings.muted_senders.push(uid);
            }
        }
        if let Some(uid) = req.unmute_user_id {
            settings.muted_senders.retain(|id| *id != uid);
        }
        self.security.upsert_room_security(room_id, &settings).await?;
        self.audit
            .insert(
                Some(actor_id),
                "room_security_updated",
                Some("room"),
                Some(&room_id.to_string()),
                None,
                None,
            )
            .await?;
        Ok(settings)
    }

    pub async fn list_audit(
        &self,
        user_id: Uuid,
        page: u32,
        limit: u32,
    ) -> Result<AuditListResponse, AppError> {
        let (rows, total) = self.audit.list_for_user(user_id, page, limit).await?;
        Ok(AuditListResponse {
            items: rows
                .into_iter()
                .map(|r| AuditEntry {
                    id: r.id,
                    action: r.action,
                    resource_type: r.resource_type,
                    resource_id: r.resource_id,
                    metadata: r
                        .metadata
                        .and_then(|m| serde_json::from_str(&m).ok()),
                    actor_username: r.actor_username,
                    created_at: r.created_at,
                })
                .collect(),
            total,
            page: page.max(1),
            limit: limit.clamp(1, 100),
        })
    }

    pub async fn list_audit_all(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<(Vec<crate::repository::audit_repo::AuditRow>, i64), AppError> {
        self.audit.list_all(page, limit).await
    }
}
