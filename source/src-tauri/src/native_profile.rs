use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

#[derive(Default)]
pub struct NativeProfile {
    root: Option<PathBuf>,
    recovery: Option<PathBuf>,
    _lock: Option<File>,
}

pub fn profile_argument(
    args: impl IntoIterator<Item = OsString>,
) -> Result<Option<PathBuf>, String> {
    let mut args = args.into_iter();
    let mut selected = None;
    while let Some(arg) = args.next() {
        if arg == "--profile-dir" {
            if selected.is_some() {
                return Err("--profile-dir must occur only once".into());
            }
            let value = args
                .next()
                .ok_or("--profile-dir requires an absolute directory")?;
            let path = PathBuf::from(value);
            if !path.is_absolute() {
                return Err("--profile-dir requires an absolute directory".into());
            }
            selected = Some(path);
        } else if arg.to_string_lossy().starts_with("--profile-dir=") {
            return Err("Use --profile-dir followed by a separate absolute directory".into());
        }
    }
    Ok(selected)
}

fn display(path: &Path) -> String {
    crate::sanitize_path(path.to_path_buf())
}

fn redirected(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn regular(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !redirected(&metadata) => Ok(true),
        Ok(_) => Err("Profile metadata must be a regular file".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

fn schema(path: &Path, expected: &str) -> Result<(), String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 256 * 1024 {
        return Err("Profile metadata exceeds its bound".into());
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Invalid profile metadata: {e}"))?;
    if value.get("schema").and_then(|v| v.as_str()) != Some(expected) {
        return Err("Unknown profile metadata schema".into());
    }
    Ok(())
}

fn child(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut actual = root.to_path_buf();
    for component in relative.split('/') {
        actual.push(component);
        match fs::symlink_metadata(&actual) {
            Ok(metadata) if metadata.is_dir() && !redirected(&metadata) => (),
            Ok(_) => return Err("Profile directory is linked or not a directory".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&actual).map_err(|e| e.to_string())?
            }
            Err(e) => return Err(e.to_string()),
        }
        actual = fs::canonicalize(&actual).map_err(|e| e.to_string())?;
        if !actual.starts_with(root) {
            return Err("Profile subdirectory escapes the selected root".into());
        }
    }
    Ok(actual)
}

impl NativeProfile {
    pub fn open(selected: Option<PathBuf>) -> Result<Self, String> {
        let Some(path) = selected else {
            return Ok(Self::default());
        };
        if !cfg!(windows) {
            return Err("--profile-dir is currently supported on Windows only".into());
        }
        if !path.is_absolute() {
            return Err("Profile directory must be absolute".into());
        }
        fs::create_dir_all(&path).map_err(|e| format!("Could not create profile: {e}"))?;
        let root =
            fs::canonicalize(&path).map_err(|e| format!("Could not resolve profile: {e}"))?;
        let marker = root.join("rustsmf-profile.json");
        if regular(&marker)? {
            schema(&marker, "rustsmf.profile.v1")?;
        } else {
            if fs::read_dir(&root)
                .map_err(|e| e.to_string())?
                .next()
                .is_some()
            {
                return Err(
                    "Existing profile directory is not empty and has no RustSMF marker".into(),
                );
            }
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&marker)
                .map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut file, b"{\"schema\":\"rustsmf.profile.v1\"}\n")
                .map_err(|e| e.to_string())?;
        }
        let lock_path = root.join("rustsmf-profile.lock");
        regular(&lock_path)?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock_path)
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|e| format!("Profile is already active or cannot be locked: {e}"))?;
        let recovery = child(&root, "native/rustsmf-recovery")?;
        child(&root, "webview")?;
        Ok(Self {
            root: Some(root),
            recovery: Some(recovery),
            _lock: Some(lock),
        })
    }

    pub fn recovery_directory(&self) -> Option<PathBuf> {
        self.recovery.clone()
    }

    pub fn configure_webview(&self) {
        if let Some(root) = &self.root {
            // Called before Tauri/WebView startup, while main owns initialization.
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", root.join("webview"));
        }
    }

    pub fn attest(&self) -> Result<(), String> {
        if let Some(root) = &self.root {
            let session_path = root.join("rustsmf-profile-session.json");
            if regular(&session_path)? {
                schema(&session_path, "rustsmf.profile-session.v1")?;
            }
            let session = serde_json::json!({
                "schema": "rustsmf.profile-session.v1",
                "pid": std::process::id(),
                "root": display(root),
                "nativeRecovery": display(self.recovery.as_ref().ok_or("Missing profile recovery path")?),
                "webview": display(&root.join("webview"))
            });
            fs::write(
                session_path,
                serde_json::to_vec_pretty(&session).map_err(|e| e.to_string())?,
            )
            .map_err(|e| format!("Could not record profile session: {e}"))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_preserves_defaults_and_refuses_malformed_flags() {
        assert!(profile_argument([OsString::from("model.glb")])
            .unwrap()
            .is_none());
        for args in [
            vec!["--profile-dir"],
            vec!["--profile-dir", "relative"],
            vec!["--profile-dir="],
        ] {
            assert!(profile_argument(args.into_iter().map(OsString::from)).is_err());
        }
        let path = std::env::temp_dir().join("rustsmf-profile-argument");
        assert_eq!(
            profile_argument([
                OsString::from("--profile-dir"),
                path.clone().into_os_string()
            ])
            .unwrap(),
            Some(path.clone())
        );
        assert!(profile_argument([
            OsString::from("--profile-dir"),
            path.clone().into_os_string(),
            OsString::from("--profile-dir"),
            path.into_os_string()
        ])
        .is_err());
        assert!(NativeProfile::open(None)
            .unwrap()
            .recovery_directory()
            .is_none());
    }
    #[test]
    #[cfg(windows)]
    fn private_profile_lock_reopen_and_attestation_keep_state_inside_root() {
        let parent = crate::tests::TestDirectory::new("native-profile");
        let root = parent.path().join("profile with spaces");
        let profile = NativeProfile::open(Some(root.clone())).unwrap();
        assert!(profile
            .recovery_directory()
            .unwrap()
            .starts_with(fs::canonicalize(&root).unwrap()));
        assert!(NativeProfile::open(Some(root.clone())).is_err());
        profile.attest().unwrap();
        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(root.join("rustsmf-profile-session.json")).unwrap())
                .unwrap();
        assert_eq!(value["pid"], std::process::id());
        drop(profile);
        assert!(NativeProfile::open(Some(root)).is_ok());
    }
    #[test]
    #[cfg(windows)]
    fn unowned_or_malformed_existing_profile_is_preserved() {
        let root = crate::tests::TestDirectory::new("profile-refusal");
        fs::write(root.path().join("caller-data"), b"preserve").unwrap();
        assert!(NativeProfile::open(Some(root.path().to_path_buf())).is_err());
        assert_eq!(
            fs::read(root.path().join("caller-data")).unwrap(),
            b"preserve"
        );
        fs::write(root.path().join("rustsmf-profile.json"), b"{}").unwrap();
        assert!(NativeProfile::open(Some(root.path().to_path_buf())).is_err());
    }

    #[test]
    #[cfg(windows)]
    fn foreign_session_and_non_directory_child_are_never_overwritten() {
        let root = crate::tests::TestDirectory::new("profile-metadata");
        let profile = NativeProfile::open(Some(root.path().join("private"))).unwrap();
        let session = root.path().join("private/rustsmf-profile-session.json");
        fs::write(&session, b"caller metadata").unwrap();
        assert!(profile.attest().is_err());
        assert_eq!(fs::read(session).unwrap(), b"caller metadata");
        let other = root.path().join("other");
        fs::create_dir(&other).unwrap();
        fs::write(
            other.join("rustsmf-profile.json"),
            b"{\"schema\":\"rustsmf.profile.v1\"}",
        )
        .unwrap();
        fs::write(other.join("native"), b"caller file").unwrap();
        assert!(NativeProfile::open(Some(other.clone())).is_err());
        assert_eq!(fs::read(other.join("native")).unwrap(), b"caller file");
    }

    #[test]
    #[cfg(windows)]
    fn junction_child_refuses_before_creating_any_recovery_outside_profile() {
        let parent = crate::tests::TestDirectory::new("profile-junction");
        let root = parent.path().join("private");
        let outside = parent.path().join("outside");
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(
            root.join("rustsmf-profile.json"),
            b"{\"schema\":\"rustsmf.profile.v1\"}",
        )
        .unwrap();
        // Reuse the existing guard suite's junction fixture mechanism, avoiding
        // cmd path parsing. Node is already a declared source-test prerequisite.
        let result = std::process::Command::new("node")
            .args([
                "-e",
                "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')",
            ])
            .arg(&outside)
            .arg(root.join("native"))
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "fixture junction could not be created: {} {}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(NativeProfile::open(Some(root)).is_err());
        assert!(!outside.join("rustsmf-recovery").exists());
    }
}
