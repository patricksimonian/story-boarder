//! Spawning the writer's own Claude Code for one workflow request: the
//! page builds the argv and the briefing, this runs the process and hands
//! back what it printed. The binary is found the way `where` finds it,
//! once, and cached; a run can be cancelled by the id the page gave it.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ProcessResult {
    pub stdout: String,
    pub stderr: String,
    #[serde(rename = "exitCode")]
    pub exit_code: i32,
}

/// The runs in flight, by the id the page gave each, so a cancel can find its process.
#[derive(Clone, Default)]
pub struct Runs(Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>);

/// Where `claude` is, once found. `None` inside means not looked up yet.
#[derive(Default)]
pub struct ClaudePath(Mutex<Option<PathBuf>>);

impl ClaudePath {
    pub fn locate(&self) -> Result<PathBuf, String> {
        let mut cached = self.0.lock().map_err(|e| e.to_string())?;
        if let Some(path) = cached.as_ref() {
            return Ok(path.clone());
        }
        let found = locate().ok_or_else(|| {
            "Claude Code not found on PATH — install it and sign in, then restart the app.".to_string()
        })?;
        *cached = Some(found.clone());
        Ok(found)
    }

    /// Tests point this at a stand-in binary.
    pub fn set(&self, path: PathBuf) {
        if let Ok(mut cached) = self.0.lock() {
            *cached = Some(path);
        }
    }
}

/// Finds `claude` on PATH: each directory in order, and on Windows each
/// PATHEXT extension in order, which is how `where claude` resolves it.
pub fn resolve(path_var: &str, pathext: Option<&str>) -> Option<PathBuf> {
    let exts: Vec<String> = match pathext {
        Some(list) if !list.is_empty() => list.split(';').map(|e| e.to_lowercase()).collect(),
        Some(_) => vec![".com".into(), ".exe".into(), ".bat".into(), ".cmd".into()],
        None => vec![String::new()],
    };
    for dir in std::env::split_paths(path_var) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        for ext in &exts {
            let candidate = dir.join(format!("claude{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

pub fn locate() -> Option<PathBuf> {
    let path = std::env::var("PATH").unwrap_or_default();
    if cfg!(windows) {
        let pathext = std::env::var("PATHEXT").unwrap_or_default();
        resolve(&path, Some(&pathext))
    } else {
        resolve(&path, None)
    }
}

/// The command to run for a found binary. The npm install is a
/// `claude.cmd` beside a node_modules, and what it runs sits in there:
/// a native `bin/claude.exe` in current releases, a `cli.js` for node in
/// older ones. Running that directly keeps every argument intact, where
/// cmd.exe would reread them; the script itself is the last resort.
fn command_for(binary: &Path) -> Command {
    let is_script = binary
        .extension()
        .map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
        .unwrap_or(false);
    if is_script {
        if let Some(dir) = binary.parent() {
            let package = dir.join("node_modules").join("@anthropic-ai").join("claude-code");
            let native = package.join("bin").join("claude.exe");
            if native.is_file() {
                return Command::new(native);
            }
            let cli = package.join("cli.js");
            if cli.is_file() {
                let mut command = Command::new("node");
                command.arg(cli);
                return command;
            }
        }
    }
    Command::new(binary)
}

#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

/// Runs claude with argv, writes stdin, waits, and returns what it printed. Blocks the calling thread.
pub fn spawn(binary: &Path, argv: &[String], stdin_text: &str, cwd: &Path, runs: &Runs, run_id: &str) -> Result<ProcessResult, String> {
    let mut command = command_for(binary);
    command.args(argv).current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    // Claude Code thinks before it answers unless told not to; for a
    // one-shot read that was forty seconds and thousands of tokens spent
    // before the first word, for no better answer.
    command.env("MAX_THINKING_TOKENS", "0");
    hide_window(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start Claude Code at {}: {e}", binary.display()))?;
    let mut stdin = child.stdin.take().ok_or("Claude Code opened without a stdin")?;
    let stdout = child.stdout.take().ok_or("Claude Code opened without a stdout")?;
    let stderr = child.stderr.take().ok_or("Claude Code opened without a stderr")?;

    let text = stdin_text.to_owned();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(text.as_bytes());
    });
    let out = std::thread::spawn(move || read_all(stdout));
    let err = std::thread::spawn(move || read_all(stderr));

    let handle = Arc::new(Mutex::new(child));
    if let Ok(mut map) = runs.0.lock() {
        map.insert(run_id.to_owned(), handle.clone());
    }
    let status = loop {
        let waited = handle.lock().map_err(|e| e.to_string())?.try_wait();
        match waited {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => break Err(e.to_string()),
        }
    };
    if let Ok(mut map) = runs.0.lock() {
        map.remove(run_id);
    }
    let _ = writer.join();
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();
    let status = status?;
    Ok(ProcessResult { stdout, stderr, exit_code: status.code().unwrap_or(-1) })
}

/// Kills the run with this id, if it is still going. Claude Code exits 143 and records nothing.
pub fn cancel(runs: &Runs, run_id: &str) {
    let handle = runs.0.lock().ok().and_then(|map| map.get(run_id).cloned());
    if let Some(handle) = handle {
        if let Ok(mut child) = handle.lock() {
            let _ = child.kill();
        }
    }
}

/// `claude --version`, as the Coach view shows it.
pub fn version(binary: &Path) -> Result<String, String> {
    let mut command = command_for(binary);
    command.arg("--version");
    hide_window(&mut command);
    let output = command.output().map_err(|e| format!("Could not run Claude Code at {}: {e}", binary.display()))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let version = text.split_whitespace().next().unwrap_or("").to_string();
    if output.status.success() && !version.is_empty() {
        Ok(format!("Claude Code {version}"))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() { "claude --version printed nothing".to_string() } else { stderr })
    }
}

/// `claude auth status --json`, as printed: signed in, the account, the plan.
pub fn auth(binary: &Path) -> Result<String, String> {
    let mut command = command_for(binary);
    command.args(["auth", "status", "--json"]);
    hide_window(&mut command);
    let output = command.output().map_err(|e| format!("Could not run Claude Code at {}: {e}", binary.display()))?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() && !text.is_empty() {
        Ok(text)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() { "claude auth status printed nothing".to_string() } else { stderr })
    }
}

fn read_all(mut reader: impl Read) -> String {
    let mut bytes = Vec::new();
    let _ = reader.read_to_end(&mut bytes);
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("storyline-assistant-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_like_where_does() {
        let first = temp("resolve-a");
        let second = temp("resolve-b");
        std::fs::write(second.join("claude.cmd"), "@echo off").unwrap();
        let path = std::env::join_paths([&first, &second]).unwrap();
        let path = path.to_string_lossy().into_owned();
        assert_eq!(resolve(&path, Some(".COM;.EXE;.BAT;.CMD")), Some(second.join("claude.cmd")));
        assert_eq!(resolve(&path, Some(".EXE")), None);
        std::fs::write(first.join("claude"), "#!/bin/sh").unwrap();
        assert_eq!(resolve(&path, None), Some(first.join("claude")));
        let _ = std::fs::remove_dir_all(&first);
        let _ = std::fs::remove_dir_all(&second);
    }

    #[cfg(windows)]
    #[test]
    fn a_script_stand_in_runs_with_its_argv_and_stdin_and_reports_its_exit() {
        let dir = temp("spawn");
        let script = dir.join("claude.cmd");
        std::fs::write(&script, "@echo off\r\nset /p line=\r\necho out %1 %2 %line%\r\necho err 1>&2\r\nexit /b 3\r\n").unwrap();
        let runs = Runs::default();
        let result = spawn(&script, &["-p".into(), "x".into()], "briefing\r\n", &dir, &runs, "run-1").unwrap();
        assert_eq!(result.stdout.trim(), "out -p x briefing");
        assert_eq!(result.stderr.trim(), "err");
        assert_eq!(result.exit_code, 3);
        assert!(runs.0.lock().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn version_takes_the_first_word() {
        let dir = temp("version");
        let script = dir.join("claude.cmd");
        std::fs::write(&script, "@echo off\r\necho 2.1.215 (Claude Code)\r\n").unwrap();
        assert_eq!(version(&script).unwrap(), "Claude Code 2.1.215");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
