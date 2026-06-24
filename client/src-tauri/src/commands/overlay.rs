use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use super::window::{
    ensure_overlay_window, hide_all_overlay_surfaces, hide_overlay_surface, overlay_label,
    resize_overlay_monitor, show_overlay_surface,
};

const MAX_ACTIVE_OVERLAYS: usize = 4;
pub const MAX_MONITOR_WINDOWS: u32 = 8;

static DISMISS_GEN: AtomicU64 = AtomicU64::new(1);

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
    #[serde(default = "default_volume")]
    pub volume: f32,
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

fn default_volume() -> f32 {
    0.8
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayState {
    pub id: String,
    pub overlay_type: String,
    pub sender_name: String,
    pub monitor_index: u32,
    pub started_at: String,
}

pub struct OverlayManager {
    pub overlays: Mutex<Vec<OverlayState>>,
    /// Cancels stale auto-dismiss timers when the same overlay id is reshown.
    dismiss_generations: Mutex<HashMap<String, u64>>,
}

impl OverlayManager {
    pub fn new() -> Self {
        Self {
            overlays: Mutex::new(Vec::new()),
            dismiss_generations: Mutex::new(HashMap::new()),
        }
    }

    fn bump_dismiss_generation(&self, id: &str) -> u64 {
        let gen = DISMISS_GEN.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut map) = self.dismiss_generations.lock() {
            map.insert(id.to_string(), gen);
        }
        gen
    }

    fn clear_dismiss_generation(&self, id: &str) {
        if let Ok(mut map) = self.dismiss_generations.lock() {
            map.remove(id);
        }
    }

    fn dismiss_generation_matches(&self, id: &str, gen: u64) -> bool {
        self.dismiss_generations
            .lock()
            .ok()
            .and_then(|map| map.get(id).copied())
            == Some(gen)
    }

    fn monitor_for_id(&self, id: &str) -> Option<u32> {
        self.overlays
            .lock()
            .ok()
            .and_then(|list| list.iter().find(|o| o.id == id).map(|o| o.monitor_index))
    }

    pub fn count_on_monitor(&self, monitor_index: u32) -> usize {
        self.overlays
            .lock()
            .map(|list| {
                list.iter()
                    .filter(|o| o.monitor_index == monitor_index)
                    .count()
            })
            .unwrap_or(0)
    }
}

pub fn clear_all_overlays(app: &AppHandle, manager: &OverlayManager) {
    if let Ok(mut overlays) = manager.overlays.lock() {
        overlays.clear();
    }
    if let Ok(mut gens) = manager.dismiss_generations.lock() {
        gens.clear();
    }
    for i in 0..MAX_MONITOR_WINDOWS {
        let label = overlay_label(i);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit("overlay:clear", ());
        }
    }
    hide_all_overlay_surfaces(app, MAX_MONITOR_WINDOWS);
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
        let mut overlays = manager.overlays.lock().map_err(|e| e.to_string())?;
        overlays.retain(|o| o.id != id);
        if overlays.len() >= MAX_ACTIVE_OVERLAYS {
            if let Some(removed) = overlays.first().cloned() {
                emit_hide(&app, &removed.id, removed.monitor_index);
                manager.clear_dismiss_generation(&removed.id);
                overlays.remove(0);
            }
        }

        overlays.push(OverlayState {
            id: id.clone(),
            overlay_type: payload.overlay_type.clone(),
            sender_name: payload.sender_name.clone(),
            monitor_index: payload.monitor_index,
            started_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    let dismiss_gen = manager.bump_dismiss_generation(&id);

    show_overlay_surface(&app, payload.monitor_index)?;

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
        let still_valid = app_clone
            .try_state::<OverlayManager>()
            .map(|mgr| mgr.dismiss_generation_matches(&hide_id, dismiss_gen))
            .unwrap_or(false);
        if !still_valid {
            return;
        }
        let _ = hide_overlay_internal(app_clone, hide_id, Some(monitor_index));
    });

    Ok(id)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle, id: String, monitor_index: Option<u32>) -> Result<(), String> {
    hide_overlay_internal(app, id, monitor_index)
}

fn hide_overlay_internal(
    app: AppHandle,
    id: String,
    monitor_index: Option<u32>,
) -> Result<(), String> {
    let monitor = monitor_index.or_else(|| {
        app.try_state::<OverlayManager>()
            .and_then(|m| m.monitor_for_id(&id))
    }).unwrap_or(0);

    emit_hide(&app, &id, monitor);

    if let Some(manager) = app.try_state::<OverlayManager>() {
        manager.clear_dismiss_generation(&id);
        if let Ok(mut overlays) = manager.overlays.lock() {
            overlays.retain(|o| o.id != id);
        }
    }
    Ok(())
}

/// Called by the overlay webview when it has no visible content left (hides the surface).
#[tauri::command]
pub fn overlay_surface_idle(
    app: AppHandle,
    monitor_index: u32,
    manager: State<'_, OverlayManager>,
) -> Result<(), String> {
    if manager.count_on_monitor(monitor_index) == 0 {
        hide_overlay_surface(&app, monitor_index)?;
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
        .overlays
        .lock()
        .map(|o| o.clone())
        .map_err(|e| e.to_string())
}
