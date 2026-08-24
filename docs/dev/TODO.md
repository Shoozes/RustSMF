# RustSMF TODO

Last reviewed: 2026-08-24

All implementation items from the current review are complete. Current behavior belongs in `APP_STATE.md`; completed work and command evidence belong in `HISTORY.md` and `review.md`; recurring hazards belong in `PITFALL_LEDGER.md`. This closure section remains structured so the project-integrity guard can verify that the backlog was deliberately reconciled rather than silently removed.

## Review closure — no active implementation TODOs

- What: Reconcile the repository-wide integrity pass, architect/research inbox review, feature groups, issue groups, TODO comments, stubs, import/export seams, async ownership, tests, and durable documentation.
- Why: The requested milestone is complete only when every actionable item has either been implemented and verified or has a documented, evidence-gated product limit instead of an unowned stale TODO.
- Where: `source/frontend/src/`, `source/src-tauri/src/`, `source/frontend/tests/`, `scripts/`, `docs/`, and `summary_bank.json`.
- When: Closed on 2026-08-24 after the final local verification pass.
- How: Implemented the bounded sidecar resource bundle, versioned project save/recovery, rig metadata and keyed IK contracts, geometry/shader diagnostics, display-only pose overlays, and guarded static model surface authoring; added focused tests and browser/native fixtures; reconciled current state, history, review, user notes, test ownership, and context routes.
- Done when: no active implementation section remains with an unresolved condition; each shipped feature has a typed owner, guarded failure path, focused coverage, current docs, and local verification evidence; known format or harness limits are stated in `APP_STATE.md` rather than left as hidden stubs.
- Verification: `pwsh -NoProfile -File .\run.ps1 -Task context`, `pwsh -NoProfile -File .\run.ps1 -Task verify`, `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`, `pwsh -NoProfile -File .\run.ps1 -Task test:journey`, `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`, `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`, and `npm audit --omit=optional` from `source` are the authoritative repository gates; focused commands and their results are recorded in `docs/dev/review.md`.

Deferred compatibility and visual-certification limits are not active TODOs: universal third-party FBX behavior, true OS-dialog automation, and strict screenshot refreshes remain evidence-gated until their external fixtures or review conditions exist. They must not be represented as implemented behavior or silently broadened by future changes.
