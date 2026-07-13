# RustSMF

Tauri + React + Three.js desktop/web tool for SMF (and GLB/GLTF/FBX/OBJ) model load, preview, pose edit, and export.

Core: high-fidelity SMF roundtrip (import/export with coord/DQ), guarded skinned non-SMF to SMF (one named skeleton, pos/rot tracks only; scale/materials/morphs/static use GLB), live bone pos/rot edits that export for SMF sources, native desktop dialogs + Rust SMF header/rig/anim/model peeks, viewport with orbit/TransformControls/weight viz/raycast select/animation scrub.

## State and work
- Current app state: docs/dev/APP_STATE.md
- Active backlog (paired what/why/where/when/how, subtasks, and done criteria): docs/dev/TODO.md
- Regression prevention and verification gaps: docs/dev/PITFALL_LEDGER.md
- Context groups for files/folders/features/issues: summary_bank.json (narrow paths, intent-based; validate with `python scripts/verify-context-bank.py` after edits)

## Quick commands (from repo root)
.\run.bat                              # open numbered launcher menu
.\run.bat 2                            # run desktop app if already installed
pwsh -File run.ps1 -Task run           # run desktop app if already installed
pwsh -File run.ps1 -Task verify        # lint + app typecheck + test typecheck + build + chunk guard + unit + cargo check
pwsh -File run.ps1 -Task test:e2e      # Playwright via optional GenEye advisory wrapper, or browser-only if unavailable
pwsh -File run.ps1 -Task test:visual-strict # opt-in strict SMF screenshot baselines
pwsh -File run.ps1 -Task desktop-smoke # unbundled tauri build + Rust native parser/peek tests

`test:e2e` keeps RustSMF independent. When GenEye is discoverable through `-GenEyeRoot`, `GENEYE_ROOT`, `GENEYE_RUN_BAT`, or the local Three-Sisters path, it wraps the RustSMF Playwright command with GenEye `playwright-full -AllowGenEyeFailure` and writes ignored evidence under `runtime-data\geneye-playwright-runs\`. RustSMF's Playwright config owns the app server/navigation, so GenEye's built-in scenario is only a plumbing check; the RustSMF app evidence is the GenEye `project_tests` result plus discovered RustSMF Playwright artifacts. Use `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` for a browser-only run. If GenEye is missing or fails before project-test evidence exists, RustSMF runs browser-only Playwright. If RustSMF tests fail, their exit code stays authoritative.

## Launcher contract matrix (current)

- Windows desktop flow (preferred): `run.bat` / `run.ps1 -Task run` / `run.ps1` menu option `2` -> full process safety (JobObject child tree tie, stale entry sweep, terminal close cleanup).
- Direct Vite/Tauri launches (`npm run dev`, `npm run tauri:dev`, or equivalent) -> faster ad-hoc access, but fewer lifecycle protections than launcher.
- Use launcher defaults for normal onboarding, verification, and close/relaunch confidence.

See run.ps1 help, source/frontend/package.json, source/package.json (workspace), source/src-tauri for details.

## Architecture highlights (modular)
- App.tsx thin shell
- useLoadModel.ts: load/export/stale guards/pose persistence/viewport edit handlers/pose + rig + animation-key undo-redo (composes store slices)
- poseEdits.ts: snapshot/clone/guard/apply helpers plus dirty/scale flags for viewport pose edits (extracted)
- editorHistory.ts: shared undo/redo stack helper currently wired for pose, rig edits, selected-bone animation key edits, and Outliner visibility transactions; toolbar/keyboard history also reaches Skin edit snapshots
- ThreeViewport.tsx: self-contained three (renderer/orbit/mixer/attach/dispose/raycast/Transform/edit-event/weight/RAF decoupled via refs)
- loaders/: SMF binary (smf.ts + smfBinary.ts with bounded reads/DQ guards/zero-dur), threeToSmf (guarded converter), glb/fbx/obj, coord (swizzles + DQ math, the single source of truth)
- backend-client/tauri.ts: bridge (native dialog/read/write + browser fallbacks); save returns bool for cancel distinction
- store/: lightweight slice hooks (no extra deps)
- src-tauri/src/main.rs + src-tauri/src/smf_core.rs: Tauri commands, shared SMF header/section parsing, and native tests exercising the same logic as TS/Rust peeks
- Tests: unit (DQ/roundtrip/guard edges in loaders/*.test.ts), e2e smoke (real fixtures + static FBX + generated skinned GLB + UI), opt-in strict SMF visual snapshots, native.spec (deterministic IPC mocks for open/read/save/cancel + desktop status sims aligned to u8 anim count)

## Known limits (intentional)
- SMF export from edited pose or converted skinned: pos/rot only (no scale channel in DQ path). Scale edits block SMF export with status.
- Non-SMF SMF export only for single shared named skeleton skinned, pos/quat bone tracks (no scale anim, no static, no multi-skel). Else GLB.
- FBX-source export writes binary FBX 7500 through the vendored MIT FBXExporter-threejs writer.
- FBX load/export dispatch uses a self-authored static ASCII fixture plus a generated static export roundtrip; skinned non-SMF export fidelity is covered by the generated skinned GLB fixture.
- OBJ: load/preview parity only (static focus); export via GLB.
- Native automation: deterministic Playwright Tauri IPC mocks + Rust cmd tests (real OS dialogs optional later via tauri-driver if needed).
- Desktop peeks: small header/rig/anim/model validation for .smf status (real FS in Rust; complements full TS loader).
- Editor modernization: quad layout, pane labels/dividers, grouped Display controls, model-safe wireframe display, viewport selection overlays, endpoint handles, viewport model picking, Outliner multi-select/bulk visibility with undo/redo, viewport transform export tracking, pose undo/redo for nudges/gizmo/endpoint edits, constrained Rig IK posing with whole-chain cancel/undo, non-SMF structural rig edit undo/redo, selected-bone animation key undo/redo, SMF scale-edit blocking, skin paint/Auto Paint/Normalize/Auto Skin toolbar undo/redo, Auto Skin algorithm/options, cached skin brush candidate indexing, and basic ortho/perspective panes are current preview/editor affordances. Remaining old-editor parity work is broader viewport click/raycast edge coverage, remaining global shelf actions, clip-level animation polish, and deeper ortho-pane editing controls.

Philosophy (AGENTS.md): Safety, courtesy, show, efficiency. Dynamic/modular over hard-coding. Direct minimal comments. Correctness/readability first. TS React front, Rust backend.

All features connect through guarded loaders + seq-guarded async load (loadSeq/fileReadSeq + isCurrentLoad checks) + ref-decoupled timing (playback, orbit enable on drag, RAF reports) + clear error/status UX + fidelity gates that fail explicitly rather than drop data.

Run verify after changes. Update state docs + summary_bank only on scope/status shifts (keep lean). Work locally on `main`; Codex work is reviewed in-place here, temp branches are scratch only, and PRs are not part of the default flow. Push only when explicitly requested, and push/sync `main` unless another branch is explicitly named. Current behavior lives in `docs/dev/APP_STATE.md`, forward work in `docs/dev/TODO.md`, latest review direction in `docs/dev/review.md`, and recurring hazards in `docs/dev/PITFALL_LEDGER.md`.
