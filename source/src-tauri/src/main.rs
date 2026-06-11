// File: src/main.rs
// RustSMF Tauri entry. Minimal shell for the Three.js frontend.
// Provides native file open (dialog) and future binary SMF/GLB I/O commands.

use tauri::command;
use tauri_plugin_dialog::DialogExt;
use std::path::PathBuf;

fn sanitize_path(path: PathBuf) -> String {
    let path_str = path.to_string_lossy().to_string();
    if cfg!(windows) && path_str.starts_with("\\\\?\\") {
        return path_str[4..].to_string();
    }
    path_str
}

#[command]
async fn open_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file_path = app.dialog().file().blocking_pick_file();
    match file_path {
        Some(p) => {
            let s = sanitize_path(p.into_path().map_err(|e| e.to_string())?);
            Ok(Some(s))
        }
        None => Ok(None),
    }
}

#[command]
fn greet(name: &str) -> String {
    format!("Hello, {}! RustSMF Tauri backend is alive.", name)
}

#[command]
async fn read_file_text(path: String) -> Result<String, String> {
    // Simple text read example (for future small metadata or debug)
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
async fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    // Binary read for SMF/GLB/FBX etc. Returns raw bytes so frontend can pass to loaders.
    // This makes desktop .smf load work when open_file only gives a path.
    std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[command]
async fn write_file_binary(path: String, data: Vec<u8>) -> Result<(), String> {
    // Binary write for exports (SMF/GLB etc). Used by frontend saveFile for native desktop save.
    // Note: Uses direct std::fs (consistent with read_file_binary). For packaged Tauri apps,
    // additional filesystem scope/permissions may be required per Tauri v2 security model
    // (see capabilities/default.json and Tauri fs docs). In dev it works; "fs:default" permission
    // would need tauri-plugin-fs if switching to its API.
    std::fs::write(&path, data).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[command]
async fn peek_smf_header(path: String) -> Result<String, String> {
    // Real (not stub) small SMF header peek for desktop validation / rust-smf-parser progress.
    // Reads initial bytes, extracts version strZ if present (SMF_v11 or v12).
    // Includes size for extra info. Frontend uses for desktop .smf to surface Rust I/O in status.
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    if bytes.is_empty() {
        return Ok("empty file".to_string());
    }
    let mut s = String::new();
    for &b in bytes.iter().take(64) {
        if b == 0 { break; }
        s.push(b as char);
    }
    let size = bytes.len();
    if s.starts_with("SMF_v") {
        Ok(format!("Rust SMF peek: {} (size: {} bytes)", s, size))
    } else {
        Ok(format!("not SMF header or unknown (size: {} bytes)", size))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_file, greet, read_file_text, read_file_binary, write_file_binary, peek_smf_header])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
