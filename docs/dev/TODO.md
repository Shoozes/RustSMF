# RustSMF TODO

Last reviewed: 2026-07-13 (verified GLB recovery export is current; direct endpoint/TransformControls edits are not mislabeled as IK, and reversible IK posing has an explicit completion contract)

This file is the active backlog. Completed work should stay in:
- `docs/dev/APP_STATE.md` (current state),
- `docs/dev/PITFALL_LEDGER.md` (durable pitfalls),
- `summary_bank.json` (context routing).

## Backlog Format

Each active item should answer:
- What: the concrete outcome.
- Why: the user or engineering risk it addresses.
- Where: primary files or reference areas.
- When: sequencing trigger, dependency, or priority timing.
- How: implementation approach.
- Subtasks: smaller work units that can be completed and tested independently.
- Done when: completion criteria.

## Active Backlog

### P1: Finish precision-editor parity in quad/ortho workflows

- What: Close remaining orthographic/pane affordance gaps for rigging/skinning precision.
- Why: Quad view, labels, endpoint handles, and per-pane rendering are active, but old editor parity still depends on reliable ortho-pane hit behavior and clear precision feedback.
- Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/utils/viewportLayout.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/visual.spec.ts`.
- When: Continue alongside any pointer, camera, pane, or endpoint-editing change.
- How:
  - Keep pane math centralized in `viewportLayout.ts`.
  - Keep model/shared-root continuity unchanged.
  - Add regression tests before changing drag, hover, pane selection, label scaling, or DPR handling.
- Subtasks:
  - Done: add high-DPI/browser-pixel style coverage for fractional CSS coordinates and deterministic pane-boundary hit tests in shared viewport math.
  - Done: add faster single-to-quad-to-single switching tests around selected bone, hover state, endpoint telemetry, and scrub time.
  - Done: add narrow visual coverage proving quad labels/dividers do not overlap the open Display menu panel and do not create horizontal overflow.
  - Done: add browser smoke coverage that clicks each quad pane and asserts the routed `data-viewport-pane-role` for Top/3D/Front/Side hit behavior.
  - Done: expose actual rig click selection telemetry with `data-viewport-picked-bone` and smoke-test that at least one real quad-pane rig-select click mutates selected-bone state.
  - Done: assert quad endpoint drags are pose-mutating `rig-endpoint-drag` interactions routed through the perspective pane.
  - Done: assert quad Skin paint can mutate dirty skin state without changing selected-bone ownership.
  - Done: assert quad Animate `animate-select` can select a bone before keyframe insertion marks animation state dirty.
  - Done: decide Rig Add child and Rig Move are Top/Front/Side pane tools, while perspective remains selection/endpoint-owned unless a later deliberate camera-plane tool owns the gesture.
- Done when: Rapid layout/mode switching in single and quad states never drops bone selection, scrub continuity, endpoint-hover state, or pane labels in e2e.

### P1: Complete viewport click/raycast event parity

- What: Make viewport selection, drag, paint, endpoint, transform, and orbit gestures a single tested interaction contract instead of scattered pointer branches.
- Why: Current viewport bone helper picking, endpoint dragging, and skin-paint ray hits work, but old-editor behavior also relied on explicit ray-sphere node selection, ray-plane movement, click-near keyframe/timeline selection, and predictable left/right/mode-specific clicks. As features accumulate, accidental gesture conflicts are the highest-risk show-floor bug class.
- Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/viewportInteractionRouter.ts`, `source/frontend/src/utils/viewportLayout.ts`, `source/frontend/src/utils/modernSkeletonHelper.ts`, `source/frontend/src/utils/skinPointOverlay.ts`, `source/frontend/src/components/Timeline.tsx`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/visual.spec.ts`, `docs/dev/old_editor_source_map.md`, old refs `docs/references/old-src/scripts/animeditor_perform_actions/animeditor_perform_actions.gml`, `docs/references/old-src/scripts/rigeditor_perform_actions/rigeditor_perform_actions.gml`, `docs/references/old-src/scripts/rigeditor_press_buttons/rigeditor_press_buttons.gml`, and `docs/references/old-src/scripts/skineditor_paint_vertices/skineditor_paint_vertices.gml`.
- When: Before adding more viewport authoring tools.
- How:
  - Extract a small viewport interaction controller or pure hit-contract helper that returns intent: select bone, drag endpoint, paint skin, orbit, context action, or no-op.
  - Preserve current click thresholds and pane-aware camera picking while making precision-mode differences explicit.
  - Treat right-click/pan/context behavior as a first-class decision instead of incidental orbit behavior.
  - Keep skin paint disabled unless a real selected bone and skinned mesh target are present.
- Subtasks:
  - Done: add typed viewport bone-transform edit events for TransformControls and endpoint drags, route them into pose dirty state, and expose endpoint-drag smoke coverage for app-state propagation.
  - Done: add `viewportInteractionRouter.ts` with table-driven owner decisions for Model/Rig/Skin/Animate/Export pointer-down events, unit coverage, and `data-pointer-owner` smoke telemetry.
  - Done: source-map old ray-sphere/ray-plane actions into a click/drag matrix for rig, skin, animate, and model modes in `docs/dev/old_editor_source_map.md`.
  - Done: add model/submodel viewport picking for `model-select` owner, including empty-click clear, right-click context readiness, and Shift/Ctrl multi-select behavior through the shared Outliner selection model.
  - Done: make Skin paint miss rays no-op instead of falling back to the model center, with selected-bone empty-space smoke coverage proving no dirty skin edit is created.
  - Done: add skinned-world brush indexing for active Skin paint queries so posed/animated vertices are not missed before world-space/depth filtering.
  - Done: rename Auto Skin/Auto Paint algorithms to precise canonical ids, keep legacy ids normalized, and make nearest segment vs nearest bone origin genuinely distinct.
  - Done: remove shallow TransformControls pointer-down ownership from `viewportInteractionRouter`; TransformControls now report owner/attached/dragging telemetry separately from pointer owner routing.
  - Done: extract and test the pointer-up click contract so short clicks can select, while drags, long presses, button mismatches, and out-of-pane releases cannot accidentally select.
  - Done: add browser smoke coverage proving Rig-mode left drags and right-drag orbit gestures preserve the selected bone instead of selecting accidentally.
  - Done: add tests that endpoint drags pause/restore TransformControls telemetry, and skin paint does not orbit or change selected bone state.
  - Add a stable browser-level TransformControls handle-drag test if Playwright can target the Three gizmo without brittle screen-coordinate probing.
  - Done: add pointer-cancel cleanup coverage for active endpoint drag and Skin paint gestures.
  - Done: make internal quad pane boundaries deterministic with half-open hit boxes while preserving inclusive outer canvas edges.
  - Done: add broader quad browser coverage for pane-specific pointer role telemetry.
  - Done: add browser coverage that proves a real quad-pane rig-select click mutates selected-bone state through actual picked-bone telemetry.
  - Done: add browser coverage that proves quad endpoint drags mutate pose from the expected perspective pane.
  - Done: add browser coverage that proves quad Skin paint mutates dirty skin state as a `skin-paint` owner path, with helper success requiring dirty-state transition rather than brush telemetry alone.
  - Done: add browser coverage that proves quad Animate selection feeds selected-bone keyframe authoring.
  - Done: add quad/ortho browser coverage for Rig Add child and Rig Move mutations with undo/redo; keep window-up cleanup coverage required for future long-running drag tools.
  - Done: decide Skin pts overlays are display-only, mark them with no-pick metadata, disable their raycast path, and cover that contract in `skinPointOverlay.test.ts`.
- Done when: A table-driven interaction contract and e2e smoke prove each supported click/drag path mutates only the intended state in single, quad, perspective, and ortho contexts.

### P1: Make Animate-mode viewport transforms author keyframes

- What: Route Animate workspace TransformControls and selected-bone viewport edits into the current animation keyframe edit layer instead of mutating bind pose.
- Why: Rig-mode transforms and pose preview now have export tracking, but Animate mode still needs the old editor behavior where moving/rotating a node at the current time updates or creates the selected keyframe.
- Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/AnimatePanel.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/utils/animationEdits.ts`, `source/frontend/tests/smoke.spec.ts`.
- When: Before adding richer animation handles, IK-style movement, or transform-children controls.
- How:
  - Done: add explicit `boneTransformOwner` routing so Rig/Skin transforms are pose-owned, Animate transforms are animation-owned, and View/Export are disabled.
  - Done: extend typed viewport transform edit events with owner metadata and canvas owner/attached/dragging telemetry.
  - Done: upsert selected-bone position/quaternion keys at the current timeline time when Animate owns a transform event, without marking pose edits.
  - Done: record Animate-owned viewport transform edits through the shared animation history snapshot path.
  - Done: detach TransformControls in View/Export and hide View-mode transform buttons so read-only modes cannot mutate bones.
- Done when: Current smoke verifies Rig `pose`, Animate `animation`, and Export `disabled` ownership plus existing animation key undo/redo/export behavior. A direct Playwright drag of the Three TransformControls handle remains a test-hardening follow-up because stable gizmo targeting is not yet available.

### P1: Add app-level authoring undo/redo transactions

- What: Extend undo/redo beyond skin-paint strokes into a shared authoring transaction layer for every model/rig/animation mutation that should be reversible.
- Why: Pose nudges/gizmo/endpoint drags, non-SMF rig rename/reparent/create/move/delete, selected-bone animation key edits, Outliner visibility, and Skin edit snapshots now have toolbar/keyboard history, but the app still needs a current mutator inventory so future authoring surfaces stay reversible or explicitly classified. The old app called `undo_save(...)` for autoskin, set bone influence, insert/delete/detach nodes, IK move, drag node, and local/global rotate actions.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/hooks/poseEdits.ts`, `source/frontend/src/utils/editorHistory.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/utils/animationEdits.ts`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/components/RigPanel.tsx`, `source/frontend/src/components/AnimatePanel.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/native.spec.ts`, old refs `docs/references/old-src/scripts/undo_save/undo_save.gml`, `docs/references/old-src/scripts/undo_load/undo_load.gml`, `docs/references/old-src/scripts/skineditor_press_buttons/skineditor_press_buttons.gml`, `docs/references/old-src/scripts/rigeditor_press_buttons/rigeditor_press_buttons.gml`, and `docs/references/old-src/scripts/animeditor_perform_actions/animeditor_perform_actions.gml`.
- When: Before shipping broader rig/animation authoring as show-ready.
- How:
  - Define typed transaction categories for skin, rig, pose, transform, endpoint, and animation edits.
  - Collapse pointer drags into one transaction per completed drag/stroke instead of one entry per move event.
  - Keep display-only toggles, selection-only changes, playback/scrub state, and canceled saves out of destructive-edit history unless UX intentionally says otherwise.
  - Keep redo invalidation deterministic after any new committed edit.
- Subtasks:
  - Done: mark absolute viewport transform edits as pose edits so SMF-source TransformControls/endpoint changes are not silently lost on export.
  - Done: refuse SMF scale mode in the UI and block recorded non-identity pose scale during SMF export/roundtrip.
  - Done: add `editorHistory.ts` with bounded undo/redo stacks and unit coverage.
  - Done: wrap quick nudges, TransformControls changes, and endpoint drags with before/after pose snapshots that restore Three bone transforms, selected bone, and the SMF pose edit map.
  - Done: add toolbar Undo/Redo plus Ctrl+Z/Ctrl+Y for pose transactions, with generated-skinned smoke coverage.
  - Inventory every current mutator and mark it undoable, selection-only, display-only, or intentionally irreversible.
  - Done: wrap rig rename/reparent/create/delete with reversible snapshots covering skeleton bones, inverses, skin indices, animation tracks, pose edits, selected bone, and selected skin-paint state.
  - Done: wrap Rig Move ortho drags as one reversible rig snapshot transaction instead of one entry per pointer move.
  - Done: add animation key Insert/Update/Delete/Paste undo/redo before clip-level CRUD expands, with shared history snapshots and smoke coverage.
  - Done: fold existing skin paint/Normalize/Auto Skin history into the toolbar/keyboard command surface without losing stroke/batch snapshot behavior.
  - Done: add Outliner visibility undo/redo for individual and bulk visibility transactions through toolbar buttons and Ctrl+Z/Ctrl+Y.
  - Done: add shared chronological ordering across editor, Skin, and Outliner stacks so global toolbar/Ctrl+Z/Ctrl+Y Undo/Redo follows newest transaction order across workspace changes.
  - Keep a physical single-stack history coordinator under consideration only if future mutators need cross-domain transaction grouping beyond the current ordered stack routing.
- Done when: Unit and e2e coverage can perform each mutating authoring action, undo it, redo it, then export/check without stale dirty state, broken skeleton references, or mismatched selected-bone state.

### P2: Add non-SMF rig tool modes

- What: Expand the Rig workspace from form-based rename/reparent/create/delete into explicit tool modes: select, add child, move, rotate, detach-toggle, spin rig, and snap-aware placement.
- Why: The old rig editor supported click-driven node add/move/rotate/detach workflows; RustSMF now has safe non-SMF structural edits plus Select/Add child/Move/Rotate viewport tools with snap-aware placement/movement where applicable, Detach/Connect buttons, and Spin buttons. The remaining work is regression hardening and reusing the proven tool contracts for future movement/animation tools.
- Where: `source/frontend/src/components/RigPanel.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/utils/rigEdits.test.ts`, `source/frontend/tests/smoke.spec.ts`.
- When: After current pose/rig history remains green, and before claiming rig workspace parity beyond safe form edits.
- How:
  - Keep the compact Rig Tool control row and app/editor tool state small until each additional tool is tested.
  - Keep SMF-source structural mutation blocked; non-SMF tools must preserve skeleton validity and skin indices.
  - Keep add-child/move/rotate as Top/Front/Side tools, keep detach/connect and spin as explicit buttons backed by one history transaction, and reuse these contracts for future rig or animation movement tools.
  - Reuse the Rig snap helper/settings shape for future animation movement tools.
- Subtasks:
  - Done: extend `createChildBone` with tested world-position placement so future ortho-pane add tools can create at a projected point without ad hoc skeleton mutation.
  - Done: add typed Rig tool mode state for Select/Add child/Move and keep future rotate/detach/connect/spin out of the UI until their edit contracts are implemented.
  - Done: implement Add child as a Top/Front/Side pane projection under the selected parent, with perspective clicks left selection-only and smoke coverage for create plus undo/redo.
  - Done: implement Move as one undoable Top/Front/Side drag transaction that preserves skeleton buffers and selected skin-paint state.
  - Done: add Rig snap settings and pure snap helpers; apply them to Add child placement and Move drag positions with unit and smoke coverage.
  - Reuse the snap helper/settings pattern when explicit animation movement tools ship.
  - Done: keep perspective-pane Rig Add child clicks selection-only unless endpoint drag or a later deliberate camera-plane tool owns the gesture.
  - Done: add pure rig edit tests for detach/connect that preserve hierarchy, remap skin indices, and reject invalid root/missing/already-attached cases without exposing UI controls yet.
  - Done: harden rig history snapshots so Detach/Connect UI can preserve hierarchy-only bones separately from the deform `skeleton.bones` list.
  - Done: add pure rig edit tests for spin that apply the old 90-degree X/Y/Z button transform, preserve skin indices, refresh skeleton buffers, and reject invalid empty/missing-axis/nonfinite-angle cases without exposing UI controls yet.
  - Done: add shared rig hierarchy display collection and wire Inspector/RigPanel to show detached hierarchy nodes while keeping deform-only edit controls gated to `skeleton.bones`.
  - Done: add Detach/Connect UI for selected non-SMF hierarchy bones with smoke coverage proving detached nodes stay visible/selectable, deform-only controls stay gated, and undo/redo restores deform skeleton membership.
  - Done: add Spin X/Y/Z UI for non-SMF rigs with smoke coverage proving one undoable history transaction.
  - Done: add Rotate as a non-SMF Top/Front/Side drag tool with pure helper coverage and smoke coverage proving one undoable history transaction.
- Done when: Unit tests prove add-child/move/rotate, detach/connect, and spin preserve valid skeleton/skin references; smoke creates, moves, and rotates a child from an ortho pane with undo restoring the previous rig; exposed detach/connect UI keeps affected nodes visible/selectable and commits one undoable transaction; exposed spin UI commits one undoable transaction.

### P2: Complete SMF-aware rig editing parity

- What: Decide and implement the next safe SMF-source rig edit layer, including metadata/name behavior, detach/connect, and mirror/reset helpers.
- Why: Non-SMF rig rename/reparent/create/delete are implemented, but SMF-source edits remain blocked to preserve node-index and head-node export fidelity.
- Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/utils/rigValidation.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/components/RigPanel.tsx`, `source/frontend/tests`, `docs/references/old-src/scripts/rig_*`, `docs/references/old-src/screenshots/`.
- When: After SMF pose/fidelity cleanup or when an SMF-source authoring workflow specifically needs rig metadata edits.
- How:
  - Start with a source-map pass over old rig scripts for detach/connect/mirror/reset semantics.
  - Keep SMF node-index fidelity as the default; add a separate metadata/edit layer only if export can preserve or intentionally rewrite indexes.
  - Add pure validators before UI controls.
- Subtasks:
  - Decide whether SMF-source node names stay display-only, become metadata-only, or rewrite SMF node records.
  - Add detach/head-node compatibility controls only after old-source source-map review.
  - Add mirror/reset helpers only with pure tests for hierarchy and skin/animation safety.
  - Reuse the existing Rig snap helper/settings shape if animation move tools adopt old ray-plane behavior.
- Done when: SMF-source rig controls either remain explicitly blocked with clear UX, or ship with tests proving they cannot corrupt node-index, skin, or animation fidelity.

### P2: Fill global shelf and Outliner action gaps

- What: Bring missing old global shelf/model-list actions into the modern toolbar/outliner where they still make sense.
- Why: Current Outliner has display-only visibility toggles and material color cues, but old editor workflows included select all, hide selected, hide unselected, unhide all, merge same textures, culling, texture repeat/filter, snap-to-grid, and include-textures policy controls.
- Where: `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/Outliner.tsx`, `source/frontend/src/utils/modelOutliner.ts`, `source/frontend/src/utils/textureCompat.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/tests/smoke.spec.ts`, old refs `docs/references/old-src/scripts/common_add_buttons/common_add_buttons.gml` and `docs/references/old-src/scripts/combine_textures/combine_textures.gml`.
- When: After selection/interaction parity is stable enough that submodel selection has a clear target model.
- How:
  - Split display-only actions from export-affecting actions.
  - Keep culling/repeat/filter as viewport/material preview state unless export semantics are explicit.
  - Treat merge-by-texture and include-textures as guarded export/preflight decisions, not silent model mutation.
  - Reuse existing texture diagnostics for warnings and status copy.
- Subtasks:
  - Done: add Outliner multi-select and bulk visibility actions for Select All, Clear, Hide selected, Hide unselected, and Show all, with browser smoke coverage.
  - Decide whether global snap belongs in the toolbar after animation movement tools exist; current snap is scoped to Rig Add child/Move.
  - Decide whether texture repeat/filter toggles are preview-only, persisted metadata, or export-blocking incompatibility.
  - Document merge same textures as either unsupported, preview-only, or a tested conversion pipeline with undo.
- Done when: Each global/outliner action either ships with browser coverage and clear export behavior or remains an explicit TODO with the reason it is deferred.

### P2: Complete workspace transition and continuity coverage

- What: Harden mode/workspace transitions around model-dependent panel state and user feedback timing.
- Why: Skin, Animate, Rig, Export, layout, and Display controls now share one model root; transition timing can regress status, scrub, selection, dirty state, or disabled-control semantics.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/store/index.ts`, `source/frontend/src/components/{SkinPanel,AnimatePanel,ExportPanel,RigPanel,Toolbar}.tsx`, `source/frontend/tests/smoke.spec.ts`.
- When: Expand this before or during each new authoring panel feature.
- How:
  - Keep viewport controls model-aware.
  - Keep shared model root and persistence unchanged.
  - Assert no redundant reloads or stale panel writes during mode changes.
- Subtasks:
  - Add transition assertions around mode + layout continuity for panel visibility, export status, and playback scrub timing.
  - Add negative transition case: no model loaded + mode switch + disabled layout/display controls.
  - Keep existing dirty skin/animation continuity and canceled-save coverage current as panels change.
- Done when: Smoke plus a dedicated transition slice demonstrates no accidental reload, status reset, stale export state, or dirty-edit loss across workspace switches.

### P2: Expand async race contract coverage across all load/export entrypoints

- What: Complete deterministic multi-path coverage proving stale results cannot commit when operations overlap across picker open, file input, drag/drop, and export actions.
- Why: Guards in `useLoadModel` are in place, but dirty authoring state increases the cost of stale writes.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/helpers/smoke-helpers.ts`.
- When: Revisit whenever load/export orchestration, save behavior, or dirty state changes.
- How:
  - Keep native open/load/export overlap coverage in `native.spec.ts`.
  - Keep browser overlap coverage in smoke tests.
  - Add targeted race cases as new authoring state becomes test-addressable.
- Subtasks:
  - Add browser export-overlap assertions if the download/export path becomes fully mockable.
  - Keep shared delayed-read/drop helpers isolated in `smoke-helpers.ts`.
  - Add stale worker-response coverage if SMF import/export is workerized.
- Done when: No stale root, selection, status, error, dirty skin edit, or dirty animation edit writes are visible after a newer operation has started.

### P2: Tighten typed interop boundaries

- What: Reduce remaining production `any` casts and isolate unavoidable library/bridge boundary casts behind typed helpers.
- Why: The current app typechecks, but broad Three.js, Tauri, and TransformControls boundaries make regressions harder to audit as authoring-state grows.
- Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/{glb,fbx,obj}.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/threeDisposal.ts`, `source/frontend/tests`.
- When: Opportunistically when touching loader, bridge, export, or viewport code; before major new authoring surfaces.
- How:
  - Keep error handling on `unknown` and use shared formatting helpers.
  - Use type guards for loaded Three objects and bridge results.
  - Wrap TransformControls attach/listener interop in one local helper with a short type-skew comment.
  - Keep test-only casts separate from production cleanup scope.
- Subtasks:
  - Done: Tauri window/selected-path guards and cached Tauri client.
  - Done: loader clips contract direct; no legacy `root.animations` attach/fallback.
  - Done: unknown-error formatter in `useLoadModel` and typed GLB/FBX skinned-mesh traversal.
  - Done: add `check:production-any` to the frontend and repo verification path so new production `any` casts fail before merge.
  - Re-audit `ThreeViewport.tsx` casts after any TransformControls or endpoint drag refactor.
- Done when: Frontend typecheck and test typecheck pass, and production `as any` use is either eliminated or isolated in named bridge/library boundary helpers.

### P2: Add reversible IK posing only as an explicit rig tool

- What: Add a real chain solver and target handle instead of treating endpoint dragging or TransformControls as IK.
- Why: The current direct-edit tools are useful but do not preserve chain length, solve parent rotations, expose pole/joint constraints, or establish IK-specific history/export behavior.
- Where: a focused `source/frontend/src/utils/rigIk.ts`, `RigPanel.tsx`, `ThreeViewport.tsx`, `useLoadModel.ts`, unit tests, and browser smoke.
- When: After the current direct TransformControls drag test is stable, or when a concrete rig/animation workflow requires chain posing.
- How:
  - Implement a pure CCD or FABRIK solver over cloned transforms with explicit model/world target conversion.
  - Require ordered-chain validation, bounded iterations, tolerance, pole behavior, and per-joint limits before exposing UI.
  - Commit one undoable history transaction per completed IK drag and restore the entire affected chain on cancel/undo.
  - Keep SMF structural edits blocked; classify solved rotations as pose or animation edits through the existing owner path and prove the selected export route preserves them.
  - Add reachable, unreachable, stale-chain, constrained-joint, undo/redo, and export/reimport tests plus a saved visual comparison.
- Done when: A labeled IK tool reaches a bounded target without changing bone lengths, respects pole/joint constraints, cancels and undo/redoes atomically, survives the intended SMF/GLB export path, and has unit, browser, and reviewed visual proof.

### P3: Workerize heavy SMF import/export and large-file progress

- What: Move heavy SMF import/export work off the UI thread and add progress states for large files.
- Why: Current async guards prevent stale commits, but large parsing/export can still block responsiveness as authoring data grows.
- Where: `source/frontend/src/workers/modelWorker.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/*`, `source/frontend/tests`.
- When: After diagnostics and edit-layer shapes stabilize enough to avoid moving unstable contracts into a worker boundary.
- How:
  - Start with SMF import/export using transferable `ArrayBuffer`.
  - Keep desktop/native read/write paths unchanged.
  - Add progress/status messages without changing model state semantics.
- Subtasks:
  - Add worker wrapper for `importSMF` and `exportSMFToBuffer`.
  - Transfer buffers instead of copying.
  - Add generated large-sample tests or a bounded stress fixture if feasible.
  - Keep stale-operation seq guards active across worker responses.
- Done when: Large SMF work does not block the UI thread, and stale worker results cannot overwrite newer model state.

### P2: Maintain launch/task-guard completeness

- What: Keep launch docs, gates, and automation contracts synchronized across `README`, `run.ps1`, `run.bat`, and package scripts.
- Why: Launcher and verification drift can make green local claims misleading.
- Where: `README.md`, `docs/user/README.md`, `docs/dev/APP_STATE.md`, `run.ps1`, `run.bat`, `source/package.json`, `scripts/verify-context-bank.py`, `summary_bank.json`.
- When: Whenever launcher scripts, package scripts, GenEye wrapper behavior, or verification tasks change.
- How:
  - Keep canonical launcher and reduced-coverage direct paths explicit.
  - Keep optional GenEye advisory e2e contract aligned across docs.
  - Run context-bank verification after docs/path changes.
- Subtasks:
  - Review launch contract matrix after any run script edit.
  - Review GenEye-backed and browser-only e2e docs after wrapper changes.
  - Keep `run.ps1 -Task verify` as the documented repo health gate.
- Done when: New launcher/verify edits include matching docs and summary-bank updates with no stale-path references.

### P2: Maintain modular-doc integrity and reduce review debt

- What: Keep summary docs concise, non-duplicative, and aligned with current app state.
- Why: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `source/frontend/tests/README.md`, and `summary_bank.json` are the durable state surfaces for future work.
- Where: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, `source/frontend/tests/README.md`.
- When: After any feature, test, path, or current-state shift.
- How:
  - Keep only active work in TODO.
  - Keep verified current behavior in APP_STATE.
  - Keep repeated failure modes in PITFALL_LEDGER.
  - Keep context paths in summary_bank narrow and validated.
  - Keep the test README coverage-oriented, not a full progress log.
- Subtasks:
  - Remove completed-work narration from TODO after implementation lands.
  - Update APP_STATE only when current behavior changes.
  - Update summary_bank when paths move or feature ownership changes.
  - Run `python scripts/verify-context-bank.py` after any context-bank edit.
- Done when: A quick pass shows no duplicate dated recaps, no stale current-state claims, and no invalid summary-bank paths.

## Notes

- Any new issue not covered by existing tests should be added here before implementation.
- Keep old-source research factual: cite scripts/screenshots when converting reference behavior into work.
- For doc/path/group drift prevention, run `python scripts/verify-context-bank.py` after any `TODO`, `APP_STATE`, or `summary_bank.json` edit.
