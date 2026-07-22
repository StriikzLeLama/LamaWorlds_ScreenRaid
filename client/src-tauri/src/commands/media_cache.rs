use std::fs::{self, OpenOptions};
use std::io::Write;
use tauri::{AppHandle, Manager};

fn media_cache_path(app: &AppHandle, media_id: &str, extension: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let ext = extension.trim_start_matches('.');
    let filename = if ext.is_empty() {
        media_id.to_string()
    } else {
        format!("{media_id}.{ext}")
    };
    Ok(dir.join(filename))
}

/// Write downloaded media bytes to the app cache directory.
#[tauri::command]
pub fn write_media_cache(
    app: AppHandle,
    media_id: String,
    bytes: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let path = media_cache_path(&app, &media_id, &extension)?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Append (or create) a media cache file in chunks — avoids huge IPC arrays freezing the UI.
#[tauri::command]
pub fn write_media_cache_chunk(
    app: AppHandle,
    media_id: String,
    bytes: Vec<u8>,
    extension: String,
    append: bool,
) -> Result<String, String> {
    let path = media_cache_path(&app, &media_id, &extension)?;
    if !append {
        fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    } else {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Remove a single cached media file from disk.
#[tauri::command]
pub fn remove_media_cache_file(path: String) -> Result<(), String> {
    if path.is_empty() {
        return Ok(());
    }
    if fs::metadata(&path).is_ok() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Remove all cached media files from disk.
#[tauri::command]
pub fn clear_media_cache(app: AppHandle) -> Result<u64, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    if !dir.exists() {
        return Ok(0);
    }

    let mut removed = 0u64;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file() {
            fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}
