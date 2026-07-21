use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{OverlayConfig, OverlayType};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleTriggerType {
    AtTime,
    OnOnline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduledPrankStatus {
    Pending,
    Fired,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulePrankRequest {
    pub target_id: Option<Uuid>,
    pub media_id: Option<Uuid>,
    pub overlay_type: OverlayType,
    pub text_content: Option<String>,
    pub duration_ms: i32,
    pub config: OverlayConfig,
    pub trigger_type: ScheduleTriggerType,
    #[serde(default)]
    pub run_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub online_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledPrankResponse {
    pub id: Uuid,
    pub room_id: Uuid,
    pub trigger_type: ScheduleTriggerType,
    pub run_at: Option<DateTime<Utc>>,
    pub online_user_id: Option<Uuid>,
    pub status: ScheduledPrankStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledPrankItem {
    pub id: Uuid,
    pub room_id: Uuid,
    pub sender_id: Uuid,
    pub target_id: Option<Uuid>,
    pub trigger_type: ScheduleTriggerType,
    pub run_at: Option<DateTime<Utc>>,
    pub online_user_id: Option<Uuid>,
    pub status: ScheduledPrankStatus,
    pub created_at: DateTime<Utc>,
    pub fired_at: Option<DateTime<Utc>>,
    pub overlay_type: OverlayType,
    pub text_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledPrankListResponse {
    pub items: Vec<ScheduledPrankItem>,
}
