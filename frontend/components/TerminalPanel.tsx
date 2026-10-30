"use client";

import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

type OutputEvent = { sessionId: string; stream: string; text: string };
type StartedEvent = { sessionId: string; shell: string; cwd: string; pid: number | null };

export function TerminalPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const [status, setStatus] = useState("Starting");
  const [cwd, setCwd] = useState("");
  const [shell, setShell] = useState("powershell");
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      cursorBlink: true, convertEol: true,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      fontSize: 12, lineHeight: 1.35, scrollback: 5000,
      theme: { background: "#111315", foreground: "#c8cdd2", cursor: "#d6f36a",
        selectionBackground: "#414a35", black: "#17191c", brightBlack: "#69717a",
        green: "#b5d982", brightGreen: "#d6f36a", red: "#df8b86",
        brightRed: "#f0a39c", yellow: "#d6bd78", brightYellow: "#ebd18b",
        blue: "#8da9d7", brightBlue: "#a9c2ed" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);

    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    const start = async () => {
      try {
        if (!isTauri()) {
          setStatus("Preview only");
          setError("The native terminal is available in the installed APEX desktop app.");
          terminal.writeln("APEX terminal");
          terminal.writeln("Run the desktop application with pnpm tauri:dev to start a native shell.");
          return;
        }
        unlisten = await listen<OutputEvent>("apex://terminal-output", (event) => {
          if (event.payload.sessionId === sessionRef.current) terminal.write(event.payload.text);
        });
        const initialCwd = await invoke<string>("terminal_default_cwd");
        if (disposed) return;
        setCwd(initialCwd);
        fit.fit();
        const id = crypto.randomUUID();
        const started = await invoke<StartedEvent>("terminal_start", {
          sessionId: id, shell, cwd: initialCwd, cols: terminal.cols, rows: terminal.rows,
        });
        if (disposed) {
          await invoke("terminal_stop", { sessionId: id });
          return;
        }
        sessionRef.current = started.sessionId;
        setStatus("Running");
        terminal.writeln("APEX · " + started.shell + " · " + started.cwd);
        terminal.writeln("");
        terminal.focus();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        setStatus("Unavailable");
        terminal.writeln("Terminal failed to start: " + message);
      }
    };

    const dataSubscription = terminal.onData((data) => {
      const id = sessionRef.current;
      if (id) void invoke("terminal_write", { sessionId: id, input: data }).catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    });
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      const id = sessionRef.current;
      if (id) void invoke("terminal_resize", { sessionId: id, cols, rows }).catch(() => undefined);
    });
    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* panel can briefly have zero dimensions */ }
    });
    observer.observe(host);
    void start();

    return () => {
      disposed = true;
      observer.disconnect();
      dataSubscription.dispose();
      resizeSubscription.dispose();
      if (unlisten) void unlisten();
      if (sessionRef.current) {
        void invoke("terminal_stop", { sessionId: sessionRef.current });
        sessionRef.current = null;
      }
      terminal.dispose();
    };
  }, [shell]);

  return (
    <div className="terminal-panel">
      <div className="terminal-toolbar">
        <div className="terminal-session">
          <span className={status === "Running" ? "terminal-status online" : "terminal-status"} />
          <span>{shell === "powershell" ? "POWERSHELL" : "COMMAND PROMPT"}</span>
          <span className="terminal-cwd" title={cwd}>{cwd}</span>
        </div>
        <div className="terminal-controls">
          {error && <span className="terminal-error" title={error}>Terminal issue</span>}
          <select aria-label="Terminal shell" value={shell} onChange={(event) => setShell(event.target.value)}>
            <option value="powershell">PowerShell</option>
            <option value="cmd">Command Prompt</option>
          </select>
          <span className="terminal-state">{status}</span>
        </div>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
