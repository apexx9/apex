use serde::Serialize;

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
                manufacturer: None,
                product: None,
                serial_number: None,
                vendor_id: None,
                product_id: None,
            },
            serialport::SerialPortType::PciPort => SerialPortDescriptor {
                name: port.port_name,
                port_type: "pci".into(),
                manufacturer: None,
                product: None,
                serial_number: None,
                vendor_id: None,
                product_id: None,
            },
            serialport::SerialPortType::Unknown => SerialPortDescriptor {
                name: port.port_name,
                port_type: "unknown".into(),
                manufacturer: None,
                product: None,
                serial_number: None,
                vendor_id: None,
                product_id: None,
            },
        }
    }).collect())
}
