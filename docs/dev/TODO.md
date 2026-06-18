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
  - Keep viewport controls model-aware in the short path: no-model app state remains single-layout and single/quad layout switching becomes active after a model exists. Current smoke coverage asserts the pre-load lock and constrained-width post-load tab switching.
  - Add transition assertions around mode + layout continuity for panel visibility, export status, and playback scrub timing.
  - Keep shared model root/persistence unchanged; assert no redundant reloads on switch.
  - Add one negative transition case (closed/disabled model + mode switch) to block stale panel writes.
- Acceptance: Smoke plus a dedicated transition test suite demonstrates no accidental reload, status reset, or stale export state across workspace switches.

### P2: Expand async race contract coverage across all load entrypoints

- What: Complete deterministic multi-path coverage proving stale results cannot commit when operations overlap across picker open, file input, drag/drop, and export actions.
- Why: Guards in `useLoadModel` look correct, but we do not currently validate all entrypoint permutations and timings together in one regression harness.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests` (new race-spec or hook harness), `source/frontend/tests/native.spec.ts`, `source/frontend/tests/smoke.spec.ts`.
- How:
  - Keep native open/load/export overlap coverage in `native.spec.ts` (open cancel/read/save overlaps + delayed-save single-flight).
  - Keep native open coverage format-agnostic by adding a path-backed non-SMF assertion that `read_file_binary` is used and no `.smf` peek is called.
  - Added browser overlap coverage in `smoke.spec.ts`:
    - delayed file-read in file input + immediate synthetic drop read with a different fixture.
    - final status remains the latest drop result; delayed input result is ignored.
  - Keep a shared helper pair in `source/frontend/tests/helpers/smoke-helpers.ts` to patch/restore delayed `File.prototype.arrayBuffer` and dispatch synthetic drop payloads.
  - Add explicit status/error assertions for canceled saves and superseded reads to prevent UI state drift.
- Acceptance:
  - No stale root/selection/status/error writes are visible after a newer load op has started.
  - Browser load overlap now covers file-input + drop; native covers open/load/export overlaps.
  - Deferred follow-up: add deterministic browser export-overlap assertions if the download/export path is made fully test-addressable.

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
