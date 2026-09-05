//! The desktop shell. The webview is the same Vite build the browser runs;
//! these commands are the far end of `src/adapters/tauri.ts`, which
//! implements the app's Platform interface over them. Commands only ever
//! touch a folder the user picked or reopened through this shell — a root
//! the page names on its own is refused.

mod folder;
mod recents;
mod watch;

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct Roots(Mutex<HashSet<PathBuf>>);

#[derive(Serialize)]
struct FolderInfo {
    name: String,
    path: String,
}

fn info(path: &Path) -> FolderInfo {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    FolderInfo { name, path: path.to_string_lossy().into_owned() }
}

fn register(roots: &Roots, path: &Path) {
    if let Ok(mut set) = roots.0.lock() {
        set.insert(path.to_path_buf());
    }
}

fn opened(roots: &Roots, root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root);
    let known = roots.0.lock().map(|set| set.contains(&path)).unwrap_or(false);
    if known {
        Ok(path)
    } else {
        Err(format!("{root} is not an opened story folder"))
    }
}

fn recents_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("recents.json"))
}

#[tauri::command]
async fn pick_folder(app: AppHandle, roots: State<'_, Roots>) -> Result<Option<FolderInfo>, String> {
    let handle = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        handle.dialog().file().set_title("Open a story folder").blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    match picked {
        None => Ok(None),
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            register(&roots, &path);
            Ok(Some(info(&path)))
        }
    }
}

#[tauri::command]
fn recents(app: AppHandle) -> Result<Vec<recents::Recent>, String> {
    Ok(recents::load(&recents_file(&app)?))
}

#[tauri::command]
fn open_recent(app: AppHandle, roots: State<'_, Roots>, name: String) -> Result<Option<FolderInfo>, String> {
    let rows = recents::load(&recents_file(&app)?);
    let Some(row) = rows.into_iter().find(|r| r.name == name) else {
        return Ok(None);
    };
    let path = PathBuf::from(&row.path);
    if !path.is_dir() {
        return Err(format!("{name} is no longer at {} — pick the folder again instead.", row.path));
    }
    register(&roots, &path);
    Ok(Some(info(&path)))
}

#[tauri::command]
fn remember_opened(app: AppHandle, roots: State<'_, Roots>, root: String) -> Result<(), String> {
    let path = opened(&roots, &root)?;
    let FolderInfo { name, path } = info(&path);
    recents::remember(&recents_file(&app)?, &name, &path)
}

#[tauri::command]
fn read_text(roots: State<'_, Roots>, root: String, path: String) -> Result<String, String> {
    folder::read_text(&opened(&roots, &root)?, &path)
}

#[tauri::command]
fn write_text(roots: State<'_, Roots>, root: String, path: String, contents: String) -> Result<(), String> {
    folder::write_atomic(&opened(&roots, &root)?, &path, contents.as_bytes())
}

#[tauri::command]
fn read_binary(roots: State<'_, Roots>, root: String, path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = folder::read_binary(&opened(&roots, &root)?, &path)?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// The bytes travel as the raw request body; root and path ride in
/// headers, percent-encoded on the way in so a non-ASCII folder name
/// survives the trip.
#[tauri::command]
fn write_binary(roots: State<'_, Roots>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let header = |name: &str| -> Result<String, String> {
        let raw = request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("write_binary: missing {name} header"))?;
        percent_decode(raw)
    };
    let root = header("x-root")?;
    let path = header("x-path")?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.as_slice(),
        _ => return Err("write_binary: expected a raw body".to_string()),
    };
    folder::write_atomic(&opened(&roots, &root)?, &path, bytes)
}

/// Undoes JavaScript's encodeURIComponent. A stray `%` without two hex
/// digits behind it is kept literally rather than treated as an error.
fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let decoded = if bytes[i] == b'%' && i + 3 <= bytes.len() {
            std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
        } else {
            None
        };
        match decoded {
            Some(byte) => {
                out.push(byte);
                i += 3;
            }
            None => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_files(roots: State<'_, Roots>, root: String, dir: String) -> Result<Vec<String>, String> {
    folder::list_files(&opened(&roots, &root)?, &dir)
}

#[tauri::command]
fn list_folders(roots: State<'_, Roots>, root: String, dir: String) -> Result<Vec<String>, String> {
    folder::list_folders(&opened(&roots, &root)?, &dir)
}

#[tauri::command]
fn exists(roots: State<'_, Roots>, root: String, path: String) -> Result<bool, String> {
    folder::exists(&opened(&roots, &root)?, &path)
}

#[tauri::command]
fn delete_entry(roots: State<'_, Roots>, root: String, path: String) -> Result<(), String> {
    folder::delete(&opened(&roots, &root)?, &path)
}

#[tauri::command]
fn watch_folder(
    app: AppHandle,
    roots: State<'_, Roots>,
    watchers: State<'_, watch::Watchers>,
    root: String,
) -> Result<(), String> {
    let path = opened(&roots, &root)?;
    watch::start(app, &watchers, path)
}

#[tauri::command]
fn unwatch_folder(watchers: State<'_, watch::Watchers>, root: String) {
    watch::stop(&watchers, Path::new(&root));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Roots::default())
        .manage(watch::Watchers::default())
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            recents,
            open_recent,
            remember_opened,
            read_text,
            write_text,
            read_binary,
            write_binary,
            list_files,
            list_folders,
            exists,
            delete_entry,
            watch_folder,
            unwatch_folder,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_what_encode_uri_component_produces() {
        assert_eq!(percent_decode("C%3A%5CUsers%5CJos%C3%A9%5Cstories").unwrap(), "C:\\Users\\José\\stories");
        assert_eq!(percent_decode("plain").unwrap(), "plain");
        assert_eq!(percent_decode("trailing%").unwrap(), "trailing%");
        assert_eq!(percent_decode("odd%4").unwrap(), "odd%4");
    }
}
