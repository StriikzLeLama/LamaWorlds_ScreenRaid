use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub autostart: bool,
    pub default_duration_ms: u32,
    pub default_volume: f32,
    pub default_animation: String,
    pub cache_limit_mb: u32,
    pub panic_hotkey: String,
    pub server_url: String,
    pub selected_monitor: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            default_duration_ms: 5000,
            default_volume: 0.8,
            default_animation: "fade".into(),
            cache_limit_mb: 500,
            panic_hotkey: "Ctrl+Shift+Escape".into(),
            server_url: "http://localhost:8080".into(),
            selected_monitor: "primary".into(),
        }
    }
}

pub struct SettingsStore(pub Mutex<AppSettings>);

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    state
        .0
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    state: State<'_, SettingsStore>,
) -> Result<(), String> {
    let mut store = state.0.lock().map_err(|e| e.to_string())?;
    *store = settings;
    Ok(())
}
