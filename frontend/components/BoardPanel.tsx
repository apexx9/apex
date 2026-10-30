"use client";
import {useEffect,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {AlertTriangle,Check,Copy,Cpu,Wrench} from "lucide-react";
type Pin={gpio:number;label:string;input:boolean;output:boolean;adc:string|null;dac:boolean;touch:boolean;notes:string};
type Profile={id:string;name:string;family:string;target:string;description:string;verified:boolean;pins:Pin[];warnings:string[]};
type Result={code:string;conflicts:string[];warnings:string[];summary:string};
const choices=[["gpio","GPIO"],["i2c","I²C"],["spi","SPI"],["uart","UART"],["pwm","PWM / LEDC"],["adc","ADC"],["dac","DAC"],["can","CAN / TWAI"]];
export function BoardPanel({framework}:{framework:"arduino"|"esp-idf"}){
 const [profiles,setProfiles]=useState<Profile[]>([]),[selected,setSelected]=useState("esp32-classic-generic-30"),[pins,setPins]=useState<number[]>([2]),[peripheral,setPeripheral]=useState("gpio"),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(isTauri())void invoke<Profile[]>("board_profiles").then(setProfiles).catch(e=>setError(String(e)));},[]);
 const profile=profiles.find(x=>x.id===selected)||profiles[0];
 const toggle=(n:number)=>setPins(old=>old.includes(n)?old.filter(x=>x!==n):[...old,n].sort((a,b)=>a-b));
 const generate=async()=>{setBusy(true);setError("");try{setResult(await invoke<Result>("peripheral_generate",{peripheral,pins,framework}));}catch(e){setError(String(e));setResult(null)}finally{setBusy(false)}};
 return <section className="board-workbench">
  <header className="board-workbench-head"><Cpu size={16}/><strong>Board profile & GPIO explorer</strong></header>
  <label className="hw-label">BOARD PROFILE</label><select className="hw-select" value={selected} onChange={e=>setSelected(e.target.value)}>{profiles.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
  {profile&&<><div className="board-profile-copy"><b>{profile.family} · target {profile.target}</b><span>{profile.description}</span><em>{profile.verified?"Verified profile":"Generic reference only · pinout not verified"}</em></div>
  <div className="board-warnings">{profile.warnings.map(x=><p key={x}><AlertTriangle size={12}/>{x}</p>)}</div>
  <div className="pin-grid">{profile.pins.map(pin=><button key={pin.gpio} title={pin.notes} className={"pin-cell "+(pins.includes(pin.gpio)?"chosen":pin.output?"":"input-only")} onClick={()=>toggle(pin.gpio)}><b>{pin.gpio}</b><span>{pin.adc||(pin.dac?"DAC":pin.touch?"TOUCH":"GPIO")}</span>{pins.includes(pin.gpio)&&<Check size={10}/>}</button>)}</div>
  <div className="pin-legend">Selected: {pins.length?pins.map(x=>"GPIO"+x).join(", "):"none"} · Select pins for configuration</div></>}
  <div className="peripheral-config"><div className="peripheral-heading"><Wrench size={13}/> Peripheral configuration & code generation</div>
  <label className="hw-label">PERIPHERAL</label><select className="hw-select" value={peripheral} onChange={e=>setPeripheral(e.target.value)}>{choices.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>
  <p className="hw-hint">For I²C, SPI, UART and TWAI, select at least two pins in signal order. Generated code is a starting point; verify wiring, voltage and target-specific details before flashing.</p>
  <button className="hw-primary" disabled={busy||pins.length===0} onClick={()=>void generate()}>{busy?"Generating…":"Generate configuration"}</button>
  {error&&<p className="hw-error">{error}</p>}
  {result&&<><b className="hw-result-title">{result.summary}</b>{result.conflicts.map(x=><p className="hw-conflict" key={x}><AlertTriangle size={12}/>{x}</p>)}{result.warnings.map(x=><p className="hw-warning" key={x}><AlertTriangle size={12}/>{x}</p>)}<pre className="hw-code">{result.code}</pre><button className="hw-secondary" onClick={()=>void navigator.clipboard.writeText(result.code)}><Copy size={12}/> Copy generated code</button></>}
  </div></section>;
}