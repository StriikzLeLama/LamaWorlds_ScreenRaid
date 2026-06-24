use std::sync::Arc;

use chrono::{DateTime, Utc};
use screenraid_types::{MonitorLayoutResponse, MonitorSyncPayload, UpdateMonitorLayoutRequest};
use serde_json::json;
use uuid::Uuid;

use crate::error::AppError;
use crate::repository::{monitor_repo::row_to_descriptor, MonitorRepository, RoomRepository};
use crate::websocket::WsHub;

#[derive(Clone)]
pub struct MonitorService {
    repo: MonitorRepository,
    rooms: RoomRepository,
    hub: Arc<WsHub>,
}

impl MonitorService {
    pub fn new(repo: MonitorRepository, rooms: RoomRepository, hub: Arc<WsHub>) -> Self {
        Self { repo, rooms, hub }
    }

    pub async fn update_my_layout(
        &self,
        user_id: Uuid,
        req: UpdateMonitorLayoutRequest,
    ) -> Result<MonitorLayoutResponse, AppError> {
        if req.monitors.is_empty() {
            return Err(AppError::Validation("at least one monitor required".into()));
        }

        self.repo.upsert_layout(user_id, &req.monitors).await?;
        let response = self
            .get_layout(user_id)
            .await?
            .ok_or_else(|| AppError::Internal("layout missing after upsert".into()))?;

        self.broadcast_changed(user_id, &response).await;
        Ok(response)
    }

    pub async fn sync_ws(
        &self,
        user_id: Uuid,
        payload: MonitorSyncPayload,
    ) -> Result<(), AppError> {
        self.update_my_layout(
            user_id,
            UpdateMonitorLayoutRequest {
                monitors: payload.monitors,
            },
        )
        .await?;
        Ok(())
    }

    pub async fn get_layout(&self, user_id: Uuid) -> Result<Option<MonitorLayoutResponse>, AppError> {
        let Some((updated_at_str, rows)) = self.repo.get_layout(user_id).await? else {
            return Ok(None);
        };

        let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        Ok(Some(MonitorLayoutResponse {
            user_id,
            updated_at,
            monitors: rows.into_iter().map(row_to_descriptor).collect(),
        }))
    }

    pub async fn get_user_layout(
        &self,
        viewer_id: Uuid,
        target_id: Uuid,
    ) -> Result<MonitorLayoutResponse, AppError> {
        if viewer_id != target_id && !self.repo.share_room(viewer_id, target_id).await? {
            return Err(AppError::Forbidden);
        }

        self.get_layout(target_id)
            .await?
            .ok_or_else(|| AppError::NotFound("monitor layout".into()))
    }

    async fn broadcast_changed(&self, user_id: Uuid, layout: &MonitorLayoutResponse) {
        let Ok(rooms) = self.rooms.list_for_user(user_id).await else {
            return;
        };

        let payload = json!({
            "user_id": user_id,
            "updated_at": layout.updated_at,
            "monitors": layout.monitors,
        });

        for (room, _, _) in rooms {
            if let Ok(room_id) = Uuid::parse_str(&room.id) {
                self.hub
                    .broadcast_room(room_id, "monitor:changed", payload.clone())
                    .await;
            }
        }
    }
}
