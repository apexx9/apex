use serde::Serialize;
use std::{io::{BufRead,BufReader,Write},path::Path,process::{Child,ChildStdin,Command,Stdio},sync::Mutex,thread};
use tauri::{AppHandle,Emitter,State};
#[derive(Default)] pub struct DebugManager {
 openocd:Mutex<Option<Child>>,
 gdb:Mutex<Option<Child>>,
 gdb_input:Mutex<Option<ChildStdin>>,
}
#[derive(Clone,Serialize)]#[serde(rename_all="camelCase")]struct DebugOutput{text:String,stream:String}
fn stream_output<R:std::io::Read+Send+'static>(app:AppHandle,reader:R,stream:&'static str){
 thread::spawn(move||{for line in BufReader::new(reader).lines().flatten(){let _=app.emit("apex://debug-output",DebugOutput{text:line,stream:stream.into()});}});
}
#[tauri::command]
pub fn debug_openocd_start(app:AppHandle,state:State<'_,DebugManager>,interface_config:String,target_config:String)->Result<String,String>{
 if interface_config.trim().is_empty()||target_config.trim().is_empty(){return Err("Choose both an OpenOCD interface config and target config.".into())}
 if interface_config.len()>260||target_config.len()>260||interface_config.chars().any(char::is_control)||target_config.chars().any(char::is_control){return Err("Invalid OpenOCD config path.".into())}
 let mut slot=state.openocd.lock().map_err(|_|"Debugger state unavailable")?;
 if slot.is_some(){return Err("An OpenOCD process is already running. Stop it before starting another.".into())}
 let mut child=Command::new("openocd").args(["-f",&interface_config,"-f",&target_config]).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e|format!("Could not start OpenOCD: {e}. Check the executable and config paths."))?;
 if let Some(out)=child.stdout.take(){stream_output(app.clone(),out,"openocd");}
 if let Some(out)=child.stderr.take(){stream_output(app,out,"openocd-error");}
 *slot=Some(child);Ok("OpenOCD started. Its GDB server is commonly localhost:3333; check the log for the actual endpoint.".into())
}
#[tauri::command]
pub fn debug_openocd_stop(state:State<'_,DebugManager>)->Result<(),String>{
 let mut slot=state.openocd.lock().map_err(|_|"Debugger state unavailable")?;
 if let Some(mut child)=slot.take(){let _=child.kill();let _=child.wait();}Ok(())
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
#[tauri::command]
pub fn debug_gdb_start(app:AppHandle,state:State<'_,DebugManager>,executable:String,elf_path:String)->Result<String,String>{
 let allowed=["xtensa-esp32-elf-gdb","riscv32-esp-elf-gdb","gdb"];
 if !allowed.contains(&executable.as_str()){return Err("Unsupported GDB executable.".into())}
 let elf=Path::new(&elf_path);
 if !elf.is_file()||!elf_path.to_ascii_lowercase().ends_with(".elf"){return Err("Select an existing firmware .elf file.".into())}
 let mut child_slot=state.gdb.lock().map_err(|_|"Debugger state unavailable")?;
 if child_slot.is_some(){return Err("A GDB session is already running.".into())}
 let mut child=Command::new(&executable).args(["--interpreter=mi2",&elf_path]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e|format!("Could not start GDB: {e}"))?;
 let input=child.stdin.take().ok_or("Could not open GDB command input")?;
 if let Some(out)=child.stdout.take(){stream_output(app.clone(),out,"gdb-mi");}
 if let Some(out)=child.stderr.take(){stream_output(app,out,"gdb-error");}
 *state.gdb_input.lock().map_err(|_|"GDB input unavailable")?=Some(input);
 *child_slot=Some(child);
 Ok("GDB MI2 session started with the selected ELF. Use MI commands such as -target-select remote localhost:3333, -break-insert main and -exec-continue.".into())
}
#[tauri::command]
pub fn debug_gdb_command(state:State<'_,DebugManager>,command:String)->Result<(),String>{
 if command.trim().is_empty()||command.len()>4096||command.chars().any(|c|c.is_control()&&c!='\n'&&c!='\r'){return Err("Enter a valid GDB/MI command (maximum 4096 characters).".into())}
 let mut input=state.gdb_input.lock().map_err(|_|"GDB input unavailable")?;
 let stdin=input.as_mut().ok_or("GDB is not running")?;
 stdin.write_all(command.trim().as_bytes()).map_err(|e|format!("Could not write to GDB: {e}"))?;
 stdin.write_all(b"\n").map_err(|e|format!("Could not send GDB command: {e}"))?;
 stdin.flush().map_err(|e|format!("Could not flush GDB command: {e}"))
}
#[tauri::command]
pub fn debug_gdb_stop(state:State<'_,DebugManager>)->Result<(),String>{
 state.gdb_input.lock().map_err(|_|"GDB input unavailable")?.take();
 let mut slot=state.gdb.lock().map_err(|_|"Debugger state unavailable")?;
 if let Some(mut child)=slot.take(){let _=child.kill();let _=child.wait();}Ok(())
}
