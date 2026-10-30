"use client";

import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

type SerialOutput = { sessionId: string; text: string; stream: string };

export function SerialMonitorPanel({ portName }: { portName: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const [baudRate, setBaudRate] = useState("115200");
  const [status, setStatus] = useState("Disconnected");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      convertEol: true, cursorBlink: false,
      fontFamily: '"Cascadia Code", Consolas, monospace',
      fontSize: 12, scrollback: 10000,
      theme: { background: "#111315", foreground: "#c8cdd2", cursor: "#d6f36a", selectionBackground: "#414a35" },
    });
    terminal.open(host);
    terminalRef.current = terminal;
    terminal.writeln("APEX Serial Monitor · " + portName);
    terminal.writeln("Connect to begin receiving device output.");
    return () => {
      if (sessionRef.current) void invoke("serial_stop", { sessionId: sessionRef.current });
      if (unlistenRef.current) void unlistenRef.current();
      sessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [portName]);

  const connect = async () => {
    if (!isTauri()) {
      setError("Serial monitor requires the APEX desktop runtime.");
      return;
    }
    setError("");
    try {
      const id = crypto.randomUUID();
      unlistenRef.current = await listen<SerialOutput>("apex://serial-output", (event) => {
        if (event.payload.sessionId === sessionRef.current) {
          terminalRef.current?.write(event.payload.text);
        }
      });
      sessionRef.current = id;
      await invoke("serial_start", { sessionId: id, portName, baudRate: Number(baudRate) });
      setStatus("Connected");
      terminalRef.current?.writeln("\r\n[Connected at " + baudRate + " baud]\r\n");
    } catch (cause) {
      sessionRef.current = null;
      if (unlistenRef.current) {
        void unlistenRef.current();
        unlistenRef.current = null;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("Error");
      terminalRef.current?.writeln("\r\n[Connection failed: " + message + "]\r\n");
    }
  };

  const disconnect = async () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    if (id) {
      try { await invoke("serial_stop", { sessionId: id }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }
    if (unlistenRef.current) {
      await unlistenRef.current();
      unlistenRef.current = null;
    }
    setStatus("Disconnected");
  };

  const send = async () => {
    const id = sessionRef.current;
    if (!id || !input) return;
    try {
      await invoke("serial_write", { sessionId: id, data: input + "\r\n" });
      setInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="serial-monitor">
      <div className="serial-toolbar">
        <div className="serial-target"><span className={status === "Connected" ? "terminal-status online" : "terminal-status"} />{portName}<span className="serial-state">{status}</span></div>
        <div className="serial-actions">
          <label>Baud</label>
          <select value={baudRate} onChange={(event) => setBaudRate(event.target.value)} disabled={status === "Connected"}>
            {["9600", "19200", "38400", "57600", "74880", "115200", "230400", "460800", "921600"].map((rate) => <option key={rate} value={rate}>{rate}</option>)}
          </select>
          {status === "Connected" ? <button onClick={() => void disconnect()}>Disconnect</button> : <button onClick={() => void connect()}>Connect</button>}
          <button className="serial-clear" onClick={() => terminalRef.current?.clear()}>Clear</button>
        </div>
      </div>
      {error && <div className="serial-error">{error}</div>}
      <div className="serial-output" ref={hostRef} />
      <form className="serial-input" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Send data to device…" disabled={status !== "Connected"} />
        <button type="submit" disabled={status !== "Connected" || !input}>Send</button>
      </form>
    </div>
  );
}
