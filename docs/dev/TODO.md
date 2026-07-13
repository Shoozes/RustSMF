# RustSMF TODO

Last reviewed: 2026-07-13. Completed P1 precision, interaction, TransformControls, Animate ownership, authoring-history, and non-SMF Rig-tool work now lives in `APP_STATE.md`, `PITFALL_LEDGER.md`, and `source/frontend/tests/README.md`.

This file contains executable work only. Every task must identify What, Why, Where, When, How, Subtasks, Done when, and Verification.

## Active Backlog

### P2: Complete SMF-aware rig editing parity

- What: Decide and implement the safe SMF-source metadata/edit layer for rename, detach/connect, mirror, and reset behavior.
- Why: Existing-node pose rotations export safely, but structural or metadata mutations can corrupt indexed nodes, skipped head dummies, skin indices, or animation targets.
- Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/utils/rigValidation.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/components/RigPanel.tsx`, real SMF/head-node fixtures, and old Rig scripts/screenshots.
- When: Next format-authoring slice; complete before exposing another SMF Rig control.
- How: Preserve indexed identity by default, source-map old semantics, add pure validators/helpers first, and require import/export/reimport evidence before enabling UI.
- Subtasks:
  - Classify SMF names as display-only metadata, writable node records, or unsupported, with the exact export consequence.
  - Source-map old detach/connect, mirror, and reset semantics against current flat-node/effective-parent behavior.
  - Implement only operations that preserve or intentionally rewrite node, skin, and animation identity with bounded validation.
  - Keep rejected operations visibly disabled with a format-specific reason; do not leave inert controls.
  - Add real head-node fixture coverage for every enabled operation.
- Done when: Every SMF Rig control is either absent/disabled with an exact reason or passes node-index, head-node, skin-index, animation-target, pose, and import/export/reimport assertions.
- Verification: Focused rig/SMF units, real-fixture roundtrip diagnostics, browser enable/disable/undo behavior, `pwsh -File run.ps1 -Task verify`, and browser e2e.

### P2: Resolve remaining global shelf and material-policy actions

- What: Finish or explicitly retire the remaining old shelf actions: global snap, texture repeat/filter, merge-same-textures, and include-textures export policy.
- Why: Selection and visibility actions are complete, but ambiguous material actions can silently change preview/export fidelity or imply unsupported persistence.
- Where: `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/Outliner.tsx`, `source/frontend/src/utils/textureCompat.ts`, `source/frontend/src/loaders/threeToSmf.ts`, export preflight UI, tests, and old `common_add_buttons`/`combine_textures` references.
- When: After the SMF metadata decision and before claiming broader old-editor shelf parity.
- How: Separate display-only sampler previews from export-affecting conversion; reuse texture diagnostics and never mutate/merge materials silently.
- Subtasks:
  - Decide whether global snap adds value beyond the current Rig-scoped snap and future Animate movement tools.
  - Implement repeat/filter as clearly labeled preview state or retire it with the target-format reason.
  - Implement merge-same-textures only as an undoable, validated conversion; otherwise expose a preflight recommendation instead of a mutation button.
  - Make include-textures behavior explicit per GLB/FBX/OBJ/SMF export path.
- Done when: Each old shelf action either ships with clear preview/export semantics and browser coverage or is deliberately absent with a documented format/ownership reason; no inert or misleading control remains.
- Verification: Texture compatibility units, browser control/export assertions, roundtrip validation for affected formats, full verify, and e2e.

### P2: Complete workspace transition and continuity coverage

- What: Prove model, selection, scrub, status, layout, and dirty-state continuity across all workspace transitions.
- Why: Rig, Skin, Animate, Export, Display, and layout controls share one model root; transition timing must not reload, reset, hide, or overwrite authoring state.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/store/index.ts`, panel components, `source/frontend/src/components/ThreeViewport.tsx`, and `source/frontend/tests/smoke.spec.ts`.
- When: Before adding another authoring panel or worker boundary.
- How: Add a compact transition matrix that covers loaded/no-model, single/quad/ortho, paused/scrubbed, and dirty pose/skin/animation states without duplicating existing feature tests.
- Subtasks:
  - Assert loaded model identity, selected bone/object, scrub time, export status, and dirty flags across mode plus layout transitions.
  - Add no-model mode/layout/display negative cases with correctly disabled controls and no stale status.
  - Assert Select/Endpoint/IK tool transitions attach only their owned handles and leave no stale telemetry.
  - Retain canceled-save continuity checks as panels change.
- Done when: The transition matrix shows no accidental reload, stale panel write, lost selection/scrub/status, dirty-edit loss, or unsupported handle attachment.
- Verification: Focused smoke matrix, visual narrow/quad/ortho checks, full verify, and e2e.

### P2: Expand async race coverage across load and export entrypoints

- What: Prove stale results cannot commit across picker open, file input, drag/drop, desktop path reads, diagnostic saves, and exports.
- Why: Existing sequence and single-flight guards are correct for covered paths, but dirty authoring state raises the cost of an untested stale completion.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`, `source/frontend/tests/smoke.spec.ts`, and `source/frontend/tests/helpers/smoke-helpers.ts`.
- When: Before workerizing SMF operations or changing save orchestration.
- How: Use deterministic delayed reads/writes and mocked bridge results; keep helpers isolated and assert the complete committed state, not only status text.
- Subtasks:
  - Add browser download/export overlap assertions where the save path can be deterministically mocked.
  - Cover stale error after newer success and stale success after newer error for each mutable entrypoint class.
  - Assert root, selection, status/error, and pose/skin/animation dirty state remain owned by the newest operation.
  - Reuse the same sequence contract for future worker responses.
- Done when: No older completion or error can overwrite any newer root, selection, status, error, dirty edit, or save result across the supported entrypoint matrix.
- Verification: Native IPC race tests, browser overlap tests, full verify, and e2e.

### P2: Tighten typed interop boundaries

- What: Eliminate or isolate remaining broad casts at Three.js, loader, Tauri, exporter, and TransformControls boundaries.
- Why: Authoring-state growth makes untyped boundary assumptions harder to audit and easier to break during dependency upgrades.
- Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/threeDisposal.ts`, and production-any checks.
- When: Opportunistically with each touched boundary; finish before the worker migration.
- How: Keep errors `unknown`, use type guards and named adapters, and keep unavoidable library skew in one documented helper.
- Subtasks:
  - Re-audit TransformControls/helper/picker types after the r182 public-helper fix.
  - Re-audit loader/export traversal casts and bridge result guards.
  - Keep test-only casts outside production cleanup scope.
- Done when: App and test typechecks pass, `check:production-any` passes, and every remaining boundary cast is narrow, named, and justified by an external type mismatch.
- Verification: Lint, app/test typecheck, production-any gate, build, units, and full verify.

### P3: Workerize heavy SMF import/export with progress

- What: Move SMF parse/export work off the UI thread and report bounded progress for large files.
- Why: Sequence guards prevent stale commits but cannot prevent large synchronous parsing/export from blocking interaction.
- Where: `source/frontend/src/workers/modelWorker.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/`, Vite worker configuration, and tests.
- When: After SMF edit-layer and async result contracts above are stable.
- How: Start with transferable `ArrayBuffer` import/export messages, preserve desktop read/write ownership, and reuse the existing sequence guard at the worker response boundary.
- Subtasks:
  - Define typed import/export request, progress, success, and structured error messages.
  - Transfer buffers rather than copying them.
  - Add worker lifecycle cleanup and stale-response rejection.
  - Add a generated bounded stress fixture and responsive-progress browser proof.
  - Keep a tested synchronous fallback for unsupported worker startup, not a silent stub.
- Done when: Large SMF work leaves the UI responsive, progress is monotonic and clears terminally, transferred results preserve current diagnostics/export fidelity, stale worker responses cannot commit, and worker failure has a tested explicit fallback/error path.
- Verification: Worker units, stress/interaction browser test, current SMF real-fixture diagnostics, full verify, and e2e.
