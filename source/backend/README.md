# source/backend

Reserved boundary for future native or service-side logic.

Current app state:
- Frontend owns 3D loading, viewport, editing preview, and export orchestration in TypeScript/Three.js.
- `source/src-tauri` owns desktop dialogs, authorized bounded binary reads, staged serialized writes, and project recovery. The TypeScript worker owns SMF structure and validation.
- No active backend service is required for current browser or Tauri flows.

Move logic here only when a concrete performance, offline-processing, or shared-service requirement justifies a service. Extend the existing Rust native I/O owner or TypeScript codec owner for their current responsibilities instead of creating a duplicate backend.
