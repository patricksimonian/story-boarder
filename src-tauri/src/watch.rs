//! Native folder watching. One `notify` watcher per opened folder; its raw
//! events are coalesced for a quarter second and emitted to the webview as
//! a single `folder-changed` event carrying root-relative, forward-slashed
//! paths — the same shape the browser build's FileSystemObserver hands the
//! app, so everything above the adapter is untouched.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "folder-changed";
const SETTLE: Duration = Duration::from_millis(250);

#[derive(Default)]
pub struct Watchers(Mutex<HashMap<PathBuf, RecommendedWatcher>>);

#[derive(Serialize, Clone)]
pub struct Changed {
    pub root: String,
    pub paths: Vec<String>,
}

pub fn relative(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

pub fn start(app: AppHandle, watchers: &Watchers, root: PathBuf) -> Result<(), String> {
    let mut map = watchers.0.lock().map_err(|e| e.to_string())?;
    if map.contains_key(&root) {
        return Ok(());
    }
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("Cannot watch {}: {e}", root.display()))?;

    let thread_root = root.clone();
    thread::spawn(move || pump(app, thread_root, rx));
    map.insert(root, watcher);
    Ok(())
}

/// Dropping the watcher closes its channel, which ends the pump thread.
pub fn stop(watchers: &Watchers, root: &Path) {
    if let Ok(mut map) = watchers.0.lock() {
        map.remove(root);
    }
}

fn pump(app: AppHandle, root: PathBuf, rx: mpsc::Receiver<notify::Result<notify::Event>>) {
    let collect = |event: notify::Result<notify::Event>, into: &mut BTreeSet<String>| {
        if let Ok(event) = event {
            for path in event.paths {
                if let Some(rel) = relative(&root, &path) {
                    into.insert(rel);
                }
            }
        }
    };
    loop {
        let first = match rx.recv() {
            Ok(event) => event,
            Err(_) => return,
        };
        let mut paths = BTreeSet::new();
        collect(first, &mut paths);
        let deadline = Instant::now() + SETTLE;
        while let Ok(event) = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            collect(event, &mut paths);
        }
        if !paths.is_empty() {
            let _ = app.emit(
                EVENT,
                Changed { root: root.to_string_lossy().into_owned(), paths: paths.into_iter().collect() },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths_are_forward_slashed_and_the_root_itself_is_skipped() {
        let root = PathBuf::from("C:\\stories\\uyuni");
        let nested = root.join("scenes").join("one.md");
        assert_eq!(relative(&root, &nested).as_deref(), Some("scenes/one.md"));
        assert_eq!(relative(&root, &root), None);
        assert_eq!(relative(&root, Path::new("C:\\elsewhere\\x")), None);
    }
}
