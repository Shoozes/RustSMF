# RustSMF retarget core

Independent MIT Rust library, version 0.1.0, API v1. Performs pure skeleton mapping and preflight diagnostics without file access, mutation of a live scene, rig creation or clip baking.

`analyze_v1` accepts bounded source/target snapshots, explicit overrides, convention selections and clip metadata, with a cooperative cancellation callback. It returns a resolved map, ambiguity/errors and normalized proportions. `analyze_json_v1` exposes the same API for WASM. Serde field names are camelCase.

Mixamo, UE4 mannequin, Unity humanoid and Rigify deform naming include side/chain context and fingers. Helpers are distinguished from deform bones, explicit maps win and opaque rigs require reviewed mappings. Equal bone counts do not imply compatible rigs.

The app integrates native Tauri analysis and browser WASM workers. Build with the repository's `retarget:wasm` command; setup installs matching local wasm-bindgen tooling. See [the integration contract](../../docs/dev/RETARGET_ASSISTANCE.md) and run `run.ps1 -Task retarget:runtime-proof` for native/actual-Chromium parity.

The crate's `LICENSE` covers project-owned code. Carry the exact dependency notices from the repository's `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES.txt` with distributions containing their code or generated WASM glue. Dependency and generator versions are pinned together.

---
AI-created: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs
AI-edited: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=recorded retarget and asset workflow ownership
