use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorDescriptor {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorLayoutResponse {
    pub user_id: Uuid,
    pub updated_at: DateTime<Utc>,
    pub monitors: Vec<MonitorDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMonitorLayoutRequest {
    pub monitors: Vec<MonitorDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorSyncPayload {
    pub monitors: Vec<MonitorDescriptor>,
}
