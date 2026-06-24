use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use super::window::{ensure_overlay_window, overlay_label, resize_overlay_monitor};

const MAX_ACTIVE_OVERLAYS: usize = 4;

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
    #[serde(default)]
    pub monitor_index: u32,
    #[serde(default = "default_pos")]
    pub position_x: f32,
    #[serde(default = "default_pos")]
    pub position_y: f32,
    #[serde(default = "default_scale")]
    pub scale: f32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
}

fn default_pos() -> f32 {
    0.5
}

fn default_scale() -> f32 {
    1.0
}

fn default_opacity() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayState {
    pub id: String,
    pub overlay_type: String,
    pub sender_name: String,
    pub started_at: String,
}

pub struct OverlayManager(pub Mutex<Vec<OverlayState>>);

pub fn clear_all_overlays(app: &AppHandle, manager: &OverlayManager) {
    if let Ok(mut overlays) = manager.0.lock() {
        overlays.clear();
    }
    for i in 0..8 {
        let label = overlay_label(i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit("overlay:clear", ());
        }
    }
}

fn emit_hide(app: &AppHandle, id: &str, monitor_index: u32) {
    let label = overlay_label(monitor_index);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.emit("overlay:hide", id);
    }
}

#[tauri::command]
pub fn show_overlay(
    app: AppHandle,
    payload: OverlayPayload,
    manager: State<'_, OverlayManager>,
) -> Result<String, String> {
    ensure_overlay_window(&app, payload.monitor_index)?;
    let _ = resize_overlay_monitor(&app, payload.monitor_index);

    let id = if payload.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        payload.id.clone()
    };

    let mut payload = payload;
    payload.id = id.clone();

    {
        let mut overlays = manager.0.lock().map_err(|e| e.to_string())?;
        overlays.retain(|o| o.id != id);
        if overlays.len() >= MAX_ACTIVE_OVERLAYS {
            if let Some(removed) = overlays.first().cloned() {
                emit_hide(&app, &removed.id, payload.monitor_index);
                overlays.remove(0);
            }
        }

        overlays.push(OverlayState {
            id: id.clone(),
            overlay_type: payload.overlay_type.clone(),
            sender_name: payload.sender_name.clone(),
            started_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    let label = overlay_label(payload.monitor_index);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "overlay window not available".to_string())?;

    window
        .emit("overlay:show", &payload)
        .map_err(|e| e.to_string())?;

    let duration = payload.duration_ms.max(500);
    let monitor_index = payload.monitor_index;
    let app_clone = app.clone();
    let hide_id = id.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(duration as u64)).await;
        let _ = hide_overlay_internal(app_clone, hide_id, monitor_index);
    });

    Ok(id)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle, id: String, monitor_index: Option<u32>) -> Result<(), String> {
    hide_overlay_internal(app, id, monitor_index.unwrap_or(0))
}

fn hide_overlay_internal(app: AppHandle, id: String, monitor_index: u32) -> Result<(), String> {
    emit_hide(&app, &id, monitor_index);
    if let Some(manager) = app.try_state::<OverlayManager>() {
        if let Ok(mut overlays) = manager.0.lock() {
            overlays.retain(|o| o.id != id);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn panic_hide_all(app: AppHandle, manager: State<'_, OverlayManager>) -> Result<(), String> {
    clear_all_overlays(&app, &manager);
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
