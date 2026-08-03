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

/// Entrance animation for a visual overlay.
///
/// Serialized as snake_case (`slide_left`, `pop`, …). Existing lowercase
/// values (`fade`, `zoom`, `bounce`, `none`) stay compatible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Animation {
    Fade,
    Zoom,
    Bounce,
    SlideLeft,
    SlideRight,
    SlideUp,
    SlideDown,
    Shake,
    Pop,
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
    /// Stick to the OS cursor (~2–3s).
    FollowMouse,
    /// Circle around the cursor.
    Orbit,
    /// Three mini copies trailing the cursor.
    Trail,
    /// Flee when the cursor approaches.
    Dodge,
    /// Fake close button that spawns a second overlay.
    Clickbait,
    /// Full-screen banner 1s, then media centered.
    Takeover,
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
    /// Optional entrance SFX: `none` | `pop` | `whoosh`.
    #[serde(default = "default_sfx")]
    pub sfx: String,
    /// Optional text theme (text overlays).
    #[serde(default)]
    pub text_color: Option<String>,
    #[serde(default)]
    pub bg_color: Option<String>,
    #[serde(default)]
    pub accent_color: Option<String>,
    #[serde(default)]
    pub font_family: Option<String>,
}

fn default_sfx() -> String {
    "none".into()
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
            sfx: default_sfx(),
            text_color: None,
            bg_color: None,
            accent_color: None,
            font_family: None,
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
    /// When true, receivers should show the overlay even without consent / room.
    #[serde(default)]
    pub self_test: bool,
}
