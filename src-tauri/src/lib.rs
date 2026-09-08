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
use tauri_plugin_opener::OpenerExt;

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

fn recents_file<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("recents.json"))
}

#[tauri::command]
async fn pick_folder<R: tauri::Runtime>(app: AppHandle<R>, roots: State<'_, Roots>) -> Result<Option<FolderInfo>, String> {
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
fn recents<R: tauri::Runtime>(app: AppHandle<R>) -> Result<Vec<recents::Recent>, String> {
    Ok(recents::load(&recents_file(&app)?))
}

#[tauri::command]
fn open_recent<R: tauri::Runtime>(app: AppHandle<R>, roots: State<'_, Roots>, name: String) -> Result<Option<FolderInfo>, String> {
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
fn remember_opened<R: tauri::Runtime>(app: AppHandle<R>, roots: State<'_, Roots>, root: String) -> Result<(), String> {
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

/// Hands a file in an opened folder to whatever Windows opens it with —
/// for a playable export, the default browser.
#[tauri::command]
fn open_path<R: tauri::Runtime>(app: AppHandle<R>, roots: State<'_, Roots>, root: String, path: String) -> Result<(), String> {
    let target = folder::resolve(&opened(&roots, &root)?, &path)?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Cannot open {path}: {e}"))
}

/// Shows a file in Explorer with the file selected.
#[tauri::command]
fn reveal_path<R: tauri::Runtime>(app: AppHandle<R>, roots: State<'_, Roots>, root: String, path: String) -> Result<(), String> {
    let target = folder::resolve(&opened(&roots, &root)?, &path)?;
    app.opener()
        .reveal_item_in_dir(&target)
        .map_err(|e| format!("Cannot show {path}: {e}"))
}

#[tauri::command]
fn watch_folder<R: tauri::Runtime>(
    app: AppHandle<R>,
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

/// What the page couldn't handle — an uncaught error, an unhandled
/// rejection — lands in the log file under the page's own name.
#[tauri::command]
fn log_error(message: String) {
    log::error!(target: "webview", "{message}");
}

/// The state and commands, on whichever runtime: the real one in `run`,
/// the mock one in the ipc tests below.
fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
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
            open_path,
            reveal_path,
            watch_folder,
            unwatch_folder,
            log_error,
        ])
}

/// The log goes to a file in the app's log directory in every build —
/// on Windows, %LOCALAPPDATA%\io.github.patricksimonian.storyline\logs\
/// storyline.log — and to the terminal as well in a debug build. One
/// file, capped, replaced when it fills.
fn logging() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    let mut builder = tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .clear_targets()
        .target(Target::new(TargetKind::LogDir { file_name: Some("storyline".to_string()) }))
        .rotation_strategy(RotationStrategy::KeepOne)
        .max_file_size(2_000_000);
    if cfg!(debug_assertions) {
        builder = builder.target(Target::new(TargetKind::Stdout));
    }
    builder.build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure(tauri::Builder::default())
        .plugin(logging())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            log::info!("Story Boarder {} starting", app.package_info().version);
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

/// The commands through the real IPC path: JSON arguments named as the
/// page names them, raw bodies with headers, errors as strings. This is
/// the contract `src/adapters/tauri.ts` is written against, checked from
/// this side without a webview; the adapter's own tests check it from
/// the other.
#[cfg(test)]
mod ipc {
    use super::*;
    use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
    use tauri::webview::InvokeRequest;
    use tauri::{App, WebviewWindow};

    struct Shell {
        _app: App<MockRuntime>,
        webview: WebviewWindow<MockRuntime>,
        dir: PathBuf,
        root: String,
    }

    impl Shell {
        /// A shell with one opened folder: a fresh temp directory.
        fn open(tag: &str) -> Shell {
            let app = configure(mock_builder()).build(mock_context(noop_assets())).unwrap();
            let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
            let dir = std::env::temp_dir().join(format!("storyline-ipc-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            register(&app.state::<Roots>(), &dir);
            let root = dir.to_string_lossy().into_owned();
            Shell { _app: app, webview, dir, root }
        }

        fn request(
            &self,
            cmd: &str,
            body: InvokeBody,
            headers: tauri::http::HeaderMap,
        ) -> Result<InvokeResponseBody, serde_json::Value> {
            get_ipc_response(
                &self.webview,
                InvokeRequest {
                    cmd: cmd.to_string(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "http://tauri.localhost".parse().unwrap(),
                    body,
                    headers,
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
        }

        /// A command with JSON arguments, as `invoke(cmd, { ... })` sends them.
        fn call(&self, cmd: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
            match self.request(cmd, InvokeBody::Json(args), Default::default()) {
                Ok(InvokeResponseBody::Json(json)) => Ok(serde_json::from_str(&json).unwrap()),
                Ok(InvokeResponseBody::Raw(bytes)) => Ok(serde_json::json!(bytes)),
                Err(value) => Err(value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string())),
            }
        }

        /// The arguments with this shell's opened root attached.
        fn args(&self, rest: serde_json::Value) -> serde_json::Value {
            let mut map = serde_json::json!({ "root": self.root });
            for (k, v) in rest.as_object().unwrap() {
                map[k] = v.clone();
            }
            map
        }
    }

    impl Drop for Shell {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn text_round_trips_with_the_page_side_argument_names() {
        let shell = Shell::open("text");
        let manifest = "{\"title\":\"T\"}";
        assert_eq!(shell.call("exists", shell.args(serde_json::json!({ "path": "story.json" }))).unwrap(), false);
        shell
            .call("write_text", shell.args(serde_json::json!({ "path": "story.json", "contents": manifest })))
            .unwrap();
        shell.call("write_text", shell.args(serde_json::json!({ "path": "scenes/a.md", "contents": "# A" }))).unwrap();
        assert_eq!(shell.call("exists", shell.args(serde_json::json!({ "path": "story.json" }))).unwrap(), true);
        assert_eq!(shell.call("read_text", shell.args(serde_json::json!({ "path": "story.json" }))).unwrap(), manifest);
        assert_eq!(
            shell.call("list_files", shell.args(serde_json::json!({ "dir": "" }))).unwrap(),
            serde_json::json!(["story.json"])
        );
        assert_eq!(
            shell.call("list_folders", shell.args(serde_json::json!({ "dir": "" }))).unwrap(),
            serde_json::json!(["scenes"])
        );
        assert_eq!(
            shell.call("list_files", shell.args(serde_json::json!({ "dir": "scenes" }))).unwrap(),
            serde_json::json!(["scenes/a.md"])
        );
        shell.call("delete_entry", shell.args(serde_json::json!({ "path": "scenes/a.md" }))).unwrap();
        assert_eq!(shell.call("exists", shell.args(serde_json::json!({ "path": "scenes/a.md" }))).unwrap(), false);
        assert!(shell.dir.join("story.json").is_file());
    }

    #[test]
    fn errors_reach_the_page_as_plain_strings() {
        let shell = Shell::open("errors");
        let missing = shell.call("read_text", shell.args(serde_json::json!({ "path": "nope.md" }))).unwrap_err();
        assert!(missing.starts_with("No file at nope.md"), "{missing}");
        std::fs::write(shell.dir.join("pic.png"), [0x89, b'P', 0xff, 0xfe]).unwrap();
        assert_eq!(
            shell.call("read_text", shell.args(serde_json::json!({ "path": "pic.png" }))).unwrap_err(),
            "pic.png is not UTF-8 text"
        );
        let escape = shell.call("read_text", shell.args(serde_json::json!({ "path": "../x" }))).unwrap_err();
        assert!(escape.starts_with("Refusing a path outside the story folder"), "{escape}");
    }

    #[test]
    fn a_root_the_page_names_on_its_own_is_refused() {
        let shell = Shell::open("roots");
        let elsewhere = std::env::temp_dir().to_string_lossy().into_owned();
        for cmd in ["read_text", "write_text", "exists", "delete_entry"] {
            let err = shell
                .call(cmd, serde_json::json!({ "root": elsewhere, "path": "story.json", "contents": "" }))
                .unwrap_err();
            assert!(err.ends_with("is not an opened story folder"), "{cmd}: {err}");
        }
        let err = shell.call("list_files", serde_json::json!({ "root": elsewhere, "dir": "" })).unwrap_err();
        assert!(err.ends_with("is not an opened story folder"), "{err}");
    }

    #[test]
    fn binary_goes_as_a_raw_body_with_encoded_headers_and_comes_back_raw() {
        let shell = Shell::open("binary");
        let bytes: Vec<u8> = (0..=255).collect();
        let mut headers = tauri::http::HeaderMap::new();
        // What encodeURIComponent makes of a Windows path on the page side.
        let encoded_root = shell
            .root
            .replace('%', "%25")
            .replace(':', "%3A")
            .replace('\\', "%5C")
            .replace(' ', "%20");
        headers.insert("x-root", encoded_root.parse().unwrap());
        headers.insert("x-path", "assets%2Fpic.png".parse().unwrap());
        shell.request("write_binary", InvokeBody::Raw(bytes.clone()), headers).unwrap();
        assert_eq!(std::fs::read(shell.dir.join("assets").join("pic.png")).unwrap(), bytes);

        let read = shell.request(
            "read_binary",
            InvokeBody::Json(shell.args(serde_json::json!({ "path": "assets/pic.png" }))),
            Default::default(),
        );
        match read {
            Ok(InvokeResponseBody::Raw(back)) => assert_eq!(back, bytes),
            other => panic!("expected raw bytes back, got {other:?}"),
        }

        let missing = shell.request("write_binary", InvokeBody::Raw(vec![1]), Default::default()).unwrap_err();
        assert_eq!(missing, serde_json::json!("write_binary: missing x-root header"));
    }

    #[test]
    fn the_page_can_log_what_it_dropped() {
        let shell = Shell::open("log");
        shell.call("log_error", serde_json::json!({ "message": "Unhandled rejection: Error: boom" })).unwrap();
    }
}
