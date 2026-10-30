"use client";
import {useEffect,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {listen,type UnlistenFn} from "@tauri-apps/api/event";
import {Bug,Play,Square,Terminal,AlertTriangle} from "lucide-react";
type Event={text:string;stream:string};
export function DebugPanel(){
 const [iface,setIface]=useState("interface/esp-prog.cfg"),[target,setTarget]=useState("target/esp32.cfg"),[output,setOutput]=useState("OpenOCD output will appear here."),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[gdb,setGdb]=useState("xtensa-esp32-elf-gdb"),[version,setVersion]=useState("");
 useEffect(()=>{let off:UnlistenFn|undefined;void listen<Event>("apex://debug-output",e=>setOutput(x=>x+"\n"+e.payload.text)).then(fn=>{off=fn});return()=>off?.();},[]);
 const start=async()=>{if(!isTauri())return;setBusy(true);setOutput("Starting OpenOCD…");try{const msg=await invoke<string>("debug_openocd_start",{interfaceConfig:iface,targetConfig:target});setOutput(msg);setRunning(true)}catch(e){setOutput(String(e))}finally{setBusy(false)}};
 const stop=async()=>{try{await invoke("debug_openocd_stop");setRunning(false);setOutput(x=>x+"\nOpenOCD stopped.")}catch(e){setOutput(String(e))}};
 const probe=async()=>{try{setVersion(await invoke<string>("debug_gdb_probe",{executable:gdb}))}catch(e){setVersion(String(e))}};
 return <section className="debug-panel"><header className="debug-header"><Bug size={17}/><div><b>OpenOCD / GDB</b><span>JTAG server process and debugger toolchain check</span></div></header>
 <div className="debug-warning"><AlertTriangle size={13}/> A serial USB adapter is not automatically a JTAG probe. Config files must match your adapter, ESP32 variant and wiring.</div>
 <label className="hw-label">OPENOCD INTERFACE CONFIG</label><input className="debug-input" value={iface} onChange={e=>setIface(e.target.value)}/>
 <label className="hw-label">OPENOCD TARGET CONFIG</label><input className="debug-input" value={target} onChange={e=>setTarget(e.target.value)}/>
 <div className="debug-actions"><button disabled={busy||running} onClick={()=>void start()}><Play size={12}/> Start OpenOCD</button><button disabled={!running} onClick={()=>void stop()}><Square size={12}/> Stop</button></div>
 <label className="hw-label">GDB EXECUTABLE</label><select className="hw-select" value={gdb} onChange={e=>setGdb(e.target.value)}><option value="xtensa-esp32-elf-gdb">Xtensa ESP32 GDB</option><option value="riscv32-esp-elf-gdb">RISC-V ESP GDB</option><option value="gdb">GNU GDB</option></select><button className="hw-secondary" onClick={()=>void probe()}><Terminal size={12}/> Check GDB version</button>{version&&<pre className="debug-version">{version}</pre>}
 <div className="debug-output-head">SERVER OUTPUT</div><pre className="debug-output">{output}</pre><p className="hw-hint">OpenOCD commonly exposes GDB at localhost:3333. Connect the matching GDB executable and load the ELF built for this target. Breakpoints and live variables still require a configured GDB session.</p></section>;
}