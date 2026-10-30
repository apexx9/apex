"use client";

import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, CircleAlert, CircleDashed, RefreshCw, Wrench, Download } from "lucide-react";

type ToolchainItem = {
  id: string;
  label: string;
  executable: string | null;
  version: string | null;
  installed: boolean;
  requiredFor: string;
};

export function ToolchainPanel() {
  const [tools, setTools] = useState<ToolchainItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [installing,setInstalling]=useState("");
  const [installOutput,setInstallOutput]=useState("");

  const scan = async () => {
    if (!isTauri()) {
      setError("Toolchain discovery is available in the APEX desktop application.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setTools(await invoke<ToolchainItem[]>("toolchain_scan"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void scan(); }, []);

  const installed = tools.filter((tool) => tool.installed).length;
  const install = async (id:string) => { if (!window.confirm(`Install ${id} using Windows Package Manager (winget)? This may download software and modify your Windows environment.`)) return; setInstalling(id); setInstallOutput(""); try { const result=await invoke<{success:boolean;output:string;command:string}>("toolchain_install",{tool:id}); setInstallOutput(result.command+"\n"+result.output); await scan(); } catch(e) { setInstallOutput(String(e)); } finally { setInstalling(""); } };

  return (
    <section className="toolchain-panel">
      <header className="toolchain-header">
        <div><Wrench size={19}/><div><strong>Development toolchains</strong><span>Detected on this Windows environment</span></div></div>
        <button onClick={() => void scan()} disabled={loading}><RefreshCw size={13} className={loading ? "spin" : ""}/>{loading ? "Scanning" : "Rescan"}</button>
      </header>
      {error && <div className="toolchain-error">{error}</div>}
      {tools.length > 0 && <div className="toolchain-summary">{installed} of {tools.length} tools detected</div>}
      <div className="toolchain-list">
        {tools.map((tool) => <article className="toolchain-item" key={tool.id}>
          <div className={tool.installed ? "toolchain-state found" : "toolchain-state missing"}>
            {tool.installed ? <Check size={13}/> : <CircleDashed size={13}/>}
          </div>
          <div className="toolchain-info">
            <strong>{tool.label}</strong>
            <span>{tool.version || (tool.executable ?? "Not found on PATH")}</span>
            <small>{tool.requiredFor}</small>
          </div>
          <span className={tool.installed ? "toolchain-badge found" : "toolchain-badge missing"}>{tool.installed ? "FOUND" : "MISSING"}</span>{!tool.installed && ["git","python","cmake","ninja","arduino-cli"].includes(tool.id) && <button className="tool-install" disabled={!!installing} onClick={()=>void install(tool.id)}><Download size={11}/>{installing===tool.id?"Installing":"Install"}</button>}
        </article>)}
      </div>
      {installOutput && <pre className="toolchain-install-output">{installOutput}</pre>}{tools.length > 0 && <p className="toolchain-note"><CircleAlert size={13}/> Detection checks PATH. Use Espressif official ESP-IDF installer for ESP-IDF, compiler toolchains, OpenOCD and GDB; APEX does not download unverified toolchain installers.</p>}
    </section>
  );
}
