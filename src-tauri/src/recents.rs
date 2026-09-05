//! Story folders opened before, newest first, kept as a small JSON file in
//! the app's data directory. The browser build has to persist directory
//! handles in IndexedDB; here a path is just a path.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Recent {
    pub name: String,
    pub path: String,
    pub opened_at: u64,
}

pub fn load(file: &Path) -> Vec<Recent> {
    let mut rows: Vec<Recent> = fs::read_to_string(file)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    rows.sort_by(|a, b| b.opened_at.cmp(&a.opened_at));
    rows
}

/// Records a folder as opened now, replacing any earlier row with the same name.
pub fn remember(file: &Path, name: &str, path: &str) -> Result<(), String> {
    let mut rows: Vec<Recent> = load(file).into_iter().filter(|r| r.name != name).collect();
    let opened_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    rows.insert(0, Recent { name: name.to_string(), path: path.to_string(), opened_at });
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())?;
    fs::write(file, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembers_newest_first_and_replaces_by_name() {
        let file = std::env::temp_dir()
            .join(format!("storyline-recents-{}", std::process::id()))
            .join("recents.json");
        let _ = fs::remove_file(&file);
        assert!(load(&file).is_empty());
        remember(&file, "one", "C:/one").unwrap();
        remember(&file, "two", "C:/two").unwrap();
        remember(&file, "one", "C:/one-moved").unwrap();
        let rows = load(&file);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "one");
        assert_eq!(rows[0].path, "C:/one-moved");
        assert_eq!(rows[1].name, "two");
        fs::remove_dir_all(file.parent().unwrap()).unwrap();
    }
}
