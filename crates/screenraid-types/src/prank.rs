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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementPreset {
    Exact,
    Center,
    Random,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayTargetPosition {
    #[serde(default)]
    pub monitor_index: u32,
    pub x: f32,
    pub y: f32,
    #[serde(default = "default_preset")]
    pub preset: PlacementPreset,
}

fn default_preset() -> PlacementPreset {
    PlacementPreset::Exact
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayPosition {
    #[serde(default)]
    pub monitor_index: u32,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayConfig {
    pub animation: Animation,
    pub position: OverlayTargetPosition,
    pub scale: f32,
    pub opacity: f32,
    pub volume: f32,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            animation: Animation::Fade,
            position: OverlayTargetPosition {
                monitor_index: 0,
                x: 0.5,
                y: 0.5,
                preset: PlacementPreset::Center,
            },
            scale: 1.0,
            opacity: 1.0,
            volume: 0.8,
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
