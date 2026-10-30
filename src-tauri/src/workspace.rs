use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::State;

const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Default)]
pub struct WorkspaceManager {
    root: Mutex<Option<PathBuf>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub relative_path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
}

impl WorkspaceManager {
    pub(crate) fn root(&self) -> Result<PathBuf, String> {
        self.root.lock()
            .map_err(|_| "Workspace state is unavailable".to_string())?
            .clone()
            .ok_or_else(|| "No workspace is open".to_string())
    }

    fn set_root(&self, path: PathBuf) -> Result<WorkspaceInfo, String> {
        let canonical = path.canonicalize()
            .map_err(|error| format!("Could not open workspace: {error}"))?;
        if !canonical.is_dir() {
            return Err("Workspace path is not a directory".into());
        }
        let name = canonical.file_name().and_then(|name| name.to_str())
            .unwrap_or("Workspace").to_string();
        *self.root.lock().map_err(|_| "Workspace state is unavailable")? = Some(canonical.clone());
        Ok(WorkspaceInfo { name, path: canonical.to_string_lossy().into_owned() })
    }
}

fn validate_relative(path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(path);
    if relative.as_os_str().is_empty() {
        return Ok(PathBuf::new());
    }
    if relative.is_absolute() || relative.components().any(|part| {
        matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_))
    }) {
        return Err("Path must stay inside the current workspace".into());
    }
    Ok(relative.to_path_buf())
}

fn resolve_existing(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = validate_relative(relative)?;
    let path = root.join(relative).canonicalize()
        .map_err(|error| format!("Could not resolve workspace path: {error}"))?;
    if !path.starts_with(root) {
        return Err("Path is outside the current workspace".into());
    }
    Ok(path)
}

fn resolve_new(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = validate_relative(relative)?;
    let name = relative.file_name().ok_or("A file name is required")?;
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let parent = root.join(parent).canonicalize()
        .map_err(|error| format!("Could not resolve parent directory: {error}"))?;
    if !parent.starts_with(root) {
        return Err("Path is outside the current workspace".into());
    }
    Ok(parent.join(name))
}

#[tauri::command]
pub fn workspace_pick(manager: State<'_, WorkspaceManager>) -> Result<Option<WorkspaceInfo>, String> {
    let Some(path) = rfd::FileDialog::new().set_title("Open APEX workspace").pick_folder() else {
        return Ok(None);
    };
    manager.set_root(path).map(Some)
}

#[tauri::command]
pub fn workspace_current(manager: State<'_, WorkspaceManager>) -> Result<Option<WorkspaceInfo>, String> {
    let root = manager.root.lock().map_err(|_| "Workspace state is unavailable")?.clone();
    Ok(root.map(|path| WorkspaceInfo {
        name: path.file_name().and_then(|name| name.to_str()).unwrap_or("Workspace").to_string(),
        path: path.to_string_lossy().into_owned(),
    }))
}

#[tauri::command]
pub fn workspace_list(
    manager: State<'_, WorkspaceManager>,
    relative_path: String,
) -> Result<Vec<WorkspaceEntry>, String> {
    let root = manager.root()?;
    let directory = if relative_path.is_empty() {
        root.clone()
    } else {
        resolve_existing(&root, &relative_path)?
    };
    if !directory.is_dir() {
        return Err("Requested workspace path is not a directory".into());
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(&directory).map_err(|error| format!("Could not list directory: {error}"))? {
        let item = item.map_err(|error| format!("Could not read directory entry: {error}"))?;
        let path = item.path();
        let canonical = match path.canonicalize() {
            Ok(path) if path.starts_with(&root) => path,
            _ => continue,
        };
        let metadata = fs::metadata(&canonical).map_err(|error| format!("Could not inspect file: {error}"))?;
        let relative = canonical.strip_prefix(&root).map_err(|_| "Invalid workspace entry")?;
        entries.push(WorkspaceEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            relative_path: relative.to_string_lossy().into_owned(),
            is_directory: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
        });
    }
    entries.sort_by(|a, b| b.is_directory.cmp(&a.is_directory).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[tauri::command]
pub fn workspace_read_file(
    manager: State<'_, WorkspaceManager>,
    relative_path: String,
) -> Result<String, String> {
    let root = manager.root()?;
    let path = resolve_existing(&root, &relative_path)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not inspect file: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected path is not a file".into());
    }
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err("File is larger than the 5 MB text editor limit".into());
    }
    fs::read_to_string(path).map_err(|error| format!("Could not read UTF-8 text file: {error}"))
}

#[tauri::command]
pub fn workspace_write_file(
    manager: State<'_, WorkspaceManager>,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("File exceeds the 5 MB text editor limit".into());
    }
    let root = manager.root()?;
    let path = match resolve_existing(&root, &relative_path) {
        Ok(path) if path.is_file() => path,
        Ok(_) => return Err("Selected path is not a file".into()),
        Err(_) => {
            let candidate = resolve_new(&root, &relative_path)?;
            if candidate.exists() {
                return Err("Refusing to write through an unresolved or symbolic link".into());
            }
            candidate
        }
    };
    fs::write(path, content).map_err(|error| format!("Could not save file: {error}"))
}

#[tauri::command]
pub fn workspace_create_file(
    manager: State<'_, WorkspaceManager>,
    relative_path: String,
) -> Result<(), String> {
    let root = manager.root()?;
    let path = resolve_new(&root, &relative_path)?;
    fs::OpenOptions::new().write(true).create_new(true).open(path)
        .map(|_| ())
        .map_err(|error| format!("Could not create file: {error}"))
}

#[tauri::command]
pub fn workspace_create_directory(
    manager: State<'_, WorkspaceManager>,
    relative_path: String,
) -> Result<(), String> {
    let root = manager.root()?;
    let path = resolve_new(&root, &relative_path)?;
    fs::create_dir(path).map_err(|error| format!("Could not create directory: {error}"))
}
