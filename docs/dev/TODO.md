# RustSMF TODO

Last reviewed: 2026-06-30 (display parity and diagnostics cleanup)

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
- Acceptance: done criteria.

## Active Backlog

### P1: Resolve strict SMF pose roundtrip mismatches

- What: Root-cause and reduce strict first/last-frame pose-delta mismatches reported by the Export workspace for real imported SMF samples.
- Why: The export cockpit now classifies pose failures, but release confidence depends on knowing whether remaining deltas are conversion tolerance, source ambiguity, or a real coordinate/DQ bug.
- Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/loaders/coord.test.ts`, `source/frontend/tests/smoke.spec.ts`, real SMF fixtures under `docs/references/old-src/datafiles/SMF/`.
- When: Before claiming release-level SMF animation fidelity or widening SMF export claims beyond current diagnostics.
- How:
  - Build a focused fixture matrix for one passing generated skinned path and one failing real SMF path.
  - Compare bind pose, inverse bind, parent transforms, DQ normalization, frame endpoint sampling, and coordinate swizzles.
  - Keep diagnostics honest while tightening math; do not relax thresholds without evidence.
- Subtasks:
  - Done: guard `dqNormalize` so zero/NaN/Infinity rotation parts fall back to identity and unit tests prove finite output.
  - Done: add bounded worst-pose-delta details to the roundtrip report and Export workspace, including animation/frame/bone, parent/isBone parity, and per-component deltas.
  - Add one regression fixture/assertion for a known real-sample mismatch once root cause is isolated.
  - Update the pitfall ledger only if the investigation finds a repeated conversion hazard.
- Acceptance: A failing real-sample pose check is either fixed with a regression test or documented as a deliberate unsupported/tolerance-bound case with specific diagnostics.

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
  - Add high-DPR/browser-pixel coverage if renderer sizing or canvas pixel-ratio logic changes.
  - Add faster single-to-quad-to-single switching tests around selected bone, hover state, endpoint telemetry, and scrub time.
  - Add visual checks that quad labels/dividers do not overlap tool overlays at narrow widths beyond the current loaded/narrow shell checks.
  - Decide whether ortho panes should support all bone selection/edit actions or a deliberate subset.
- Acceptance: Rapid layout/mode switching in single and quad states never drops bone selection, scrub continuity, endpoint-hover state, or pane labels in e2e.

### P1: Add viewport-only legacy SMF shader/display parity

- What: Keep legacy SMF display parity current without mutating export materials.
- Why: The old editor's shader/display shelf included lit SMF viewport materials, skinning-point feedback, and selection overlays; RustSMF now has viewport-only implementations for the first two, but selection overlay parity is still incomplete.
- Where: `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/legacySmfLighting.ts`, `source/frontend/src/utils/skinPointOverlay.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/visual.spec.ts`, old shader refs under `docs/references/old-src/shaders/`.
- When: After DQ safety and source-map cleanup; before claiming old-editor display parity.
- How:
  - Port behavior, not GameMaker shader code, into Three-compatible viewport-only materials/overlays.
  - Keep generated display materials backed up/restored/disposed separately from loaded model/export state.
  - Treat the old DQ shader as a CPU/math oracle for SMF correctness before attempting any GPU skinning replacement.
- Subtasks:
  - Done: replace the old `Flat` label with a `Legacy` display toggle backed by viewport-only material clones.
  - Done: add `legacySmfLighting.ts` for diffuse/specular/rim display using current Three geometry, UVs, maps, and skinning.
  - Done: add smoke coverage that toggles legacy mode and verifies `data-shader-mode="legacy-smf"` with nonblank render coverage.
  - Done: add `skinPointOverlay.ts` and a Display-menu `Skin pts` toggle for skinned vertex points colored by selected-bone influence.
  - Add selection overlay parity inspired by `docs/references/old-src/shaders/sh_selection`.
  - Reference old `sh_smf_animate`, `sh_smf_static`, `sh_grid`, `sh_skinning_points`, and `sh_selection` while preserving GLB/SMF export material fidelity.
- Acceptance: Legacy display mode remains visibly distinct from flat shading, restores original materials on disable/export, and selection overlay parity has browser visual coverage.

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
- Acceptance: SMF-source rig controls either remain explicitly blocked with clear UX, or ship with tests proving they cannot corrupt node-index, skin, or animation fidelity.

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
- Acceptance: Smoke plus a dedicated transition slice demonstrates no accidental reload, status reset, stale export state, or dirty-edit loss across workspace switches.

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
- Acceptance: No stale root, selection, status, error, dirty skin edit, or dirty animation edit writes are visible after a newer operation has started.

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
- Acceptance: Frontend typecheck and test typecheck pass, and production `as any` use is either eliminated or isolated in named bridge/library boundary helpers.

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
- Acceptance: New launcher/verify edits include matching docs and summary-bank updates with no stale-path references.

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
- Acceptance: A quick pass shows no duplicate dated recaps, no stale current-state claims, and no invalid summary-bank paths.

## Notes

- Any new issue not covered by existing tests should be added here before implementation.
- Keep old-source research factual: cite scripts/screenshots when converting reference behavior into work.
- For doc/path/group drift prevention, run `python scripts/verify-context-bank.py` after any `TODO`, `APP_STATE`, or `summary_bank.json` edit.
