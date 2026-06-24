use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentState {
    pub global_consent: bool,
    pub is_paused: bool,
    pub room_consents: HashMap<Uuid, bool>,
    pub consented_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomConsentRequest {
    pub consented: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentSyncPayload {
    pub global_consent: bool,
    pub is_paused: bool,
    pub room_consents: HashMap<Uuid, bool>,
}
