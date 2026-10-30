use serde::Serialize;
use std::{path::PathBuf, process::Command};
use tauri::State;
use crate::workspace::WorkspaceManager;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ComponentCommandResult {
    pub command: String,
    pub success: bool,
    pub output: String,
}

fn validate_package(value: &str) -> Result<String,String> {
    let value=value.trim();
    if value.is_empty() || value.len()>160 || !value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c,'-'|'_'|'.'|'/'|'@'|'^'|' ')) {
        return Err("Use a registry package name; shell operators and paths are not allowed".into());
    }
    Ok(value.to_string())
}

fn run(program: &str, args: &[String], cwd: Option<PathBuf>) -> Result<ComponentCommandResult,String> {
    let mut command=Command::new(program);
    command.args(args);
    if let Some(path)=cwd { command.current_dir(path); }
    let output=command.output().map_err(|e| format!("Could not start {program}: {e}. Check that the package manager is installed and on PATH."))?;
    let mut text=String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Ok(ComponentCommandResult {
        command:format!("{program} {}",args.join(" ")),
        success:output.status.success(),
        output:text,
    })
}

#[tauri::command]
pub fn component_search(framework: String, query: String) -> Result<ComponentCommandResult,String> {
    let query=validate_package(&query)?;
    if query.len()<2 { return Err("Enter at least two characters to search".into()); }
    match framework.as_str() {
        "arduino" => run("arduino-cli",&["lib".into(),"search".into(),query],None),
        "platformio" => run("pio",&["pkg".into(),"search".into(),query],None),
        "esp-idf" => Ok(ComponentCommandResult {
            command:"ESP-IDF Component Registry".into(),
            success:true,
            output:format!("For ESP-IDF, add the exact registry identifier in the Add dependency field (namespace/component). The project uses idf.py add-dependency. Browse the official registry at https://components.espressif.com/\n\nSearch term: {query}"),
        }),
        _ => Err("Unsupported component registry".into())
    }
}

#[tauri::command]
pub fn component_install(manager: State<'_,WorkspaceManager>, framework: String, package: String) -> Result<ComponentCommandResult,String> {
    let package=validate_package(&package)?;
    let root=manager.root()?;
    match framework.as_str() {
        "arduino" => run("arduino-cli",&["lib".into(),"install".into(),package],Some(root)),
        "platformio" => run("pio",&["pkg".into(),"install".into(),"--library".into(),package],Some(root)),
        "esp-idf" => run("idf.py",&["add-dependency".into(),package],Some(root)),
        _ => Err("Unsupported component registry".into())
    }
}

#[cfg(test)]
mod tests {
    use super::validate_package;
    #[test] fn accepts_registry_identifiers() { assert!(validate_package("espressif/esp-dsp").is_ok()); }
    #[test] fn rejects_shell_syntax() { assert!(validate_package("foo && whoami").is_err()); }
}
