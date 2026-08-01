# RustSMF App State

Last reviewed: 2026-08-01

RustSMF is a Tauri + React + Three.js desktop/web editor for loading, inspecting, posing, animating, skinning, and exporting SMF, GLB/GLTF, FBX, and OBJ models. This document owns current behavior, architecture boundaries, format limits, and the verification contract. Forward work belongs in `TODO.md`; pass evidence belongs in `review.md`; recurring failure analysis belongs in `PITFALL_LEDGER.md`.

## Product Contract

### Launch and model lifecycle

- `run.bat` and `run.ps1` are the canonical Windows launchers. No-argument launch opens the numbered menu; option 2 or `pwsh -File run.ps1 -Task run` starts the installed development app.
- Browser input, drag/drop, and the native picker accept `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj`. Unsupported or malformed files produce an error without replacing the current model.
- All picker, file-read, desktop-read, parse, export, and save paths use shared latest-intent ownership. A newer load invalidates older load/export UI completions; failed replacements preserve the mounted root, selection, dirty authoring state, and status.
- SMF import/export uses a typed Web Worker with owned transferable buffers, nested payload validation, monotonic progress, cancellation, a 120-second timeout, and explicit termination. The client rechecks an abort signal after worker handlers are installed and before `postMessage`, so setup-time cancellation cannot publish or leave a task running. The codec bounds encoded input/output to 256 MiB, section reads to declared offsets, strings to 4,095 bytes, and allocation-driving texture/mesh/rig/animation counts; non-finite numeric values and invalid byte ranges fail closed. Synchronous fallback is limited to worker construction or initial `postMessage` failure; runtime worker errors surface instead of repeating work on the UI thread.
- Save operations are globally single-flight and freshness-checked. User cancellation is distinct from failure.

### Viewport and themes

- The viewport owns one Three.js renderer, scene, animation mixer, requestAnimationFrame loop, resize observer, input listeners, model attachment, and resource disposal lifecycle.
- Modern defaults to a single perspective pane. Original SMF defaults to quad view before model load and after restoration. Layout controls remain disabled until a model is loaded.
- Quad view exposes Top, 3D, Front, and Side panes. Perspective and orthographic panes retain their own direction/zoom while sharing one world-space focus target. Right-dragging any pane moves that target for every view; reset refits the loaded model center and distance.
- Pane hit-testing uses CSS coordinates, half-open internal boundaries, inclusive outer edges, and remains stable with fractional/high-DPI layout values.
- Modern and Original SMF share one editor state. The persisted theme registry rejects stale values and treats storage failure as non-blocking.
- Original SMF restores the compact old-editor frame: narrow Settings and Submodels shelves, two-row top strip, numbered red mode tabs, dense square controls, dark quad viewports, camera-aligned grids, legacy framing, and the Animation-only upper keyframe strip. The keyframe lane retains current scrub, insert, selection, drag, and playback behavior.
- The Submodels shelf renders bounded previews from source base-color maps, including raw SMF `DataTexture` pixels. Material color remains the fallback for untextured or unsupported sources.
- Narrow layouts keep workspace tabs scrollable and the Display menu in normal toolbar flow, without horizontal page overflow or covered pane labels.

### Authoring workspaces

- Model/View: the Outliner derives groups and meshes from the mounted root, supports row and viewport selection, multi-select, bulk visibility actions, source texture thumbnails, viewport-only selection overlays, and chronological undo/redo.
- Rig: validation covers skeleton presence, duplicate names, orphan/cyclic hierarchy, skin tuple shape, and invalid skin indices. Non-SMF rigs support rename, reparent, child creation, move, rotate, detach/connect, 90-degree spin, and deletion of unweighted non-root branches with full snapshot undo/redo.
- SMF Rig policy is explicit: position/rotation pose edits and inverse-bind local reset are supported; scale export, rename persistence, structural detach/connect, and mirror remain unavailable when the format cannot preserve them.
- Endpoint and bounded CCD IK are explicit Rig tools with exclusive pointer ownership, cancel restoration, and one history transaction per completed gesture. IK is pose-only; it does not silently create animation keys.
- Skin: selected-bone paint supports set/add/subtract/auto modes, vertex/triangle targets, bounded spatial candidate indexes, configurable Auto Skin algorithms, normalize, pointer cancel, undo/redo, and supported SMF export.
- Skin weight preview uses a non-destructive Three.js vertex-color heat map for the selected bone and restores the original color attribute plus each material's prior `vertexColors` mode when disabled. The legacy four-slot shader and paint-transport references remain documented in `docs/dev/old_editor_source_map.md`; exact legacy texture modulation is not required for the current export-safe display path.
- Animate: clip rename/duplicate/delete/reorder, loop/sample metadata, playback, scrub, selected-bone key insert/update/delete/copy/paste, marker drag, snap, interpolation metadata, and undo/redo update the runtime clips and supported SMF export candidate.
- App-level Undo/Redo selects the newest editor, Skin, or Outliner transaction by shared chronology rather than the currently visible workspace.
- Workspace, layout, and camera-mode changes preserve the mounted model, selection, paused time, dirty state, export status, and exclusive Select/Endpoint/IK ownership.

### Export and validation

- Source-aware Export preserves the high-fidelity SMF path for SMF sources and uses FBX for FBX sources. Explicit GLB, FBX, and SMF actions remain available where valid.
- SMF export preserves imported node/head structure, deform-order skin indices, finite normalized dual quaternions, normalized tangent handedness, position/rotation pose edits, supported animation edits/metadata, and dirty skin weights. Attribute shape, counts, times, strings, ranges, output size, and section arithmetic are checked before serialization; malformed data is rejected rather than wrapped. Structured diagnostics and an in-memory export/reimport comparison run before risky conversion saves.
- Compatible non-SMF-to-SMF conversion requires one shared named skeleton, complete skin attributes, and position/quaternion bone tracks. Indexed geometry is expanded through one validated triangle map so all attributes become aligned SMF triangle soup.
- GLB export reparses generated bytes and checks finite transforms/tracks plus representative bone, skinned-mesh, clip, name, and track preservation before save.
- FBX import waits for loader-owned texture work before attaching a parsed root and removes unavailable texture maps before render. Export writes binary FBX 7500 through the vendored MIT `FBXExporter-threejs`, emits typed index/layer arrays, then reparses the bytes and checks representative mesh, skin, bone, clip, and animation endpoint structure before save.
- Display-only material, opacity, sampler, legacy-lighting, and weight-color previews are restored for the entire asynchronous GLB/FBX exporter call and reapplied only if the same root remains mounted.
- Export workspace copy states texture behavior per format. GLB is the preferred high-fidelity output for static models, materials/textures, morphs, object tracks, multiple skeletons, and scale animation.

## Architecture Ownership

| Owner | Responsibility |
| --- | --- |
| `src/App.tsx` | Workspace composition, theme/layout policy, shared UI chronology, and component wiring. |
| `src/hooks/useLoadModel.ts` | Load/export intent integration, editor state coordination, save serialization, and the stable app-facing contract. Animation actions are delegated to `src/utils/animationAuthoringController.ts`. |
| `src/hooks/useSmfCodecTask.ts` | SMF worker task lifecycle, progress, abort, timeout, and startup fallback. |
| `src/hooks/smfExportCandidate.ts` | One pure authority for pose, animation, metadata, and live-skin application before SMF export. |
| `src/components/ThreeViewport.tsx` | Renderer/mixer/root lifecycle and imperative viewport interaction ownership. Display/material mutation is delegated to `src/utils/viewportDisplayController.ts`. |
| `src/utils/viewportLayout.ts` | Viewport specs, pane hit math, model-fit distance, fixed-camera focus, and ortho pan conversion. |
| `src/utils/themeViewportGrid.ts` | Theme grid construction, pane visibility, and disposal. |
| `src/utils/materialPreview.ts` | Source-versus-preview material boundary for async exporters. |
| `src/utils/weightPreview.ts` | Selected-bone weight-color preview with original geometry/material restoration and no export-material mutation. |
| `src/utils/viewportDisplayController.ts` | Viewport texture/opacity preview, legacy SMF lighting substitution, source assignment restoration, and display cleanup. |
| `src/utils/animationEdits.ts`, `rigEdits.ts`, `rigIk.ts`, `skinWeights.ts` | Pure authoring policy and transformations with focused unit coverage. |
| `src/utils/animationAuthoringContext.ts` | Pure selected-bone and active-clip guards shared by animation authoring callbacks and focused tests. |
| `src/utils/animationAuthoringController.ts` | Clip CRUD, metadata, selected-bone key editing, snap, and animation-history action contract used by `useLoadModel`. |
| `src/loaders/*` | SMF/GLB/FBX/OBJ parsing, conversion, diagnostics, coordinate/DQ math, and validated export. |
| `src/workers/*` | Runtime-validated SMF worker protocol, client, and worker entry. |
| `src/backend-client/tauri.ts` | Guarded native dialog/read/write adapters and browser fallbacks. |
| `source/src-tauri/src/main.rs`, `smf_core.rs` | Tauri commands and shared native SMF header/section parsing. Native file reads/writes are size-bounded and run through blocking-task adapters; native validation reports header/offset acceptance only. |
| `source/frontend/tests/*` | Domain-owned browser suites and committed deterministic fixtures. |

`useLoadModel.ts` and `ThreeViewport.tsx` remain deliberate integration owners for load/export and renderer lifecycle. Animation actions and display/material mutations now have explicit leaf-controller contracts; future extractions still require independent inputs, tests, and one disposal owner.

## Verification

Primary commands from the repository root:

- `pwsh -NoProfile -File .\run.ps1 -Task context`
- `pwsh -NoProfile -File .\run.ps1 -Task verify`
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`
- `npm audit --omit=optional` from `source`
- `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` from `source/src-tauri`

`verify` owns context-bank validation/tests, lint coverage, ESLint, app/test typechecks, the production-`any` guard, production build, entry-chunk guards, frontend units, and Rust fmt/clippy/tests/check. Playwright runs against one production Vite preview server. Strict screenshots are opt-in. `desktop-smoke` runs an unbundled Tauri build, all Rust tests, and native IPC browser coverage.

When the bundled Playwright Chromium executable is rejected by a managed Windows process boundary, set `RUSTSMF_PLAYWRIGHT_EXECUTABLE` to an approved existing absolute Chrome/Edge executable for that process only. The config validates the path and does not persist or weaken the app sandbox/CSP.

The sandbox checkup is diagnostic rather than an app gate. A managed profile may report `python_unavailable`; Python is not required by the Node/PowerShell/Rust verification lane, and the Python Blender fixture scripts are an optional external compatibility check.

Current inventory:

- 251 frontend unit tests across 41 discovered unit-test files; `source/frontend/scripts/run-unit-tests.mjs` is the discovery authority.
- 55 browser cases in eight domain-owned spec files.
- 9 Rust tests; the real-SMF native tests require and parse the committed `source/frontend/tests/mixamo_smf_baldguy.smf` fixture instead of silently skipping.
- 21 context groups, including one archived compatibility test route and one archived old-editor reference route. The default orientation remains intentionally narrow; the latest context run reports 25.3 KiB default orientation with zero warnings.

The latest command results and any environment-only warnings are recorded in `review.md`.

## Current Limits

- SMF has no scale channel in the current dual-quaternion path. Scale edits block SMF export rather than being dropped.
- Non-SMF-to-SMF conversion does not preserve static-only roots, materials/textures, morphs, object-level tracks, multiple skeletons, or scale animation.
- The freeform TransformControls gizmo remains single-perspective. Quad/ortho authoring uses pane-aware explicit Rig move/rotate/add-child/endpoint/IK tools; the freeform gizmo is intentionally not rebound across fixed cameras.
- Rig IK is a pose tool. Keyed IK requires an explicit solve-and-bake design.
- FBX compatibility is covered by self-authored/generated fixtures plus an independently authored Blender 5.0.0 skinned, textured, animated fixture. The app-exported roundtrip has been reopened and structurally validated by Blender 5.0.0; this does not claim universal third-party FBX compatibility.
- Native dialog behavior is covered by Rust tests plus deterministic Tauri IPC browser mocks; true OS-dialog automation remains evidence-gated.
- Full process-tree cleanup is Windows-launcher owned. Direct Tauri/Vite and non-Windows launches have reduced lifecycle guarantees.

## Documentation and Context Ownership

- `README.md`: concise project entry and primary commands.
- `docs/user/README.md`: user-facing workflows and format limits.
- `docs/dev/APP_STATE.md`: current app and architecture contract.
- `docs/dev/TODO.md`: prioritized executable work with What/Why/Where/When/How/Subtasks/Done when/Verification.
- `docs/dev/review.md`: latest integrity-pass findings and command evidence.
- `docs/dev/PITFALL_LEDGER.md`: durable regression-prevention stories.
- `source/frontend/tests/README.md`: test ownership and fixture policy.
- `summary_bank.json`: focused file routes; it is not a progress log or backlog.
