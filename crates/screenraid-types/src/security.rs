use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityPolicyResponse {
    pub turnstile_site_key: Option<String>,
    pub turnstile_required_on_register: bool,
    pub password_min_length: u32,
    pub password_requires_letter_and_digit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: Uuid,
    pub label: Option<String>,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    pub expires_at: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionsListResponse {
    pub sessions: Vec<SessionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: Uuid,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub actor_username: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditListResponse {
    pub items: Vec<AuditEntry>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub otpauth_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TotpEnableRequest {
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TotpEnableResponse {
    pub recovery_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TotpDisableRequest {
    pub password: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TotpVerifyRequest {
    pub temp_token: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    #[serde(flatten)]
    pub auth: Option<super::AuthResponse>,
    pub requires_2fa: bool,
    pub temp_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSecurityPrefs {
    pub preset: String,
    pub allow_sound: bool,
    pub allow_video: bool,
    pub allow_fullscreen: bool,
    pub local_cooldown_ms: u32,
    pub max_pranks_per_minute: Option<u32>,
    pub target_cooldown_ms: Option<u32>,
    pub max_duration_ms: Option<u32>,
    pub max_volume: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserSecurityPrefsRequest {
    pub preset: Option<String>,
    pub allow_sound: Option<bool>,
    pub allow_video: Option<bool>,
    pub allow_fullscreen: Option<bool>,
    pub local_cooldown_ms: Option<u32>,
    pub max_pranks_per_minute: Option<u32>,
    pub target_cooldown_ms: Option<u32>,
    pub max_duration_ms: Option<u32>,
    pub max_volume: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomSecuritySettings {
    pub preset: String,
    pub max_pranks_per_minute: Option<u32>,
    pub target_cooldown_ms: Option<u32>,
    pub max_duration_ms: Option<u32>,
    pub max_volume: Option<f32>,
    pub muted_senders: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRoomSecurityRequest {
    pub preset: Option<String>,
    pub max_pranks_per_minute: Option<u32>,
    pub target_cooldown_ms: Option<u32>,
    pub max_duration_ms: Option<u32>,
    pub max_volume: Option<f32>,
    pub mute_user_id: Option<Uuid>,
    pub unmute_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SecurityPreset {
    Friends,
    Strict,
    Custom,
    Inherit,
}

#[derive(Debug, Clone, Copy)]
pub struct ResolvedRaidLimits {
    pub max_pranks_per_minute: u32,
    pub target_cooldown_ms: u32,
    pub max_duration_ms: u32,
    pub max_volume: f32,
}

impl ResolvedRaidLimits {
    pub fn friends() -> Self {
        Self {
            max_pranks_per_minute: 12,
            target_cooldown_ms: 3000,
            max_duration_ms: 15_000,
            max_volume: 1.0,
        }
    }

    pub fn strict() -> Self {
        Self {
            max_pranks_per_minute: 5,
            target_cooldown_ms: 8000,
            max_duration_ms: 8000,
            max_volume: 0.7,
        }
    }
}
