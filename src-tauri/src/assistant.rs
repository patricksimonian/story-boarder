//! Spawning the writer's own Claude Code for one run. The page sends a
//! run — workflow, model, rubric, briefing, schema — and never an argv:
//! every flag is fixed in `argv` below, so nothing that reaches this
//! command can hand Claude Code a tool, a folder, or a permission. The
//! binary is found the way `where` finds it, once, and cached; a run can
//! be cancelled by the id the page gave it.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
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

/// A run, as the page sends it: the four fields of a workflow request
/// and the model. This is all the page can say about a run; a body with
/// any other field in it is refused before it is looked at.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Run {
    pub workflow: String,
    pub model: String,
    pub system: String,
    pub briefing: String,
    pub schema: serde_json::Value,
}

/// An alias like `haiku`, or a full name: letters, digits, dots, dashes,
/// underscores, and a `[1m]` suffix. Never a flag.
fn is_model_name(model: &str) -> bool {
    let starts_plainly = model.chars().next().map(|c| c.is_ascii_alphanumeric()).unwrap_or(false);
    starts_plainly
        && model.len() <= 80
        && model.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '[' | ']'))
}

/// The argv for one run. Every flag is fixed here and the run's own text
/// goes in as values, so nothing in a run can add a flag. The run asks
/// for one schema-validated JSON answer, streamed as it is made. It keeps
/// nothing on disk, loads none of the writer's settings, and takes no
/// MCP server from anywhere. It is not `--bare`, because bare mode never
/// reads the subscription login. The only tool left is StructuredOutput,
/// which is how Claude Code delivers the schema-shaped answer: removing
/// every tool removes that one too, and the first real run spent five
/// turns being refused it. scripts/assistant.mjs builds the same list
/// for the browser build; change both, and the tests that pin them.
pub fn argv(run: &Run) -> Result<Vec<String>, String> {
    if !is_model_name(&run.model) {
        return Err(format!("\"{}\" is not a model name Claude Code takes", run.model));
    }
    if !run.schema.is_object() {
        return Err("The run's schema is not a JSON object".to_string());
    }
    Ok(vec![
        "-p".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--include-partial-messages".into(),
        "--json-schema".into(),
        run.schema.to_string(),
        "--model".into(),
        run.model.clone(),
        "--system-prompt".into(),
        run.system.clone(),
        "--tools".into(),
        "StructuredOutput".into(),
        "--strict-mcp-config".into(),
        "--no-session-persistence".into(),
        "--setting-sources".into(),
        String::new(),
    ])
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

/// Runs claude for one run — the argv from `argv`, the briefing on stdin —
/// hands each stdout line to `on_line` as it is printed, waits, and
/// returns what it printed. Blocks the calling thread.
pub fn spawn(
    binary: &Path,
    run: &Run,
    cwd: &Path,
    runs: &Runs,
    run_id: &str,
    on_line: impl Fn(&str) + Send + 'static,
) -> Result<ProcessResult, String> {
    let argv = argv(run)?;
    let mut command = command_for(binary);
    command.args(&argv).current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
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

    let text = run.briefing.clone();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(text.as_bytes());
    });
    let out = std::thread::spawn(move || {
        let mut all = String::new();
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if !line.trim().is_empty() {
                on_line(&line);
            }
            all.push_str(&line);
            all.push('\n');
        }
        all
    });
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

    fn a_run() -> Run {
        Run {
            workflow: "ping".into(),
            model: "haiku".into(),
            system: "s".into(),
            briefing: "briefing\r\n".into(),
            schema: serde_json::json!({}),
        }
    }

    #[test]
    fn the_argv_is_fixed_and_only_the_run_s_text_goes_in() {
        assert_eq!(
            argv(&a_run()).unwrap(),
            vec![
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--json-schema",
                "{}",
                "--model",
                "haiku",
                "--system-prompt",
                "s",
                "--tools",
                "StructuredOutput",
                "--strict-mcp-config",
                "--no-session-persistence",
                "--setting-sources",
                "",
            ]
        );
        // A rubric that begins with a dash, or reads like a flag, is still a value: commander takes the next word after --system-prompt whatever it is.
        let mut run = a_run();
        run.system = "--dangerously-skip-permissions".into();
        assert_eq!(argv(&run).unwrap()[10], "--dangerously-skip-permissions");
    }

    #[test]
    fn a_model_that_is_not_a_name_is_refused_and_so_is_a_run_with_more_in_it() {
        for bad in ["", "--dangerously-skip-permissions", "-p", "haiku & calc", "haiku\"", "haiku sonnet", "a\n"] {
            let mut run = a_run();
            run.model = bad.into();
            let err = argv(&run).unwrap_err();
            assert!(err.ends_with("is not a model name Claude Code takes"), "{bad:?}: {err}");
        }
        for good in ["haiku", "claude-haiku-4-5-20251001", "claude-sonnet-4-5[1m]", "opus_4.1"] {
            let mut run = a_run();
            run.model = good.into();
            assert!(argv(&run).is_ok(), "{good}");
        }
        let mut run = a_run();
        run.schema = serde_json::json!([]);
        assert_eq!(argv(&run).unwrap_err(), "The run's schema is not a JSON object");

        let extra = serde_json::from_str::<Run>(
            r#"{"workflow":"ping","model":"haiku","system":"s","briefing":"b","schema":{},"argv":["-p"]}"#,
        )
        .unwrap_err()
        .to_string();
        assert!(extra.contains("unknown field `argv`"), "{extra}");
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
    fn a_script_stand_in_runs_with_the_run_s_argv_and_briefing_and_reports_its_exit() {
        let dir = temp("spawn");
        let script = dir.join("claude.cmd");
        std::fs::write(&script, "@echo off\r\nset /p line=\r\necho out %1 %2 %line%\r\necho err 1>&2\r\nexit /b 3\r\n").unwrap();
        let runs = Runs::default();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let result = spawn(&script, &a_run(), &dir, &runs, "run-1", move |line| sink.lock().unwrap().push(line.to_string())).unwrap();
        assert_eq!(result.stdout.trim(), "out -p --output-format briefing");
        assert_eq!(seen.lock().unwrap().as_slice(), ["out -p --output-format briefing"]);
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
