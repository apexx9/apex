use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
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
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
                let _ = session.child.wait();
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStarted {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
    pub pid: Option<u32>,
}

#[tauri::command]
pub fn terminal_start(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    session_id: String,
    shell: String,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalStarted, String> {
    if session_id.trim().is_empty() {
        return Err("A terminal session ID is required".into());
    }

    let working_dir = PathBuf::from(&cwd);
    if !working_dir.is_dir() {
        return Err(format!("Working directory does not exist: {cwd}"));
    }

    let (program, args) = match shell.as_str() {
        "powershell" if cfg!(windows) => ("powershell.exe", vec!["-NoLogo", "-NoProfile"]),
        "powershell" => ("pwsh", vec!["-NoLogo", "-NoProfile"]),
        "cmd" if cfg!(windows) => ("cmd.exe", vec!["/Q"]),
        "cmd" => return Err("Command Prompt is only available on Windows".into()),
        _ => return Err("Unsupported shell. Choose powershell or cmd.".into()),
    };

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: rows.unwrap_or(30).max(5),
        cols: cols.unwrap_or(100).max(20),
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|error| format!("Could not allocate terminal: {error}"))?;

    let mut command = CommandBuilder::new(program);
    command.args(args);
    command.cwd(&working_dir);

    let child = pair.slave.spawn_command(command)
        .map_err(|error| format!("Could not start {program}: {error}"))?;
    let pid = child.process_id();
    let writer = pair.master.take_writer()
        .map_err(|error| format!("Could not open terminal input: {error}"))?;
    let reader = pair.master.try_clone_reader()
        .map_err(|error| format!("Could not open terminal output: {error}"))?;

    let mut sessions = manager.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    if sessions.contains_key(&session_id) {
        let mut child = child;
        let _ = child.kill();
        return Err("A terminal session with this ID already exists".into());
    }

    let app_handle = app.clone();
    let id = session_id.clone();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0_u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let text = String::from_utf8_lossy(&buffer[..count]).into_owned();
                    if app_handle.emit("apex://terminal-output", TerminalOutput {
                        session_id: id.clone(),
                        stream: "pty".into(),
                        text,
                    }).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = app_handle.emit("apex://terminal-output", TerminalOutput {
                        session_id: id.clone(),
                        stream: "system".into(),
                        text: format!("\r\nTerminal reader stopped: {error}\r\n"),
                    });
                    break;
                }
            }
        }
    });

    sessions.insert(session_id.clone(), Session {
        child,
        writer,
        master: pair.master,
    });

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
    session.writer.write_all(input.as_bytes())
        .map_err(|error| format!("Could not write to terminal: {error}"))?;
    session.writer.flush()
        .map_err(|error| format!("Could not flush terminal input: {error}"))
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    let session = sessions.get_mut(&session_id).ok_or("Terminal session not found")?;
    session.master.resize(PtySize {
        rows: rows.max(5),
        cols: cols.max(20),
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|error| format!("Could not resize terminal: {error}"))
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
