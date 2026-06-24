mod commands;

use commands::media_cache::{clear_media_cache, remove_media_cache_file, write_media_cache};
use commands::monitor::collect_monitors;
use commands::overlay::{
    get_active_overlays, hide_overlay, overlay_surface_idle, panic_hide_all, show_overlay,
    OverlayManager,
};
use commands::settings::{get_settings, save_settings, SettingsStore};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OverlayManager::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:screenraid-client.db",
                    vec![tauri_plugin_sql::Migration {
                        version: 1,
                        description: "client_cache",
                        sql: include_str!("../migrations/001_client_cache.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .setup(|app| {
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

            app.manage(SettingsStore::new(&app.handle())?);

            let handle = app.handle().clone();
            let shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Escape);
            let gs = app.global_shortcut();
            let _ = gs.unregister_all();
            let _ = gs.unregister(shortcut.clone());

            let register_panic_hotkey = || {
                gs.on_shortcut(shortcut.clone(), {
                    let handle = handle.clone();
                    move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            if let Some(manager) = handle.try_state::<OverlayManager>() {
                                commands::overlay::clear_all_overlays(&handle, &manager);
                            }
                            let _ = handle.emit("panic:triggered", ());
                        }
                    }
                })
            };

            if let Err(err) = register_panic_hotkey() {
                log::warn!(
                    "panic hotkey Ctrl+Shift+Escape unavailable ({err}); \
                     close any stale screenraid-client.exe and restart if needed"
                );
                std::thread::sleep(std::time::Duration::from_millis(400));
                if let Err(retry_err) = register_panic_hotkey() {
                    log::warn!("panic hotkey still unavailable after retry: {retry_err}");
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            collect_monitors,
            show_overlay,
            hide_overlay,
            panic_hide_all,
            get_active_overlays,
            overlay_surface_idle,
            write_media_cache,
            remove_media_cache_file,
            clear_media_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
