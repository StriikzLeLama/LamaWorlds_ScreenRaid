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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorNormalized {
    pub monitor_index: u32,
    pub x: f32,
    pub y: f32,
}

#[cfg(windows)]
fn raw_cursor_screen_pos() -> Option<(i32, i32)> {
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    extern "system" {
        fn GetCursorPos(lp_point: *mut Point) -> i32;
    }
    let mut point = Point { x: 0, y: 0 };
    // SAFETY: GetCursorPos writes into a valid Point.
    let ok = unsafe { GetCursorPos(&mut point) };
    if ok != 0 {
        Some((point.x, point.y))
    } else {
        None
    }
}

#[cfg(not(windows))]
fn raw_cursor_screen_pos() -> Option<(i32, i32)> {
    None
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

/// Cursor position normalized 0–1 relative to the monitor that contains it.
#[tauri::command]
pub fn get_cursor_normalized(app: AppHandle) -> Result<CursorNormalized, String> {
    let (cx, cy) = raw_cursor_screen_pos().ok_or_else(|| "cursor position unavailable".to_string())?;
    let monitors = collect_monitors(app)?;
    if monitors.is_empty() {
        return Ok(CursorNormalized {
            monitor_index: 0,
            x: 0.5,
            y: 0.5,
        });
    }

    for m in &monitors {
        let right = m.x.saturating_add(m.width as i32);
        let bottom = m.y.saturating_add(m.height as i32);
        if cx >= m.x && cx < right && cy >= m.y && cy < bottom {
            let x = ((cx - m.x) as f32 / m.width.max(1) as f32).clamp(0.0, 1.0);
            let y = ((cy - m.y) as f32 / m.height.max(1) as f32).clamp(0.0, 1.0);
            return Ok(CursorNormalized {
                monitor_index: m.id,
                x,
                y,
            });
        }
    }

    let primary = monitors
        .iter()
        .find(|m| m.is_primary)
        .unwrap_or(&monitors[0]);
    Ok(CursorNormalized {
        monitor_index: primary.id,
        x: 0.5,
        y: 0.5,
    })
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
