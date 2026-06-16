# RustSMF App State

Last reviewed: 2026-06-16 (full integrity + launcher process safety review + wrap-up: documented the child-process / rogue-node-server hardening (run.ps1 Job+tree+scans+finally+trap+stale + start-vite-dev.mjs wrapper for beforeDev + tauri.conf update); added paired pitfall + two narrow summary_bank groups (subsystem__dev_process_lifecycle + issue__rogue_node_servers); cross-plat tree kill in mjs + direct-launch docs + tests/README sharpen + fresh modularity LOC rank (no new splits justified); error catching comments; all gates clean; manual close-X/relaunch clean (no rogues on 5173). All work on local main. Explicit user request to push to git after wrap-up verification.

## Current Product State

RustSMF is a Tauri + React + Three.js desktop/web model tool for SMF, GLB/GLTF, FBX, and OBJ workflows.

Core flow:
- Launch from `.\run.bat` or `pwsh -File run.ps1`; no-argument launch starts the desktop app.
- Load `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj` through browser input, drag/drop, or Tauri native dialog.
- Render model roots in a self-contained Three.js viewport with orbit, wheel zoom, right-drag pan, reset, lighting, grid, axes, resize handling, and cleanup.
- Drive animation through viewport-owned `AnimationMixer` state with timeline play/pause, scrub, speed, and clip selection.
- Inspect skeletons, select bones from the hierarchy or viewport click, show a bone marker, use TransformControls, use quick nudges, and toggle selected-bone weight preview.
- Export SMF sources through the high-fidelity SMF roundtrip path, including live position/rotation pose edits.
- Export compatible skinned GLB/FBX runtime roots to SMF through `threeToSmf`; use GLB export for static/material/scale cases.
- Cover default non-SMF skinned load/export e2e with a generated self-authored skinned GLB fixture.
- Cover basic FBX parsing/export dispatch with a self-authored static ASCII FBX fixture.
- Use Rust/Tauri commands for native open/save, binary read/write, and small SMF header/rig/anim/model validation/status peeks.
- Ignore stale file-open and browser file/drop read results when a newer operation has started.
- Planned modernization keeps the current React/Tauri/Three stack, uses GLB/GLTF as the preferred modern fidelity format, preserves SMF for backwards compatibility, and uses the old GameMaker screenshots to guide optional quad/ortho workspaces with larger bone handles/labels for rigging and skinning. Active breakdown in TODO #1: editorMode foundation (1.3) built; 1.4-1.8 subtasks defined for incremental quad, glyphs, mode behaviors, tabs (see subtasks for scope/done criteria).

## Architecture

- `source/frontend/src/App.tsx`: thin shell wiring toolbar, viewport, inspector, timeline, outliner, drop zone, status, and error banner.
- `source/frontend/src/hooks/useLoadModel.ts`: load/export orchestration, source format tracking, Tauri lazy imports, load/open stale guards, selected bone handling, pose edit persistence, transform mode, and weight preview state.
- `source/frontend/src/hooks/poseEdits.ts`: nudge delta types and helpers for live SMF position/rotation edits.
- `source/frontend/src/components/ThreeViewport.tsx`: renderer, scene, camera, orbit, model attach/dispose, mixer, skeleton helper, raycast bone picking, marker, TransformControls, and weight preview.
- `source/frontend/src/components/Inspector.tsx`: typed skeleton tree, clip list, selection controls, transform mode controls, and nudge controls.
- `source/frontend/src/loaders/*`: SMF import/export (buildThreeScene delegates rig to buildRigHierarchy for flat nodes + isBone=0 head dummies: cycle-safe effective-parent walk skips heads for direct real-bone .add() + deform-only Skeleton; bind locals use nearest real ancestor world for correct matrixWorld; inverse binds are calculated after world matrices update; animation tracks are emitted only for real scene bones; names `SMF_Node_N` + userData; skin remap direct on compressed is-bone seq), bounded binary helpers, rig node-list helper (export), guarded Three-to-SMF conversion, GLB/FBX/OBJ loading/export, coordinate swizzles, and DQ math. SMF rig tree now produces clean SkeletonHelper/Inspector/picker for rigs with disconnected parts (skin/anim/export fidelity preserved via world DQ + compose).
- `source/frontend/src/backend-client/tauri.ts`: browser/Tauri bridge for dialog, save, binary read, invokes, and desktop fallback messages. `saveFile` returns `boolean` so cancel is explicit.
- `source/frontend/tests/helpers/skinned-glb-fixture.ts`: generated self-authored skinned GLB fixture for default non-SMF skinned e2e coverage.
- `source/frontend/src/store`: lightweight React state slices for model, playback, and UI.
- `source/src-tauri/src/main.rs`: Tauri commands and Rust SMF header/section peeks with native tests.
- `source/backend`: reserved boundary only; no current backend service is required.
- Launchers + dev server lifecycle (`run.ps1` / `run.bat` default, `source/frontend/scripts/start-vite-dev.mjs` beforeDev wrapper, `source/src-tauri/tauri.conf.json`): safe child process handling (Windows JobObject KILL_ON_JOB_CLOSE + recursive tree kill + port 5173 + cmdline sweeps + entry stale reaper + signals + finally/traps + parent poll) so closing the cmd window or Tauri app does not leave rogue node/Vite servers. Tauri CLI term of beforeDev triggers mjs cleanup; launcher owns the outer tree. (See PITFALL for the pre-fix rogue class and summary_bank subsystem__dev_process_lifecycle.)

## Verification

Primary commands:
- `pwsh -File run.ps1 -Task verify`: frontend lint, app typecheck, test-source typecheck, Vite build, chunk guard, unit tests, and `cargo check`.
- `python scripts/verify-context-bank.py`: summary-bank JSON/path guard. This also runs inside `verify`.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright smoke, visual confirmation, and native IPC mock coverage. The web server is `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`, not Vite dev.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in strict SMF screenshot baseline check for the key load/export visual states.
- `pwsh -File run.ps1 -Task test:visual-update`: refreshes those strict SMF screenshot baselines after intentional renderer/framing changes.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native peek tests, and focused Playwright native IPC mock suite.
- `npm audit --omit=optional`: current dependency audit gate for installed npm packages.
- Launcher safety is exercised by manual close-X + re-launch (no rogue node on 5173) + `Stop-DevServers` / port sweeps on entry + full verify (which runs context-bank). See PITFALL + summary_bank for the durable record. (Cross-plat tree-kill and direct-launch documentation remain as active next-prevention per PITFALL.)

Current verification coverage:
- App source has strict `tsc --noEmit` coverage.
- Test sources have a separate strict `tsc --noEmit` gate with Node/Playwright types.
- Unit tests cover SMF coordinate/DQ math, binary bounds, roundtrips, rig node semantics, converter rejection paths, and pose-capture roundtrip.
- Playwright smoke tests cover boot, real SMF load, viewport/bone/timeline flows, export UX, invalid-load UX, OBJ static parity, FBX static fixture load/export, and generated skinned GLB load plus SMF/GLB export.
- Playwright visual tests cover desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, and loaded SMF visual state. Strict screenshot snapshots are opt-in with `RUSTSMF_STRICT_VISUALS=1`.
- `test:visual-strict` wraps the strict SMF snapshot subset and keeps generated `playwright-report/` and `test-results/` artifacts out of Git.
- Playwright native IPC tests cover mocked Tauri open/read/status, save/write, save cancel, and open cancel.
- Rust tests cover native SMF parser width/offset behavior and desktop peek commands.
- `check-entry-chunks.mjs` now fails `verify` if the Vite build output is missing or the `three-vendor` split is absent.

Last verified local results:
- `python scripts/verify-context-bank.py`: passed with `summary_bank.json OK (0 warnings)`.
- `pwsh -File run.ps1 -Task verify`: passed on 2026-06-16 after the SMF load-hang fix (context-bank validation, lint, app typecheck, test typecheck, Vite build, chunk guard, 32 unit tests, and cargo check).
- `npm --workspace frontend run test:e2e -- tests/smoke.spec.ts -g "can load a real SMF sample"`: passed on 2026-06-16 with no SMF head-track warnings.
- `npm --workspace frontend run test:e2e -- tests/native.spec.ts`: passed on 2026-06-16 (2 tests).
- Browser QA on `http://127.0.0.1:5173`: app shell loaded with no console warnings/errors; mode select updated viewport/inspector mode state. Regular Playwright file-flow proof loaded `mixamo_smf_baldguy.smf` with status `Loaded: mixamo_smf_baldguy.smf | bones: 24 | clips: 12 | verts: 132`.
- `pwsh -File run.ps1 -Task test:e2e`: passed after the docs/context pass with 16 tests and 0 skipped.
- `npm audit --omit=optional`: passed with `found 0 vulnerabilities`.
- `pwsh -File run.ps1 -Task test:visual-strict`: passed after refreshing coherent SMF load/export snapshots.
- `npm --workspace frontend run typecheck:test`: passed.
- `npm --workspace frontend run test:unit`: passed with 32 unit tests.
- `cmd /c run.bat verify`: passed through the batch wrapper with the same verify gate.
- `pwsh -File run.ps1 -Task desktop-smoke`: passed with unbundled Tauri build, 4 Rust native tests, and 2 Playwright native IPC tests.

## Current Limits

- Native UI roundtrip automation is covered through deterministic Playwright Tauri IPC mocks plus Rust command tests; true OS dialog automation is deferred until a dialog-only bug, CI requirement, or release checklist needs it.
- Default non-SMF skinned coverage uses a generated skinned GLB fixture. FBX coverage uses a self-authored static ASCII FBX fixture for basic parser/export dispatch; skinned FBX fidelity still needs a dedicated redistributable skinned FBX asset if that path becomes important.
- GLB/FBX-to-SMF conversion is available for skinned models with one shared named skeleton and no scale animation. Static roots, textures/materials, morph tracks, object-level tracks, and scale animation still use GLB export for fidelity.
- GLB/GLTF remains the preferred format for maximum fidelity and new development. SMF support is scoped to legacy recovery and users who target the old SMF binary pipeline.
- Live SMF position/rotation pose edits export; scale edits are blocked for SMF export because the current SMF DQ path has no scale channel.
- Quad/ortho split views, oversized screen-space bone handles, endpoint handles, and full skin-weight paint authoring are planned modernization work, not current implementation.
- Launcher process safety (no rogue node servers on close) is Windows-primary via run.ps1 + mjs layers (Job/tree/scans/poll). Direct `tauri dev` or non-Windows have reduced coverage (mjs signals + poll only); documented with next-prevention steps.

## Context Docs

- Docs index and policy: `docs/README.md`, `docs/dev/README.md`, `docs/research-inbox/README.md`.
- Active backlog: `docs/dev/TODO.md`.
- Regression prevention: `docs/dev/PITFALL_LEDGER.md`.
- Test coverage map: `source/frontend/tests/README.md`.
- Context groups: `summary_bank.json`.
- Old source reference screenshots and GameMaker LTS notes: `docs/references/old-src/screenshots/`, `docs/references/old-src/issues.md`, `docs/references/old-src/GML-2026.md`.
- Old source GameMaker `.gml` and `.yy` files are preserved as important reference source, not generated docs. The current local old-src state is a merged recovery: docs/screenshots/proof artifacts and `options/reddit` metadata came from execute-plan refs, while tracked `.gml`/`.yy`/`SMF.yyp` source metadata came from `stash@{0}` (`auto-stash before pull 2026-06-13T23:06:23.0755471-04:00`) with whitespace-only cleanup where needed. All 241 `.gml` and 260 `.yy` files are present, and the recovered old-src GameMaker state was user-tested.

Keep this file as current state only. Put completed work and new findings in TODO or the pitfall ledger when they change active work.
