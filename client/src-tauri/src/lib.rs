mod commands;

use commands::overlay::{
    clear_all_overlays, get_active_overlays, hide_overlay, panic_hide_all, show_overlay,
    OverlayManager, OverlayState,
};
use commands::settings::{get_settings, save_settings, AppSettings, SettingsStore};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SettingsStore(Mutex::new(AppSettings::default())))
        .manage(OverlayManager(Mutex::new(Vec::<OverlayState>::new())))
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

            let handle = app.handle().clone();
            let shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Escape);
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(manager) = handle.try_state::<OverlayManager>() {
                        clear_all_overlays(&manager);
                    }
                    let _ = handle.emit("panic:triggered", ());
                }
            })?;

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
            show_overlay,
            hide_overlay,
            panic_hide_all,
            get_active_overlays,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
