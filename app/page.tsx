"use client";

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="editor-loading">Loading code editor…</div>,
});
const TerminalPanel = dynamic(() => import("@/frontend/components/TerminalPanel").then((module) => module.TerminalPanel), {
  ssr: false,
  loading: () => <div className="panel-placeholder">Loading terminal…</div>,
});
const SerialMonitorPanel = dynamic(() => import("@/frontend/components/SerialMonitorPanel").then((module) => module.SerialMonitorPanel), {
  ssr: false,
  loading: () => <div className="panel-placeholder">Loading serial monitor…</div>,
});
import { ToolchainPanel } from "@/frontend/components/ToolchainPanel";
import { ComponentPanel } from "@/frontend/components/ComponentPanel";
import { BoardPanel } from "@/frontend/components/BoardPanel";
import { DebugPanel } from "@/frontend/components/DebugPanel";
import {
  Activity, AppWindow, Blocks, Bug, ChevronDown, ChevronRight, CircleHelp,
  Code2, Cpu, FileCode2, Folder, FolderOpen, GitBranch, Hammer, Layers3,
  ListTree, Monitor, Play, Plus, Search, Settings2, TerminalSquare,
  Usb, X, Save, FilePlus, FolderPlus, ArrowLeft, Wrench,
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

type Tab = "explorer" | "boards" | "components" | "tools" | "debug";
type SerialPort = { name: string; portType: string; manufacturer?: string | null; product?: string | null; serialNumber?: string | null; vendorId?: number | null; productId?: number | null };
type WorkspaceInfo = { name: string; path: string };
type WorkspaceEntry = { name: string; relativePath: string; isDirectory: boolean; size: number | null };
type FirmwareResult = { command: string; success: boolean; exitCode: number | null; output: string };

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
  const [appNotice, setAppNotice] = useState("");
  const [framework, setFramework] = useState<"arduino" | "esp-idf">("arduino");
  const [firmwareOutput, setFirmwareOutput] = useState("");
  const [firmwareBusy, setFirmwareBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "directory">("file");
  const [newEntryName, setNewEntryName] = useState("");
  const createProject = async () => {
    if (!isTauri()) return;
    if (dirty && !window.confirm("Discard unsaved changes and create a new project?")) return;
    const name = window.prompt("Project name (letters, numbers, hyphens and underscores):", "esp32-project");
    if (!name) return;
    const selected = window.prompt("Framework: enter arduino or esp-idf", framework);
    if (selected !== "arduino" && selected !== "esp-idf") return;
    setFramework(selected);
    try {
      const path = await invoke<string>("firmware_create_project", { name, framework: selected });
      await invoke("workspace_open_path", { path });
      const current = await invoke<WorkspaceInfo | null>("workspace_current");
      setWorkspace(current); setCurrentPath(""); setActiveFile(""); setDirty(false);
      await refreshWorkspace("");
      setFirmwareOutput("Created project at " + path); setBottomTab("Output");
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const buildFirmware = async () => {
    if (firmwareBusy) return;
    if (!workspace) { setFirmwareOutput("Open a workspace or create a project before building firmware."); setBottomTab("Output"); return; }
    setFirmwareBusy(true); setBottomTab("Output"); setFirmwareOutput("Building…");
    try {
      const result = await invoke<FirmwareResult>("firmware_build", { framework });
      setFirmwareOutput(result.command + "\n\n" + result.output + "\n\n" + (result.success ? "BUILD SUCCEEDED" : "BUILD FAILED (exit " + result.exitCode + ")"));
    } catch (error) { setFirmwareOutput(error instanceof Error ? error.message : String(error)); }
    finally { setFirmwareBusy(false); }
  };
  const flashFirmware = async () => {
    if (!workspace || !selectedPort || firmwareBusy) {
      setFirmwareOutput("Select a serial port from Board Manager before flashing."); setBottomTab("Output"); return;
    }
    if (!window.confirm("Flash firmware to " + selectedPort + "? This will overwrite the program currently on the device.")) return;
    setFirmwareBusy(true); setBottomTab("Output"); setFirmwareOutput("Flashing…");
    try {
      const result = await invoke<FirmwareResult>("firmware_flash", { framework, port: selectedPort });
      setFirmwareOutput(result.command + "\n\n" + result.output + "\n\n" + (result.success ? "FLASH SUCCEEDED" : "FLASH FAILED (exit " + result.exitCode + ")"));
    } catch (error) { setFirmwareOutput(error instanceof Error ? error.message : String(error)); }
    finally { setFirmwareBusy(false); }
  };
  const refreshWorkspace = async (path: string) => {
    try { setEntries(await invoke<WorkspaceEntry[]>("workspace_list", { relativePath: path })); setWorkspaceError(""); }
    catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const openWorkspace = async () => {
    if (dirty && !window.confirm("Discard unsaved changes and open another workspace?")) return;
    if (!isTauri()) { setWorkspaceError("Opening a workspace requires the APEX desktop runtime."); return; }
    try {
      const opened = await invoke<WorkspaceInfo | null>("workspace_pick");
      if (!opened) return;
      setWorkspace(opened); setCurrentPath(""); setActiveFile(""); setDirty(false);
      await refreshWorkspace("");
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const openEntry = async (entry: WorkspaceEntry) => {
    if (!entry.isDirectory && dirty && !window.confirm("Discard unsaved changes in the current file?")) return;
    if (entry.isDirectory) { setCurrentPath(entry.relativePath); await refreshWorkspace(entry.relativePath); return; }
    try {
      const value = await invoke<string>("workspace_read_file", { relativePath: entry.relativePath });
      setActiveFile(entry.relativePath); setEditorValue(value); setDirty(false);
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const saveFile = async () => {
    if (!dirty) return;
    if (!isTauri()) { setWorkspaceError("Saving files requires the APEX desktop runtime."); return; }
    if (!workspace) { setWorkspaceError("Open a workspace before saving this editor buffer."); return; }
    try {
      let target = activeFile;
      if (!target) {
        const name = window.prompt("Save editor buffer as (workspace-relative path):", "main.cpp");
        if (!name) return;
        target = name.trim();
        if (!target) return;
        await invoke("workspace_create_file", { relativePath: target });
      }
      await invoke("workspace_write_file", { relativePath: target, content: editorValue });
      setActiveFile(target); setDirty(false); await refreshWorkspace(currentPath); setWorkspaceError("");
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  const createEntry = async () => {
    if (!newEntryName.trim()) return;
    const relativePath = currentPath ? currentPath + "/" + newEntryName.trim() : newEntryName.trim();
    try {
      await invoke(createKind === "file" ? "workspace_create_file" : "workspace_create_directory", { relativePath });
      setNewEntryName(""); setShowCreate(false); await refreshWorkspace(currentPath);
      if (createKind === "file") {
        setActiveFile(relativePath);
        setEditorValue("");
        setDirty(false);
      }
    } catch (error) { setWorkspaceError(error instanceof Error ? error.message : String(error)); }
  };
  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [activeFile, dirty, editorValue]);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<WorkspaceInfo | null>("workspace_current").then(async (current) => {
      if (current) { setWorkspace(current); await refreshWorkspace(""); }
    }).catch((error) => setWorkspaceError(error instanceof Error ? error.message : String(error)));
  }, []);
  const refreshPorts = async () => {
    if (!isTauri()) { setPortsError("Serial discovery requires the APEX desktop runtime."); return; }
    setPortsLoading(true); setPortsError("");
    try {
      const nextPorts = await invoke<SerialPort[]>("serial_list_ports");
      setPorts(nextPorts);
      // Do not leave a removed COM port selected as a possible flash target.
      setSelectedPort((current) => current && !nextPorts.some((port) => port.name === current) ? "" : current);
    }
    catch (error) { setPortsError(error instanceof Error ? error.message : String(error)); }
    finally { setPortsLoading(false); }
  };

  // Keep the port list in sync with USB hot-plug events. A serial port is not
  // proof of board identity, but it is the first prerequisite for ESP32 access.
  useEffect(() => {
    if (!isTauri()) return;
    void refreshPorts();
    const timer = window.setInterval(() => { void refreshPorts(); }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="ide">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand"><div className="brand-mark">A</div><span>APEX</span><span className="brand-sub">EMBEDDED STUDIO</span></div>
        <div className="project-title"><Folder size={14}/> {workspace?.name || "No workspace"} <ChevronDown size={13}/></div>
        <div className="title-actions"><button className="subtle-button" onClick={() => void createProject()}>New project</button><span className="connection"><span/> {ports.length > 0 ? `${ports.length} serial port${ports.length === 1 ? "" : "s"} available` : "No serial ports detected"}</span><button aria-label="Minimize" onClick={() => isTauri() && void getCurrentWindow().minimize()}>—</button><button aria-label="Maximize" onClick={() => isTauri() && void getCurrentWindow().toggleMaximize()}>□</button><button aria-label="Close" onClick={() => isTauri() && void getCurrentWindow().close()}>×</button></div>
      </header>
      <div className="workspace">
        <nav className="activity">
          <button className={activeTab === "explorer" ? "selected" : ""} onClick={() => setActiveTab("explorer")} title="Explorer"><ListTree/></button>
          <button className={activeTab === "boards" ? "selected" : ""} onClick={() => { setActiveTab("boards"); void refreshPorts(); }} title="Boards"><Cpu/></button>
          <button className={activeTab === "components" ? "selected" : ""} onClick={() => setActiveTab("components")} title="Components"><Blocks/></button>
          <button className={activeTab === "tools" ? "selected" : ""} onClick={() => setActiveTab("tools")} title="Toolchains"><Wrench/></button>
          <button className={activeTab === "debug" ? "selected" : ""} onClick={() => setActiveTab("debug")} title="JTAG Debug"><Bug/></button>
          <div className="activity-spacer"/>
          <button title="Settings" onClick={() => { setActiveTab("tools"); setAppNotice("Settings currently opens the toolchain configuration workspace. More editor preferences are planned."); }}><Settings2/></button>
          <button title="Help" onClick={() => setAppNotice("APEX quick help: open a workspace, create or open a source file, edit it in the editor, then use Build and Flash. For USB detection, check Device Manager and install the board's USB-to-UART driver if needed.")}><CircleHelp/></button>
        </nav>
        <aside className="sidebar">
          <div className="side-heading"><span>{activeTab === "explorer" ? "EXPLORER" : activeTab === "boards" ? "BOARD MANAGER" : activeTab === "tools" ? "TOOLCHAINS" : activeTab === "debug" ? "DEBUG" : "COMPONENTS"}</span>{activeTab === "explorer" ? <div className="explorer-actions"><button onClick={() => void openWorkspace()} title="Open workspace"><FolderOpen size={14}/></button><button onClick={() => { setCreateKind("file"); setShowCreate(true); }} disabled={!workspace} title="New file"><FilePlus size={14}/></button><button onClick={() => { setCreateKind("directory"); setShowCreate(true); }} disabled={!workspace} title="New folder"><FolderPlus size={14}/></button></div> : <Search size={14}/>}</div>
          {activeTab === "explorer" && <>
            <div className="tree-root"><FolderOpen size={15}/> {workspace?.name || "NO WORKSPACE"}</div>
            {workspace && currentPath && <button className="tree-back" onClick={() => { const parent = currentPath.replace(/[\\/][^\\/]+$/, ""); setCurrentPath(parent); void refreshWorkspace(parent); }}><ArrowLeft size={13}/> Back</button>}
            {showCreate && <div className="create-entry"><span>{createKind === "file" ? "New file" : "New folder"}</span><input autoFocus value={newEntryName} onChange={(event) => setNewEntryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createEntry(); if (event.key === "Escape") setShowCreate(false); }} placeholder="Name"/><div><button onClick={() => void createEntry()}>Create</button><button onClick={() => setShowCreate(false)}>Cancel</button></div></div>}
            {workspaceError && <div className="workspace-error">{workspaceError}</div>}
            {!workspace && <div className="empty-state"><FolderOpen size={22}/><strong>No workspace open</strong><span>Open a folder to browse and edit your firmware project.</span><button className="subtle-button" onClick={() => void openWorkspace()}>Open workspace</button></div>}
            {workspace && entries.map((entry) => <button key={entry.relativePath} className={activeFile === entry.relativePath ? "tree-item dynamic active" : "tree-item dynamic"} onClick={() => void openEntry(entry)}>{entry.isDirectory ? <Folder size={15}/> : <FileCode2 size={15}/>}<span>{entry.name}</span></button>)}
            {workspace && entries.length === 0 && <div className="empty-state"><span>This folder is empty.</span></div>}
          </>}
          {activeTab === "boards" && <><BoardPanel framework={framework}/><div className="board-manager">
            <div className="board-intro"><Cpu size={22}/><strong>Detected serial ports</strong><span>Port presence does not confirm board identity. Select a port only after verifying your hardware.</span><button className="subtle-button" onClick={() => void refreshPorts()} disabled={portsLoading}>{portsLoading ? "Scanning…" : "Refresh ports"}</button></div>
            {portsError && <div className="port-error">{portsError}</div>}
            {ports.length === 0 && !portsLoading && !portsError && <div className="port-empty">No serial ports detected. Check that the board uses a USB data cable and appears under Ports (COM & LPT) in Windows Device Manager. If it appears as an unknown USB device, install the matching USB-to-UART driver (commonly CP210x or CH340), then reconnect and scan again.</div>}
            {ports.map((port) => <div className="port-card" key={port.name}><div className="port-icon"><Usb size={15}/></div><div className="port-details"><strong>{port.name}</strong><span>{port.product || port.manufacturer || port.portType.toUpperCase()}</span>{port.vendorId != null && port.productId != null && <small>VID {port.vendorId.toString(16).padStart(4,"0").toUpperCase()} · PID {port.productId.toString(16).padStart(4,"0").toUpperCase()}</small>}</div><button className="port-monitor-button" onClick={() => { setSelectedPort(port.name); setBottomTab("Serial monitor"); }}>Monitor</button></div>)}
          </div></>}
          {activeTab === "debug" && <DebugPanel/>}
          {activeTab === "tools" && <ToolchainPanel />}
          {activeTab === "components" && <ComponentPanel framework={framework} />}
        </aside>
        <section className="editor-area">
          <div className="tabs"><div className="file-tab"><FileCode2 size={14}/> {activeFile ? activeFile.split(/[\\/]/).pop() : "Untitled.cpp"} {dirty && <span className="dirty-dot"/>}</div><div className="editor-actions"><button title="Save file (Ctrl+S)" onClick={() => void saveFile()} disabled={!dirty || !workspace}><Save size={15}/></button><select aria-label="Firmware framework" value={framework} onChange={(event) => setFramework(event.target.value as "arduino" | "esp-idf")}><option value="arduino">Arduino</option><option value="esp-idf">ESP-IDF</option></select><button title="Build firmware" onClick={() => void buildFirmware()} disabled={firmwareBusy} title={!workspace ? "Open a workspace before building" : "Build firmware"}><Hammer size={15}/></button><button title="Flash firmware to selected serial port" onClick={() => void flashFirmware()} disabled={firmwareBusy} title={!workspace ? "Open a workspace and select a serial port before flashing" : !selectedPort ? "Select a serial port in Board Manager" : "Flash firmware"}><Play size={15}/></button></div></div>
          <div className="breadcrumbs">{workspace?.name || "Welcome"} <span>/</span> {activeFile || "Untitled.cpp · unsaved buffer"}</div>
          <div className="editor"><Editor height="100%" width="100%" language={activeFile.endsWith(".py") ? "python" : activeFile.endsWith(".json") ? "json" : activeFile.endsWith(".md") ? "markdown" : "cpp"} value={editorValue} onChange={(value) => { setEditorValue(value ?? ""); setDirty(true); }} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "Cascadia Code, Consolas, monospace", lineNumbers: "on", scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, padding: { top: 16 }, renderLineHighlight: "all", readOnly: false }} /></div>
          <div className="bottom-panel">
            <div className="panel-tabs">{["PROBLEMS", "OUTPUT", "DEBUG CONSOLE", "SERIAL MONITOR", "TERMINAL"].map((name) => <button key={name} className={bottomTab.toUpperCase() === name ? "current" : ""} onClick={() => setBottomTab(name[0] + name.slice(1).toLowerCase())}>{name}</button>)}<Plus size={14}/><div className="panel-spacer"/><ChevronDown size={14}/><X size={14}/></div>
            {bottomTab === "Terminal" ? <TerminalPanel /> : bottomTab === "Serial monitor" && selectedPort ? <SerialMonitorPanel key={selectedPort} portName={selectedPort} /> : bottomTab === "Output" ? <pre className="firmware-output">{firmwareOutput || "Build and flash output will appear here."}</pre> : <div className="panel-placeholder">{bottomTab === "Problems" ? "No diagnostics provider is connected yet. Compiler diagnostics will appear here after build integration." : bottomTab === "Debug console" ? "The GDB console is available in the JTAG Debug workspace." : bottomTab === "Serial monitor" ? "Select a detected serial port in Board Manager, then choose Monitor." : bottomTab}</div>}
          </div>
        </section>
      </div>
      <footer className="statusbar"><div><GitBranch size={13}/> main <span>●</span> Workspace</div><div><Usb size={13}/> Serial ports <span>UTF-8</span><span>CRLF</span><span>C++</span><Activity size={13}/> Ready</div></footer>
      {appNotice && <div className="app-notice"><div><strong>APEX</strong><p>{appNotice}</p></div><button onClick={() => setAppNotice("")} aria-label="Dismiss"><X size={14}/></button></div>}
      {showWelcome && <div className="welcome-toast"><div className="welcome-icon"><AppWindow size={18}/></div><div><strong>Welcome to APEX</strong><p>Your embedded development workspace is taking shape.</p></div><button onClick={() => setShowWelcome(false)} aria-label="Dismiss"><X size={14}/></button></div>}
    </main>
  );
}
