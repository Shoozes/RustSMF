# RustSMF App State

Last reviewed: 2026-08-09

RustSMF is a Tauri + React + Three.js desktop/web editor for loading, inspecting, posing, animating, skinning, and exporting SMF, GLB/GLTF, FBX, and OBJ models. This document owns current behavior, architecture boundaries, format limits, and the verification contract. Forward work belongs in `TODO.md`; pass evidence belongs in `review.md`; recurring failure analysis belongs in `PITFALL_LEDGER.md`.

## Product Contract

### Launch and model lifecycle

- `run.bat` and `run.ps1` are the canonical Windows launchers. No-argument launch opens the numbered menu; option 2 or `pwsh -File run.ps1 -Task run` starts the installed development app.
- Browser input, drag/drop, and the native picker accept `.smf`, `.glb`, `.gltf`, `.fbx`, and `.obj`. Unsupported or malformed files produce an error without replacing the current model.
- Browser metadata and native/test-injected byte payloads share a 256 MiB model-input limit. Browser picker and drop paths reject oversized `File` metadata before `File.arrayBuffer()`; the load boundary repeats the byte-length check for native reads and test fixtures. Native IPC payloads must be an `ArrayBuffer`, `Uint8Array`, or byte array whose entries are integers from 0 through 255; malformed responses fail instead of being silently coerced. A selected browser file that cannot be read is reported as an Open error rather than picker cancellation.
- A replacement requested while pose, animation, skin, rig, editor, or Outliner history is dirty opens an accessible Cancel/Discard decision. File bytes are not materialized until the decision is made; Cancel preserves the current root, selection, dirty flags, and status, while Discard permits one replacement. Parse failure or stale completion keeps the previous model mounted.
- All picker, file-read, desktop-read, parse, export, and save paths use shared latest-intent ownership. A newer load invalidates older load/export UI completions; failed replacements preserve the mounted root, selection, dirty authoring state, and status.
- SMF import/export uses a typed Web Worker with owned transferable buffers, nested payload validation, monotonic progress, cancellation, a 120-second timeout, and explicit termination. The client rechecks an abort signal after worker handlers are installed and before `postMessage`, so setup-time cancellation cannot publish or leave a task running. The codec bounds encoded input/output to 256 MiB, decoded allocation estimates to 512 MiB, section reads to declared offsets, strings to 4,095 bytes, and allocation-driving texture/mesh/rig/animation counts; non-finite numeric values and invalid byte ranges fail closed. Synchronous fallback is limited to worker construction or initial `postMessage` failure; runtime worker errors surface instead of repeating work on the UI thread.
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
- Rig: validation covers skeleton presence, duplicate names, orphan/cyclic hierarchy, skin tuple shape, and invalid skin indices. Non-SMF rigs support rename, reparent, child creation, move, rotate, detach/connect, 90-degree spin, and deletion of unweighted non-root branches with full snapshot undo/redo. Static non-SMF roots (for example mesh-only FBX/OBJ) can use Prepare root skeleton to promote meshes into one shared root-bound SkinnedMesh set so child bones and weight painting become available; preparation is one reversible rig-history transaction and participates in dirty replacement protection.
- SMF Rig policy is explicit: position/rotation pose edits and inverse-bind local reset are supported; scale export, rename persistence, structural detach/connect, and mirror remain unavailable when the format cannot preserve them.
- Endpoint and bounded CCD IK are explicit Rig tools with exclusive pointer ownership, cancel restoration, and one history transaction per completed gesture. IK is pose-only; it does not silently create animation keys.
- Skin: selected-bone paint supports set/add/subtract/auto modes, vertex/triangle targets, bounded spatial candidate indexes, configurable Auto Skin algorithms, normalize, pointer cancel, undo/redo, and supported SMF export. Set mode now separates Target weight (0–1) from brush flow and falloff; flow blends toward the target while Add/Subtract retain incremental behavior. The Skin panel reports raw four-slot influence diagnostics for the hovered vertex, including bone names, finite sums, unweighted vertices, invalid references, invalid weights, and stable issue codes. Paint sampling has explicit Rest / Bind, Frozen Current, and Live Animation modes: Rest uses bind coordinates, Frozen Current captures bone matrices until the mode changes, and Live follows the mixer with a visible safety warning. The selected paint-pose mode and live-warning marker are mirrored in viewport telemetry and reapplied across Skin-mode transitions; imperative cleanup removes only transient brush state. The optional Skin pts overlay samples posed skinned vertices during the viewport loop and remains display-only; unchanged poses skip resampling, while pose, geometry, and skin-attribute changes invalidate the cached sample.
- Skin weight preview uses a non-destructive Three.js vertex-color heat map for the selected bone and restores the original color attribute plus each material's prior `vertexColors` mode when disabled. The legacy four-slot shader and paint-transport references remain documented in `docs/dev/old_editor_source_map.md`; exact legacy texture modulation is not required for the current export-safe display path.
- Animate: clip creation, rename/duplicate/delete/reorder, bounded duration set/extension, retime, finite trim with sampled boundary keys, loop/sample metadata, playback, scrub, Bone/Branch/Full Rig key insert/update/delete/move/copy/paste, marker drag, snap, interpolation metadata, locked-bone state, and undo/redo update the runtime clips and supported SMF export candidate. Editable duration fields use stable up-to-three-decimal display formatting, so floating-point representation noise is not shown without changing stored duration precision or edit semantics. Scope operations resolve from the selected hierarchy, use one animation-edit history transaction, union their timeline markers, and reject clipboard fingerprints or target scopes that do not match without mutation. Trim retains source keys in the inclusive range and samples both boundaries; authored keys are shifted by the trim start. Locked channels are immutable: scoped key edits, viewport keying, retime, and trim fail closed when they would rewrite a locked track, while lock/unlock itself is one history transaction. New clips can be created from the canonical load-time rest pose or the current local bone pose, including models that load with zero source clips; creation is one animation-workspace history transaction and emits position/quaternion keys for every named skeleton bone. New animation creation fails closed when the skeleton is missing, unnamed, or has duplicate bone names rather than emitting ambiguous tracks. The mixer clock remains imperative in the viewport; the parent timeline publishes a bounded 50 ms display cadence and flushes immediately for scrub/clip/pause commands.
- App-level Undo/Redo selects the newest editor, Skin, or Outliner transaction by shared chronology rather than the currently visible workspace.
- Editor history is capped at 100 entries and 64 MiB across undo/redo; skin history is capped at 50 entries and 32 MiB per direction. When an oldest entry is evicted, the status surface explains the bounded-history decision while the current edit remains applied.
- Workspace, layout, and camera-mode changes preserve the mounted model, selection, paused time, dirty state, export status, and exclusive Select/Endpoint/IK ownership.

### Export and validation

- Source-aware Export preserves the high-fidelity SMF path for SMF sources and uses FBX for FBX sources. Explicit GLB, FBX, and SMF actions remain available where valid.
- SMF export preserves imported node/head structure, deform-order skin indices, finite normalized dual quaternions, normalized tangent handedness, position/rotation pose edits, supported animation edits/metadata, and dirty skin weights. Attribute shape, counts, times, strings, ranges, output size, section arithmetic, relational rig/animation/skin references, and finite numeric payloads are checked by the shared semantic validator before serialization; malformed data is rejected rather than wrapped.
- Non-SMF-to-SMF conversion uses one explicit boundary: mesh attributes are baked once into model-root Three space, the serializer owns the single Three-to-SMF vector conversion, bones are captured as root-relative world DQs, and clips are sampled through a Three mixer. The app-facing SMF action and roundtrip check remain enabled for compatible skinned GLB/FBX sources; unsupported static roots, scale tracks, incomplete skin data, and malformed geometry remain blocked by diagnostics.
- GLB export reparses generated bytes and checks finite transforms/tracks plus representative bone, skinned-mesh, clip, name, and track preservation before save.
- FBX import waits for loader-owned texture work before attaching a parsed root and removes unavailable texture maps before render. Geometry still mounts when texture embeds or external absolute paths cannot be resolved; the load status reports mesh/vertex/bone/clip counts plus notes for static-only roots and skipped maps. Export writes binary FBX 7500 through the vendored MIT `FBXExporter-threejs`, emits typed index/layer arrays, then reparses the bytes and checks representative mesh, skin, bone, clip, and animation endpoint structure before save.
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
| `src/utils/animationFrame.ts` | Shared pending-RAF cancellation guard used by the mount-owned viewport loop and resize callback. |
| `src/utils/themeViewportGrid.ts` | Theme grid construction, pane visibility, and disposal. |
| `src/utils/materialPreview.ts` | Source-versus-preview material boundary for async exporters. |
| `src/utils/weightPreview.ts` | Selected-bone weight-color preview with original geometry/material restoration and no export-material mutation. |
| `src/utils/viewportDisplayController.ts` | Viewport texture/opacity preview, legacy SMF lighting substitution, source assignment restoration, and display cleanup. |
| `src/utils/animationEdits.ts`, `rigEdits.ts`, `rigIk.ts`, `skinWeights.ts`, `skinDiagnostics.ts` | Pure authoring policy, transformations, and raw skin diagnostics with focused unit coverage; animation edits include scoped key operations, clipboard guards, finite boundary-sampled trim, locked-channel protection, and bounded duration/retime transforms; skin history snapshots use keyed indexing for batch comparisons. |
| `src/utils/skinnedVertexPosition.ts`, `src/utils/skinBrushIndex.ts` | Shared world-position and spatial-index contracts for Live, Frozen Current, and Rest / Bind skin-paint sampling; malformed skin data fails closed before brush mutation. |
| `src/utils/animationAuthoringContext.ts` | Pure selected-bone and active-clip guards shared by animation authoring callbacks and focused tests. |
| `src/utils/animationCreation.ts` | Rest/current pose capture, bounded new-clip duration normalization, unique-bone validation, and complete position/quaternion track construction. |
| `src/utils/animationScope.ts` | Bone/Branch/Full Rig resolution and skeleton fingerprints for scoped key authoring and clipboard validation. |
| `src/utils/animationAuthoringController.ts` | Clip creation/CRUD, metadata, trim/retime, locked-bone policy, selected-bone key editing, snap, and animation-history action contract used by `useLoadModel`. |
| `src/utils/skinPointOverlay.ts` | Viewport-only sampled skin-point construction, cached posed-vertex refresh/invalidation, and disposal; runtime source links stay outside serializable `userData`. |
| `src/utils/staticMeshSkinPrep.ts` | Reversible promotion of static meshes to one root-bound skeleton, including original skin-attribute restoration for undo/redo. |
| `src/loaders/*` | SMF/GLB/FBX/OBJ parsing, conversion, diagnostics, coordinate/DQ math, and validated export. |
| `src/loaders/smfSemantics.ts` | Shared relational and finite-value validation for parsed, worker-fallback, and serialized `ImportedSmf` payloads. |
| `src/workers/*` | Runtime-validated SMF worker protocol, client, and worker entry. |
| `src/backend-client/tauri.ts`, `binaryPayload.ts` | Guarded native dialog/read/write adapters, strict native byte normalization, and browser fallbacks. |
| `source/src-tauri/src/main.rs`, `smf_core.rs` | Tauri commands and shared native SMF header/section parsing. Rust owns the native dialogs, authorizes read paths selected by the dialog, bounds blocking reads/writes to 256 MiB, and accepts typed byte payloads for the save command; native validation reports header/offset acceptance only. |
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

- 307 frontend unit tests across 50 discovered unit-test files; `source/frontend/scripts/run-unit-tests.mjs` is the discovery authority.
- Extra arguments after `npm.cmd run test:unit --` are forwarded to the Node/tsx test runner, so focused flags such as `--test-name-pattern` execute only matching cases while still loading the deterministic discovered file set.
- 63 browser cases in eight domain-owned spec files; `npm.cmd run test:e2e:list` from `source/frontend` is the discovery authority.
- 10 Rust tests; the real-SMF native tests require and parse the committed `source/frontend/tests/mixamo_smf_baldguy.smf` fixture instead of silently skipping.
- 24 context groups, including one archived compatibility test route and one archived old-editor reference route. The default orientation remains intentionally narrow; focused generation has a 256 KiB ceiling for the largest active routes.

The latest command results and any environment-only warnings are recorded in `review.md`.

## Current Limits

- SMF has no scale channel in the current dual-quaternion path. Scale edits block SMF export rather than being dropped.
- Non-SMF-to-SMF conversion does not preserve static-only roots, materials/textures in the SMF binary policy, morphs, object-level tracks, multiple skeletons, or scale animation. Mesh transforms and nested deform-bone world poses are baked into the supported single-root contract.
- `.gltf` import currently supports self-contained JSON assets. External buffer, image, and other sidecar URIs are not resolved from a lone picker/drop payload; use `.glb` until resource-bundle import is implemented.
- OBJ import does not resolve a neighboring `.mtl` sidecar and is therefore geometry-focused.
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
