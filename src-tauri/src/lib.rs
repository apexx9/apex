mod terminal;
mod serial;

use terminal::TerminalManager;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn terminal_default_cwd() -> Result<String, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_dir());
    let path = home.or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| "Could not determine a starting directory for the terminal".to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalManager::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            terminal_default_cwd,
            terminal::terminal_start,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_stop,
            terminal::terminal_stop_all,
            serial::serial_list_ports
        ])
        .run(tauri::generate_context!())
        .expect("error while running APEX");
}
