//! The story folder on disk: every path the app hands over is relative to
//! the folder root and forward-slashed, exactly as the browser build's
//! FileAccess speaks it. Nothing here knows about Tauri, so the whole
//! module tests against a temp directory with plain `cargo test`.

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Joins a relative, forward-slashed path onto the root. Anything that
/// could step outside the folder — `..`, a drive prefix, a backslash — is
/// refused rather than normalised, because the app never produces such
/// paths and a path that looks like one is a bug worth surfacing.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut out = root.to_path_buf();
    for part in rel.split('/').filter(|p| !p.is_empty()) {
        let mut components = Path::new(part).components();
        let plain = !part.contains('\\')
            && matches!(components.next(), Some(Component::Normal(_)))
            && components.next().is_none();
        if !plain {
            return Err(format!("Refusing a path outside the story folder: {rel}"));
        }
        out.push(part);
    }
    Ok(out)
}

pub fn read_text(root: &Path, rel: &str) -> Result<String, String> {
    fs::read_to_string(resolve(root, rel)?).map_err(|e| format!("No file at {rel}: {e}"))
}

pub fn read_binary(root: &Path, rel: &str) -> Result<Vec<u8>, String> {
    fs::read(resolve(root, rel)?).map_err(|e| format!("No file at {rel}: {e}"))
}

static SWAP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Writes the whole file or nothing: the bytes land in a swap file beside
/// the target, are flushed to disk, then renamed over it. The swap file
/// carries Chromium's `.crswap` suffix on purpose — the app already treats
/// that suffix as "not story content" in its watcher, its commits, and its
/// exports, so the desktop build inherits every one of those exclusions.
pub fn write_atomic(root: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
    let target = resolve(root, rel)?;
    let parent = target
        .parent()
        .ok_or_else(|| format!("Cannot create {rel}"))?;
    fs::create_dir_all(parent).map_err(|e| format!("Cannot create {rel}: {e}"))?;
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Cannot create {rel}"))?;
    let n = SWAP_COUNTER.fetch_add(1, Ordering::SeqCst);
    let swap = target.with_file_name(format!("{name}.{}-{n}.crswap", std::process::id()));

    let written = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&swap)?;
        file.write_all(bytes)?;
        file.sync_all()
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&swap);
        return Err(format!("Cannot write {rel}: {e}"));
    }
    fs::rename(&swap, &target).map_err(|e| {
        let _ = fs::remove_file(&swap);
        format!("Cannot write {rel}: {e}")
    })
}

fn children(root: &Path, dir: &str, want_dirs: bool) -> Result<Vec<String>, String> {
    let path = resolve(root, dir)?;
    let entries = match fs::read_dir(&path) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };
    let prefix = if dir.is_empty() { String::new() } else { format!("{dir}/") };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir != want_dirs {
            continue;
        }
        if let Some(name) = entry.file_name().to_str() {
            out.push(format!("{prefix}{name}"));
        }
    }
    out.sort();
    Ok(out)
}

/// File paths directly under `dir`, non-recursive; a missing dir lists as empty.
pub fn list_files(root: &Path, dir: &str) -> Result<Vec<String>, String> {
    children(root, dir, false)
}

/// Folder paths directly under `dir`, non-recursive; a missing dir lists as empty.
pub fn list_folders(root: &Path, dir: &str) -> Result<Vec<String>, String> {
    children(root, dir, true)
}

/// True for a file; a folder at that path is not a file.
pub fn exists(root: &Path, rel: &str) -> Result<bool, String> {
    Ok(resolve(root, rel)?.is_file())
}

/// Removes a file, or an empty folder; nothing there is not an error.
pub fn delete(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    let result = if path.is_dir() {
        fs::remove_dir(&path)
    } else if path.exists() {
        fs::remove_file(&path)
    } else {
        Ok(())
    };
    result.map_err(|e| format!("Cannot delete {rel}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "storyline-folder-{tag}-{}-{}",
            std::process::id(),
            SWAP_COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_nested_forward_slashed_paths() {
        let root = PathBuf::from("root");
        assert_eq!(resolve(&root, "scenes/one.md").unwrap(), root.join("scenes").join("one.md"));
        assert_eq!(resolve(&root, "").unwrap(), root);
    }

    #[test]
    fn refuses_paths_that_could_escape() {
        let root = PathBuf::from("root");
        // A leading slash is tolerated, as the browser adapter tolerates it:
        // empty segments drop out, so "/abs" is just "abs".
        for bad in ["../x", "a/../b", "C:/x", "a\\b", "."] {
            assert!(resolve(&root, bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn write_creates_parents_replaces_content_and_leaves_no_swap() {
        let root = temp_root("write");
        write_atomic(&root, "notes/deep/a.md", b"first").unwrap();
        assert_eq!(read_text(&root, "notes/deep/a.md").unwrap(), "first");
        write_atomic(&root, "notes/deep/a.md", b"second").unwrap();
        assert_eq!(read_text(&root, "notes/deep/a.md").unwrap(), "second");
        assert_eq!(list_files(&root, "notes/deep").unwrap(), vec!["notes/deep/a.md"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn lists_files_and_folders_separately_and_missing_dirs_as_empty() {
        let root = temp_root("list");
        write_atomic(&root, "story.json", b"{}").unwrap();
        write_atomic(&root, "scenes/a.md", b"a").unwrap();
        write_atomic(&root, "scenes/b.md", b"b").unwrap();
        assert_eq!(list_files(&root, "").unwrap(), vec!["story.json"]);
        assert_eq!(list_folders(&root, "").unwrap(), vec!["scenes"]);
        assert_eq!(list_files(&root, "scenes").unwrap(), vec!["scenes/a.md", "scenes/b.md"]);
        assert_eq!(list_files(&root, "nowhere").unwrap(), Vec::<String>::new());
        assert!(exists(&root, "scenes/a.md").unwrap());
        assert!(!exists(&root, "scenes").unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn binary_round_trips_and_delete_is_forgiving() {
        let root = temp_root("bin");
        let bytes: Vec<u8> = (0..=255).collect();
        write_atomic(&root, "assets/x.bin", &bytes).unwrap();
        assert_eq!(read_binary(&root, "assets/x.bin").unwrap(), bytes);
        delete(&root, "assets/x.bin").unwrap();
        delete(&root, "assets/x.bin").unwrap();
        assert!(!exists(&root, "assets/x.bin").unwrap());
        delete(&root, "assets").unwrap();
        assert!(list_folders(&root, "").unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
