# RustSMF App State

Last reviewed: 2026-06-13

## Current Product State

RustSMF is a Tauri + React + Three.js desktop/web model tool for SMF, GLB/GLTF, FBX, and OBJ workflows.

Core flow:
- Load `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj` through browser input, drag/drop, or Tauri native dialog.
- Render model roots in a self-contained Three.js viewport with orbit, wheel zoom, right-drag pan, reset, lighting, grid, axes, resize handling, and cleanup.
- Drive animation through viewport-owned `AnimationMixer` state with timeline play/pause, scrub, speed, and clip selection.
- Inspect skeletons, select bones from the hierarchy or viewport click, show a bone marker, use TransformControls, use quick nudges, and toggle selected-bone weight preview.
- Export SMF sources through the high-fidelity SMF roundtrip path. Export FBX/GLB/OBJ-loaded roots through GLB where appropriate.
- Use Rust/Tauri commands for native open/save, binary read/write, and small SMF header/rig/anim/model validation/peek status on desktop paths.

## Architecture

- `source/frontend/src/App.tsx`: Thin shell wiring toolbar, viewport, inspector, timeline, outliner, drop zone, status, and error banner.
- `source/frontend/src/hooks/useLoadModel.ts`: Load/export orchestration, source format tracking, Tauri lazy imports, stale-load guards, selected bone handling, transform mode, and weight preview state.
- `source/frontend/src/components/ThreeViewport.tsx`: Renderer, scene, camera, orbit, model attach/dispose, mixer, skeleton helper, raycast bone picking, marker, TransformControls, and weight preview.
- `source/frontend/src/components/*`: Focused UI surfaces for toolbar, inspector, timeline, and outliner.
- `source/frontend/src/loaders/*`: SMF binary import/export, GLB/FBX/OBJ loading, GLB export, and coordinate/DQ math.
- `source/frontend/src/store`: Lightweight React state slices for model, playback, and UI.
- `source/frontend/src/backend-client/tauri.ts`: Browser/Tauri bridge for dialog, save, binary read, invokes, and desktop fallback messages.
- `source/src-tauri/src/main.rs`: Tauri commands and Rust SMF header/section peeks with native tests.

## Verification

Primary commands:
- `pwsh -File run.ps1 -Task verify`: frontend lint, app typecheck, Vite build, chunk guard, unit tests, and `cargo check`.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright smoke and visual coverage.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build and Rust native peek tests.

Current verification improvements from this pass:
- App source now has strict `tsc --noEmit` coverage in verify.
- Typecheck caught and fixed previously hidden import/export and type contract drift.
- `SimpleOrbit` event listeners now clean up on viewport unmount and can be disabled while TransformControls drags.
- Async load path now guards stale overlapping model reads.
- Playwright desktop SMF info simulation now matches Rust `u8` animation-count behavior.

Latest results:
- `pwsh -File run.ps1 -Task verify`: passed.
- `pwsh -File run.ps1 -Task test:e2e`: 10 passed, 1 expected skip for missing FBX fixture.
- `pwsh -File run.ps1 -Task desktop-smoke`: passed unbundled Tauri build and 4 Rust native tests.

## Current Limits

- Full native UI roundtrip automation still needs a Tauri webview driver or equivalent harness. Native Rust peeks and browser e2e cover most shared behavior.
- Full FBX load/export e2e is ready but skipped until a real `.fbx` fixture is added.
- GLB/FBX-to-SMF exact animation DQ export is not complete; non-SMF sources use GLB export for fidelity.
- Live transform edits are preview-only until a pose/keyframe persistence layer is designed and tested.
- Test source static typing is not yet part of verify; tests are currently validated by execution.

## Context Docs

- Active backlog: `docs/TODO.md`.
- Regression prevention: `docs/dev/PITFALL_LEDGER.md`.
- Context groups: `summary_bank.json`.

Keep this file as current state only. Do not append repeated pass logs here; put new findings in TODO or the pitfall ledger when they change active work.
