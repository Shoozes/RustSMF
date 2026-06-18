# RustSMF App State

Last reviewed: 2026-06-18

## Current Product State

RustSMF is a Tauri + React + Three.js desktop/web model tool for SMF, GLB/GLTF, FBX, and OBJ workflows.

Core flow:
- Launch from `.\run.bat` or `pwsh -File run.ps1`; no-argument launch opens the numbered menu. Choose option 2, or run `.\run.bat 2` / `pwsh -File run.ps1 -Task run`, to start the desktop app when dependencies are already installed.
- Load `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj` through browser input, drag/drop, or Tauri native dialog.
- Render model roots in a self-contained Three.js viewport with orbit, wheel zoom, right-drag pan, reset, lighting, grid, axes, resize handling, and cleanup.
- Viewport layout controls are model-aware: with no model loaded, layout is forced to single-view (`data-viewport-layout="single"`); single/quad layout controls become active after a model is loaded.
- Mode/workspace switching is continuity-checked in normal, medium, and constrained-width viewports; narrow layouts put mode tabs on a scrollable row, and layout switching remains disabled until a model is loaded.
- Launcher contract (current):
  - `run.bat` / `run.ps1` are the canonical Windows workflow and carry full orphan-prevention coverage.
  - `run.ps1 -Task run` (same as launcher option 2) is the default app launch path after setup.
  - `run.ps1 -Task test:e2e` uses GenEye as an optional advisory Playwright subagent when discoverable, but RustSMF remains able to run browser-only e2e with `-NoGenEye`, `RUSTSMF_NO_GENEYE=1`, or no GenEye checkout/runtime.
  - Direct `npm run dev` / `npm run tauri:dev` flows remain available but intentionally have reduced non-canonical lifecycle guarantees.
- Drive animation through viewport-owned `AnimationMixer` state with timeline play/pause, scrub, speed, and clip selection.
- Inspect skeletons, select bones from the hierarchy or viewport click, show a bone marker, use TransformControls, use quick nudges, and toggle selected-bone weight preview.
- Move selected bone endpoint markers in precision modes with camera-plane constrained drag (no model swap, no control conflict), and endpoint-drag lifecycle assertions are covered by e2e smoke in single and quad modes.
- Export SMF sources through the high-fidelity SMF roundtrip path, including live position/rotation pose edits.
- Export compatible skinned GLB/FBX runtime roots to SMF through `threeToSmf`; use GLB export for static/material/scale cases.
- Cover default non-SMF skinned load/export e2e with a generated self-authored skinned GLB fixture.
- Cover basic FBX parsing/export dispatch with a self-authored static ASCII FBX fixture.
- Use Rust/Tauri commands for native open/save, binary read/write, and small SMF header/rig/anim/model validation/status peeks. Desktop open is format-aware: all path-backed non-SMF models now route through `readBinaryFile`, while `.smf` still performs `get_smf_desktop_info` validation before parse.
- Ignore stale file-open and browser file/drop read results when a newer operation has started (covered by native mocked-open/rapid-export checks and browser file-input/drop overlap smoke assertions).
- Keep editor mode + viewport layout transitions on the same shared model/viewport root; selected bone and scrub/timeline state are preserved across those transitions and now covered by smoke assertions.
- Keep constrained-width workspace tabs deterministic after model load; the 360px smoke path clicks Model/Rig/Skin/Animate/Export without forced clicks and verifies selected bone plus scrub continuity.
- Model/load/export async failures in `useLoadModel` now normalize unknown error values through a single helper and remove brittle `any` traversal casts for skinned mesh extraction/clip reads.
- Planned modernization keeps the current React/Tauri/Three stack, uses GLB/GLTF as the preferred modern fidelity format, preserves SMF for backwards compatibility, and uses the old GameMaker screenshots to guide optional quad/ortho workspaces with larger bone handles/labels for rigging and skinning. Endpoint drag constraints and pane-aware timing have been validated in e2e (single + quad).

## Architecture

- `source/frontend/src/App.tsx`: thin shell wiring toolbar, viewport, inspector, timeline, outliner, drop zone, status, and error banner.
- `source/frontend/src/hooks/useLoadModel.ts`: load/export orchestration, source format tracking, Tauri lazy imports, load/open stale guards, selected bone handling, pose edit persistence, transform mode, and weight preview state.
- `source/frontend/src/hooks/useLoadModel.ts`: loader path now resolves a typed `TauriClient` contract (`../backend-client/tauri`) and uses a shared typed `LoadedModelResult`, reducing `any` usage across load/export/peek branches.
- `source/frontend/src/hooks/useLoadModel.ts`: in-flight export/save guard (`isExportingRef` + export seq guard) serializes export actions during async save/write and blocks stale completions.
- `source/frontend/tests/native.spec.ts`: added Playwright native IPC race coverage for delayed native saves to prove single-flight export behavior and status-button recovery under rapid click.
- `source/frontend/src/hooks/poseEdits.ts`: nudge delta types and helpers for live SMF position/rotation edits.
- `source/frontend/src/components/ThreeViewport.tsx`: renderer, scene, camera, orbit, model attach/dispose, mixer, skeleton helper, raycast bone picking, marker, TransformControls, and weight preview.
- `source/frontend/src/components/Inspector.tsx`: typed skeleton tree, clip list, selection controls, transform mode controls, and nudge controls.
- `source/frontend/src/utils/viewportLayout.ts`: shared single/quad viewport pane math, ortho camera framing, and pointer coordinate conversion helpers used by `ThreeViewport.tsx`.
- `source/frontend/src/loaders/*`: SMF import/export (buildThreeScene delegates rig to buildRigHierarchy for flat nodes + isBone=0 head dummies: cycle-safe effective-parent walk skips heads for direct real-bone .add() + deform-only Skeleton; bind locals use nearest real ancestor world for correct matrixWorld; inverse binds are calculated after world matrices update; animation tracks are emitted only for real scene bones; names `SMF_Node_N` + userData; skin remap direct on compressed is-bone seq), bounded binary helpers, rig node-list helper (export), guarded Three-to-SMF conversion, GLB/FBX/OBJ loading/export, coordinate swizzles, and DQ math. SMF rig tree now produces clean SkeletonHelper/Inspector/picker for rigs with disconnected parts (skin/anim/export fidelity preserved via world DQ + compose).
- `source/frontend/src/backend-client/tauri.ts`: `TauriClient` interface now centralizes shared desktop bridge function contracts for load/export/peek calls, and `useLoadModel.ts` consumes it directly.
- `source/frontend/src/backend-client/tauri.ts`: browser/Tauri bridge for dialog, save, binary read, invokes, and desktop fallback messages. `saveFile` returns `boolean` so cancel is explicit.
- `source/frontend/src/utils/modelFormat.ts`: canonical format extension parser + shared extension constants for open/load/tauri filters.
- `source/frontend/tests/helpers/skinned-glb-fixture.ts`: generated self-authored skinned GLB fixture for default non-SMF skinned e2e coverage.
- `source/frontend/src/store`: lightweight React state slices for model, playback, and UI.
- `source/src-tauri/src/main.rs`: Tauri commands and Rust SMF header/section peeks with native tests.
- `source/backend`: reserved boundary only; no current backend service is required.
- Launchers + dev server lifecycle (`run.ps1` / `run.bat` default, `source/frontend/scripts/start-vite-dev.mjs` beforeDev wrapper, `source/src-tauri/tauri.conf.json`): safe child process handling (Windows JobObject KILL_ON_JOB_CLOSE + recursive tree kill + port 5173 + cmdline sweeps + entry stale reaper + signals + finally/traps + parent poll) so closing the cmd window or Tauri app does not leave rogue node/Vite servers. Tauri CLI term of beforeDev triggers mjs cleanup; launcher owns the outer tree. (See PITFALL for the pre-fix rogue class and summary_bank subsystem__dev_process_lifecycle.)

## Verification

- Primary commands:
  - `pwsh -File run.ps1 -Task verify`
  - `pwsh -File run.ps1 -Task test:e2e`
    - `test:e2e` passes RustSMF's Playwright command to GenEye `playwright-full -AllowGenEyeFailure -Group geneye-watch-fixture` when GenEye is discoverable (`-GenEyeRoot`, `GENEYE_ROOT`, `GENEYE_RUN_BAT`, or local Three-Sisters path). Evidence is ignored under `runtime-data\geneye-playwright-runs\`; RustSMF app evidence is the GenEye `project_tests` block plus discovered RustSMF Playwright artifacts, while the built-in GenEye scenario only proves advisory plumbing. Use `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` for browser-only e2e. If GenEye is unavailable or fails before project-test evidence exists, the launcher runs browser-only Playwright. RustSMF project-test failures stay authoritative.
  - `pwsh -File run.ps1 -Task test:visual-strict` (opt-in)
  - `pwsh -File run.ps1 -Task test:visual-update` (intentional baseline refresh only)
  - `pwsh -File run.ps1 -Task desktop-smoke`
  - `python scripts/verify-context-bank.py`
  - `npm audit --omit=optional`
- E2E web-server path: `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort` (not Vite dev).
- Last successful command set (core): verify, test:e2e, test:visual-strict, desktop-smoke, and context-bank checks on 2026-06-18.

## Current Limits

- Native UI roundtrip automation is covered through deterministic Playwright Tauri IPC mocks plus Rust command tests; true OS dialog automation is deferred until a dialog-only bug, CI requirement, or release checklist needs it.
- Default non-SMF skinned coverage uses a generated skinned GLB fixture. FBX coverage uses a self-authored static ASCII FBX fixture for basic parser/export dispatch; skinned FBX fidelity still needs a dedicated redistributable skinned FBX asset if that path becomes important.
- GLB/FBX-to-SMF conversion is available for skinned models with one shared named skeleton and no scale animation. Static roots, textures/materials, morph tracks, object-level tracks, and scale animation still use GLB export for fidelity.
- GLB/GLTF remains the preferred format for maximum fidelity and new development. SMF support is scoped to legacy recovery and users who target the old SMF binary pipeline.
- Live SMF position/rotation pose edits export; scale edits are blocked for SMF export because the current SMF DQ path has no scale channel.
- Quad layout, ortho camera panes, oversized screen-space bone handles, and endpoint drag interactions are implemented at a preview/editor-affordance level and covered by focused e2e checks. Full skin-weight paint authoring and deeper ortho-pane editing parity remain planned.
- Launcher process safety (no rogue node servers on close) is Windows-primary via run.ps1 + mjs layers (Job/tree/scans/poll). Direct `tauri dev` or non-Windows have reduced coverage (mjs signals + polls + child-tree cleanup where supported); behavior is documented explicitly in launcher docs.

## Context Docs

- Docs index and policy: `docs/README.md`, `docs/dev/README.md`, `docs/research-inbox/README.md`.
- Active backlog: `docs/dev/TODO.md`.
- Regression prevention: `docs/dev/PITFALL_LEDGER.md`.
- Test coverage map: `source/frontend/tests/README.md`.
- Context groups: `summary_bank.json`.
- Old source reference screenshots and GameMaker LTS notes: `docs/references/old-src/screenshots/`, `docs/references/old-src/issues.md`, `docs/references/old-src/GML-2026.md`.
- Old source GameMaker `.gml` and `.yy` files are preserved as important reference source, not generated docs. The current local old-src state is a merged recovery: docs/screenshots/proof artifacts and `options/reddit` metadata came from execute-plan refs, while tracked `.gml`/`.yy`/`SMF.yyp` source metadata came from `stash@{0}` (`auto-stash before pull 2026-06-13T23:06:23.0755471-04:00`) with whitespace-only cleanup where needed. All 241 `.gml` and 260 `.yy` files are present, and the recovered old-src GameMaker state was user-tested.

Keep this file as current state only. Put completed work and new findings in TODO or the pitfall ledger when they change active work.
