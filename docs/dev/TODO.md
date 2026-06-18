# RustSMF TODO

Last reviewed: 2026-06-18

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

### P1: Build an old-editor parity source map

- What: Produce a focused implementation map from old GameMaker scripts/screenshots to RustSMF features before deeper authoring work starts.
- Why: The old source has working behavior spread across `objects`, `scripts`, screenshots, and legacy SMF docs; implementing from screenshots alone risks missing data-model rules.
- Where: `docs/references/old-src/screenshots/README.md`, `docs/references/old-src/scripts`, `docs/references/old-src/objects/oAnimEditSystem`, `docs/references/Old SMF Documentation v1.pdf`, `docs/references/old-src/issues.md`, `docs/dev/TODO.md`.
- When: Do this before implementing skin paint or keyframe authoring beyond the current preview/playback features.
- How:
  - Map old script families to modern subsystems: `skineditor_*`, `animeditor_*`, `rigeditor_*`, `common_add_buttons`, viewport draw/step logic, and SMF import/export helpers.
  - Capture only behavior needed for current RustSMF goals; do not recreate old GameMaker chrome verbatim.
  - Record ambiguous or format-risky findings in `PITFALL_LEDGER.md` only when they represent repeatable hazards.
- Subtasks:
  - Inventory skin paint scripts and classify brush, selection, weight-normalization, autoskin, and UI-only behavior.
  - Inventory animation scripts and classify clip list, keyframe grid, interpolation, copy/paste, sample-strip, and export behavior.
  - Inventory viewport settings and classify display-only toggles versus data-mutating commands.
  - Cross-check old screenshots against current RustSMF state and update stale comparison text.
- Acceptance: A compact source map exists in docs or TODO notes, and each large implementation item below names the old scripts it depends on.

### P1: Implement skin-weight edit data model

- What: Add an internal skin-edit state model that can safely represent per-vertex selected-bone weight edits without immediately corrupting imported source data.
- Why: Current RustSMF only previews selected-bone weights; real weight paint needs deterministic mutation, normalization, undo-ready dirty state, and export gating.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/store/index.ts`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/tests`.
- When: After the old-editor skin source map identifies the required normalization and paint semantics; before adding brush UI.
- How:
  - Represent editable skin weights separately from loaded SMF/GLB source data until an explicit apply/export path.
  - Normalize affected vertex weights and enforce the current four-bone influence limit.
  - Keep display preview and export serialization paths explicit so unsupported edits fail loudly.
- Subtasks:
  - Define a typed `SkinEditState` with selected bone, dirty mesh ids, edited vertex weights, and source format.
  - Extract pure helpers for read/edit/normalize selected-bone weight slots.
  - Add unit tests for add, subtract, set, clamp, normalize, no-selected-bone, and missing-skin-attribute cases.
  - Add export-gate tests proving unsupported edited weights cannot silently disappear.
- Acceptance: Unit tests prove edited weights normalize deterministically and no export path silently drops dirty skin edits.

### P1: Implement skin paint viewport interaction

- What: Add actual viewport skin painting: selected-bone prerequisite, brush hover, set/add/subtract modes, radius/strength/influence controls, and live preview updates.
- Why: Old Skinning mode is a core authoring workflow; current “Show Weights” only visualizes data and does not modify it.
- Where: `source/frontend/src/components/SkinPanel.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/tests/smoke.spec.ts`, `docs/references/old-src/scripts/skineditor_*`, `docs/references/old-src/screenshots/smf_editor_skinning_tab.png`, `docs/references/old-src/screenshots/smf_editor_skinning_painting.png`.
- When: After `SkinEditState` exists and has pure helper tests.
- How:
  - Use raycast hits on skinned geometry to find paint targets.
  - Display brush hover only in Skin mode and only on paintable meshes.
  - Require selected bone before modifying weights; show clear disabled/status behavior otherwise.
  - Reuse weight preview colors after each edit so user feedback matches exported data.
- Subtasks:
  - Add SkinPanel controls for paint mode: set, add, subtract.
  - Add numeric controls for radius, strength, and target influence.
  - Add viewport brush marker and hit telemetry for tests.
  - Add Playwright coverage: select bone -> enable paint -> paint -> preview changes -> export status reflects dirty skin edits.
  - Add a negative Playwright case: no bone selected -> brush visible but paint disabled/status explains why.
- Acceptance: A selected bone can paint deterministic weights in the viewport, the preview updates, and tests cover both enabled and blocked paint paths.

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
  - Define typed editable clip/keyframe state with current clip, selected keyframe, selected bone, and dirty flag.
  - Implement pure helpers for insert/update/delete selected-bone pos/rot keyframes.
  - Implement conversion helpers between editable state and Three `VectorKeyframeTrack` / `QuaternionKeyframeTrack`.
  - Add unit tests for keyframe insertion order, replacement, deletion guard, interpolation metadata, and zero-duration safety.
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
  - Add selected-clip/keyframe display in AnimatePanel.
  - Add timeline keyframe markers with deterministic test ids.
  - Add Insert/Update/Delete/Copy/Paste controls.
  - Add interpolation controls for supported modes.
  - Add Playwright coverage for insert -> scrub -> update -> export status.
- Acceptance: A user can create or edit a selected-bone pos/rot keyframe, scrub to it, see it on the timeline, and export supported edited animation data without silent loss.

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
  - Add edge-case tests for small canvases and high-DPR rendering.
  - Add fast single-to-quad-to-single switching tests around selected bone, hover state, endpoint telemetry, and scrub time.
  - Add visual checks that quad labels/dividers do not overlap tool overlays at narrow widths.
  - Decide whether ortho panes should support all bone selection/edit actions or a deliberate subset.
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
  - Add grid/axes visibility toggles.
  - Add material/texture visibility override that does not mutate source materials.
  - Add rig opacity/thickness controls where Three allows reliable visual feedback.
  - Add node label/index visibility controls that reuse existing bone label infrastructure.
  - Add submodel visibility support through Outliner once model submesh ids are stable.
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
  - Add dirty-state continuity cases once skin edits and animation edits exist.
  - Add export/status preservation cases for dirty skin/animation state.
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
  - Add stale-load protection cases for dirty skin/animation edit state once those states exist.
  - Add canceled-save status assertions for edited model states.
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
  - Replace Tauri dialog selected-path casts with a typed parser and unit or native mock coverage.
  - Replace repeated loader root animation casts with a shared typed helper.
  - Re-audit `ThreeViewport.tsx` casts after any TransformControls or endpoint drag refactor.
  - Add a grep check or review note so new production `as any` casts are justified at boundary points.
- Acceptance: Frontend typecheck and test typecheck pass, and production `as any` use is either eliminated or isolated in named bridge/library boundary helpers.

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
