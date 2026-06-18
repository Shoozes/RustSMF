# RustSMF TODO

Last reviewed: 2026-06-18

This file is the active backlog. Completed work should stay in:
- `docs/dev/APP_STATE.md` (current state),
- `docs/dev/PITFALL_LEDGER.md` (durable pitfalls),
- `summary_bank.json` (group registry).

## Active backlog (what/why/where/how + acceptance)

### P1: Raise default launch + task-guard completeness

- What: Keep launch docs, gates, and automation contracts synchronized across `README`, `run.ps1`, `run.bat`, and `source/package.json` so every contributor follows the same canonical path.
- Why: `docs__state_backlog` and `subsystem__harness_and_context` rely on docs correctness to prevent regression drift during onboarding and verification.
- Where: `README.md`, `docs/user/README.md`, `docs/dev/APP_STATE.md`, `run.ps1`, `run.bat`, `source/package.json`, `scripts/verify-context-bank.py`.
- How:
  - Add a short launch contract matrix review whenever launcher scripts or scripts paths change.
  - Keep reduced-coverage vs canonical paths explicit in one place (launcher docs).
  - Keep the optional GenEye advisory e2e contract aligned across `run.ps1`, README, test docs, APP_STATE, and summary_bank whenever either side changes the wrapper command or browser-only `-NoGenEye` behavior.
  - Run `python scripts/verify-context-bank.py` after docs or path changes.
- Acceptance: New launcher/verify edits include one matching `docs/dev` and summary-bank path update with no stale-path references.

### P1: Finish precision-editor parity in quad/ortho workflows

- What: Close remaining orthographic/pane affordance gaps (handle size, hover signal quality, and continuity around rapid layout transitions).
- Why: Precision rigging/skinning is now present but ergonomics and edge-case behavior still lag the shipped target.
- Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/utils/viewportLayout.ts`, `source/frontend/tests/smoke.spec.ts`.
- How:
  - Add focused edge-case tests for small canvases, high-DPR rendering, and fast single↔quad switching.
  - Keep endpoint/hover lifecycle assertions as smoke-critical checks in both layouts.
  - Track any control-hit regressions against selected-bone continuity assertions.
- Acceptance: Rapid layout/mode switching in single and quad states never drops bone selection, scrub continuity, or endpoint-hover state in e2e.

### P1: Complete workspace transition and continuity coverage

- What: Harden mode/workspace transitions around model-dependent panel state and user feedback timing.
- Why: `App` state plumbing is stable, but transition timing is a high-risk area for subtle UX regressions.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/store/index.ts`, `source/frontend/src/components/{SkinPanel,AnimatePanel,ExportPanel}.tsx`, `source/frontend/tests/smoke.spec.ts`.
- How:
  - Keep viewport controls model-aware in the short path: no-model app state remains single-layout and single/quad layout switching becomes active after a model exists.
  - Add transition assertions around mode + layout continuity for panel visibility, export status, and playback scrub timing.
  - Keep shared model root/persistence unchanged; assert no redundant reloads on switch.
  - Add one negative transition case (closed/disabled model + mode switch) to block stale panel writes.
- Acceptance: Smoke plus a dedicated transition test suite demonstrates no accidental reload, status reset, or stale export state across workspace switches.

### P2: Add contract-level tests for Tauri/native import-export edges

- What: Keep browser fallback and native bridge contract behavior aligned with command payloads and cancel paths.
- Why: Runtime-visible status and save behavior can drift after minor refactors even when unit tests pass.
- Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`, `source/src-tauri/src/main.rs`.
- How:
  - Expand async edge-case tests for open/read/save race/cancel paths (especially rapid sequential operations).
  - Keep command contracts in docs and tests where behavior changes (what contract changed, why, and migration impact).
- Acceptance: No import/export edge case modifies UI with stale path/version/contract data after a canceled or superseded operation.

### P2: Expand async race contract coverage across all load entrypoints

- What: Add deterministic multi-path tests proving stale results cannot commit when operations overlap across picker open, file input, drag/drop, and export actions.
- Why: Guards in `useLoadModel` look correct, but we do not currently validate all entrypoint permutations and timings together in one regression harness.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests` (new race-spec or hook harness), `source/frontend/tests/native.spec.ts`, `source/frontend/tests/smoke.spec.ts`.
- How:
  - Add a focused test that starts overlapping `handleOpen`, `handleFileInputChange`, and `handleDrop` sequences and asserts final model/state/status reflect only the latest successful operation.
  - Add a busy-guard race case where export save resolves late while a second export or load starts.
  - Include explicit status/error assertions for canceled saves and superseded reads to prevent UI state from drifting.
- Acceptance:
  - No stale root/selection/status/error writes are visible after a newer op has started.
  - The harness covers at least one browser-file and one native-like mocked-open path.

### P2: Resolve tiny-viewport mode/workspace transition variance

- What: Remove remaining model-mode workspace non-determinism on narrow layouts so mode tab clicks (Model/Rig/Skin/Animate/Export) transition consistently under constrained viewport widths.
- Why: One e2e flow had to relax strict mode-switch assertions on very small viewports to avoid false negatives, which hides a real UX consistency gap and keeps workspace intent ambiguous for constrained desktops/tablets.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/SkinPanel.tsx`, `source/frontend/src/components/AnimatePanel.tsx`, `source/frontend/src/components/ExportPanel.tsx`, `source/frontend/tests/smoke.spec.ts`.
- How:
  - Capture and assert the effective workspace mode transition state from both toolbar button state and panel mount outcome.
  - Add a deterministic small-viewport transition test that proves at least one workspace switch succeeds per click and that selected bone/scrub continuity remains stable.
  - If layout-size gating is intentional, make the behavior explicit in UI copy and tests (instead of relying on relaxed assertions).
- Acceptance:
  - Small-width model flows reliably switch workspace panel and mode state in repeated clicks with stable selected/scrub continuity.
  - Coverage proves behavior in e2e with no fallback assertions for mode-change progress.

### P2: Maintain modular-doc integrity and reduce review debt

- What: Keep summary docs concise, reduce repeated pass-history duplication, and keep completed work out of active backlog.
- Why: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, and `summary_bank.json` are currently the three main state surfaces and should be non-duplicative.
- Where: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`.
- How:
  - Keep only active intent in `TODO.md`.
  - Keep verified state in `APP_STATE.md`.
- Acceptance: A quick pass over these files shows no duplicate dated recaps, only scoped, non-redundant entries.

## Notes

- Any new issue not covered by existing tests should be added as a P1/P2 item here before implementation.
- For doc/path/group drift prevention, run `python scripts/verify-context-bank.py` after any `TODO`, `APP_STATE`, or `summary_bank.json` edits.
