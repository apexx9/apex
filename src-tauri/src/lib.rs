mod terminal;

use terminal::TerminalManager;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn terminal_default_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| format!("Could not determine the current directory: {error}"))
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
            terminal::terminal_stop_all
        ])
        .build(tauri::generate_context!())
        .expect("error while building APEX")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = app.state::<TerminalManager>();
            }
        });
}
