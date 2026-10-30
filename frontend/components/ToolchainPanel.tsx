"use client";

import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, CircleAlert, CircleDashed, RefreshCw, Wrench } from "lucide-react";

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
          <span className={tool.installed ? "toolchain-badge found" : "toolchain-badge missing"}>{tool.installed ? "FOUND" : "MISSING"}</span>
        </article>)}
      </div>
      {tools.length > 0 && <p className="toolchain-note"><CircleAlert size={13}/> Detection checks PATH only. ESP-IDF installations that have not been added to PATH may need manual environment setup.</p>}
    </section>
  );
}
