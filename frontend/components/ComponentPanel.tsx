"use client";

import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Search, Download, Package, AlertCircle } from "lucide-react";

type Result = { command: string; success: boolean; output: string };

export function ComponentPanel({ framework }: { framework: "arduino" | "esp-idf" }) {
  const [query,setQuery]=useState("");
  const [output,setOutput]=useState("");
  const [command,setCommand]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const run = async (action:"search"|"install") => {
    if (!isTauri()) { setError("Package management requires the APEX desktop runtime."); return; }
    if (!query.trim()) return;
    setBusy(true); setError(""); setOutput(action==="search"?"Searching registry…":"Installing dependency…");
    try {
      const result=await invoke<Result>(action==="search"?"component_search":"component_install",{framework,query});
      setCommand(result.command);
      setOutput(result.output || (result.success?"Command completed.":"Command failed."));
      if (!result.success) setError("The package manager returned a non-zero exit status.");
    } catch (cause) { setError(cause instanceof Error?cause.message:String(cause)); setOutput(""); }
    finally { setBusy(false); }
  };
  const registry=framework==="arduino"?"Arduino Library Manager":"ESP-IDF Component Registry";
  return <section className="component-panel">
    <header className="component-header"><Package size={19}/><div><strong>Component manager</strong><span>{registry} · framework package workflows</span></div></header>
    <p className="component-description">{framework==="arduino"?"Search and install libraries into the Arduino CLI user's library environment.":"Add ESP-IDF Component Registry dependencies to the active project's manifest."}</p>
    <label className="component-label" htmlFor="component-query">{framework==="esp-idf"?"Registry identifier":"Library search"}</label>
    <div className="component-search"><input id="component-query" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void run("search");}} placeholder={framework==="esp-idf"?"espressif/esp-dsp":"e.g. Adafruit BusIO"} /><button onClick={()=>void run("search")} disabled={busy||!query.trim()}><Search size={13}/> Search</button></div>
    <div className="component-actions"><button onClick={()=>void run("install")} disabled={busy||!query.trim()}><Download size={13}/>{framework==="esp-idf"?"Add dependency":"Install library"}</button><span>Requires the selected package manager on PATH.</span></div>
    {error&&<div className="component-error"><AlertCircle size={13}/>{error}</div>}
    <div className="component-output"><div>{command||"REGISTRY OUTPUT"}</div><pre>{output||"Search for a package or enter its exact name to install it into the active workspace."}</pre></div>
    {framework==="esp-idf"&&<p className="component-note">Find the exact component identifier in the Espressif Component Registry; APEX runs <code>idf.py add-dependency</code> for the identifier you provide.</p>}
  </section>;
}
