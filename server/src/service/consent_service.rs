use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use screenraid_types::{
    ConsentState, ConsentStatus, ConsentSyncPayload, RoomConsentRequest,
};
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{ConsentRepository, RoomRepository};
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct ConsentService {
    consent: ConsentRepository,
    rooms: RoomRepository,
    hub: Arc<WsHub>,
}

impl ConsentService {
    pub fn new(
        consent: ConsentRepository,
        rooms: RoomRepository,
        hub: Arc<WsHub>,
    ) -> Self {
        Self {
            consent,
            rooms,
            hub,
        }
    }

    pub async fn get_state(&self, user_id: Uuid) -> Result<ConsentState, AppError> {
        let row = self.consent.get(user_id).await?;
        let room_consents: HashMap<Uuid, bool> =
            serde_json::from_value(row.room_consents).unwrap_or_default();

        Ok(ConsentState {
            global_consent: row.global_consent,
            is_paused: row.is_paused,
            room_consents,
            consented_at: row
                .consented_at
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|d| d.with_timezone(&Utc)),
            updated_at: DateTime::parse_from_rfc3339(&row.updated_at)
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        })
    }

    pub async fn grant(&self, user_id: Uuid) -> Result<ConsentState, AppError> {
        self.consent.set_global(user_id, true).await?;
        self.audit(user_id, "consent_granted", None).await?;
        self.broadcast_consent(user_id).await;
        self.get_state(user_id).await
    }

    pub async fn revoke(&self, user_id: Uuid) -> Result<ConsentState, AppError> {
        self.consent.set_global(user_id, false).await?;
        self.consent.set_paused(user_id, false).await?;
        self.audit(user_id, "consent_revoked", None).await?;
        self.broadcast_consent(user_id).await;
        self.get_state(user_id).await
    }

    pub async fn pause(&self, user_id: Uuid) -> Result<ConsentState, AppError> {
        self.consent.set_paused(user_id, true).await?;
        self.audit(user_id, "consent_paused", None).await?;
        self.broadcast_consent(user_id).await;
        self.get_state(user_id).await
    }

    pub async fn resume(&self, user_id: Uuid) -> Result<ConsentState, AppError> {
        self.consent.set_paused(user_id, false).await?;
        self.audit(user_id, "consent_resumed", None).await?;
        self.broadcast_consent(user_id).await;
        self.get_state(user_id).await
    }

    pub async fn set_room(
        &self,
        user_id: Uuid,
        room_id: Uuid,
        req: RoomConsentRequest,
    ) -> Result<ConsentState, AppError> {
        if self.rooms.is_member(room_id, user_id).await?.is_none() {
            return Err(AppError::Forbidden);
        }
        self.consent
            .set_room_consent(user_id, room_id, req.consented)
            .await?;
        self.audit(user_id, "room_consent_updated", Some(room_id))
            .await?;
        self.broadcast_consent(user_id).await;
        self.get_state(user_id).await
    }

    pub async fn sync(&self, user_id: Uuid, payload: ConsentSyncPayload) -> Result<(), AppError> {
        let room_json = serde_json::to_value(&payload.room_consents).unwrap_or(json!({}));
        self.consent
            .sync_from_client(
                user_id,
                payload.global_consent,
                payload.is_paused,
                room_json,
            )
            .await?;
        self.broadcast_consent(user_id).await;
        Ok(())
    }

    /// Used by prank pipeline (Phase 5) — returns false if target cannot receive overlays.
    pub async fn can_receive(&self, user_id: Uuid, room_id: Option<Uuid>) -> Result<bool, AppError> {
        let state = self.get_state(user_id).await?;
        if !state.global_consent || state.is_paused {
            return Ok(false);
        }
        if let Some(rid) = room_id {
            if let Some(&consented) = state.room_consents.get(&rid) {
                if !consented {
                    return Ok(false);
                }
            }
        }
        Ok(true)
    }

    pub fn consent_status(state: &ConsentState, room_id: Uuid) -> ConsentStatus {
        if state.is_paused {
            ConsentStatus::Paused
        } else if !state.global_consent {
            ConsentStatus::None
        } else if let Some(&c) = state.room_consents.get(&room_id) {
            if c {
                ConsentStatus::Consented
            } else {
                ConsentStatus::None
            }
        } else {
            ConsentStatus::Consented
        }
    }

    async fn broadcast_consent(&self, user_id: Uuid) {
        let Ok(state) = self.get_state(user_id).await else {
            return;
        };
        let Ok(rooms) = self.rooms.list_for_user(user_id).await else {
            return;
        };
        for (room, _, _) in rooms {
            let room_id = Uuid::parse_str(&room.id).unwrap_or_default();
            let room_consented = state
                .room_consents
                .get(&room_id)
                .copied()
                .unwrap_or(true);
            self.hub
                .broadcast_room(
                    room_id,
                    "consent:updated",
                    json!({
                        "user_id": user_id,
                        "room_id": room_id,
                        "global_consent": state.global_consent,
                        "is_paused": state.is_paused,
                        "room_consented": room_consented,
                    }),
                )
                .await;
        }
    }

    async fn audit(
        &self,
        user_id: Uuid,
        action: &str,
        resource_id: Option<Uuid>,
    ) -> Result<(), AppError> {
        self.consent.insert_audit(user_id, action, resource_id).await
    }
}
