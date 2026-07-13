# RustSMF TODO

Last reviewed: 2026-07-13. Completed editor, lifecycle, and typed-boundary work now lives in `APP_STATE.md`, `PITFALL_LEDGER.md`, and `source/frontend/tests/README.md`.

This file contains executable work only. Every task must identify What, Why, Where, When, How, Subtasks, Done when, and Verification.

## Active Backlog

### P2: Workerize heavy SMF import/export with progress

- What: Move SMF parse/export work off the UI thread and report bounded progress for large files.
- Why: Sequence guards prevent stale commits but cannot prevent large synchronous parsing/export from blocking interaction.
- Where: `source/frontend/src/workers/modelWorker.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/`, Vite worker configuration, and tests.
- When: Now that SMF edit-layer, async ownership, and typed boundary contracts are stable.
- How: Start with transferable `ArrayBuffer` import/export messages, preserve desktop read/write ownership, and reuse the existing sequence guard at the worker response boundary.
- Subtasks:
  - Define typed import/export request, progress, success, and structured error messages.
  - Transfer buffers rather than copying them.
  - Add worker lifecycle cleanup and stale-response rejection.
  - Add a generated bounded stress fixture and responsive-progress browser proof.
  - Keep a tested synchronous fallback for unsupported worker startup, not a silent stub.
- Done when: Large SMF work leaves the UI responsive, progress is monotonic and clears terminally, transferred results preserve current diagnostics/export fidelity, stale worker responses cannot commit, and worker failure has a tested explicit fallback/error path.
- Verification: Worker units, stress/interaction browser test, current SMF real-fixture diagnostics, full verify, and e2e.
