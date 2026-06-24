use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayPayload {
    pub id: String,
    pub overlay_type: String,
    pub media_url: Option<String>,
    pub local_path: Option<String>,
    pub text: Option<String>,
    pub duration_ms: u32,
    pub animation: String,
    pub sender_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayState {
    pub id: String,
    pub overlay_type: String,
    pub sender_name: String,
    pub started_at: String,
}

pub struct OverlayManager(pub Mutex<Vec<OverlayState>>);

#[tauri::command]
pub fn show_overlay(
    payload: OverlayPayload,
    manager: State<'_, OverlayManager>,
) -> Result<String, String> {
    let id = if payload.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        payload.id.clone()
    };

    let state = OverlayState {
        id: id.clone(),
        overlay_type: payload.overlay_type,
        sender_name: payload.sender_name,
        started_at: chrono::Utc::now().to_rfc3339(),
    };

    manager
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .push(state);

    Ok(id)
}

#[tauri::command]
pub fn hide_overlay(id: String, manager: State<'_, OverlayManager>) -> Result<(), String> {
    let mut overlays = manager.0.lock().map_err(|e| e.to_string())?;
    overlays.retain(|o| o.id != id);
    Ok(())
}

pub fn clear_all_overlays(manager: &OverlayManager) {
    if let Ok(mut overlays) = manager.0.lock() {
        overlays.clear();
    }
}

#[tauri::command]
pub fn panic_hide_all(manager: State<'_, OverlayManager>) -> Result<(), String> {
    clear_all_overlays(&manager);
    Ok(())
}

#[tauri::command]
pub fn get_active_overlays(manager: State<'_, OverlayManager>) -> Result<Vec<OverlayState>, String> {
    manager
        .0
        .lock()
        .map(|o| o.clone())
        .map_err(|e| e.to_string())
}
