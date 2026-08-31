// File: src/main.rs
// RustSMF Tauri entry. Minimal shell for the Three.js frontend.
// Provides native file dialogs plus binary SMF/GLB I/O commands.

use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};
use tauri::{command, Manager};
use tauri_plugin_dialog::DialogExt;

const MAX_NATIVE_FILE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_NATIVE_SIDECAR_BYTES: u64 = 64 * 1024 * 1024;
const MAX_NATIVE_BUNDLE_FILES: usize = 64;
const PROJECT_RECOVERY_DIRECTORY: &str = "rustsmf-recovery";
const PROJECT_RECOVERY_TARGET: &str = "rustsmf-autosave.rsproj";
const TEMP_FILE_ATTEMPTS: usize = 64;

static NATIVE_WRITE_LOCK: OnceLock<tauri::async_runtime::Mutex<()>> = OnceLock::new();
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
struct NativeFileAuthority(Mutex<HashSet<String>>);

fn sanitize_path(path: PathBuf) -> String {
    let path_str = path.to_string_lossy().to_string();
    if cfg!(windows) {
        if let Some(rest) = path_str.strip_prefix("\\\\?\\UNC\\") {
            return format!("\\\\{rest}");
        }
        if let Some(rest) = path_str.strip_prefix("\\\\?\\") {
            return rest.to_string();
        }
    }
    path_str
}

fn authority_key(path: &Path) -> String {
    let path = sanitize_path(path.to_path_buf());
    if cfg!(windows) {
        path.to_ascii_lowercase()
    } else {
        path
    }
}

fn register_selected_path(
    authority: &NativeFileAuthority,
    path: PathBuf,
) -> Result<String, String> {
    let canonical = std::fs::canonicalize(&path).map_err(|error| {
        format!(
            "Failed to authorize selected file {}: {error}",
            path.display()
        )
    })?;
    authority
        .0
        .lock()
        .map_err(|_| "Native file authority lock is poisoned".to_string())?
        .insert(authority_key(&canonical));
    Ok(sanitize_path(canonical))
}

fn authorize_selected_path(authority: &NativeFileAuthority, path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    let canonical = std::fs::canonicalize(&candidate)
        .map_err(|error| format!("Failed to resolve selected file {path}: {error}"))?;
    let key = authority_key(&canonical);
    let selected = authority
        .0
        .lock()
        .map_err(|_| "Native file authority lock is poisoned".to_string())?;
    if !selected.contains(&key) {
        return Err(format!(
            "NATIVE_PATH_NOT_SELECTED: {path} was not selected by the native file dialog"
        ));
    }
    Ok(canonical)
}

fn read_bytes_bounded<R: Read>(
    reader: R,
    reported_len: u64,
    path: &Path,
    max_bytes: u64,
) -> Result<Vec<u8>, String> {
    if reported_len > max_bytes {
        return Err(format!(
            "MODEL_INPUT_TOO_LARGE: refusing to read {}: file is {} bytes; maximum is {max_bytes}",
            path.display(),
            reported_len
        ));
    }

    let capacity = usize::try_from(reported_len)
        .map_err(|_| format!("Failed to size native file read for {}", path.display()))?;
    let read_limit = max_bytes
        .checked_add(1)
        .ok_or_else(|| "Native file byte limit is invalid".to_string())?;
    let mut bytes = Vec::with_capacity(capacity);
    reader
        .take(read_limit)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;

    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "MODEL_INPUT_TOO_LARGE: refusing to read {}: file exceeded the maximum of {max_bytes} bytes while reading",
            path.display()
        ));
    }
    Ok(bytes)
}

fn read_file_bytes_with_limit(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path)
        .map_err(|error| format!("Failed to open {}: {error}", path.display()))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!(
            "MODEL_INPUT_NOT_A_FILE: refusing to read {}: path is not a regular file",
            path.display()
        ));
    }
    read_bytes_bounded(file, metadata.len(), path, max_bytes)
}

fn read_file_bytes_sync(path: &Path) -> Result<Vec<u8>, String> {
    read_file_bytes_with_limit(path, MAX_NATIVE_FILE_BYTES)
}

fn read_file_bundle_sync(paths: Vec<PathBuf>) -> Result<Vec<Vec<u8>>, String> {
    if paths.is_empty() {
        return Err("MODEL_RESOURCE_BUNDLE_EMPTY: no files were selected".to_string());
    }
    if paths.len() > MAX_NATIVE_BUNDLE_FILES {
        return Err(format!(
            "RESOURCE_BUNDLE_TOO_MANY_FILES: selected {} files; maximum is {}",
            paths.len(),
            MAX_NATIVE_BUNDLE_FILES
        ));
    }

    let mut total_bytes = 0_u64;
    let mut metadata = Vec::with_capacity(paths.len());
    for (index, path) in paths.iter().enumerate() {
        let file = std::fs::File::open(path)
            .map_err(|error| format!("Failed to open {}: {error}", path.display()))?;
        let file_metadata = file
            .metadata()
            .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
        if !file_metadata.is_file() {
            return Err(format!(
                "MODEL_INPUT_NOT_A_FILE: refusing to read {}: path is not a regular file",
                path.display()
            ));
        }
        let limit = if index == 0 {
            MAX_NATIVE_FILE_BYTES
        } else {
            MAX_NATIVE_SIDECAR_BYTES
        };
        if file_metadata.len() > limit {
            return Err(format!(
                "MODEL_INPUT_TOO_LARGE: refusing to read {}: file is {} bytes; maximum is {limit}",
                path.display(),
                file_metadata.len()
            ));
        }
        total_bytes = total_bytes
            .checked_add(file_metadata.len())
            .ok_or_else(|| {
                "RESOURCE_BUNDLE_TOO_LARGE: selected file sizes overflowed the bundle limit"
                    .to_string()
            })?;
        if total_bytes > MAX_NATIVE_FILE_BYTES {
            return Err(format!(
                "RESOURCE_BUNDLE_TOO_LARGE: selected files total {} bytes; maximum is {}",
                total_bytes, MAX_NATIVE_FILE_BYTES
            ));
        }
        metadata.push((path.clone(), file, file_metadata.len(), limit));
    }

    metadata
        .into_iter()
        .map(|(path, file, reported_len, limit)| {
            read_bytes_bounded(file, reported_len, &path, limit)
        })
        .collect()
}

async fn read_file_bytes(authority: &NativeFileAuthority, path: String) -> Result<Vec<u8>, String> {
    let authorized_path = authorize_selected_path(authority, &path)?;
    tauri::async_runtime::spawn_blocking(move || read_file_bytes_sync(&authorized_path))
        .await
        .map_err(|error| format!("Native file read task failed: {error}"))?
}

async fn read_file_bundle_bytes(
    authority: &NativeFileAuthority,
    paths: Vec<String>,
) -> Result<Vec<Vec<u8>>, String> {
    let authorized_paths = paths
        .iter()
        .map(|path| authorize_selected_path(authority, path))
        .collect::<Result<Vec<_>, _>>()?;
    tauri::async_runtime::spawn_blocking(move || read_file_bundle_sync(authorized_paths))
        .await
        .map_err(|error| format!("Native file bundle read task failed: {error}"))?
}

fn project_backup_path(target: &Path, generation: usize) -> PathBuf {
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("rustsmf-project.rsproj");
    target.with_file_name(format!("{name}.bak{generation}"))
}

fn native_write_lock() -> &'static tauri::async_runtime::Mutex<()> {
    NATIVE_WRITE_LOCK.get_or_init(tauri::async_runtime::Mutex::default)
}

async fn run_native_write<T, F>(task_name: &str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let _guard = native_write_lock().lock().await;
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{task_name} task failed: {error}"))?
}

#[derive(Debug)]
struct TemporaryFile {
    path: PathBuf,
    remove_on_drop: bool,
}

impl TemporaryFile {
    fn path(&self) -> &Path {
        &self.path
    }

    fn disarm(&mut self) {
        self.remove_on_drop = false;
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        if self.remove_on_drop {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

fn next_temporary_path(target: &Path, purpose: &str) -> PathBuf {
    let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    target.with_file_name(format!(
        ".rustsmf-{purpose}-{}-{sequence}.tmp",
        std::process::id()
    ))
}

fn create_temporary_file(
    target: &Path,
    purpose: &str,
) -> Result<(TemporaryFile, std::fs::File), String> {
    for _ in 0..TEMP_FILE_ATTEMPTS {
        let path = next_temporary_path(target, purpose);
        match std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
        {
            Ok(file) => {
                return Ok((
                    TemporaryFile {
                        path,
                        remove_on_drop: true,
                    },
                    file,
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Failed to create staged file beside {}: {error}",
                    target.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to reserve a unique staged file beside {} after {TEMP_FILE_ATTEMPTS} attempts",
        target.display()
    ))
}

fn stage_file_bytes(target: &Path, data: &[u8], purpose: &str) -> Result<TemporaryFile, String> {
    let (temporary, mut file) = create_temporary_file(target, purpose)?;
    file.write_all(data)
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!(
                "Failed to flush staged file {}: {error}",
                temporary.path().display()
            )
        })?;
    drop(file);
    Ok(temporary)
}

fn reserve_temporary_path(target: &Path, purpose: &str) -> Result<PathBuf, String> {
    let (mut reservation, file) = create_temporary_file(target, purpose)?;
    drop(file);
    std::fs::remove_file(reservation.path()).map_err(|error| {
        format!(
            "Failed to release staged path {}: {error}",
            reservation.path().display()
        )
    })?;
    reservation.disarm();
    Ok(reservation.path.clone())
}

fn write_file_replacing(target: &Path, data: &[u8]) -> Result<(), String> {
    let mut staged = stage_file_bytes(target, data, "export")?;
    if !target.exists() {
        std::fs::rename(staged.path(), target).map_err(|error| {
            format!(
                "Failed to install staged export {}: {error}",
                target.display()
            )
        })?;
        staged.disarm();
        return Ok(());
    }

    let previous = reserve_temporary_path(target, "previous")?;
    std::fs::rename(target, &previous).map_err(|error| {
        format!(
            "Failed to preserve previous export {}: {error}",
            target.display()
        )
    })?;

    match std::fs::rename(staged.path(), target) {
        Ok(()) => {
            staged.disarm();
            if let Err(error) = std::fs::remove_file(&previous) {
                eprintln!(
                    "RustSMF warning: installed export {}, but could not remove the previous generation at {}: {error}",
                    target.display(),
                    previous.display()
                );
            }
            Ok(())
        }
        Err(install_error) => {
            let rollback = std::fs::rename(&previous, target);
            match rollback {
                Ok(()) => Err(format!(
                    "Failed to install staged export {}; the previous file was restored: {install_error}",
                    target.display()
                )),
                Err(rollback_error) => Err(format!(
                    "Failed to install staged export {} ({install_error}) and failed to restore the previous file from {} ({rollback_error})",
                    target.display(),
                    previous.display()
                )),
            }
        }
    }
}

fn write_project_rotating(target: &Path, data: &[u8]) -> Result<(), String> {
    if data.is_empty() {
        return Err("PROJECT_EMPTY: refusing to write an empty project".to_string());
    }
    if data.len() as u64 > MAX_NATIVE_FILE_BYTES {
        return Err(format!(
            "MODEL_INPUT_TOO_LARGE: refusing to write project: file is {} bytes; maximum is {MAX_NATIVE_FILE_BYTES}",
            data.len()
        ));
    }
    let parent = target
        .parent()
        .ok_or_else(|| "Project destination has no parent directory".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create project directory {}: {error}",
            parent.display()
        )
    })?;

    let mut temporary = stage_file_bytes(target, data, "project")?;

    let backup_one = project_backup_path(target, 1);
    let backup_two = project_backup_path(target, 2);
    if backup_two.exists() {
        std::fs::remove_file(&backup_two).map_err(|error| {
            format!(
                "Failed to rotate project backup {}: {error}",
                backup_two.display()
            )
        })?;
    }
    let rotated_backup_one = backup_one.exists();
    if rotated_backup_one {
        std::fs::rename(&backup_one, &backup_two).map_err(|error| {
            format!(
                "Failed to rotate project backup {}: {error}",
                backup_one.display()
            )
        })?;
    }
    let preserved_target = target.exists();
    if preserved_target {
        if let Err(preserve_error) = std::fs::rename(target, &backup_one) {
            if rotated_backup_one {
                return match std::fs::rename(&backup_two, &backup_one) {
                    Ok(()) => Err(format!(
                        "Failed to preserve previous project generation; the prior backup was restored: {preserve_error}"
                    )),
                    Err(rollback_error) => Err(format!(
                        "Failed to preserve previous project generation ({preserve_error}) and failed to restore {} ({rollback_error})",
                        backup_one.display()
                    )),
                };
            }
            return Err(format!(
                "Failed to preserve previous project generation: {preserve_error}"
            ));
        }
    }
    if let Err(install_error) = std::fs::rename(temporary.path(), target) {
        if preserved_target {
            return match std::fs::rename(&backup_one, target) {
                Ok(()) => Err(format!(
                    "Failed to install project generation {}; the previous generation was restored: {install_error}",
                    target.display()
                )),
                Err(rollback_error) => Err(format!(
                    "Failed to install project generation {} ({install_error}) and failed to restore {} ({rollback_error})",
                    target.display(),
                    backup_one.display()
                )),
            };
        }
        return Err(format!(
            "Failed to install project generation {}: {install_error}",
            target.display()
        ));
    }
    temporary.disarm();
    Ok(())
}

fn project_recovery_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve RustSMF app data directory: {error}"))?
        .join(PROJECT_RECOVERY_DIRECTORY))
}

fn is_project_recovery_generation_name(name: &str) -> bool {
    name == PROJECT_RECOVERY_TARGET
        || matches!(
            name.strip_prefix(PROJECT_RECOVERY_TARGET),
            Some(".bak1" | ".bak2")
        )
}

fn discover_project_recovery_in(directory: &Path) -> Result<Vec<String>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut names = Vec::new();
    for entry in std::fs::read_dir(directory)
        .map_err(|error| format!("Failed to inspect project recovery directory: {error}"))?
    {
        let entry = entry
            .map_err(|error| format!("Failed to inspect a project recovery entry: {error}"))?;
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "Failed to inspect project recovery entry {}: {error}",
                entry.path().display()
            )
        })?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if file_type.is_file() && is_project_recovery_generation_name(&name) {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

fn read_project_recovery_from(directory: &Path, name: &str) -> Result<Vec<u8>, String> {
    if !is_project_recovery_generation_name(name) {
        return Err(
            "PROJECT_RECOVERY_INVALID_NAME: recovery name is not an owned project generation"
                .to_string(),
        );
    }
    let path = directory.join(name);
    let metadata = std::fs::symlink_metadata(&path).map_err(|error| {
        format!(
            "Failed to inspect project recovery {}: {error}",
            path.display()
        )
    })?;
    if !metadata.file_type().is_file() {
        return Err(format!(
            "PROJECT_RECOVERY_NOT_A_FILE: refusing to read {} because it is not a regular recovery file",
            path.display()
        ));
    }
    read_file_bytes_with_limit(&path, MAX_NATIVE_FILE_BYTES)
}

#[command]
async fn open_file(
    app: tauri::AppHandle,
    authority: tauri::State<'_, NativeFileAuthority>,
) -> Result<Option<Vec<String>>, String> {
    let file_paths = app.dialog().file().blocking_pick_files();
    match file_paths {
        Some(paths) => {
            let selected = paths
                .into_iter()
                .map(|path| path.into_path().map_err(|error| error.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            let registered = selected
                .into_iter()
                .map(|path| register_selected_path(&authority, path))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Some(registered))
        }
        None => Ok(None),
    }
}

#[command]
async fn open_project_file(
    app: tauri::AppHandle,
    authority: tauri::State<'_, NativeFileAuthority>,
) -> Result<Option<String>, String> {
    let file_path = app.dialog().file().blocking_pick_file();
    match file_path {
        Some(path) => Ok(Some(register_selected_path(
            &authority,
            path.into_path().map_err(|error| error.to_string())?,
        )?)),
        None => Ok(None),
    }
}

#[command]
fn greet(name: &str) -> String {
    format!("Hello, {}! RustSMF Tauri backend is alive.", name)
}

#[command]
async fn read_file_text(
    path: String,
    authority: tauri::State<'_, NativeFileAuthority>,
) -> Result<String, String> {
    // Small text read helper for metadata/debug paths; model loads use read_file_binary.
    let bytes = read_file_bytes(&authority, path).await?;
    String::from_utf8(bytes).map_err(|error| format!("File is not valid UTF-8: {error}"))
}

#[command]
async fn read_file_binary(
    path: String,
    authority: tauri::State<'_, NativeFileAuthority>,
) -> Result<Vec<u8>, String> {
    // Binary read for SMF/GLB/FBX etc. Returns raw bytes so frontend can pass to loaders.
    // The path is accepted only after open_file authorizes the native dialog result.
    read_file_bytes(&authority, path).await
}

#[command]
async fn read_files_binary(
    paths: Vec<String>,
    authority: tauri::State<'_, NativeFileAuthority>,
) -> Result<Vec<Vec<u8>>, String> {
    read_file_bundle_bytes(&authority, paths).await
}

#[command]
async fn save_file_binary(
    app: tauri::AppHandle,
    suggested_name: String,
    data: Vec<u8>,
) -> Result<bool, String> {
    // The native dialog owns the destination. The frontend never supplies an
    // arbitrary write path, and the byte bound is checked before filesystem work.
    if data.len() as u64 > MAX_NATIVE_FILE_BYTES {
        return Err(format!(
            "MODEL_INPUT_TOO_LARGE: refusing to write export: file is {} bytes; maximum is {MAX_NATIVE_FILE_BYTES}",
            data.len()
        ));
    }
    let file_path = app
        .dialog()
        .file()
        .set_file_name(suggested_name)
        .blocking_save_file();
    let Some(file_path) = file_path else {
        return Ok(false);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Native save destination has no parent directory".to_string())?;
    let canonical_parent = std::fs::canonicalize(parent).map_err(|error| {
        format!(
            "Failed to resolve native save directory {}: {error}",
            parent.display()
        )
    })?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Native save destination has no file name".to_string())?
        .to_owned();
    let output_path = canonical_parent.join(file_name);
    run_native_write("Native file write", move || {
        write_file_replacing(&output_path, &data)
    })
    .await?;
    Ok(true)
}

#[command]
async fn save_project_atomic(
    app: tauri::AppHandle,
    suggested_name: String,
    data: Vec<u8>,
) -> Result<bool, String> {
    if data.len() as u64 > MAX_NATIVE_FILE_BYTES {
        return Err(format!(
            "MODEL_INPUT_TOO_LARGE: refusing to write project: file is {} bytes; maximum is {MAX_NATIVE_FILE_BYTES}",
            data.len()
        ));
    }
    let file_path = app
        .dialog()
        .file()
        .set_file_name(suggested_name)
        .blocking_save_file();
    let Some(file_path) = file_path else {
        return Ok(false);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Native project destination has no parent directory".to_string())?;
    let canonical_parent = std::fs::canonicalize(parent).map_err(|error| {
        format!(
            "Failed to resolve native project save directory {}: {error}",
            parent.display()
        )
    })?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Native project destination has no file name".to_string())?
        .to_owned();
    let output_path = canonical_parent.join(file_name);
    run_native_write("Native project write", move || {
        write_project_rotating(&output_path, &data)
    })
    .await?;
    Ok(true)
}

#[command]
async fn autosave_project(app: tauri::AppHandle, data: Vec<u8>) -> Result<bool, String> {
    let directory = project_recovery_directory(&app)?;
    let target = directory.join(PROJECT_RECOVERY_TARGET);
    run_native_write("Native autosave", move || {
        write_project_rotating(&target, &data)
    })
    .await?;
    Ok(true)
}

#[command]
fn discover_project_recovery(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let directory = project_recovery_directory(&app)?;
    discover_project_recovery_in(&directory)
}

#[command]
fn read_project_recovery(app: tauri::AppHandle, name: String) -> Result<Vec<u8>, String> {
    let directory = project_recovery_directory(&app)?;
    read_project_recovery_from(&directory, &name)
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(NativeFileAuthority::default())
        .invoke_handler(tauri::generate_handler![
            open_file,
            open_project_file,
            greet,
            read_file_text,
            read_file_binary,
            read_files_binary,
            save_file_binary,
            save_project_atomic,
            autosave_project,
            discover_project_recovery,
            read_project_recovery
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    struct TestDirectory {
        path: std::path::PathBuf,
    }

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("rustsmf-{label}-{}-{nonce}", std::process::id()));
            std::fs::create_dir(&path).expect("temporary test directory should create");
            Self { path }
        }

        fn path(&self) -> &std::path::Path {
            &self.path
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn native_file_authority_rejects_unselected_paths() {
        let directory = TestDirectory::new("native-authority");
        let path = directory.path().join("fixture.bin");
        std::fs::write(&path, b"authority-test").expect("temporary authority fixture should write");

        let authority = super::NativeFileAuthority::default();
        let path_string = path.to_string_lossy().to_string();
        let rejected = super::authorize_selected_path(&authority, &path_string)
            .expect_err("arbitrary frontend paths must not be readable");
        assert!(rejected.starts_with("NATIVE_PATH_NOT_SELECTED:"));

        let selected = super::register_selected_path(&authority, path.clone())
            .expect("dialog-selected path should be registered");
        let authorized = super::authorize_selected_path(&authority, &selected)
            .expect("registered dialog path should be readable");
        assert_eq!(
            authorized,
            std::fs::canonicalize(&path).expect("fixture should canonicalize")
        );
    }

    #[test]
    fn native_file_reads_enforce_reported_and_observed_byte_limits() {
        let path = std::path::Path::new("bounded-reader-fixture.bin");

        let exact = super::read_bytes_bounded(std::io::Cursor::new(b"1234"), 4, path, 4)
            .expect("a file exactly at the byte limit should be accepted");
        assert_eq!(exact, b"1234");

        let metadata_rejection =
            super::read_bytes_bounded(std::io::Cursor::new(b"12345"), 5, path, 4)
                .expect_err("reported files over the byte limit must be rejected");
        assert!(metadata_rejection.starts_with("MODEL_INPUT_TOO_LARGE:"));

        let growth_rejection =
            super::read_bytes_bounded(std::io::Cursor::new(b"12345"), 2, path, 4)
                .expect_err("reads that grow past reported metadata must remain bounded");
        assert!(growth_rejection.starts_with("MODEL_INPUT_TOO_LARGE:"));
        assert!(growth_rejection.contains("while reading"));
    }

    #[test]
    fn native_file_reads_reject_non_regular_paths() {
        let directory = TestDirectory::new("native-directory");

        let rejected = super::read_file_bytes_with_limit(directory.path(), 4)
            .expect_err("directories must not be treated as model byte streams");
        assert!(
            rejected.starts_with("MODEL_INPUT_NOT_A_FILE:")
                || rejected.starts_with("Failed to open"),
            "non-regular paths must be rejected before reading: {rejected}"
        );
    }

    #[test]
    fn project_rotation_preserves_previous_generations() {
        let directory = TestDirectory::new("project-rotation");
        let target = directory.path().join("project.rsproj");

        super::write_project_rotating(&target, b"generation-one")
            .expect("first generation should write");
        super::write_project_rotating(&target, b"generation-two")
            .expect("second generation should write");
        assert_eq!(
            std::fs::read(&target).expect("target should exist"),
            b"generation-two"
        );
        assert_eq!(
            std::fs::read(super::project_backup_path(&target, 1)).expect("backup one should exist"),
            b"generation-one"
        );
        super::write_project_rotating(&target, b"generation-three")
            .expect("third generation should write");
        assert_eq!(
            std::fs::read(super::project_backup_path(&target, 1))
                .expect("new backup one should exist"),
            b"generation-two"
        );
        assert_eq!(
            std::fs::read(super::project_backup_path(&target, 2)).expect("backup two should exist"),
            b"generation-one"
        );
    }

    #[test]
    fn project_rotation_rejects_empty_payloads_without_creating_files() {
        let directory = TestDirectory::new("project-empty");
        let target = directory.path().join("project.rsproj");
        let error = super::write_project_rotating(&target, &[])
            .expect_err("empty project writes must fail closed");
        assert!(error.starts_with("PROJECT_EMPTY:"));
        assert!(!target.exists());
        assert_eq!(
            std::fs::read_dir(directory.path())
                .expect("temporary project directory should remain readable")
                .count(),
            0
        );
    }

    #[test]
    fn staged_export_replacement_keeps_complete_files_and_cleans_temporary_paths() {
        let directory = TestDirectory::new("staged-export");
        let target = directory.path().join("model.glb");

        super::write_file_replacing(&target, b"first-export")
            .expect("first staged export should install");
        super::write_file_replacing(&target, b"second-export")
            .expect("replacement export should install");

        assert_eq!(
            std::fs::read(&target).expect("replacement export should remain readable"),
            b"second-export"
        );
        let leftover = std::fs::read_dir(directory.path())
            .expect("staged export directory should remain readable")
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .filter(|name| name.starts_with(".rustsmf-"))
            .collect::<Vec<_>>();
        assert!(
            leftover.is_empty(),
            "staged paths must be cleaned: {leftover:?}"
        );
    }

    #[test]
    fn project_rotation_cleans_staged_file_when_backup_rotation_fails() {
        let directory = TestDirectory::new("project-cleanup");
        let target = directory.path().join("project.rsproj");
        std::fs::write(&target, b"current").expect("current project fixture should write");
        std::fs::create_dir(super::project_backup_path(&target, 2))
            .expect("blocking backup directory should create");

        let error = super::write_project_rotating(&target, b"replacement")
            .expect_err("a non-file backup generation must block rotation");
        assert!(error.contains("Failed to rotate project backup"));
        assert_eq!(
            std::fs::read(&target).expect("failed rotation must preserve the current project"),
            b"current"
        );
        let staged = std::fs::read_dir(directory.path())
            .expect("project directory should remain readable")
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .filter(|name| name.starts_with(".rustsmf-project-"))
            .collect::<Vec<_>>();
        assert!(
            staged.is_empty(),
            "failed rotation left staged files: {staged:?}"
        );
    }

    #[test]
    fn recovery_discovery_and_reads_accept_only_owned_generations() {
        let directory = TestDirectory::new("project-recovery");
        let expected = [
            super::PROJECT_RECOVERY_TARGET.to_string(),
            format!("{}.bak1", super::PROJECT_RECOVERY_TARGET),
            format!("{}.bak2", super::PROJECT_RECOVERY_TARGET),
        ];
        for (index, name) in expected.iter().enumerate() {
            std::fs::write(directory.path().join(name), format!("generation-{index}"))
                .expect("owned recovery fixture should write");
        }
        std::fs::write(
            directory
                .path()
                .join(format!("{}.evil", super::PROJECT_RECOVERY_TARGET)),
            b"not-owned",
        )
        .expect("sibling app-data fixture should write");
        std::fs::write(directory.path().join("settings.json"), b"private-app-data")
            .expect("unrelated app-data fixture should write");

        assert_eq!(
            super::discover_project_recovery_in(directory.path())
                .expect("recovery discovery should succeed"),
            expected
        );
        assert_eq!(
            super::read_project_recovery_from(directory.path(), super::PROJECT_RECOVERY_TARGET)
                .expect("owned recovery generation should read"),
            b"generation-0"
        );
        for rejected in [
            "settings.json",
            "rustsmf-autosave.rsproj.evil",
            "rustsmf-autosave.rsproj.bak3",
            "../rustsmf-autosave.rsproj",
        ] {
            let error = super::read_project_recovery_from(directory.path(), rejected)
                .expect_err("unowned app-data names must be rejected before filesystem access");
            assert!(error.starts_with("PROJECT_RECOVERY_INVALID_NAME:"));
        }
    }

    #[test]
    fn recovery_reader_rejects_an_owned_name_that_is_not_a_regular_file() {
        let directory = TestDirectory::new("project-recovery-non-file");
        std::fs::create_dir(directory.path().join(super::PROJECT_RECOVERY_TARGET))
            .expect("non-file recovery fixture should create");

        let error =
            super::read_project_recovery_from(directory.path(), super::PROJECT_RECOVERY_TARGET)
                .expect_err("recovery directories must not be read as project bytes");
        assert!(error.starts_with("PROJECT_RECOVERY_NOT_A_FILE:"));
        assert!(super::discover_project_recovery_in(directory.path())
            .expect("recovery discovery should succeed")
            .is_empty());
    }

    #[test]
    fn native_write_tasks_serialize_concurrent_project_rotations() {
        let directory = TestDirectory::new("serialized-writes");
        let target = directory.path().join("project.rsproj");
        let first_target = target.clone();
        let second_target = target.clone();

        tauri::async_runtime::block_on(async {
            let first = tauri::async_runtime::spawn(async move {
                super::run_native_write("test project write", move || {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    super::write_project_rotating(&first_target, b"first")
                })
                .await
            });
            let second = tauri::async_runtime::spawn(async move {
                super::run_native_write("test project write", move || {
                    super::write_project_rotating(&second_target, b"second")
                })
                .await
            });
            first
                .await
                .expect("first native write task should join")
                .expect("first native write should succeed");
            second
                .await
                .expect("second native write task should join")
                .expect("second native write should succeed");
        });

        let current = std::fs::read(&target).expect("serialized target should exist");
        let previous = std::fs::read(super::project_backup_path(&target, 1))
            .expect("serialized previous generation should exist");
        assert!(
            (current == b"first" && previous == b"second")
                || (current == b"second" && previous == b"first"),
            "serialized writes must preserve two complete generations"
        );
    }
}
