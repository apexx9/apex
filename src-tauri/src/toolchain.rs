use serde::Serialize;
use std::{path::PathBuf, process::Command};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainItem { pub id:&'static str,pub label:&'static str,pub executable:Option<String>,pub version:Option<String>,pub installed:bool,pub required_for:&'static str }
fn locate(executable:&str)->Option<PathBuf>{
 let finder=if cfg!(windows){"where.exe"}else{"which"};
 let output=Command::new(finder).arg(executable).output().ok()?;
 if !output.status.success(){return None}
 let stdout=String::from_utf8_lossy(&output.stdout).into_owned();
 stdout.lines().map(str::trim).find(|s|!s.is_empty()).map(PathBuf::from)
}
fn read_version(path:&PathBuf,executable:&str)->Option<String>{
 if executable.ends_with(".py")||executable.ends_with(".bat")||executable.ends_with(".cmd"){return None}
 let output=Command::new(path).arg("--version").output().ok()?;
 let text=if output.stdout.is_empty(){String::from_utf8_lossy(&output.stderr).to_string()}else{String::from_utf8_lossy(&output.stdout).to_string()};
 text.lines().next().map(str::trim).filter(|s|!s.is_empty()).map(str::to_string)
}
#[tauri::command]
pub fn toolchain_scan()->Vec<ToolchainItem>{
 let defs:[(&str,&str,&str,&str);14]=[
 ("python","Python","python","ESP-IDF scripts and tooling"),("cmake","CMake","cmake","ESP-IDF build system"),("ninja","Ninja","ninja","ESP-IDF build system"),("git","Git","git","Source control"),("idf","ESP-IDF","idf.py","ESP-IDF builds"),("esptool","esptool","esptool","Firmware flashing"),("openocd","OpenOCD","openocd","JTAG debugging"),("xtensa-gcc","Xtensa GCC","xtensa-esp32-elf-gcc","Original ESP32 compiler"),("xtensa-gdb","Xtensa GDB","xtensa-esp32-elf-gdb","Original ESP32 debugger"),("riscv-gcc","RISC-V GCC","riscv32-esp-elf-gcc","RISC-V ESP targets"),("riscv-gdb","RISC-V GDB","riscv32-esp-elf-gdb","RISC-V ESP debugging"),("arduino-cli","Arduino CLI","arduino-cli","Arduino build and upload"),("platformio","PlatformIO","pio","PlatformIO builds"),("gdb","GNU GDB","gdb","Generic GDB debugging")];
 defs.into_iter().map(|(id,label,exe,required)|{let path=locate(exe);let version=path.as_ref().and_then(|p|read_version(p,exe));let installed=path.is_some();ToolchainItem{id,label,executable:path.map(|p|p.to_string_lossy().into_owned()),version,installed,required_for:required}}).collect()
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct InstallResult{pub success:bool,pub output:String,pub command:String}
#[tauri::command]
pub fn toolchain_install(tool:String)->Result<InstallResult,String>{
 if !cfg!(windows){return Err("Guided package installation currently supports Windows via winget.".into())}
 let (id,label)=match tool.as_str(){
 "git"=>("Git.Git","Git"),"python"=>("Python.Python.3.12","Python 3.12"),"cmake"=>("Kitware.CMake","CMake"),"ninja"=>("Ninja-build.Ninja","Ninja"),"arduino-cli"=>("ArduinoSA.CLI","Arduino CLI"),"vscode"=>("Microsoft.VisualStudioCode","Visual Studio Code"),
 _=>return Err("This tool requires the official Espressif installer or manual setup; APEX will not run an unverified installer.".into())
 };
 let output=Command::new("winget").args(["install","--id",id,"--exact","--silent","--accept-package-agreements","--accept-source-agreements"]).output().map_err(|e|format!("Could not start winget: {e}. Install App Installer from Microsoft Store."))?;
 let mut text=String::from_utf8_lossy(&output.stdout).into_owned();text.push_str(&String::from_utf8_lossy(&output.stderr));
 Ok(InstallResult{success:output.status.success(),output:text,command:format!("winget install --id {id} --exact · {label}")})
}
