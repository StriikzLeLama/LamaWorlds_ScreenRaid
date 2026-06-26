use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// Client preferences persisted to disk (survives app restarts).
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

/// In-memory cache plus JSON file under the app config directory.
pub struct SettingsStore {
    inner: Mutex<AppSettings>,
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("settings.json");

        let settings = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        Ok(Self {
            inner: Mutex::new(settings),
            path,
        })
    }

    fn write_disk(&self, settings: &AppSettings) -> Result<(), String> {
        let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(&self.path, json).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    log::info!("[settings] get_settings called");
    state
        .inner
        .lock()
        .map(|s| s.clone())
        .map_err(|e| {
            log::error!("[settings] lock failed: {e}");
            e.to_string()
        })
}

#[tauri::command]
pub fn save_settings(
    settings: AppSettings,
    state: State<'_, SettingsStore>,
) -> Result<(), String> {
    log::info!("[settings] save_settings server_url={}", settings.server_url);
    state.write_disk(&settings)?;
    *state.inner.lock().map_err(|e| e.to_string())? = settings;
    Ok(())
}
