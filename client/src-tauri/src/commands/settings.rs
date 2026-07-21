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
    /// When true, force all received overlays onto the preferred monitor.
    #[serde(default)]
    pub force_preferred_monitor: bool,
    /// Soft mode caps overlay opacity so raids stay subtle.
    #[serde(default)]
    pub soft_mode: bool,
    #[serde(default = "default_max_opacity")]
    pub max_opacity: f32,
    /// When true, auto-block receive during quiet hours window.
    #[serde(default)]
    pub quiet_hours_enabled: bool,
    /// Local time HH:MM (24h), inclusive start.
    #[serde(default = "default_quiet_start")]
    pub quiet_hours_start: String,
    /// Local time HH:MM (24h), exclusive end (supports overnight windows).
    #[serde(default = "default_quiet_end")]
    pub quiet_hours_end: String,
}

fn default_max_opacity() -> f32 {
    0.55
}

fn default_quiet_start() -> String {
    "22:00".into()
}

fn default_quiet_end() -> String {
    "08:00".into()
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
            server_url: "https://screenraid.lama-worlds.com".into(),
            selected_monitor: "primary".into(),
            force_preferred_monitor: false,
            soft_mode: false,
            max_opacity: default_max_opacity(),
            quiet_hours_enabled: false,
            quiet_hours_start: default_quiet_start(),
            quiet_hours_end: default_quiet_end(),
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

        let mut settings: AppSettings = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        if settings.server_url == "http://localhost:8080" {
            settings.server_url = AppSettings::default().server_url;
            let _ = fs::write(
                &path,
                serde_json::to_string_pretty(&settings).unwrap_or_default(),
            );
        }

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
