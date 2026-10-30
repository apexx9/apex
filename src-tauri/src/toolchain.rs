use serde::Serialize;
use std::{path::PathBuf, process::Command};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainItem {
    pub id: &'static str,
    pub label: &'static str,
    pub executable: Option<String>,
    pub version: Option<String>,
    pub installed: bool,
    pub required_for: &'static str,
}

fn locate(executable: &str) -> Option<PathBuf> {
    let finder = if cfg!(windows) { "where.exe" } else { "which" };
    let output = Command::new(finder).arg(executable).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let path = stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    Some(PathBuf::from(path))
}

fn read_version(path: &PathBuf, executable: &str) -> Option<String> {
    // Python scripts and Windows command wrappers are not launched implicitly.
    if executable.ends_with(".py") || executable.ends_with(".bat") || executable.ends_with(".cmd") {
        return None;
    }
    let output = Command::new(path).arg("--version").output().ok()?;
    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    text.lines().next().map(str::trim).filter(|line| !line.is_empty()).map(str::to_string)
}

#[tauri::command]
pub fn toolchain_scan() -> Vec<ToolchainItem> {
    let definitions: [(&'static str, &'static str, &'static str, &'static str); 11] = [
        ("python", "Python", "python", "ESP-IDF, scripts and tooling"),
        ("cmake", "CMake", "cmake", "ESP-IDF and CMake projects"),
        ("ninja", "Ninja", "ninja", "ESP-IDF build system"),
        ("git", "Git", "git", "Version control and dependency workflows"),
        ("idf", "ESP-IDF", "idf.py", "ESP32 firmware builds and flashing"),
        ("esptool", "esptool", "esptool", "ESP32 firmware flashing"),
        ("openocd", "OpenOCD", "openocd", "JTAG debugging"),
        ("xtensa-gcc", "Xtensa ESP32 GCC", "xtensa-esp32-elf-gcc", "Original ESP32 compiler"),
        ("xtensa-gdb", "Xtensa GDB", "xtensa-esp32-elf-gdb", "Original ESP32 debugger"),
        ("riscv-gcc", "RISC-V ESP GCC", "riscv32-esp-elf-gcc", "RISC-V ESP32-family targets"),
        ("riscv-gdb", "RISC-V ESP GDB", "riscv32-esp-elf-gdb", "RISC-V ESP32-family debugging"),
    ];

    definitions.into_iter().map(|(id, label, executable, required_for)| {
        let path = locate(executable);
        let version = path.as_ref().and_then(|path| read_version(path, executable));
        let installed = path.is_some();
        ToolchainItem {
            id,
            label,
            executable: path.map(|path| path.to_string_lossy().into_owned()),
            version,
            installed,
            required_for,
        }
    }).collect()
}
