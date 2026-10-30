use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortDescriptor {
    pub name: String,
    pub port_type: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialOutput {
    pub session_id: String,
    pub text: String,
    pub stream: String,
}

struct SerialSession {
    port: Box<dyn serialport::SerialPort>,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct SerialManager {
    sessions: Mutex<HashMap<String, SerialSession>>,
}

impl SerialManager {
    pub fn shutdown(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, session) in sessions.drain() {
                session.stop.store(true, Ordering::Relaxed);
            }
        }
    }
}

impl Drop for SerialManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[tauri::command]
pub fn serial_list_ports() -> Result<Vec<SerialPortDescriptor>, String> {
    let ports = serialport::available_ports()
        .map_err(|error| format!("Could not enumerate serial ports: {error}"))?;

    Ok(ports.into_iter().map(|port| {
        match port.port_type {
            serialport::SerialPortType::UsbPort(info) => SerialPortDescriptor {
                name: port.port_name,
                port_type: "usb".into(),
                manufacturer: info.manufacturer,
                product: info.product,
                serial_number: info.serial_number,
                vendor_id: Some(info.vid),
                product_id: Some(info.pid),
            },
            serialport::SerialPortType::BluetoothPort => SerialPortDescriptor {
                name: port.port_name,
                port_type: "bluetooth".into(),
                manufacturer: None, product: None, serial_number: None,
                vendor_id: None, product_id: None,
            },
            serialport::SerialPortType::PciPort => SerialPortDescriptor {
                name: port.port_name,
                port_type: "pci".into(),
                manufacturer: None, product: None, serial_number: None,
                vendor_id: None, product_id: None,
            },
            serialport::SerialPortType::Unknown => SerialPortDescriptor {
                name: port.port_name,
                port_type: "unknown".into(),
                manufacturer: None, product: None, serial_number: None,
                vendor_id: None, product_id: None,
            },
        }
    }).collect())
}

#[tauri::command]
pub fn serial_start(
    app: AppHandle,
    manager: State<'_, SerialManager>,
    session_id: String,
    port_name: String,
    baud_rate: u32,
) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("A serial session ID is required".into());
    }
    if !(1200..=2_000_000).contains(&baud_rate) {
        return Err("Baud rate must be between 1200 and 2000000".into());
    }

    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|error| format!("Could not open {port_name}: {error}"))?;
    let mut reader = port.try_clone()
        .map_err(|error| format!("Could not create serial reader: {error}"))?;

    let mut sessions = manager.sessions.lock().map_err(|_| "Serial state is unavailable")?;
    if sessions.contains_key(&session_id) {
        return Err("A serial session with this ID already exists".into());
    }

    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let app_handle = app.clone();
    let id = session_id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 2048];
        while !thread_stop.load(Ordering::Relaxed) {
            match reader.read(&mut buffer) {
                Ok(0) => thread::sleep(Duration::from_millis(10)),
                Ok(count) => {
                    let text = String::from_utf8_lossy(&buffer[..count]).into_owned();
                    if app_handle.emit("apex://serial-output", SerialOutput {
                        session_id: id.clone(),
                        text,
                        stream: "device".into(),
                    }).is_err() {
                        break;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::TimedOut
                    || error.kind() == std::io::ErrorKind::WouldBlock => continue,
                Err(error) => {
                    let _ = app_handle.emit("apex://serial-output", SerialOutput {
                        session_id: id.clone(),
                        text: format!("\r\nSerial connection error: {error}\r\n"),
                        stream: "system".into(),
                    });
                    break;
                }
            }
        }
    });

    sessions.insert(session_id, SerialSession { port, stop });
    Ok(())
}

#[tauri::command]
pub fn serial_write(
    manager: State<'_, SerialManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Serial state is unavailable")?;
    let session = sessions.get_mut(&session_id).ok_or("Serial session not found")?;
    session.port.write_all(data.as_bytes())
        .map_err(|error| format!("Could not write to serial port: {error}"))?;
    session.port.flush().map_err(|error| format!("Could not flush serial output: {error}"))
}

#[tauri::command]
pub fn serial_stop(
    manager: State<'_, SerialManager>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = manager.sessions.lock().map_err(|_| "Serial state is unavailable")?;
    if let Some(session) = sessions.remove(&session_id) {
        session.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}
