mod terminal;
mod serial;
mod workspace;
mod toolchain;
mod firmware;
mod components;\nmod hardware;\nmod debug;

use terminal::TerminalManager;
use serial::SerialManager;
use workspace::WorkspaceManager;

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
        .manage(SerialManager::default())
        .manage(WorkspaceManager::default())\n        .manage(debug::DebugManager::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            terminal_default_cwd,
            terminal::terminal_start,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_stop,
            terminal::terminal_stop_all,
            serial::serial_list_ports,
            serial::serial_start,
            serial::serial_write,
            serial::serial_stop,
            workspace::workspace_pick,
            workspace::workspace_open_path,
            workspace::workspace_current,
            workspace::workspace_list,
            workspace::workspace_read_file,
            workspace::workspace_write_file,
            workspace::workspace_create_file,
            workspace::workspace_create_directory,
            toolchain::toolchain_scan,\n            toolchain::toolchain_install,\n            hardware::board_profiles,\n            hardware::peripheral_generate,\n            debug::debug_openocd_start,\n            debug::debug_openocd_stop,\n            debug::debug_gdb_probe,
            firmware::firmware_create_project,
            firmware::firmware_build,
            firmware::firmware_flash,
            components::component_search,
            components::component_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running APEX");
}
