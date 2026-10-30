"use client";

import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

type OutputEvent = { sessionId: string; stream: string; text: string };
type StartedEvent = { sessionId: string; shell: string; cwd: string; pid: number | null };
type SessionInfo = { id: string; shell: "powershell" | "cmd" };

export function TerminalPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeId, setActiveId] = useState("");
  const [newShell, setNewShell] = useState<"powershell" | "cmd">("powershell");

  const addSession = (shell: "powershell" | "cmd") => {
    const id = crypto.randomUUID();
    setSessions((current) => [...current, { id, shell }]);
    setActiveId(id);
  };

  const closeSession = (id: string) => {
    const remaining = sessions.filter((session) => session.id !== id);
    setSessions(remaining);
    if (activeId === id) setActiveId(remaining[remaining.length - 1]?.id ?? "");
  };

  useEffect(() => {
    if (sessions.length === 0) {
      const id = crypto.randomUUID();
      setSessions([{ id, shell: "powershell" }]);
      setActiveId(id);
    }
  }, [sessions.length]);

  return (
    <div className="terminal-panel">
      <div className="terminal-toolbar">
        <div className="terminal-session-tabs">
          {sessions.map((session, index) => (
            <div key={session.id} className={session.id === activeId ? "terminal-session-tab active" : "terminal-session-tab"}>
              <button onClick={() => setActiveId(session.id)}>
                {session.shell === "powershell" ? "PowerShell" : "CMD"} {index + 1}
              </button>
              <button className="terminal-tab-close" aria-label="Close terminal session" onClick={() => closeSession(session.id)}>×</button>
            </div>
          ))}
          <button className="terminal-add-session" onClick={() => addSession(newShell)} title="New terminal session">+</button>
        </div>
        <div className="terminal-controls">
          <select aria-label="Shell for new terminal" value={newShell} onChange={(event) => setNewShell(event.target.value as "powershell" | "cmd")}>
            <option value="powershell">PowerShell</option>
            <option value="cmd">Command Prompt</option>
          </select>
          <span className="terminal-state">{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="terminal-session-views">
        {sessions.map((session) => (
          <TerminalSessionView key={session.id} session={session} active={session.id === activeId} />
        ))}
      </div>
    </div>
  );
}

function TerminalSessionView({ session, active }: { session: SessionInfo; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState("Starting");

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
    fitRef.current = fit;
    terminal.loadAddon(fit);
    terminal.open(host);

    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    const start = async () => {
      try {
        if (!isTauri()) {
          setStatus("Preview only");
          terminal.writeln("APEX terminal");
          terminal.writeln("Run pnpm tauri:dev to start a native shell.");
          return;
        }
        unlisten = await listen<OutputEvent>("apex://terminal-output", (event) => {
          if (event.payload.sessionId === sessionRef.current) terminal.write(event.payload.text);
        });
        const cwd = await invoke<string>("terminal_default_cwd");
        if (disposed) return;
        try { fit.fit(); } catch { /* host may not have been laid out yet */ }
        sessionRef.current = session.id;
        const started = await invoke<StartedEvent>("terminal_start", {
          sessionId: session.id, shell: session.shell, cwd, cols: terminal.cols, rows: terminal.rows,
        });
        if (disposed) {
          await invoke("terminal_stop", { sessionId: session.id });
          return;
        }
        sessionRef.current = started.sessionId;
        setStatus("Running");
        terminal.writeln("APEX · " + started.shell + " · " + started.cwd);
        terminal.writeln("");
        if (active) terminal.focus();
      } catch (error) {
        setStatus("Unavailable");
        terminal.writeln("Terminal failed to start: " + (error instanceof Error ? error.message : String(error)));
      }
    };

    const input = terminal.onData((data) => {
      if (sessionRef.current) {
        void invoke("terminal_write", { sessionId: sessionRef.current, input: data }).catch((error) => {
          setStatus("Input error");
          terminal.writeln(String(error));
        });
      }
    });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (sessionRef.current) {
        void invoke("terminal_resize", { sessionId: sessionRef.current, cols, rows }).catch(() => undefined);
      }
    });
    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* hidden panels can have zero dimensions */ }
    });
    observer.observe(host);
    void start();

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      if (unlisten) void unlisten();
      if (sessionRef.current) {
        void invoke("terminal_stop", { sessionId: sessionRef.current });
        sessionRef.current = null;
      }
      fitRef.current = null;
      terminal.dispose();
    };
  }, [session.id, session.shell]);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      try { fitRef.current?.fit(); } catch { /* layout may still be settling */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className="terminal-session-view" style={{ display: active ? "block" : "none" }}>
      <div className="terminal-view-status"><span className={status === "Running" ? "terminal-status online" : "terminal-status"} />{status}</div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
