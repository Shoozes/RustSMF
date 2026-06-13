# source/backend

Reserved boundary for future native or service-side logic.

Current app state:
- Frontend owns 3D loading, viewport, editing preview, and export orchestration in TypeScript/Three.js.
- `source/src-tauri` owns desktop dialog, binary read/write, and small Rust SMF peek/validation commands.
- No active backend service is required for current browser or Tauri flows.

Move logic here only when there is a concrete performance, offline-processing, or shared-service reason. Prefer small Rust commands in `source/src-tauri/src/main.rs` for desktop-native SMF work until that boundary becomes too large.
