use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, process::Command};
use tauri::State;
use crate::workspace::WorkspaceManager;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct FirmwareResult {
    pub command: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub output: String,
}

fn safe_project_name(name: &str) -> Result<String, String> {
    let trimmed=name.trim();
    if trimmed.is_empty() || trimmed.len()>64 || trimmed=="." || trimmed==".." ||
       !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c=='-' || c=='_') {
        return Err("Project name must use only letters, numbers, hyphens and underscores (max 64 characters)".into());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn firmware_create_project(name: String, framework: String) -> Result<String, String> {
    let name=safe_project_name(&name)?;
    let parent=rfd::FileDialog::new().set_title("Choose where to create the APEX project").pick_folder()
        .ok_or("Project creation cancelled")?;
    let root=parent.join(&name);
    if root.exists() { return Err(format!("A folder named {name} already exists at the selected location")); }
    fs::create_dir_all(&root).map_err(|e| format!("Could not create project directory: {e}"))?;
    let result=(|| -> std::io::Result<()> {
        fs::write(root.join(".gitignore"), "build/\n.pio/\n.vscode/\n*.bin\n*.elf\n")?;
        fs::write(root.join("README.md"), format!("# {name}\n\nCreated with APEX.\n\nFramework: {framework}\nTarget: generic Espressif ESP32 (verify the exact module and board before flashing).\n"))?;
        match framework.as_str() {
            "arduino" => {
                fs::write(root.join(format!("{name}.ino")), "#include <Arduino.h>\n\nconstexpr uint8_t LED_PIN = 2; // Verify this pin against your board.\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_PIN, OUTPUT);\n  Serial.println(\"APEX firmware ready\");\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, !digitalRead(LED_PIN));\n  delay(500);\n}\n")?;
                fs::write(root.join("apex-board.json"), "{\n  \"family\": \"ESP32\",\n  \"target\": \"esp32\",\n  \"fqbn\": \"esp32:esp32:esp32\",\n  \"profile\": \"generic-esp32-devkit\",\n  \"pinoutVerified\": false\n}\n")?;
            },
            "esp-idf" => {
                fs::create_dir_all(root.join("main"))?;
                fs::write(root.join("CMakeLists.txt"), "cmake_minimum_required(VERSION 3.16)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(apex_firmware)\n")?;
                fs::write(root.join("main/CMakeLists.txt"), "idf_component_register(SRCS \"main.c\" INCLUDE_DIRS \".\")\n")?;
                fs::write(root.join("main/main.c"), "#include <stdio.h>\n#include \"freertos/FreeRTOS.h\"\n#include \"freertos/task.h\"\n#include \"driver/gpio.h\"\n#include \"esp_log.h\"\n\n#define LED_GPIO GPIO_NUM_2 // Verify this pin against your board.\nstatic const char *TAG = \"apex\";\n\nvoid app_main(void) {\n    gpio_reset_pin(LED_GPIO);\n    gpio_set_direction(LED_GPIO, GPIO_MODE_OUTPUT);\n    ESP_LOGI(TAG, \"APEX firmware ready\");\n    while (1) {\n        gpio_set_level(LED_GPIO, 1);\n        vTaskDelay(pdMS_TO_TICKS(500));\n        gpio_set_level(LED_GPIO, 0);\n        vTaskDelay(pdMS_TO_TICKS(500));\n    }\n}\n")?;
                fs::write(root.join("sdkconfig.defaults"), "CONFIG_IDF_TARGET=\"esp32\"\n")?;
            },
            _ => return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "Unsupported framework. Choose arduino or esp-idf.")),
        }
        Ok(())
    })();
    if let Err(error)=result { let _=fs::remove_dir_all(&root); return Err(error.to_string()); }
    Ok(root.to_string_lossy().into_owned())
}

fn run_in_project(root: &Path, program: &str, args: &[String]) -> Result<FirmwareResult,String> {
    if !root.is_dir() { return Err("Project directory does not exist".into()); }
    let output=Command::new(program).args(args).current_dir(root).output()
        .map_err(|e| format!("Could not start {program}: {e}. Check that the relevant toolchain is installed and on PATH."))?;
    let mut text=String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Ok(FirmwareResult {
        command: format!("{program} {}", args.join(" ")),
        success: output.status.success(),
        exit_code: output.status.code(),
        output: text,
    })
}

fn active_project(manager: &WorkspaceManager, framework: &str) -> Result<PathBuf,String> {
    let root=manager.root()?;
    match framework {
        "arduino" => {
            let has_sketch=fs::read_dir(&root).map_err(|e| format!("Could not inspect Arduino project: {e}"))?
                .filter_map(Result::ok).any(|entry| entry.path().extension().is_some_and(|ext| ext.eq_ignore_ascii_case("ino")));
            if !has_sketch { return Err("The active workspace does not contain an Arduino .ino sketch. Select the matching framework or open an Arduino project.".into()); }
        },
        "esp-idf" => {
            if !root.join("CMakeLists.txt").is_file() || !root.join("main").is_dir() {
                return Err("The active workspace does not look like an ESP-IDF project (expected CMakeLists.txt and main/).".into());
            }
        },
        _ => return Err("Unsupported framework".into())
    }
    Ok(root)
}

#[tauri::command]
pub fn firmware_build(manager: State<'_,WorkspaceManager>, framework: String) -> Result<FirmwareResult,String> {
    let root=active_project(&manager, &framework)?;
    match framework.as_str() {
        "arduino" => run_in_project(&root,"arduino-cli",&["compile".into(),"--fqbn".into(),"esp32:esp32:esp32".into(),".".into()]),
        "esp-idf" => run_in_project(&root,"idf.py",&["build".into()]),
        _ => Err("Unsupported framework".into())
    }
}

#[tauri::command]
pub fn firmware_flash(manager: State<'_,WorkspaceManager>, framework: String, port: String) -> Result<FirmwareResult,String> {
    if port.trim().is_empty() || port.len()>128 || port.chars().any(|c| c.is_control()) {
        return Err("Select a valid serial port before flashing".into());
    }
    let root=active_project(&manager)?;
    match framework.as_str() {
        "arduino" => run_in_project(&root,"arduino-cli",&["compile".into(),"--fqbn".into(),"esp32:esp32:esp32".into(),"--upload".into(),"--port".into(),port,".".into()]),
        "esp-idf" => run_in_project(&root,"idf.py",&["-p".into(),port,"flash".into()]),
        _ => Err("Unsupported framework".into())
    }
}

#[cfg(test)]
mod tests {
    use super::safe_project_name;
    #[test] fn accepts_simple_project_names() { assert_eq!(safe_project_name("robot_firmware").unwrap(), "robot_firmware"); }
    #[test] fn rejects_path_traversal_and_shell_characters() { assert!(safe_project_name("../firmware").is_err()); assert!(safe_project_name("firmware;whoami").is_err()); }
}
