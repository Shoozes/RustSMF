# RustSMF TODO

Last reviewed: 2026-07-13. Completed P1 precision, interaction, TransformControls, Animate ownership, authoring-history, and non-SMF Rig-tool work now lives in `APP_STATE.md`, `PITFALL_LEDGER.md`, and `source/frontend/tests/README.md`.

This file contains executable work only. Every task must identify What, Why, Where, When, How, Subtasks, Done when, and Verification.

## Active Backlog

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
