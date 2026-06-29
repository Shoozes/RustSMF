# RustSMF TODO

Last reviewed: 2026-06-29 (skin autoskin/normalize batch tools)

This file is the active backlog. Completed work should stay in:
- `docs/dev/APP_STATE.md` (current state),
- `docs/dev/PITFALL_LEDGER.md` (durable pitfalls),
- `summary_bank.json` (group registry).

## Backlog Format

Each active item should answer:
- What: the concrete outcome.
- Why: the user or engineering risk it addresses.
- Where: primary files or reference areas.
- When: sequencing trigger, dependency, or priority timing.
- How: implementation approach.
- Subtasks: smaller work units that can be completed and tested independently.
- Acceptance: done criteria.

## Active Backlog

### Completed

Source-map parity foundation is captured in `docs/dev/old_editor_source_map.md`. Skin paint data/viewport/export wiring is now current app state; remaining skin work belongs to deeper precision items below.

### P1: Implement skin-weight edit data model

- What: Add an internal skin-edit state model that can safely represent per-vertex selected-bone weight edits without immediately corrupting imported source data.
- Why: Current RustSMF only previews selected-bone weights; real weight paint needs deterministic mutation, normalization, undo-ready dirty state, and export gating.
- Where: `source/frontend/src/utils/skinWeights.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/store/index.ts`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/tests`.
- When: After the old-editor skin source map identifies the required normalization and paint semantics; before adding brush UI.
- How:
  - Represent editable skin weights separately from loaded SMF/GLB source data until an explicit apply/export path.
  - Normalize affected vertex weights and enforce the current four-bone influence limit.
  - Keep display preview and export serialization paths explicit so unsupported edits fail loudly.
- Subtasks:
  - Done: define typed `SkinEditState` with selected bone, dirty mesh ids, edited vertex weights, and source format in `skinWeights.ts`.
  - Done: extract pure helpers for read/edit/normalize selected-bone weight slots and reuse the reader in weight preview.
  - Done: add unit tests for add, subtract, set, clamp, normalize, invalid bone/vertex, and missing-skin-attribute cases in `skinWeights.test.ts`.
  - Done: wire `SkinEditState` into `useLoadModel`/panels so dirty state is visible and survives workspace switches.
  - Done: serialize dirty skin edits into supported SMF export paths and show a block reason for unsupported dirty states.
  - Done: add dirty-state continuity and canceled-save coverage in Playwright native/browser tests.
- Acceptance: Unit tests prove edited weights normalize deterministically and no export path silently drops dirty skin edits.

### P2: Extend skin paint parity beyond first authoring path

- What: Add the remaining old-editor skinning behaviors after the first selected-bone set/add/subtract paint path.
- Why: The app can now paint and export supported dirty weights, but old Skinning mode also had autoskin, normalize/single-paint variants, and undo-oriented transactional safety.
- Where: `source/frontend/src/components/SkinPanel.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/tests/smoke.spec.ts`, `docs/references/old-src/scripts/skineditor_*`, `docs/references/old-src/screenshots/smf_editor_skinning_tab.png`, `docs/references/old-src/screenshots/smf_editor_skinning_painting.png`.
- When: After the current paint/export path stays stable under e2e and before claiming full old-editor skinning parity.
- How:
  - Keep the existing selected-bone gating and dirty export serialization.
  - Add autoskin/normalize behavior only with pure helper tests first.
  - Add undo/redo or equivalent transactional checkpoints before adding broader paint tools.
- Subtasks:
  - Done: SkinPanel controls for set/add/subtract, radius, strength, and target influence.
  - Done: viewport brush marker/hit telemetry with selected-bone prerequisite.
  - Done: Playwright coverage for no-bone blocked paint, enabled paint, workspace continuity, and supported SMF export.
  - Done: add pure autoskin and normalize helpers based on old `skineditor_*` scripts, exposed as undo-safe full-model Skin workspace actions.
  - Done: add undo/redo checkpointing for skin paint edits, including touched-vertex snapshot restore and redo invalidation after new strokes.
- Acceptance: Remaining skin tools match documented old-source semantics, are undo-safe, and cannot silently drop dirty edits on export.

### P1: Implement animation edit data model

- What: Add an editable clip/keyframe model for selected-bone position and rotation tracks.
- Why: Current Timeline drives imported clips, but old Animation mode authored keyframes. Editing live pose without an animation edit model cannot safely become exported keyframes.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/store/index.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/components/AnimatePanel.tsx`, `source/frontend/src/components/Timeline.tsx`, `docs/references/old-src/scripts/animeditor_*`, `docs/references/old-src/scripts/smf_anim`.
- When: After old animation keyframe-grid semantics are mapped; before building timeline UI controls.
- How:
  - Maintain editable clip state separate from loaded `THREE.AnimationClip` until committed.
  - Support position/quaternion tracks first; keep scale/material/morph/object tracks blocked or GLB-only.
  - Preserve existing playback/scrub behavior while allowing dirty keyframes to drive the mixer.
- Subtasks:
  - Done: define typed editable clip/keyframe state with current clip, selected keyframe, selected bone, clipboard, interpolation, and dirty clip tracking.
  - Done: implement pure helpers for insert/update/delete/copy/paste selected-bone pos/rot keyframes.
  - Done: implement conversion helpers between editable state and Three `VectorKeyframeTrack` / `QuaternionKeyframeTrack`, plus SMF-source animation patching for dirty clips.
  - Done: add unit tests for keyframe insertion order, replacement, deletion guard, interpolation metadata, zero-duration safety, edited clip conversion, and SMF-source patching.
- Acceptance: Tests prove selected-bone pos/rot keyframes can be edited and converted to runtime/export tracks without changing unsupported channels.

### P1: Implement timeline/keyframe authoring UI

- What: Add user-facing keyframe authoring controls and a timeline surface beyond play/scrub.
- Why: Old Animation mode included colored keyframe strips, insert/edit/delete/copy/paste, interpolation, frame multiplier, clip list editing, and selected-node transform actions.
- Where: `source/frontend/src/components/Timeline.tsx`, `source/frontend/src/components/AnimatePanel.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/index.css`, `source/frontend/tests/smoke.spec.ts`, `docs/references/old-src/screenshots/smf_editor_animation_tab.png`.
- When: After editable animation state and conversion helpers exist.
- How:
  - Keep playback controls intact.
  - Add compact keyframe lane UI for selected clip and selected bone.
  - Start with insert/update/delete/copy/paste for selected-bone pos/rot only.
  - Expose interpolation only where SMF/Three export behavior is defined.
- Subtasks:
  - Done: add selected-clip/keyframe display in AnimatePanel for imported clip summaries.
  - Done: add timeline keyframe markers with deterministic test ids for imported clip/scrub preview.
  - Done: add Insert/Update/Delete/Copy/Paste controls.
  - Done: add interpolation controls for supported modes.
  - Done: add Playwright coverage for insert -> scrub -> update -> SMF roundtrip status on the supported generated-skinned export path.
- Acceptance: A user can create or edit a selected-bone pos/rot keyframe, scrub to it, see it on the timeline, and export supported edited animation data without silent loss.
  - Note: real imported SMF samples can still report strict pose-delta roundtrip mismatches before and after animation edits; that belongs to the export cockpit/SMF pose diagnostics item below rather than the keyframe UI.

### P1: Expand export cockpit reports beyond first roundtrip check

- What: Extend the current Export workspace diagnostics, in-memory roundtrip check, and saved report into a fuller compatibility cockpit with richer comparisons.
- Why: SMF export is the product boundary; users should know exactly why export is safe, warning-only, or blocked before committing files.
- Where: `source/frontend/src/components/ExportPanel.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/tests`.
- When: After first-pass diagnostics and count-based roundtrip check are stable; before claiming release-level SMF compatibility UX.
- How:
  - Keep `smfDiagnostics.ts` as the structured report owner.
  - Continue exporting to memory and reimporting before optional save.
  - Expand comparisons from summary counts into bounds, first-frame pose sanity, and targeted mismatch details.
  - Keep GLB export unchanged for full-fidelity paths.
- Subtasks:
  - Done: add bounds and first/last-frame pose sanity checks to the existing "Run SMF Check" action.
  - Done: render structured roundtrip check rows for count, geometry, bounds, animation timing, animation metadata, and animation pose results instead of relying only on status text.
  - Done: add blocked-export and warning-only diagnostics result cases to the Export workspace e2e coverage.
  - Done: add report serialization tests for the expanded diagnostics/roundtrip JSON shape.
- Acceptance: Export workspace can distinguish count, bounds, and pose mismatches without relying only on status text.
  - Note: real imported SMF samples can still surface strict pose-delta failures; the cockpit now classifies those failures, but root-cause SMF pose conversion cleanup remains separate compatibility work.

### P2: Implement rig editing and validation

- What: Add real rig editing commands: rename, create, delete, reparent, detach/connect, mirror/reset helpers, and hierarchy validation.
- Why: SMF rigs are node-based, disconnected/head nodes matter, and rig edits can invalidate skin weights or animation tracks if not validated.
- Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/components/RigPanel.tsx`, `source/frontend/src/hooks/rigEdits.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests`.
- When: After skin edit state or alongside animation authoring only when validation/undo boundaries are explicit.
- How:
  - Keep rig edits in a non-destructive edit layer before export.
  - Rebuild or patch the Three skeleton through tested helpers.
  - Validate cycles, orphan bones, self-parent roots, missing bind targets, and skin indices pointing at deleted bones.
- Subtasks:
  - Add a RigPanel for rename/reparent/create/delete commands.
  - Add pure validators for cycles, orphaned nodes, and invalid skin references.
  - Add detach/head-node compatibility controls only after old-source source-map review.
  - Add unit tests for hierarchy validation and e2e for create child -> transform -> export/reimport.
- Acceptance: Rig edits cannot create cyclic or silently invalid SMF output, and unsupported cases produce actionable diagnostics.

### P2: Add texture and material compatibility diagnostics

- What: Add material/texture inspection for SMF export: texture source, resolution, power-of-two status, one-texture-per-mesh constraints, and split/block guidance.
- Why: GLB can preserve richer material graphs, while SMF compatibility needs explicit texture limits and clear user choices.
- Where: `source/frontend/src/components/ExportPanel.tsx`, `source/frontend/src/components/TexturePanel.tsx`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/utils/textureCompat.ts`, `source/frontend/tests`.
- When: After export diagnostics and before broad release packaging or material-heavy sample validation.
- How:
  - Extend diagnostics with material/texture warnings and errors.
  - Keep GLB export untouched.
  - Only add split-by-material export after diagnostics identify stable mesh/material ids.
- Subtasks:
  - Done: add power-of-two texture helper tests.
  - Done: detect multiple material slots and multiple texture maps on SMF-target meshes.
  - Done: surface material/texture warnings in structured SMF diagnostics without blocking GLB export.
  - Show texture names/resolution/source in a compact panel if diagnostics need more than the Export cockpit list.
  - Decide whether unsupported material layouts should remain warning-only, block SMF export, or offer split/export action.
- Acceptance: Material-heavy models produce clear SMF compatibility guidance, and GLB remains the recommended full-fidelity path.

### P1: Finish precision-editor parity in quad/ortho workflows

- What: Close remaining orthographic/pane affordance gaps for rigging/skinning precision.
- Why: Quad view, labels, endpoint handles, and per-pane rendering are active, but old editor parity still depends on reliable ortho-pane hit behavior and clear precision feedback.
- Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/utils/viewportLayout.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/visual.spec.ts`.
- When: Continue alongside skin/animation work whenever pointer interaction or quad rendering changes.
- How:
  - Keep pane math in `viewportLayout.ts`.
  - Keep model/shared-root continuity unchanged.
  - Add regression tests before changing drag, hover, pane selection, or label scaling.
- Subtasks:
  - Done: add edge-case unit coverage that tiny ortho panes stay finite and pickable.
  - Done: add single-view Ortho camera toggle smoke coverage with a loaded SMF render assertion.
  - Done: add visual coverage for loaded Display menu + single-view Ortho render without horizontal overflow.
  - Add high-DPR/browser-pixel coverage if renderer sizing or canvas pixel ratio logic changes.
  - Add faster single-to-quad-to-single switching tests around selected bone, hover state, endpoint telemetry, and scrub time.
  - Add visual checks that quad labels/dividers do not overlap tool overlays at narrow widths beyond the current loaded/narrow shell checks.
  - Decide whether ortho panes should support all bone selection/edit actions or a deliberate subset.
- Recent progress: Larger old-editor-like diamond/joint skeleton helpers are implemented through `modernSkeletonHelper.ts`, with helper mesh hit mapping before the distance-picker fallback.
- Acceptance: Rapid layout/mode switching in single and quad states never drops bone selection, scrub continuity, endpoint-hover state, or pane labels in e2e.

### P2: Adapt old viewport/settings shelf controls

- What: Round out old editor display toggles after the first modern wireframe setting.
- Why: Old screenshots show useful display controls beyond wireframe: texture visibility, grid, shader, draw node indices, perspective, node opacity, rig opacity/thickness, and submodel visibility/color cues.
- Where: `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/Outliner.tsx`, `source/frontend/src/index.css`, `source/frontend/tests/smoke.spec.ts`, `docs/references/old-src/scripts/common_add_buttons`, `docs/references/old-src/objects/oAnimEditSystem/Draw_0.gml`.
- When: After wireframe is stable; before deep visual QA or release-style editor parity claims.
- How:
  - Keep toggles display-only unless explicitly named as data-mutating.
  - Prefer compact controls over recreating the old left shelf wholesale.
  - Add DOM state assertions plus tolerant viewport screenshots.
- Subtasks:
  - Done: add grid/axes visibility toggles.
  - Done: add material/texture visibility override that does not mutate source materials.
  - Done: add rig opacity/thickness controls where Three allows reliable visual feedback.
  - Done: add node label/index visibility controls that reuse existing bone label infrastructure.
  - Done: group file actions, workspace tabs, layout/camera controls, and secondary display toggles into a compact toolbar/Display menu.
  - Done: add submodel visibility support through Outliner once model submesh ids are stable.
- Acceptance: Core old-editor display affordances can be toggled independently, remain disabled before model load where appropriate, and are covered by smoke tests.

### P2: Complete workspace transition and continuity coverage

- What: Harden mode/workspace transitions around model-dependent panel state and user feedback timing.
- Why: `App` state plumbing is stable, but transition timing is a high-risk area for subtle UX regressions as Skin and Animate become authoring surfaces.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/store/index.ts`, `source/frontend/src/components/{SkinPanel,AnimatePanel,ExportPanel}.tsx`, `source/frontend/tests/smoke.spec.ts`.
- When: Expand this before or during each new authoring panel feature.
- How:
  - Keep viewport controls model-aware.
  - Keep shared model root/persistence unchanged.
  - Assert no redundant reloads or stale panel writes during mode changes.
- Subtasks:
  - Add transition assertions around mode + layout continuity for panel visibility, export status, and playback scrub timing.
  - Add negative transition case: no model loaded + mode switch + disabled layout/display controls.
  - Done: add dirty-state continuity cases once skin edits and animation edits exist.
  - Done: add export/status preservation cases for dirty skin/animation state.
- Acceptance: Smoke plus a dedicated transition suite demonstrates no accidental reload, status reset, stale export state, or dirty-edit loss across workspace switches.

### P2: Expand async race contract coverage across all load entrypoints

- What: Complete deterministic multi-path coverage proving stale results cannot commit when operations overlap across picker open, file input, drag/drop, and export actions.
- Why: Guards in `useLoadModel` are in place, but new dirty authoring state will increase the cost of stale writes.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/helpers/smoke-helpers.ts`.
- When: Before adding skin/animation dirty state to export flows, and again whenever load/export orchestration changes.
- How:
  - Keep native open/load/export overlap coverage in `native.spec.ts`.
  - Keep browser overlap coverage in smoke tests.
  - Add targeted race cases as new authoring state becomes test-addressable.
- Subtasks:
  - Add browser export-overlap assertions if the download/export path becomes fully mockable.
  - Done: added browser race coverage that verifies stale dirty pose edits are cleared when an older `.smf` load is overtaken by drag/drop `.fbx` load (`tests/smoke.spec.ts`).
  - Done: added browser race coverage that verifies skin-dirty state and selected bone are cleared when a delayed `.smf` input load is overtaken by a drag/drop `.fbx` load (`tests/smoke.spec.ts`).
  - Done: added native e2e assertion that skin edits stay dirty across canceled SMF export save (`tests/native.spec.ts`).
  - Done: added pose-edit continuity coverage via `pose-edit` dirty state and canceled SMF save (`tests/native.spec.ts`).
  - Done: added authored animation key dirty-state coverage across canceled native SMF export save (`tests/native.spec.ts`).
  - Keep shared delayed-read/drop helpers isolated in `smoke-helpers.ts`.
- Acceptance: No stale root, selection, status, error, dirty skin edit, or dirty animation edit writes are visible after a newer operation has started.

### P2: Tighten typed interop boundaries

- What: Reduce remaining production `as any` casts and isolate unavoidable library/bridge boundary casts behind typed helpers.
- Why: The current app typechecks, but authoring-state growth will make loose Tauri dialog, loader animation, and TransformControls boundaries harder to audit.
- Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/{glb,fbx,obj}.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests`.
- When: Before adding dirty skin/animation authoring state to load/export paths, or opportunistically when touching those files.
- How:
  - Add narrow type guards for Tauri selected file results instead of direct bridge casts.
  - Introduce a small `Object3DWithAnimations` helper/type for loader roots and animation extraction.
  - Wrap TransformControls attach/add interop in one local helper with a comment that explains the Three.js type skew.
  - Keep test-only casts separate from production cleanup scope.
- Subtasks:
  - Replace Tauri dialog selected-path casts with a typed parser and unit or native mock coverage. (2026-06-18 review: added TauriWindow interface + get path helper + isTauriEnv typed.)
  - Replace repeated loader root animation casts with a shared typed helper. (2026-06-18: removed legacy (root as any).animations = attaches in glb/fbx/smf/obj + (root as any) fallback in useLoadModel; rely on returned .clips consistently.)
  - Re-audit `ThreeViewport.tsx` casts after any TransformControls or endpoint drag refactor.
  - Add a grep check or review note so new production `as any` casts are justified at boundary points.
- Acceptance: Frontend typecheck and test typecheck pass, and production `as any` use is either eliminated or isolated in named bridge/library boundary helpers.
- Recent: 2026-06-18 review pass + opportunistic tighten: Tauri window/selected guarded, loader clips contract direct, tauri client cached for repeated call timing. Remaining boundary casts (TransformControls, three materials/userData, test polyfills, obj read anims) are documented.

### P2: Promote Rust SMF parser core beyond peeks

- What: Move Rust SMF handling from desktop peek helpers toward a small canonical parser module that returns structured header and section summaries.
- Why: The desktop app already uses Rust for file IO/status peeks; a focused parser core improves error quality and future native confidence without porting the full Three visual loader at once.
- Where: `source/src-tauri/src/main.rs`, `source/src-tauri/src/smf_core.rs`, `source/src-tauri/Cargo.toml`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/tests/native.spec.ts`.
- When: After export diagnostics are stable and before packaging the app as a serious desktop compatibility tool.
- How:
  - First move header parsing and offset bounds into `smf_core.rs`.
  - Keep TS loader as the visual/Three owner.
  - Add Rust unit tests for malformed offset, missing null, non-SMF header, and valid sample.
- Subtasks:
  - Extract current Rust parse helpers into `smf_core.rs`.
  - Return a typed `SmfParsedSummary` from desktop info commands.
  - Keep Playwright native mocks aligned with Rust field widths and offsets.
  - Defer full parse/export port until parity tests are stronger.
- Acceptance: Rust parser core rejects malformed headers with bounded errors and existing desktop status behavior stays compatible.

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
- Acceptance: Large SMF work does not block the UI thread, and stale worker results cannot overwrite newer model state.

### P2: Maintain launch/task-guard completeness

- What: Keep launch docs, gates, and automation contracts synchronized across `README`, `run.ps1`, `run.bat`, and `source/package.json`.
- Why: `docs__state_backlog` and `subsystem__harness_and_context` rely on docs correctness to prevent onboarding and verification drift.
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
- Acceptance: New launcher/verify edits include matching docs and summary-bank updates with no stale-path references.

### P2: Maintain modular-doc integrity and reduce review debt

- What: Keep summary docs concise, non-duplicative, and aligned with current app state.
- Why: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json` are the main durable state surfaces.
- Where: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, `source/frontend/tests/README.md`.
- When: After any feature, test, path, or current-state shift.
- How:
  - Keep only active work in TODO.
  - Keep verified current behavior in APP_STATE.
  - Keep repeated failure modes in PITFALL_LEDGER.
  - Keep context paths in summary_bank narrow and validated.
- Subtasks:
  - Remove completed-work narration from TODO after implementation lands.
  - Update APP_STATE only when current behavior changes.
  - Update summary_bank when paths move or feature ownership changes.
  - Run `python scripts/verify-context-bank.py` after any context-bank edit.
- Acceptance: A quick pass shows no duplicate dated recaps, no stale current-state claims, and no invalid summary-bank paths.

## Notes

- Any new issue not covered by existing tests should be added here before implementation.
- Keep old-source research factual: cite scripts/screenshots when converting reference behavior into work.
- For doc/path/group drift prevention, run `python scripts/verify-context-bank.py` after any `TODO`, `APP_STATE`, or `summary_bank.json` edit.
