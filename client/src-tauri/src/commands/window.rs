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

pub fn ensure_overlay_window(app: &AppHandle, monitor_index: u32) -> Result<(), String> {
    let label = format!("overlay-{monitor_index}");
    if app.get_webview_window(&label).is_some() {
        return resize_overlay_monitor(app, monitor_index);
    }

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let monitor = monitors
        .get(monitor_index as usize)
        .or(monitors.first())
        .ok_or_else(|| "no monitors".to_string())?;

    let size = monitor.size();
    let pos = monitor.position();

    let window = WebviewWindowBuilder::new(app, &label, overlay_url())
        .title("ScreenRaid Overlay")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .focused(false)
        .resizable(false)
        .position(pos.x as f64, pos.y as f64)
        .inner_size(size.width as f64, size.height as f64)
        .build()
        .map_err(|e| e.to_string())?;

    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    Ok(())
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
