use serde::Serialize;
use std::{io::{BufRead,BufReader},process::{Child,Command,Stdio},sync::Mutex,thread};
use tauri::{AppHandle,Emitter,State};
#[derive(Default)] pub struct DebugManager{child:Mutex<Option<Child>>}
#[derive(Clone,Serialize)]#[serde(rename_all="camelCase")]struct DebugOutput{text:String,stream:String}
#[tauri::command]
pub fn debug_openocd_start(app:AppHandle,state:State<'_,DebugManager>,interface_config:String,target_config:String)->Result<String,String>{
 if interface_config.trim().is_empty()||target_config.trim().is_empty(){return Err("Choose both an OpenOCD interface config and target config.".into())}
 if interface_config.len()>260||target_config.len()>260||interface_config.chars().any(char::is_control)||target_config.chars().any(char::is_control){return Err("Invalid OpenOCD config path.".into())}
 let mut slot=state.child.lock().map_err(|_|"Debugger state unavailable")?;
 if slot.is_some(){return Err("An OpenOCD process is already running. Stop it before starting another.".into())}
 let mut child=Command::new("openocd").args(["-f",&interface_config,"-f",&target_config]).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e|format!("Could not start OpenOCD: {e}. Check the executable and config paths."))?;
 let stdout=child.stdout.take();let stderr=child.stderr.take();let app1=app.clone();let app2=app.clone();
 if let Some(out)=stdout{thread::spawn(move||{for line in BufReader::new(out).lines().flatten(){let _=app1.emit("apex://debug-output",DebugOutput{text:line,stream:"stdout".into()});}});}
 if let Some(out)=stderr{thread::spawn(move||{for line in BufReader::new(out).lines().flatten(){let _=app2.emit("apex://debug-output",DebugOutput{text:line,stream:"stderr".into()});}});}
 *slot=Some(child);Ok("OpenOCD started. Connect GDB to the server endpoint reported in its output (commonly localhost:3333).".into())
}
#[tauri::command]
pub fn debug_openocd_stop(state:State<'_,DebugManager>)->Result<(),String>{
 let mut slot=state.child.lock().map_err(|_|"Debugger state unavailable")?;
 if let Some(mut child)=slot.take(){child.kill().map_err(|e|format!("Could not stop OpenOCD: {e}"))?;let _=child.wait();}Ok(())
}
#[tauri::command]
pub fn debug_gdb_probe(executable:String)->Result<String,String>{
 let allowed=["xtensa-esp32-elf-gdb","riscv32-esp-elf-gdb","gdb"];
 if !allowed.contains(&executable.as_str()){return Err("Unsupported GDB executable.".into())}
 let output=Command::new(&executable).arg("--version").output().map_err(|e|format!("Could not start {executable}: {e}"))?;
 let mut text=String::from_utf8_lossy(&output.stdout).into_owned();text.push_str(&String::from_utf8_lossy(&output.stderr));
 if !output.status.success(){return Err(text)}
 Ok(text.lines().take(2).collect::<Vec<_>>().join("\n"))
}
