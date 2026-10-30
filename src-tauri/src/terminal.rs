use serde::Serialize;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub session_id: String,
    pub stream: String,
    pub text: String,
}

struct Session {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStarted {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
    pub pid: u32,
}

#[tauri::command]
pub fn terminal_start(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    session_id: String,
    shell: String,
    cwd: String,
) -> Result<TerminalStarted, String> {
    if session_id.trim().is_empty() {
        return Err("A terminal session ID is required".into());
    }

    let mut sessions = manager.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    if sessions.contains_key(&session_id) {
        return Err("A terminal session with this ID already exists".into());
    }

    let working_dir = std::path::PathBuf::from(&cwd);
    if !working_dir.is_dir() {
        return Err(format!("Working directory does not exist: {cwd}"));
    }

    let (program, args) = match shell.as_str() {
        "powershell" => (
            if cfg!(windows) { "powershell.exe" } else { "pwsh" },
            vec!["-NoLogo", "-NoProfile", "-NoExit", "-Command", "-"],
        ),
        "cmd" if cfg!(windows) => ("cmd.exe", vec!["/Q", "/K"]),
        "cmd" => return Err("Command Prompt is only available on Windows".into()),
        _ => return Err("Unsupported shell. Choose powershell or cmd.".into()),
    };

    let mut command = Command::new(program);
    command.args(args).current_dir(&working_dir)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command.spawn().map_err(|error| format!("Could not start {program}: {error}"))?;
    let pid = child.id();
    let stdin = child.stdin.take().ok_or("Could not open terminal input")?;
    let stdout = child.stdout.take().ok_or("Could not open terminal output")?;
    let stderr = child.stderr.take().ok_or("Could not open terminal error stream")?;

    for (stream_name, reader) in [("stdout", stdout), ("stderr", stderr)] {
        let app_handle = app.clone();
        let id = session_id.clone();
        thread::spawn(move || {
            let reader = BufReader::new(reader);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        let _ = app_handle.emit("apex://terminal-output", TerminalOutput {
                            session_id: id.clone(),
                            stream: stream_name.to_string(),
                            text,
                        });
                    }
                    Err(error) => {
                        let _ = app_handle.emit("apex://terminal-output", TerminalOutput {
                            session_id: id.clone(),
                            stream: "system".into(),
                            text: format!("Terminal output read error: {error}"),
                        });
                        break;
                    }
                }
            }
        });
    }

    sessions.insert(session_id.clone(), Session { child, stdin });
    Ok(TerminalStarted {
        session_id,
        shell,
        cwd: working_dir.to_string_lossy().into_owned(),
        pid,
    })
}

#[tauri::command]
pub fn terminal_write(
    manager: State<'_, TerminalManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    let session = sessions.get_mut(&session_id).ok_or("Terminal session not found")?;
    session.stdin.write_all(input.as_bytes()).map_err(|error| format!("Could not write to terminal: {error}"))?;
    session.stdin.flush().map_err(|error| format!("Could not flush terminal input: {error}"))
}

#[tauri::command]
pub fn terminal_resize(_session_id: String, _cols: u16, _rows: u16) -> Result<(), String> {
    // std::process pipes do not provide a PTY. A ConPTY-backed implementation will replace
    // this compatibility command so terminal applications can receive real resize events.
    Ok(())
}

#[tauri::command]
pub fn terminal_stop(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    if let Some(mut session) = sessions.remove(&session_id) {
        session.child.kill().map_err(|error| format!("Could not stop terminal: {error}"))?;
        let _ = session.child.wait();
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_stop_all(manager: State<'_, TerminalManager>) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    for (_, mut session) in sessions.drain() {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}
