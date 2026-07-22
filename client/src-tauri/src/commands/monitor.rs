use serde::{Deserialize, Serialize};
use tauri::AppHandle;

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

#[tauri::command]
pub fn collect_monitors(app: AppHandle) -> Result<Vec<MonitorDescriptor>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_name = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().map(|n| n.to_string()));

    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, m)| {
            let pos = m.position();
            let size = m.size();
            let is_primary = match (&primary_name, m.name()) {
                (Some(primary), Some(name)) => name == primary.as_str(),
                _ => index == 0,
            };
            MonitorDescriptor {
                id: index as u32,
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: m.scale_factor(),
                is_primary,
            }
        })
        .collect())
}

/// Resolve `selected_monitor` setting ("primary" | "0" | "1" | …) to a monitor index.
#[tauri::command]
pub fn resolve_preferred_monitor(app: AppHandle, selected: String) -> Result<u32, String> {
    let monitors = collect_monitors(app)?;
    if monitors.is_empty() {
        return Ok(0);
    }
    let trimmed = selected.trim();
    if trimmed.is_empty() || trimmed == "primary" {
        return Ok(monitors
            .iter()
            .find(|m| m.is_primary)
            .map(|m| m.id)
            .unwrap_or(0));
    }
    if let Ok(idx) = trimmed.parse::<u32>() {
        if monitors.iter().any(|m| m.id == idx) {
            return Ok(idx);
        }
    }
    Ok(monitors
        .iter()
        .find(|m| m.is_primary)
        .map(|m| m.id)
        .unwrap_or(0))
}
