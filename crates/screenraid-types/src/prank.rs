use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{MediaRef, UserSummary};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverlayType {
    Image,
    Gif,
    Video,
    Text,
    Sound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Animation {
    Fade,
    Zoom,
    Bounce,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrankStatus {
    Pending,
    Delivered,
    Acked,
    Blocked,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayConfig {
    pub animation: Animation,
    pub position: OverlayPosition,
    pub scale: f32,
    pub opacity: f32,
    pub volume: f32,
    pub monitor_id: Option<u32>,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            animation: Animation::Fade,
            position: OverlayPosition { x: 0.5, y: 0.5 },
            scale: 1.0,
            opacity: 1.0,
            volume: 0.8,
            monitor_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendPrankRequest {
    pub target_id: Option<Uuid>,
    pub media_id: Option<Uuid>,
    pub overlay_type: OverlayType,
    pub text_content: Option<String>,
    pub duration_ms: i32,
    pub config: OverlayConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrankResponse {
    pub id: Uuid,
    pub room_id: Uuid,
    pub status: PrankStatus,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrankIncomingPayload {
    pub prank_id: Uuid,
    pub room_id: Uuid,
    pub sender: UserSummary,
    pub overlay_type: OverlayType,
    pub media: Option<MediaRef>,
    pub text_content: Option<String>,
    pub duration_ms: i32,
    pub config: OverlayConfig,
    pub expires_at: DateTime<Utc>,
}
