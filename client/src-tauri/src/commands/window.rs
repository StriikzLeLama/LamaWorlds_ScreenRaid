use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub fn overlay_url() -> WebviewUrl {
    if cfg!(debug_assertions) {
        WebviewUrl::External(
            "http://localhost:1420/overlay.html"
                .parse()
                .expect("valid overlay dev url"),
        )
    } else {
        WebviewUrl::App("overlay.html".into())
    }
}

/// Lazily create an overlay webview for a monitor (hidden until content is shown).
pub fn ensure_overlay_window(app: &AppHandle, monitor_index: u32) -> Result<(), String> {
    let label = format!("overlay-{monitor_index}");
    if app.get_webview_window(&label).is_some() {
        log::info!("[overlay] window {label} already exists — resizing");
        return resize_overlay_monitor(app, monitor_index);
    }

    log::info!("[overlay] creating new window {label}");
    let monitors = app.available_monitors().map_err(|e| {
        log::error!("[overlay] available_monitors failed: {e}");
        e.to_string()
    })?;
    let monitor = monitors
        .get(monitor_index as usize)
        .or(monitors.first())
        .ok_or_else(|| {
            log::error!("[overlay] no monitors available");
            "no monitors".to_string()
        })?;

    let size = monitor.size();
    let pos = monitor.position();
    log::info!(
        "[overlay] monitor {monitor_index}: size={}x{} pos={},{}",
        size.width, size.height, pos.x, pos.y
    );

    let window = WebviewWindowBuilder::new(app, &label, overlay_url())
        .title("ScreenRaid Overlay")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Hidden by default — zero GPU compositing cost while idle.
        .visible(false)
        .focused(false)
        .resizable(false)
        .position(pos.x as f64, pos.y as f64)
        .inner_size(size.width as f64, size.height as f64)
        .build()
        .map_err(|e| {
            log::error!("[overlay] window build failed: {e}");
            e.to_string()
        })?;

    log::info!("[overlay] window {label} built, setting ignore-cursor-events");
    window.set_ignore_cursor_events(true).map_err(|e| {
        log::error!("[overlay] set_ignore_cursor_events failed: {e}");
        e.to_string()
    })?;
    log::info!("[overlay] window {label} ready");
    Ok(())
}

/// Show the overlay surface when prank content is active.
pub fn show_overlay_surface(app: &AppHandle, monitor_index: u32) -> Result<(), String> {
    let label = overlay_label(monitor_index);
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_ignore_cursor_events(true);
    Ok(())
}

/// Hide the overlay surface when no content remains (restores full FPS).
pub fn hide_overlay_surface(app: &AppHandle, monitor_index: u32) -> Result<(), String> {
    let label = overlay_label(monitor_index);
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };
    window.hide().map_err(|e| e.to_string())
}

pub fn resize_overlay_monitor(app: &AppHandle, monitor_index: u32) -> Result<(), String> {
    let label = format!("overlay-{monitor_index}");
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let monitor = monitors
        .get(monitor_index as usize)
        .or(monitors.first())
        .ok_or_else(|| "no monitors".to_string())?;

    let size = monitor.size();
    let pos = monitor.position();

    window
        .set_position(PhysicalPosition::new(pos.x, pos.y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn overlay_label(monitor_index: u32) -> String {
    format!("overlay-{monitor_index}")
}

/// Hide every overlay webview (panic / clear).
pub fn hide_all_overlay_surfaces(app: &AppHandle, max_monitors: u32) {
    for i in 0..max_monitors {
        let _ = hide_overlay_surface(app, i);
    }
}
