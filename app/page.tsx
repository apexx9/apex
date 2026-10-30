"use client";

import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { TerminalPanel } from "@/frontend/components/TerminalPanel";
import {
  Activity, AppWindow, Blocks, ChevronDown, ChevronRight, CircleHelp,
  Code2, Cpu, FileCode2, Folder, FolderOpen, GitBranch, Hammer, Layers3,
  ListTree, Monitor, Play, Plus, Search, Settings2, TerminalSquare,
  Usb, X,
} from "lucide-react";

const source = `#include <Arduino.h>

constexpr uint8_t LED_PIN = 2;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("APEX: ESP32 firmware started");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
`;

type Tab = "explorer" | "boards" | "components";
type SerialPort = { name: string; portType: string; manufacturer?: string | null; product?: string | null; serialNumber?: string | null; vendorId?: number | null; productId?: number | null };

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("explorer");
  const [bottomTab, setBottomTab] = useState("Terminal");
  const [showWelcome, setShowWelcome] = useState(true);
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [portsError, setPortsError] = useState("");
  const [portsLoading, setPortsLoading] = useState(false);
  const refreshPorts = async () => {
    if (!isTauri()) { setPortsError("Serial discovery requires the APEX desktop runtime."); return; }
    setPortsLoading(true); setPortsError("");
    try { setPorts(await invoke<SerialPort[]>("serial_list_ports")); }
    catch (error) { setPortsError(error instanceof Error ? error.message : String(error)); }
    finally { setPortsLoading(false); }
  };

  return (
    <main className="ide">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand"><div className="brand-mark">A</div><span>APEX</span><span className="brand-sub">EMBEDDED STUDIO</span></div>
        <div className="project-title"><Folder size={14}/> esp32-blink <ChevronDown size={13}/></div>
        <div className="title-actions"><span className="connection"><span/> No device connected</span><button aria-label="Minimize" onClick={() => isTauri() && void getCurrentWindow().minimize()}>—</button><button aria-label="Maximize" onClick={() => isTauri() && void getCurrentWindow().toggleMaximize()}>□</button><button aria-label="Close" onClick={() => isTauri() && void getCurrentWindow().close()}>×</button></div>
      </header>
      <div className="workspace">
        <nav className="activity">
          <button className={activeTab === "explorer" ? "selected" : ""} onClick={() => setActiveTab("explorer")} title="Explorer"><ListTree/></button>
          <button className={activeTab === "boards" ? "selected" : ""} onClick={() => { setActiveTab("boards"); void refreshPorts(); }} title="Boards"><Cpu/></button>
          <button className={activeTab === "components" ? "selected" : ""} onClick={() => setActiveTab("components")} title="Components"><Blocks/></button>
          <div className="activity-spacer"/>
          <button title="Settings"><Settings2/></button>
          <button title="Help"><CircleHelp/></button>
        </nav>
        <aside className="sidebar">
          <div className="side-heading"><span>{activeTab === "explorer" ? "EXPLORER" : activeTab === "boards" ? "BOARD MANAGER" : "COMPONENTS"}</span><Search size={14}/></div>
          {activeTab === "explorer" && <>
            <div className="tree-root"><ChevronDown size={13}/><FolderOpen size={15}/> ESP32-BLINK</div>
            <div className="tree-item indent"><ChevronRight size={13}/><Folder size={15}/> .vscode</div>
            <div className="tree-item indent"><FileCode2 size={15}/> CMakeLists.txt</div>
            <div className="tree-item indent active"><FileCode2 size={15}/> main.cpp</div>
            <div className="tree-item indent"><FileCode2 size={15}/> platformio.ini</div>
            <div className="tree-item indent"><FileCode2 size={15}/> README.md</div>
            <div className="side-section">OUTLINE</div>
            <div className="tree-item indent muted-item">setup()</div><div className="tree-item indent muted-item">loop()</div>
          </>}
          {activeTab === "boards" && <div className="board-manager">
            <div className="board-intro"><Cpu size={22}/><strong>Connected serial ports</strong><span>Port presence does not confirm board identity. Select a port only after verifying your hardware.</span><button className="subtle-button" onClick={() => void refreshPorts()} disabled={portsLoading}>{portsLoading ? "Scanning…" : "Refresh ports"}</button></div>
            {portsError && <div className="port-error">{portsError}</div>}
            {ports.length === 0 && !portsLoading && !portsError && <div className="port-empty">No serial ports found.</div>}
            {ports.map((port) => <div className="port-card" key={port.name}><div className="port-icon"><Usb size={15}/></div><div className="port-details"><strong>{port.name}</strong><span>{port.product || port.manufacturer || port.portType.toUpperCase()}</span>{port.vendorId != null && port.productId != null && <small>VID {port.vendorId.toString(16).padStart(4,"0").toUpperCase()} · PID {port.productId.toString(16).padStart(4,"0").toUpperCase()}</small>}</div><span className="port-tag">PORT</span></div>)}
          </div>}
          {activeTab === "components" && <div className="empty-state"><Blocks size={22}/><strong>Component manager</strong><span>Install and manage project dependencies from supported registries.</span></div>}
        </aside>
        <section className="editor-area">
          <div className="tabs"><div className="file-tab"><FileCode2 size={14}/> main.cpp <span className="dirty-dot"/> <X size={13}/></div><div className="editor-actions"><button title="Build"><Hammer size={15}/></button><button title="Run"><Play size={15}/></button><button title="More"><ChevronDown size={14}/></button></div></div>
          <div className="breadcrumbs">main <span>/</span> main.cpp</div>
          <div className="editor"><Editor height="100%" defaultLanguage="cpp" defaultValue={source} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "Cascadia Code, Consolas, monospace", lineNumbers: "on", scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, padding: { top: 16 }, renderLineHighlight: "all" }}/></div>
          <div className="bottom-panel">
            <div className="panel-tabs">{["PROBLEMS", "OUTPUT", "DEBUG CONSOLE", "TERMINAL"].map((name) => <button key={name} className={bottomTab.toUpperCase() === name ? "current" : ""} onClick={() => setBottomTab(name[0] + name.slice(1).toLowerCase())}>{name}</button>)}<Plus size={14}/><div className="panel-spacer"/><ChevronDown size={14}/><X size={14}/></div>
            <TerminalPanel />
          </div>
        </section>
      </div>
      <footer className="statusbar"><div><GitBranch size={13}/> main <span>●</span> Workspace</div><div><Usb size={13}/> No serial port <span>UTF-8</span><span>CRLF</span><span>C++</span><Activity size={13}/> Ready</div></footer>
      {showWelcome && <div className="welcome-toast"><div className="welcome-icon"><AppWindow size={18}/></div><div><strong>Welcome to APEX</strong><p>Your embedded development workspace is taking shape.</p></div><button onClick={() => setShowWelcome(false)} aria-label="Dismiss"><X size={14}/></button></div>}
    </main>
  );
}
