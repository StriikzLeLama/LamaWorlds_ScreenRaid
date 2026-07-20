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
    /// Full payloads keyed by overlay id (needed to re-emit to freshly loaded overlay windows).
    payloads: Mutex<HashMap<String, OverlayPayload>>,
    /// Cancels stale auto-dismiss timers when the same overlay id is reshown.
    dismiss_generations: Mutex<HashMap<String, u64>>,
}

impl OverlayManager {
    pub fn new() -> Self {
        Self {
            overlays: Mutex::new(Vec::new()),
            payloads: Mutex::new(HashMap::new()),
            dismiss_generations: Mutex::new(HashMap::new()),
        }
    }

    fn store_payload(&self, payload: &OverlayPayload) {
        if let Ok(mut map) = self.payloads.lock() {
            map.insert(payload.id.clone(), payload.clone());
        }
    }

    fn drop_payload(&self, id: &str) {
        if let Ok(mut map) = self.payloads.lock() {
            map.remove(id);
        }
    }

    fn payloads_for_monitor(&self, monitor_index: u32) -> Vec<OverlayPayload> {
        self.payloads
            .lock()
            .map(|map| {
                self.overlays
                    .lock()
                    .map(|list| {
                        list.iter()
                            .filter(|o| o.monitor_index == monitor_index)
                            .filter_map(|o| map.get(&o.id).cloned())
                            .collect()
                    })
                    .unwrap_or_default()
            })
            .unwrap_or_default()
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
    if let Ok(mut payloads) = manager.payloads.lock() {
        payloads.clear();
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
    log::info!(
        "[overlay] show_overlay id={} type={} monitor={} text={:?}",
        payload.id, payload.overlay_type, payload.monitor_index, payload.text
    );
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
                manager.drop_payload(&removed.id);
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

    manager.store_payload(&payload);

    let dismiss_gen = manager.bump_dismiss_generation(&id);

    show_overlay_surface(&app, payload.monitor_index)?;

    let label = overlay_label(payload.monitor_index);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| {
            log::error!("[overlay] window {label} missing after create");
            "overlay window not available".to_string()
        })?;

    // Emit immediately, then re-emit a few times. Fresh WebView2 windows often
    // miss the first event while React mounts its listeners; OverlayApp also
    // pulls via sync_overlays_for_monitor, but delayed emits cover both races.
    window
        .emit("overlay:show", &payload)
        .map_err(|e| {
            log::error!("[overlay] emit overlay:show failed: {e}");
            e.to_string()
        })?;
    log::info!("[overlay] emitted overlay:show to {label}");

    let app_for_retry = app.clone();
    let retry_label = label.clone();
    let retry_payload = payload.clone();
    let retry_id = id.clone();
    tauri::async_runtime::spawn(async move {
        for delay_ms in [150u64, 400, 800] {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            let still_active = app_for_retry
                .try_state::<OverlayManager>()
                .map(|m| {
                    m.overlays
                        .lock()
                        .map(|list| list.iter().any(|o| o.id == retry_id))
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            if !still_active {
                return;
            }
            if let Some(win) = app_for_retry.get_webview_window(&retry_label) {
                let _ = win.emit("overlay:show", &retry_payload);
                log::info!(
                    "[overlay] re-emitted overlay:show to {retry_label} after {delay_ms}ms"
                );
            }
        }
    });

    // Re-apply click-through shortly after show. On Windows/WebView2 the first
    // set_ignore_cursor_events (called during window creation, before the
    // webview is ready) can be dropped, which would let the fullscreen
    // always-on-top surface capture all input for the overlay's lifetime.
    let app_for_cursor = app.clone();
    let cursor_label = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(250)).await;
        if let Some(win) = app_for_cursor.get_webview_window(&cursor_label) {
            let _ = win.set_always_on_top(true);
            match win.set_ignore_cursor_events(true) {
                Ok(()) => log::info!("[overlay] re-applied ignore-cursor-events on {cursor_label}"),
                Err(e) => log::warn!("[overlay] ignore-cursor-events re-apply failed on {cursor_label}: {e}"),
            }
        }
    });

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

    log::info!("[overlay] hide_overlay_internal id={id} monitor={monitor}");
    emit_hide(&app, &id, monitor);

    if let Some(manager) = app.try_state::<OverlayManager>() {
        manager.clear_dismiss_generation(&id);
        manager.drop_payload(&id);
        if let Ok(mut overlays) = manager.overlays.lock() {
            overlays.retain(|o| o.id != id);
        }
    }

    // Guaranteed surface hide — independent of the overlay webview. If the
    // webview failed to load or never processes overlay:hide, it would never
    // call overlay_surface_idle and the fullscreen always-on-top window would
    // trap all input forever. This grace fallback hides the surface after the
    // exit-animation window unless a new overlay appeared on that monitor.
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(800)).await;
        let should_hide = app_clone
            .try_state::<OverlayManager>()
            .map(|m| m.count_on_monitor(monitor) == 0)
            .unwrap_or(true);
        if should_hide {
            log::info!("[overlay] grace hide surface monitor={monitor}");
            let _ = hide_overlay_surface(&app_clone, monitor);
        }
    });

    Ok(())
}

/// Forward a log line from a webview (e.g. the overlay window) to the Rust
/// logger so it appears in the terminal / log file. Lets us diagnose overlay
/// windows whose devtools cannot be opened (e.g. a click-through fullscreen
/// window that has trapped input).
#[tauri::command]
pub fn debug_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!("[web] {message}"),
        "warn" => log::warn!("[web] {message}"),
        _ => log::info!("[web] {message}"),
    }
}

/// Re-emit all active overlays for a monitor. Called by the overlay webview
/// when it mounts, so a freshly created window receives its content even if
/// the original `overlay:show` event was emitted before the listener was ready.
#[tauri::command]
pub fn sync_overlays_for_monitor(
    app: AppHandle,
    monitor_index: u32,
    manager: State<'_, OverlayManager>,
) -> Result<(), String> {
    let payloads = manager.payloads_for_monitor(monitor_index);
    log::info!(
        "[overlay] sync_overlays_for_monitor monitor={monitor_index} count={}",
        payloads.len()
    );
    let label = overlay_label(monitor_index);
    let Some(window) = app.get_webview_window(&label) else {
        log::warn!("[overlay] sync: window {label} not found");
        return Ok(());
    };
    for payload in payloads {
        let _ = window.emit("overlay:show", &payload);
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
    log::info!("[overlay] panic_hide_all called");
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
