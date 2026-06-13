# RustSMF TODO

Last reviewed: 2026-06-13

## Current Focus

Maintain repo integrity for scalable work: keep docs current, keep `summary_bank.json` narrow and useful, catch broken imports/exports with automated checks, preserve modular boundaries, and track unfinished feature ideas as paired action items.

## Completed This Pass

- What: Added `npm run typecheck` and wired it into `run.ps1 -Task verify` and `source/package.json` verify.
  Why: Existing ESLint config ignores TypeScript/TSX, so build/lint could miss broken type imports, ambiguous exports, and stale contracts.
  Where: `source/frontend/package.json`, `source/package.json`, `run.ps1`, `source/frontend/tsconfig.json`.
  How: App source now runs `tsc -p tsconfig.json --noEmit`; unit and e2e specs remain covered by their runners.

- What: Fixed typecheck blockers and import/export drift.
  Why: The first typecheck found ambiguous `LoadedModel` barrel exports, missing `THREE` type imports, typed-array buffer issues, private helper-field access, and stale material props.
  Where: `source/frontend/src/loaders/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/store/index.ts`, `source/frontend/src/App.tsx`.
  How: Narrowed FBX local model type, copied `Uint8Array` data to real `ArrayBuffer`s, made SMF helper APIs type-safe, removed duplicate type re-exports, and removed obsolete `skinning` material prop.

- What: Hardened async and interaction timing.
  Why: Overlapping file reads could let an older load overwrite a newer model, and transform dragging did not actually disable orbit controls.
  Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/utils/SimpleOrbit.ts`, `source/frontend/src/components/ThreeViewport.tsx`.
  How: Added load/read sequence guards, made `SimpleOrbit.attach` return cleanup, added an `enabled` gate, prevented right-click context menus, and routed TransformControls change events through current refs.

- What: Fixed format support consistency.
  Why: OBJ was supported by loaders/drop/browser input but missing from the Tauri native dialog filter.
  Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`.
  How: Added `obj` to native dialog filters and updated open status text to list all supported formats.

- What: Fixed a stale desktop parser simulation.
  Why: Playwright simulated `get_smf_desktop_info` using a 32-bit animation count while Rust and the SMF loader use an 8-bit count.
  Where: `source/frontend/tests/smoke.spec.ts`.
  How: Changed the simulation to read `offAnim` as `u8` and derive model peek text from the real sample offset.

- What: Consolidated progress docs and context groups.
  Why: `docs/TODO.md`, `docs/dev/APP_STATE.md`, and `summary_bank.json` had high repetition and oversized generated file lists.
  Where: `docs/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, small READMEs.
  How: Replaced repeated logs with current state, open paired backlog, narrow context groups, and a Q&A pitfall entry for the hidden typecheck gap.

- What: Verified the pass.
  Why: Integrity changes touched source, tests, docs, and harness behavior.
  Where: `run.ps1`, frontend tests, Rust tests.
  How: `verify` passed; Playwright passed 10 tests with 1 expected FBX-fixture skip; `desktop-smoke` passed unbundled Tauri build and 4 Rust native tests.

## Priority Backlog

Execution rule: complete P0 items before feature work, run the listed checks after each source change, and update this section only when scope, status, or ordering changes.

1. P0 - Typecheck test sources.
   What: Add static TypeScript coverage for unit and Playwright test code without weakening strict app-source settings.
   Why: `verify` now catches app-source drift, but tests can still carry stale helper types, Node globals, fixture assumptions, or browser mocks until runtime.
   Where: `source/frontend/tsconfig*.json`, `source/frontend/package.json`, `source/package.json`, `source/frontend/src/loaders/coord.test.ts`, `source/frontend/tests/smoke.spec.ts`, `run.ps1`.
   When: Next integrity task. It is the smallest known verification gap and should land before refactoring large files or adding native-driver coverage.
   How:
   - Add `source/frontend/tsconfig.test.json` that extends the app config and includes test files with the needed Node, Vitest, and Playwright types.
   - Add frontend and root scripts such as `typecheck:test`.
   - Fix any strict typing errors in tests and helper mocks instead of excluding failing files.
   - Wire test typecheck into `run.ps1 -Task verify` after it is green.
   Done when: `pwsh -File run.ps1 -Task verify` passes and no test source is excluded solely to avoid type errors.

2. P0 - Full native UI roundtrip automation.
   What: Automate desktop webview open, save, export, native dialog fallback/status behavior, and native file write paths.
   Why: Browser e2e and Rust peeks cover shared logic, but the real Tauri shell still has manual coverage around native dialogs and file IO.
   Where: `source/src-tauri`, `source/frontend/tests`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `run.ps1 -Task desktop-smoke`.
   When: After test-source typecheck is green and before broad native IO or export UX changes.
   How:
   - Spike `tauri-driver` first; if it is too unstable on Windows, document the failure and use a small desktop harness only for deterministic commands.
   - Add temporary fixture/output directories so native writes are isolated and cleaned after tests.
   - Cover open status, SMF info/status, export success, cancel paths, and write failure messaging.
   - Keep the existing Rust command tests as lower-level coverage, but make `desktop-smoke` fail on any native UI harness failure.
   Done when: `pwsh -File run.ps1 -Task desktop-smoke` validates at least one native open/export roundtrip and fails reliably on bad native command status.

3. P1 - Add a real FBX sample fixture.
   What: Add a small license-safe `.fbx` fixture with at least one mesh and, if practical, one simple bone.
   Why: FBX dispatch is tested, but full FBX runtime load, outliner, bone selection, and GLB export coverage is currently skipped.
   Where: `source/frontend/tests/test.fbx`, `source/frontend/tests/smoke.spec.ts`, optional fixture notes under `source/frontend/tests/README.md` if provenance needs explanation.
   When: After P0 verification work, before changing FBX loader/export behavior.
   How:
   - Prefer a self-authored minimal fixture or a documented CC0 source; record provenance beside the fixture if it is not generated locally.
   - Enable the existing skipped FBX test path automatically when the file exists.
   - Assert `Loaded FBX`, scene visibility, outliner content, bone selection when available, and GLB export status.
   - Keep fixture size small enough for source control and quick CI/e2e runs.
   Done when: `pwsh -File run.ps1 -Task test:e2e` runs the FBX path without the current expected skip.

4. P1 - Persist live pose edits.
   What: Convert TransformControls and nudge edits from preview-only viewport state into an explicit pose/keyframe edit layer.
   Why: Users can edit bones visually today, but exports intentionally ignore those edits; that is clear in messaging but incomplete for a model editor workflow.
   Where: `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/store`.
   When: After P0 checks and before promising edited-pose export in UI copy or release notes.
   How:
   - Define an edit data model keyed by skeleton/bone identity and source format.
   - Update viewport transform/nudge handlers to write edits through one state path instead of keeping them only in Three.js objects.
   - Add reset/revert behavior for edited bones.
   - Decide whether first export support is static pose export, keyframe insertion, or both; document unsupported paths until implemented.
   - Add tests for edit state creation, reset, selected-bone messaging, and export inclusion once export support exists.
   Done when: UI messaging no longer says edits are preview-only for the supported path, and tests prove edited data is included or intentionally blocked with a clear status.

5. P2 - GLB/FBX-to-SMF exact animation export.
   What: Replace approximate non-SMF dual-quaternion animation construction with verified matrix-to-DQ reconstruction for save-as-SMF.
   Why: SMF source roundtrip is high-fidelity, but non-SMF sources should not expose exact SMF export until animation fidelity is proven.
   Where: `source/frontend/src/loaders/glb.ts`, `source/frontend/src/loaders/fbx.ts`, `source/frontend/src/loaders/coord.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`.
   When: After the FBX fixture exists and after at least one skeletal GLB/FBX clip is available for repeatable tests.
   How:
   - Define the fidelity contract: coordinate basis, bind pose, sampling rate, interpolation, locked bones, and acceptable numeric tolerance.
   - Add one fixture-backed unit test that maps a known clip frame into expected DQ output.
   - Implement matrix-to-DQ reconstruction behind an internal helper before exposing the user-facing save-as-SMF path.
   - Keep GLB export as the default for non-SMF sources until roundtrip tests pass.
   Done when: fixture-backed tests verify non-SMF animation frames through SMF export/import, and UI exposes save-as-SMF only for verified cases.

6. P2 - Split large files at safe boundaries.
   What: Reduce context pressure in the remaining 500+ line files without changing behavior.
   Why: `smoke.spec.ts`, `smf.ts`, and `ThreeViewport.tsx` are still manageable but expensive to review and risky to edit during feature work.
   Where: `source/frontend/tests/smoke.spec.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`.
   When: After P0 checks are in place, or immediately before touching one of these files for related feature work.
   How:
   - Extract SMF binary reader/writer helpers first because they are low-level and type-testable.
   - Move Playwright fixture builders and desktop simulation helpers out of `smoke.spec.ts`.
   - Extract viewport transform/weight-preview helpers only after tests cover transform drag and selected-bone behavior.
   - Run `verify` after each extraction and `test:e2e` after any viewport or Playwright split.
   Done when: each split preserves public imports/exports, reduces the parent file meaningfully, and has no behavior-only cleanup mixed into the same change.

7. P3 - Keep context docs and summary groups lean.
   What: Maintain current-state docs, active backlog, pitfall ledger, and `summary_bank.json` as concise navigation aids.
   Why: Repeated progress logs and generated broad file lists make the repo harder to review and scale.
   Where: `docs/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, small README files.
   When: At the end of every integrity pass, after significant feature completion, or after any regression worth preserving.
   How:
   - Move completed backlog items to `Completed This Pass` only when they changed source, tests, harnesses, or user-visible behavior.
   - Add pitfall entries only for regressions, failed approaches, hidden verification gaps, or easy-to-repeat mistakes.
   - Keep `summary_bank.json` grouped by paths and intent; avoid broad generated `files` lists unless a specific workflow needs them.
   - Validate JSON after edits with `python -m json.tool summary_bank.json > $null`.
   Done when: docs answer current state and next work in one pass, without duplicated daily logs or obsolete TODO comments.

## Known Intentional Limits

- SMF source export uses the high-fidelity imported SMF data path; current live bone edits are preview-only until a pose/keyframe layer exists.
- FBX source export writes a GLB container via Three.js GLTFExporter because Three.js does not provide an official FBXExporter and no new dependency is currently justified.
- OBJ remains static preview/import parity; export should use GLB unless a concrete OBJ writer requirement appears.
