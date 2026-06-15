# RustSMF App State

Last reviewed: 2026-06-14 (integrity pass aligned docs with source, restored missing test-source typecheck, added native IPC e2e coverage, tightened harness exits, and kept modular boundaries stable).

## Current Product State

RustSMF is a Tauri + React + Three.js desktop/web model tool for SMF, GLB/GLTF, FBX, and OBJ workflows.

Core flow:
- Load `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj` through browser input, drag/drop, or Tauri native dialog.
- Render model roots in a self-contained Three.js viewport with orbit, wheel zoom, right-drag pan, reset, lighting, grid, axes, resize handling, and cleanup.
- Drive animation through viewport-owned `AnimationMixer` state with timeline play/pause, scrub, speed, and clip selection.
- Inspect skeletons, select bones from the hierarchy or viewport click, show a bone marker, use TransformControls, use quick nudges, and toggle selected-bone weight preview.
- Export SMF sources through the high-fidelity SMF roundtrip path, including live position/rotation pose edits.
- Export compatible skinned GLB/FBX runtime roots to SMF through `threeToSmf`; use GLB export for static/material/scale cases.
- Use Rust/Tauri commands for native open/save, binary read/write, and small SMF header/rig/anim/model validation/status peeks.
- Viewport bone selection now ignores short drag/hold paths on the canvas, browser file-picker cancellation resolves, and GLB loader empty-skeleton skinned meshes have fallback binding when recoverable.

## Architecture

- `source/frontend/src/App.tsx`: thin shell wiring toolbar, viewport, inspector, timeline, outliner, drop zone, status, and error banner.
- `source/frontend/src/hooks/useLoadModel.ts`: load/export orchestration, source format tracking, Tauri lazy imports, stale-load guards, selected bone handling, pose edit persistence, transform mode, and weight preview state.
- `source/frontend/src/hooks/poseEdits.ts`: nudge delta types and helpers for live SMF position/rotation edits.
- `source/frontend/src/components/ThreeViewport.tsx`: renderer, scene, camera, orbit, model attach/dispose, mixer, skeleton helper, raycast bone picking, marker, TransformControls, and weight preview.
- `source/frontend/src/loaders/*`: SMF import/export, bounded binary helpers, rig node-list helper, guarded Three-to-SMF conversion, GLB/FBX/OBJ loading/export, coordinate swizzles, and DQ math.
- `source/frontend/src/backend-client/tauri.ts`: browser/Tauri bridge for dialog, save, binary read, invokes, and desktop fallback messages. `saveFile` returns `boolean` so cancel is explicit.
- `source/frontend/src/store`: lightweight React state slices for model, playback, and UI.
- `source/src-tauri/src/main.rs`: Tauri commands and Rust SMF header/section peeks with native tests.

## Verification

Primary commands:
- `pwsh -File run.ps1 -Task verify`: frontend lint, app typecheck, test-source typecheck, Vite build, chunk guard, unit tests, and `cargo check`.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright smoke, visual confirmation, and native IPC mock coverage.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native peek tests, and focused Playwright native IPC mock suite.

Current verification coverage:
- App source has strict `tsc --noEmit` coverage.
- Test sources have a separate strict `tsc --noEmit` gate with Node/Playwright types.
- Unit tests cover SMF coordinate/DQ math, binary bounds, roundtrips, rig node semantics, converter rejection paths, and pose-capture roundtrip.
- Playwright smoke tests cover boot, real SMF load, viewport/bone/timeline flows, export UX, invalid-load UX, OBJ static parity, and FBX UI dispatch.
- Playwright visual tests cover desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, and loaded SMF visual state. Strict screenshot snapshots are opt-in with `RUSTSMF_STRICT_VISUALS=1`; default e2e uses tolerant rendered-byte checks for WebGL stability.
- Playwright native IPC tests cover mocked Tauri open/read/status, save/write, save cancel, and open cancel.
- Rust tests cover native SMF parser width/offset behavior and desktop peek commands.

Latest known results from this pass:
- `pwsh -File run.ps1 -Task verify`: passed with lint, app typecheck, test-source typecheck, Vite build, chunk guard, 20 unit tests, and cargo check.
- `pwsh -File run.ps1 -Task test:e2e`: passed with 14 tests passed and 1 skipped FBX fixture test.
- `pwsh -File run.ps1 -Task desktop-smoke`: passed with unbundled Tauri build, 4 Rust native tests, and 2 Playwright native IPC tests.

## Current Limits

- Native UI roundtrip automation is covered through deterministic Playwright Tauri IPC mocks plus Rust command tests; true OS dialog automation remains a backlog decision.
- Full fixture-backed FBX/skinned real-file coverage is still open because no default FBX fixture is present.
- GLB/FBX-to-SMF conversion is available for skinned models with one shared named skeleton and no scale animation. Static roots, textures/materials, morph tracks, object-level tracks, and scale animation still use GLB export for fidelity.
- GLB/GLTF remains the preferred format for maximum fidelity and new development. SMF support is scoped to legacy recovery and users who target the old SMF binary pipeline.
- Live SMF position/rotation pose edits export; scale edits are blocked for SMF export because the current SMF DQ path has no scale channel.

## Context Docs

- Active backlog: `docs/TODO.md`.
- Regression prevention: `docs/dev/PITFALL_LEDGER.md`.
- Test coverage map: `source/frontend/tests/README.md`.
- Context groups: `summary_bank.json`.

Keep this file as current state only. Put completed work and new findings in TODO or the pitfall ledger when they change active work.
