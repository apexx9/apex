use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Pin {
    gpio: u8, label: &'static str, input: bool, output: bool,
    adc: Option<&'static str>, dac: bool, touch: bool, notes: &'static str,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct BoardProfile {
    id: &'static str, name: &'static str, family: &'static str,
    target: &'static str, description: &'static str,
    verified: bool, pins: Vec<Pin>, warnings: Vec<&'static str>,
}
fn classic_esp32_pins() -> Vec<Pin> {
    (0u8..=39).filter(|g| !matches!(*g, 6..=11 | 20 | 24 | 28..=31)).map(|g| {
        let input_only = (34..=39).contains(&g);
        let adc = if (32..=39).contains(&g) { Some("ADC1") }
            else if (0..=4).contains(&g) || (12..=15).contains(&g) || (25..=27).contains(&g) { Some("ADC2") } else { None };
        Pin {
            gpio:g, label: match g { 0=>"BOOT",1=>"TX0",2=>"GPIO2",3=>"RX0",4=>"GPIO4",5=>"GPIO5",12=>"MTDI",15=>"MTDO",25=>"GPIO25",26=>"GPIO26",34..=39=>"INPUT ONLY",_=>"GPIO" },
            input:true, output:!input_only, adc, dac:matches!(g,25|26), touch:matches!(g,0|2|4|12|13|14|15|27|32|33),
            notes: if input_only {"Input only; no internal pull-up/down and cannot drive outputs"}
                else if matches!(g,0|2|5|12|15) {"Strapping pin; external circuitry can affect boot"}
                else if matches!(g,1|3) {"UART0 programming/log output; shared with serial console"}
                else if matches!(g,25|26) {"Also supports 8-bit DAC output"}
                else if matches!(g,6..=11) {"Reserved for module flash; not exposed"}
                else if adc==Some("ADC2") {"ADC2 may be unavailable while Wi-Fi is active"}
                else {"General-purpose I/O; verify board header routing"} ,
        }
    }).collect()
}
#[tauri::command]
pub fn board_profiles() -> Vec<BoardProfile> {
    vec![BoardProfile {
        id:"esp32-classic-generic-30", name:"ESP32 Classic · generic 30-pin dev board",
        family:"ESP32", target:"esp32", description:"Logical GPIO capability reference for original ESP32 modules. Header position and routing are not guaranteed.",
        verified:false, pins:classic_esp32_pins(),
        warnings:vec![
            "Not a board-revision-specific schematic. Do not infer physical header positions from GPIO numbers.",
            "GPIO6–GPIO11 are reserved for SPI flash on common modules.",
            "GPIO34–GPIO39 are input-only.",
            "GPIO0, 2, 5, 12 and 15 are boot-strapping pins; GPIO12 is especially sensitive at reset.",
            "ADC2 channels conflict with Wi-Fi use on the classic ESP32.",
        ],
    }]
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PeripheralResult {
    pub code: String, pub conflicts: Vec<String>, pub warnings: Vec<String>, pub summary: String,
}
#[tauri::command]
pub fn peripheral_generate(peripheral: String, pins: Vec<u8>, framework: String) -> Result<PeripheralResult,String> {
    let expected = match peripheral.as_str() {
        "gpio"|"uart"|"i2c"|"spi"|"pwm"|"adc"|"dac"|"can" => true,
        _ => false
    };
    if !expected { return Err("Choose GPIO, UART, I2C, SPI, PWM, ADC, DAC or CAN/TWAI.".into()); }
    if !matches!(framework.as_str(),"arduino"|"esp-idf") { return Err("Unsupported firmware framework".into()); }
    let required_pins = match peripheral.as_str() {
        "gpio"|"pwm"|"adc"|"dac" => 1,
        "i2c"|"uart"|"can" => 2,
        "spi" => 4,
        _ => unreachable!(),
    };
    if pins.len() != required_pins {
        let signals = match peripheral.as_str() {
            "gpio"|"pwm"|"adc"|"dac" => "exactly one GPIO",
            "i2c" => "two GPIOs in SDA, SCL order",
            "uart" => "two GPIOs in RX, TX order",
            "can" => "two GPIOs in TX, RX order",
            "spi" => "four GPIOs in SCLK, MISO, MOSI, CS order",
            _ => "the required GPIOs",
        };
        return Err(format!("{} requires {}; {} selected.", peripheral.to_uppercase(), signals, pins.len()));
    }
    if pins.iter().any(|p| *p>39 || matches!(*p,6..=11|20|24|28..=31)) {
        return Err("One or more GPIOs are invalid, unbonded, or reserved for flash on the classic ESP32.".into());
    }
    if peripheral=="dac" && pins.iter().any(|p| !matches!(*p,25|26)) {
        return Err("Classic ESP32 DAC outputs are GPIO25 (DAC1) and GPIO26 (DAC2) only.".into());
    }
    if peripheral=="adc" && pins.iter().any(|p| !(32..=39).contains(p) && !matches!(*p,0|2|4|12..=15|25..=27)) {
        return Err("Selected pin does not expose an ADC channel on the classic ESP32.".into());
    }
    let mut conflicts=Vec::new(); let mut warnings=Vec::new();
    let unique: std::collections::HashSet<u8> = pins.iter().copied().collect();
    if unique.len()!=pins.len() { return Err("The same GPIO cannot be assigned to multiple signals.".into()); }
    for p in &pins {
        if (34..=39).contains(p) && matches!(peripheral.as_str(),"gpio"|"pwm"|"spi"|"i2c"|"uart"|"can"|"dac") {
            conflicts.push(format!("GPIO{p} is input-only and cannot be used for this output-capable signal."));
        }
        if matches!(*p,0|2|5|12|15) { warnings.push(format!("GPIO{p} is a boot-strapping pin; verify external pull states and boot behaviour.")); }
        if (1..=3).contains(p) { warnings.push(format!("GPIO{p} overlaps UART0 programming/console pins on common ESP32 designs.")); }
    }
    if peripheral=="adc" && pins.iter().any(|p| matches!(*p,0|2|4|12..=15|25..=27)) {
        warnings.push("ADC2 readings are generally unavailable while Wi-Fi is active on the original ESP32; prefer ADC1 GPIO32–39.".into());
    }
    if peripheral=="dac" && pins.iter().any(|p| !matches!(*p,25|26)) {
        conflicts.push("Classic ESP32 DAC outputs are GPIO25 (DAC1) and GPIO26 (DAC2) only.".into());
    }
    if peripheral=="adc" && pins.iter().any(|p| !(32..=39).contains(p) && !matches!(*p,0|2|4|12..=15|25..=27)) {
        conflicts.push("Selected pin does not expose an ADC channel on the classic ESP32.".into());
    }
    let p = |i:usize| pins.get(i).copied().unwrap_or(0);
    let code = match (framework.as_str(),peripheral.as_str()) {
        ("arduino","gpio") => format!("constexpr int APEX_GPIO = {};\nvoid setup() {{ pinMode(APEX_GPIO, OUTPUT); }}\nvoid loop() {{ digitalWrite(APEX_GPIO, HIGH); delay(500); digitalWrite(APEX_GPIO, LOW); delay(500); }}",p(0)),
        ("arduino","i2c") => format!("#include <Wire.h>\nvoid setup() {{ Wire.begin({}, {}); Serial.begin(115200); }}\nvoid loop() {{ for (uint8_t a=1; a<127; ++a) {{ Wire.beginTransmission(a); if (Wire.endTransmission()==0) Serial.printf(\"I2C: 0x%02X\\n\",a); }} delay(3000); }}",p(0),p(1)),
        ("arduino","uart") => format!("#include <HardwareSerial.h>\nHardwareSerial ApexUart(1);\nvoid setup() {{ Serial.begin(115200); ApexUart.begin(9600, SERIAL_8N1, {}, {}); }}\nvoid loop() {{ while(ApexUart.available()) Serial.write(ApexUart.read()); }}",p(0),p(1)),
        ("arduino","pwm") => format!("constexpr int PWM_PIN = {};\nvoid setup() {{ pinMode(PWM_PIN, OUTPUT); }}\nvoid loop() {{ for(int d=0; d<=255; ++d) {{ analogWrite(PWM_PIN,d); delay(8); }} }}",p(0)),
        ("arduino","adc") => format!("void setup() {{ Serial.begin(115200); }}\nvoid loop() {{ Serial.printf(\"GPIO{} ADC: %d\\n\", analogRead({})); delay(500); }}",p(0),p(0)),
        ("arduino","dac") => format!("void setup() {{}}\nvoid loop() {{ for(int v=0;v<256;v++) dacWrite({},v); for(int v=255;v>=0;v--) dacWrite({},v); }}",p(0),p(0)),
        ("arduino","spi") => format!("#include <SPI.h>\nconstexpr int APEX_SCLK = {};\nconstexpr int APEX_MISO = {};\nconstexpr int APEX_MOSI = {};\nconstexpr int APEX_CS = {};\nvoid setup() {{ SPI.begin(APEX_SCLK, APEX_MISO, APEX_MOSI, APEX_CS); pinMode(APEX_CS, OUTPUT); digitalWrite(APEX_CS, HIGH); }}\nvoid loop() {{ digitalWrite(APEX_CS, LOW); SPI.transfer(0x9F); digitalWrite(APEX_CS, HIGH); delay(1000); }}",p(0),p(1),p(2),p(3)),
        ("arduino","can") => format!("#include <ESP32-TWAI-CAN.hpp>\n// Install ESP32-TWAI-CAN library. Confirm transceiver wiring and bus termination.\nvoid setup() {{ Serial.begin(115200); ESP32Can.setPins({}, {}); ESP32Can.setSpeed(ESP32Can.convertSpeed(500)); ESP32Can.begin(); }}\nvoid loop() {{ CanFrame frame; if (ESP32Can.readFrame(frame, 1000)) Serial.println(\"CAN frame received\"); }}",p(0),p(1)),
        ("esp-idf","gpio") => format!("#include \"driver/gpio.h\"\n#define APEX_GPIO GPIO_NUM_{}\nvoid app_main(void) {{ gpio_reset_pin(APEX_GPIO); gpio_set_direction(APEX_GPIO, GPIO_MODE_OUTPUT); gpio_set_level(APEX_GPIO, 1); }}",p(0)),
        ("esp-idf","i2c") => format!("// ESP-IDF 5.x: configure an I2C master bus with these pins.\n#include \"driver/i2c_master.h\"\n#define APEX_I2C_SDA GPIO_NUM_{}\n#define APEX_I2C_SCL GPIO_NUM_{}\n// Create bus with i2c_new_master_bus(); scan addresses using probe API.",p(0),p(1)),
        ("esp-idf","uart") => format!("#include \"driver/uart.h\"\n#define APEX_UART_RX GPIO_NUM_{}\n#define APEX_UART_TX GPIO_NUM_{}\n// Configure UART_NUM_1 with uart_param_config(), uart_set_pin(UART_NUM_1, APEX_UART_TX, APEX_UART_RX, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE), and uart_driver_install().",p(0),p(1)),
        ("esp-idf","spi") => format!("#include \"driver/spi_master.h\"\n#define APEX_SPI_SCLK GPIO_NUM_{}\n#define APEX_SPI_MISO GPIO_NUM_{}\n#define APEX_SPI_MOSI GPIO_NUM_{}\n#define APEX_SPI_CS GPIO_NUM_{}\n// Set spi_bus_config_t: sclk_io_num=APEX_SPI_SCLK, miso_io_num=APEX_SPI_MISO, mosi_io_num=APEX_SPI_MOSI, quadwp_io_num=-1, quadhd_io_num=-1.\n// Initialize SPI2_HOST with spi_bus_initialize(), then set spi_device_interface_config_t.spics_io_num=APEX_SPI_CS and add the device.",p(0),p(1),p(2),p(3)),
        ("esp-idf","pwm") => format!("#include \"driver/ledc.h\"\n#define APEX_PWM_GPIO GPIO_NUM_{}\n// Configure LEDC timer/channel, then ledc_channel_config() and ledc_set_duty().",p(0)),
        ("esp-idf","adc") => format!("#include \"esp_adc/adc_oneshot.h\"\n// Configure ADC1 oneshot unit and channel for GPIO{}. Check ESP-IDF GPIO-to-channel mapping.",p(0)),
        ("esp-idf","dac") => format!("#include \"driver/dac_oneshot.h\"\n// Original ESP32 DAC channel: GPIO25=channel 0, GPIO26=channel 1.\n// Configure dac_oneshot_new_channel() and write output. Selected GPIO: {}",p(0)),
        ("esp-idf","can") => format!("#include \"driver/twai.h\"\n#define APEX_TWAI_TX GPIO_NUM_{}\n#define APEX_TWAI_RX GPIO_NUM_{}\n// Configure TWAI general/timing/filter config, install driver, then start.",p(0),p(1)),
        _ => unreachable!()
    };
    Ok(PeripheralResult { code, conflicts, warnings, summary:format!("{} configuration for {} using GPIO {:?}",peripheral.to_uppercase(),framework,pins) })
}


#[cfg(test)]
mod tests {
    use super::peripheral_generate;

    #[test]
    fn rejects_incomplete_i2c_pin_assignment() {
        assert!(peripheral_generate("i2c".into(), vec![21], "arduino".into()).is_err());
    }

    #[test]
    fn rejects_incomplete_spi_pin_assignment() {
        assert!(peripheral_generate("spi".into(), vec![18, 19], "arduino".into()).is_err());
    }

    #[test]
    fn rejects_unbonded_classic_esp32_gpio() {
        assert!(peripheral_generate("gpio".into(), vec![20], "arduino".into()).is_err());
    }

    #[test]
    fn generates_spi_with_all_four_selected_signals() {
        let result = peripheral_generate("spi".into(), vec![18, 19, 23, 5], "arduino".into()).unwrap();
        assert!(result.code.contains("SPI.begin(APEX_SCLK, APEX_MISO, APEX_MOSI, APEX_CS)"));
        assert!(result.conflicts.is_empty());
    }

    #[test]
    fn generates_esp_idf_spi_with_all_four_signals() {
        let result = peripheral_generate("spi".into(), vec![18, 19, 23, 5], "esp-idf".into()).unwrap();
        assert!(result.code.contains("APEX_SPI_SCLK GPIO_NUM_18"));
        assert!(result.code.contains("APEX_SPI_MISO GPIO_NUM_19"));
        assert!(result.code.contains("APEX_SPI_MOSI GPIO_NUM_23"));
        assert!(result.code.contains("APEX_SPI_CS GPIO_NUM_5"));
    }

    #[test]
    fn rejects_non_adc_gpio() {
        assert!(peripheral_generate("adc".into(), vec![16], "arduino".into()).is_err());
    }
}
