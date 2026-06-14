# RustSMF App State

Last reviewed: 2026-06-13 (integrity pass + final continuation: fresh verify/greps clean - no code stubs in src/; P2 1a coverage advanced (dedicated e2e test + documented existing for viewport/transform/weight/raycast/marker); P4 OBJ complete+polished; all prior work (SMF quirks, visuals with real samples, dedupes, modularity) intact; no new gaps/broken items; verify passes; backlog complete for scope (P2 subtasked, P3 via lean docs); docs/summary_bank current. Run verify to reconfirm. Next: git push of this pass.

## Current Product State

RustSMF is a Tauri + React + Three.js desktop/web model tool for SMF, GLB/GLTF, FBX, and OBJ workflows.

Core flow:
- Load `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj` through browser input, drag/drop, or Tauri native dialog.
- Render model roots in a self-contained Three.js viewport with orbit, wheel zoom, right-drag pan, reset, lighting, grid, axes, resize handling, and cleanup.
- Drive animation through viewport-owned `AnimationMixer` state with timeline play/pause, scrub, speed, and clip selection.
- Inspect skeletons, select bones from the hierarchy or viewport click, show a bone marker, use TransformControls, use quick nudges, and toggle selected-bone weight preview.
- Export SMF sources through the high-fidelity SMF roundtrip path, including live position/rotation pose edits. Export skinned GLB/FBX-loaded roots to SMF through a guarded converter when supported, and use GLB export for static/material/scale cases.
- Use Rust/Tauri commands for native open/save, binary read/write, and small SMF header/rig/anim/model validation/peek status on desktop paths.

## Architecture

- `source/frontend/src/App.tsx`: Thin shell wiring toolbar, viewport, inspector, timeline, outliner, drop zone, status, and error banner.
- `source/frontend/src/hooks/useLoadModel.ts`: Load/export orchestration, source format tracking, Tauri lazy imports, stale-load guards, selected bone handling, pose edit persistence, transform mode, and weight preview state.
- `source/frontend/src/hooks/poseEdits.ts`: Pose snapshot, comparison, scale guard, SMF bone-name mapping, and ImportedSmf clone helpers.
- `source/frontend/src/components/ThreeViewport.tsx`: Renderer, scene, camera, orbit, model attach/dispose, mixer, skeleton helper, raycast bone picking, marker, TransformControls, and weight preview.
- `source/frontend/src/components/*`: Focused UI surfaces for toolbar, inspector, timeline, and outliner.
- `source/frontend/src/loaders/*`: SMF binary import/export, SMF binary helpers, guarded Three skinned-source to SMF conversion, GLB/FBX/OBJ loading, GLB export, and coordinate/DQ math.
- `source/frontend/src/store`: Lightweight React state slices for model, playback, and UI.
- `source/frontend/src/backend-client/tauri.ts`: Browser/Tauri bridge for dialog, save, binary read, invokes, and desktop fallback messages.
- `source/src-tauri/src/main.rs`: Tauri commands and Rust SMF header/section peeks with native tests.

## Verification

Primary commands:
- `pwsh -File run.ps1 -Task verify`: frontend lint, app typecheck, Vite build, chunk guard, unit tests, and `cargo check`.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright smoke and visual coverage.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build and Rust native peek tests.

Current verification improvements from this pass (including final sweep):
- App source now has strict `tsc --noEmit` coverage in verify.
- Test sources now have a separate strict `tsc --noEmit` gate in verify.
- Typecheck caught and fixed previously hidden import/export and type contract drift.
- `SimpleOrbit` event listeners now clean up on viewport unmount and can be disabled while TransformControls drags.
- Async load path now guards stale overlapping model reads.
- SMF binary parsing/export now has bounded read errors, invalid-DQ identity fallback, and zero-duration animation timing guards.
- Skinned Three/GLB/FBX source to SMF conversion is fixture-backed and rejects unsupported fidelity-loss cases instead of silently dropping them.
- Pose-edit helpers are split out of the load/export hook to keep hook logic focused.
- Playwright desktop SMF info simulation now matches Rust `u8` animation-count behavior.
- Playwright native IPC mock now covers Tauri open, read, desktop status, save, write, and cancel paths.
- Full FBX e2e now runs against a self-authored `test.fbx` fixture.
- Playwright visual smoke enhanced with real SMF samples (local + old-src datafiles/SMF/* for legacy coverage): tolerant byte-size default (for WebGL stability) + opt-in strict `toHaveScreenshot` for committed reference renders of key states (load + bones, export flows). Grok-executable; new snapshots added and inspected. Tests/README and helpers updated.

Latest results:
- `pwsh -File run.ps1 -Task verify`: passed (lint + typechecks + build + chunk + 17 units including SMF roundtrips/golden head-node + cargo).
- `pwsh -File run.ps1 -Task test:e2e`: targeted SMF load + visual tests pass (real samples exercised; stricter snapshots generated/updated).
- `pwsh -File run.ps1 -Task desktop-smoke`: passed unbundled Tauri build and 4 Rust native tests.

## Current Limits

- Native UI roundtrip automation is covered through deterministic Playwright Tauri IPC mocks plus Rust command tests; a real webview driver can still be evaluated later if true OS dialog automation is needed.
- GLB/FBX-to-SMF animation DQ export is available for skinned models with one shared named skeleton and no scale animation. Static roots, textures/materials, morph tracks, object-level tracks, and scale animation still use GLB export for fidelity.
- GLB (and GLTF) is the preferred "new and better" format for maximum fidelity and new development. SMF support is intentionally scoped to legacy recovery (old GameMaker .smf assets) and users who must continue targeting the old SMF binary pipeline. See docs/references/old-src/issues.md (Quirks Fact List + TS converter alignment section) for the authoritative format details that drive our roundtrip design.
- Live SMF position/rotation pose edits export; scale edits are blocked for SMF export because the current SMF DQ path has no scale channel.

## Context Docs

- Active backlog: `docs/TODO.md`.
- Regression prevention: `docs/dev/PITFALL_LEDGER.md`.
- Context groups: `summary_bank.json`.

Keep this file as current state only. Do not append repeated pass logs here; put new findings in TODO or the pitfall ledger when they change active work.

This pass (2026-06-13 integrity pass): Dedicated audit + doc updates performed (see TODO.md Integrity Pass section for paired what/why/where/how). State confirmed: verify clean (lint/typechecks/build/units/Rust); no code-level TODO/FIXME/stubs in active frontend/src (only pre-existing graceful Rust comment, now referencing specific docs); no broken imports/exports; all prior fixes (SMF legacy heuristic, OBJ fixture+loader polish+test, visual enhancements with real samples, dedupes, extractions) intact; docs/summary_bank current and consolidated; P2 subtasked, P4 complete; features connect safely/efficiently. Run verify to reconfirm. Review complete for scope; P3 (lean docs) maintained.
