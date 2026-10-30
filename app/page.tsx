"use client";

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import Editor from "@monaco-editor/react";
import { TerminalPanel } from "@/frontend/components/TerminalPanel";
import { SerialMonitorPanel } from "@/frontend/components/SerialMonitorPanel";
import {
  Activity, AppWindow, Blocks, ChevronDown, ChevronRight, CircleHelp,
  Code2, Cpu, FileCode2, Folder, FolderOpen, GitBranch, Hammer, Layers3,
  ListTree, Monitor, Play, Plus, Search, Settings2, TerminalSquare,
  Usb, X, Save, FilePlus, FolderPlus, ArrowLeft,
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
type WorkspaceInfo = { name: string; path: string };
type WorkspaceEntry = { name: string; relativePath: string; isDirectory: boolean; size: number | null };

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("explorer");
  const [bottomTab, setBottomTab] = useState("Terminal");
  const [showWelcome, setShowWelcome] = useState(true);
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [portsError, setPortsError] = useState("");
  const [portsLoading, setPortsLoading] = useState(false);
  const [selectedPort, setSelectedPort] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [activeFile, setActiveFile] = useState("");
  const [editorValue, setEditorValue] = useState(source);
  const [dirty, setDirty] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "directory">("file");
  const [newEntryName, setNewEntryName] = useState("");
  const refreshWorkspace = async (path: string) => {
    try { setEntries(await invoke<WorkspaceEntry[]>("workspace_list", { relativePath: path })); setWorkspaceError(""); }
    catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const openWorkspace = async () => {
    if (!isTauri()) { setWorkspaceError("Opening a workspace requires the APEX desktop runtime."); return; }
    try {
      const opened = await invoke<WorkspaceInfo | null>("workspace_pick");
      if (!opened) return;
      setWorkspace(opened); setCurrentPath(""); setActiveFile(""); setDirty(false);
      await refreshWorkspace("");
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const openEntry = async (entry: WorkspaceEntry) => {
    if (entry.isDirectory) { setCurrentPath(entry.relativePath); await refreshWorkspace(entry.relativePath); return; }
    try {
      const value = await invoke<string>("workspace_read_file", { relativePath: entry.relativePath });
      setActiveFile(entry.relativePath); setEditorValue(value); setDirty(false);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const saveFile = async () => {
    if (!activeFile || !dirty) return;
    try { await invoke("workspace_write_file", { relativePath: activeFile, content: editorValue }); setDirty(false); }
    catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const createEntry = async () => {
    if (!newEntryName.trim()) return;
    const relativePath = currentPath ? currentPath + "/" + newEntryName.trim() : newEntryName.trim();
    try {
      await invoke(createKind === "file" ? "workspace_create_file" : "workspace_create_directory", { relativePath });
      setNewEntryName(""); setShowCreate(false); await refreshWorkspace(currentPath);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<WorkspaceInfo | null>("workspace_current").then(async (current) => {
      if (current) { setWorkspace(current); await refreshWorkspace(""); }
    }).catch((error) => setWorkspaceError(error instanceof Error ? error.message : String(error)));
  }, []);
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
        <div className="project-title"><Folder size={14}/> {workspace?.name || "No workspace"} <ChevronDown size={13}/></div>
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
          <div className="side-heading"><span>{activeTab === "explorer" ? "EXPLORER" : activeTab === "boards" ? "BOARD MANAGER" : "COMPONENTS"}</span>{activeTab === "explorer" ? <div className="explorer-actions"><button onClick={() => void openWorkspace()} title="Open workspace"><FolderOpen size={14}/></button><button onClick={() => { setCreateKind("file"); setShowCreate(true); }} disabled={!workspace} title="New file"><FilePlus size={14}/></button><button onClick={() => { setCreateKind("directory"); setShowCreate(true); }} disabled={!workspace} title="New folder"><FolderPlus size={14}/></button></div> : <Search size={14}/>}</div>
          {activeTab === "explorer" && <>
            <div className="tree-root"><FolderOpen size={15}/> {workspace?.name || "NO WORKSPACE"}</div>
            {workspace && currentPath && <button className="tree-back" onClick={() => { const parent = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : ""; setCurrentPath(parent); void refreshWorkspace(parent); }}><ArrowLeft size={13}/> Back</button>}
            {showCreate && <div className="create-entry"><span>{createKind === "file" ? "New file" : "New folder"}</span><input autoFocus value={newEntryName} onChange={(event) => setNewEntryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createEntry(); if (event.key === "Escape") setShowCreate(false); }} placeholder="Name"/><div><button onClick={() => void createEntry()}>Create</button><button onClick={() => setShowCreate(false)}>Cancel</button></div></div>}
            {workspaceError && <div className="workspace-error">{workspaceError}</div>}
            {!workspace && <div className="empty-state"><FolderOpen size={22}/><strong>No workspace open</strong><span>Open a folder to browse and edit your firmware project.</span><button className="subtle-button" onClick={() => void openWorkspace()}>Open workspace</button></div>}
            {workspace && entries.map((entry) => <button key={entry.relativePath} className={activeFile === entry.relativePath ? "tree-item dynamic active" : "tree-item dynamic"} onClick={() => void openEntry(entry)}>{entry.isDirectory ? <Folder size={15}/> : <FileCode2 size={15}/>}<span>{entry.name}</span></button>)}
            {workspace && entries.length === 0 && <div className="empty-state"><span>This folder is empty.</span></div>}
          </>}
          {activeTab === "boards" && <div className="board-manager">
            <div className="board-intro"><Cpu size={22}/><strong>Connected serial ports</strong><span>Port presence does not confirm board identity. Select a port only after verifying your hardware.</span><button className="subtle-button" onClick={() => void refreshPorts()} disabled={portsLoading}>{portsLoading ? "Scanning…" : "Refresh ports"}</button></div>
            {portsError && <div className="port-error">{portsError}</div>}
            {ports.length === 0 && !portsLoading && !portsError && <div className="port-empty">No serial ports found.</div>}
            {ports.map((port) => <div className="port-card" key={port.name}><div className="port-icon"><Usb size={15}/></div><div className="port-details"><strong>{port.name}</strong><span>{port.product || port.manufacturer || port.portType.toUpperCase()}</span>{port.vendorId != null && port.productId != null && <small>VID {port.vendorId.toString(16).padStart(4,"0").toUpperCase()} · PID {port.productId.toString(16).padStart(4,"0").toUpperCase()}</small>}</div><button className="port-monitor-button" onClick={() => { setSelectedPort(port.name); setBottomTab("Serial monitor"); }}>Monitor</button></div>)}
          </div>}
          {activeTab === "components" && <div className="empty-state"><Blocks size={22}/><strong>Component manager</strong><span>Install and manage project dependencies from supported registries.</span></div>}
        </aside>
        <section className="editor-area">
          <div className="tabs"><div className="file-tab"><FileCode2 size={14}/> {activeFile ? activeFile.split(/[\\/]/).pop() : "Welcome.cpp"} {dirty && <span className="dirty-dot"/>}</div><div className="editor-actions"><button title="Save file (Ctrl+S)" onClick={() => void saveFile()} disabled={!activeFile || !dirty}><Save size={15}/></button><button title="Build integration is not implemented yet" disabled><Hammer size={15}/></button><button title="Run integration is not implemented yet" disabled><Play size={15}/></button></div></div>
          <div className="breadcrumbs">{workspace?.name || "Welcome"} <span>/</span> {activeFile || "Select a file from the explorer"}</div>
          <div className="editor"><Editor height="100%" language={activeFile.endsWith(".py") ? "python" : activeFile.endsWith(".json") ? "json" : activeFile.endsWith(".md") ? "markdown" : "cpp"} value={editorValue} onChange={(value) => { setEditorValue(value ?? ""); setDirty(true); }} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "Cascadia Code, Consolas, monospace", lineNumbers: "on", scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, padding: { top: 16 }, renderLineHighlight: "all", readOnly: !activeFile }}/></div>
          <div className="bottom-panel">
            <div className="panel-tabs">{["PROBLEMS", "OUTPUT", "DEBUG CONSOLE", "SERIAL MONITOR", "TERMINAL"].map((name) => <button key={name} className={bottomTab.toUpperCase() === name ? "current" : ""} onClick={() => setBottomTab(name[0] + name.slice(1).toLowerCase())}>{name}</button>)}<Plus size={14}/><div className="panel-spacer"/><ChevronDown size={14}/><X size={14}/></div>
            {bottomTab === "Terminal" ? <TerminalPanel /> : bottomTab === "Serial monitor" && selectedPort ? <SerialMonitorPanel key={selectedPort} portName={selectedPort} /> : <div className="panel-placeholder">{bottomTab} panel is not implemented yet.</div>}
          </div>
        </section>
      </div>
      <footer className="statusbar"><div><GitBranch size={13}/> main <span>●</span> Workspace</div><div><Usb size={13}/> No serial port <span>UTF-8</span><span>CRLF</span><span>C++</span><Activity size={13}/> Ready</div></footer>
      {showWelcome && <div className="welcome-toast"><div className="welcome-icon"><AppWindow size={18}/></div><div><strong>Welcome to APEX</strong><p>Your embedded development workspace is taking shape.</p></div><button onClick={() => setShowWelcome(false)} aria-label="Dismiss"><X size={14}/></button></div>}
    </main>
  );
}
