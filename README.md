# RustSMF

Tauri + React + Three.js desktop/web tool for SMF (and GLB/GLTF/FBX/OBJ) model load, preview, pose edit, and export.

Core: high-fidelity SMF roundtrip (import/export with coord/DQ), guarded skinned non-SMF to SMF (one named skeleton, pos/rot tracks only; scale/materials/morphs/static use GLB), live bone pos/rot edits that export for SMF sources, native desktop dialogs + Rust SMF header/rig/anim/model peeks, viewport with orbit/TransformControls/weight viz/raycast select/animation scrub.

## State and work
- Current app state: docs/dev/APP_STATE.md
- Active backlog + completed (paired what/why/where/how + done criteria): docs/TODO.md
- Regression prevention and verification gaps: docs/dev/PITFALL_LEDGER.md
- Context groups for files/folders/features/issues: summary_bank.json (narrow paths, intent-based; validate with python -m json.tool after edits)

## Quick commands (from repo root)
pwsh -File run.ps1 -Task verify        # lint + app typecheck + test typecheck + build + chunk guard + unit + cargo check
pwsh -File run.ps1 -Task test:e2e      # Playwright (smoke + native IPC mocks)
pwsh -File run.ps1 -Task desktop-smoke # unbundled tauri build + Rust native peek tests (4 tests in main.rs)

See run.ps1 help, source/frontend/package.json, source/package.json (workspace), source/src-tauri for details.

## Architecture highlights (modular)
- App.tsx thin shell
- useLoadModel.ts: load/export/stale guards/pose persistence/handlers (composes store slices)
- poseEdits.ts: snapshot/clone/guard/apply helpers (extracted)
- ThreeViewport.tsx: self-contained three (renderer/orbit/mixer/attach/dispose/raycast/Transform/weight/RAF decoupled via refs)
- loaders/: SMF binary (smf.ts + smfBinary.ts with bounded reads/DQ guards/zero-dur), threeToSmf (guarded converter), glb/fbx/obj, coord (swizzles + DQ math, the single source of truth)
- backend-client/tauri.ts: bridge (native dialog/read/write + browser fallbacks); save returns bool for cancel distinction
- store/: lightweight slice hooks (no extra deps)
- src-tauri/src/main.rs: Tauri commands + shared parse_smf_header_info + native tests exercising same logic as TS/Rust peeks
- Tests: unit (DQ/roundtrip/guard edges in loaders/*.test.ts), e2e smoke (real fixtures + UI), native.spec (deterministic IPC mocks for open/read/save/cancel + desktop status sims aligned to u8 anim count)

## Known limits (intentional)
- SMF export from edited pose or converted skinned: pos/rot only (no scale channel in DQ path). Scale edits block SMF export with status.
- Non-SMF SMF export only for single shared named skeleton skinned, pos/quat bone tracks (no scale anim, no static, no multi-skel). Else GLB.
- FBX export uses GLB container (no official FBXExporter without new deps).
- OBJ: load/preview parity only (static focus); export via GLB.
- Native automation: deterministic Playwright Tauri IPC mocks + Rust cmd tests (real OS dialogs optional later via tauri-driver if needed).
- Desktop peeks: small header/rig/anim/model validation for .smf status (real FS in Rust; complements full TS loader).

Philosophy (AGENTS.md): Safety, courtesy, show, efficiency. Dynamic/modular over hard-coding. Direct minimal comments. Correctness/readability first. TS React front, Rust backend.

All features connect through guarded loaders + seq-guarded async load (loadSeq/fileReadSeq + isCurrentLoad checks) + ref-decoupled timing (playback, orbit enable on drag, RAF reports) + clear error/status UX + fidelity gates that fail explicitly rather than drop data.

Run verify after changes. Update state docs + summary_bank only on scope/status shifts (keep lean). Full integrity review 2026-06-14 confirmed clean connections, no issues in active code.