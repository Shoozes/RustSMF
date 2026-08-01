# RustSMF Review Snapshot

Last reviewed: 2026-08-01

## Scope

This repository-wide integrity pass reviewed current-state documentation, `summary_bank.json`, research and progress records, source/import boundaries, incomplete logic markers, async ownership, recent Original-theme/viewport/texture/FBX work, deterministic fixtures, unit/browser/native coverage, dependencies, and branch hygiene.

Current behavior is documented once in `APP_STATE.md`. Forward work is in `TODO.md`, recurring regression lessons are in `PITFALL_LEDGER.md`, and test ownership is in `source/frontend/tests/README.md`.

## Current pass

- `pwsh -NoProfile -File .\run.ps1 -Task verify` passes after the animation/display controller extractions: 241/241 frontend units, typechecks, lint, build, chunk checks, context validation, and Rust check.
- `source/frontend/src/utils/animationAuthoringController.ts` now owns clip CRUD, metadata, selected-bone key editing, snap, and action-level animation history integration; its guards remain pure in `animationAuthoringContext.ts` and both boundaries have focused tests.
- `source/frontend/src/utils/viewportDisplayController.ts` now owns viewport texture/opacity preview, legacy lighting substitutions, source assignment restoration, and cleanup; renderer/root/RAF lifecycle remains in `ThreeViewport.tsx`.
- Fixed-pane Rig move/rotate manipulation was confirmed as already shipped, with active-pane camera hit testing, cancel/undo/redo history, and export-format browser coverage in `export-formats.spec.ts`; the backlog item was removed as completed.
- A fresh `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye` was blocked before app execution because Playwright Chromium launch returned `browserType.launch: spawn EPERM`. This is a managed-environment boundary; the previously recorded 54/54 browser pass remains historical evidence until Chromium can launch again.

## Corrections Completed

### Required fixtures now fail closed

- **What:** Browser and Rust tests use exact committed SMF, FBX, OBJ, and invalid-input fixtures. Missing fixtures throw or fail instead of searching archived source and silently skipping.
- **Why:** Three native tests previously resolved paths relative to the wrong directory, and browser helpers could fall back to deleted or unrelated files. Green output therefore did not always prove the intended real-file path.
- **Where:** `source/frontend/tests/helpers/smoke-helpers.ts`, `source/frontend/tests/fixtures/invalid-model.gml`, and `source/src-tauri/src/main.rs`.
- **How:** Centralize exact fixture resolution, remove recursive archive discovery and nullable fixture exports, and require the committed real SMF in all native positive-path tests.
- **Done when:** Deleting or renaming a required fixture makes its owning suite fail with the exact missing path, while the committed fixtures exercise load/error/native parsing successfully.
- **Result:** Done. The focused browser cases, 54-case suite, and all 9 Rust tests pass; native output confirms the real sample parsed as model 6, rig 38, animation 12.

### Viewport coverage and reset behavior were repaired

- **What:** Restore four overwritten viewport layout tests and make camera reset fit the loaded model’s shared center and distance.
- **Why:** Recent shared-pan coverage accidentally replaced existing layout, boundary, and high-DPI tests. The old hard-coded reset target also moved off-origin or large models away from their fitted view.
- **Where:** `src/utils/viewportLayout.ts`, `src/utils/SimpleOrbit.ts`, `src/utils/viewportLayout.test.ts`, `src/components/ThreeViewport.tsx`, and `tests/shell-model.spec.ts`.
- **How:** Add one finite model-fit distance helper, pass the current bounds center into reset, export the public viewport helpers, restore prior assertions, and extend the shared-camera browser case through reset.
- **Done when:** Single/quad layout, tiny panes, pane boundaries, fractional coordinates, fixed-view focus, ortho pan, model-fit distance, copied reset target, and browser pan/reset behavior all pass.
- **Result:** Done. The viewport suite now has 10 focused cases and the full browser suite proves ortho and perspective panes share one focus target through pan and reset.

### Theme grid ownership was extracted and tested

- **What:** Move Original-theme camera-plane grid creation, visibility, and disposal out of the renderer component.
- **Why:** This is a stable leaf boundary with explicit inputs and resource ownership; leaving it inline added unrelated context to a 3,000-line integration owner.
- **Where:** `src/utils/themeViewportGrid.ts`, `src/utils/themeViewportGrid.test.ts`, `src/theme.ts`, `src/utils/index.ts`, and `src/components/ThreeViewport.tsx`.
- **How:** Use a typed grid mode and viewport role, retain per-pane render visibility, and dispose all owned Three resources through the existing disposal authority.
- **Done when:** Plane orientation, role visibility, disabled state, scene removal, geometry disposal, typecheck, strict visuals, and Original quad behavior pass.
- **Result:** Done. Three focused units, all 241 frontend units, strict visuals, and the previously recorded full browser coverage pass.

### Documentation and context routing were consolidated

- **What:** Replace the repeated implementation recap with a compact product/architecture contract, create executable backlog items, record the fixture pitfall, and split broad context groups.
- **Why:** The old default orientation approached its 64 KiB budget and mixed completed progress with current state. Broad authoring/test routes increased irrelevant context and made later scaling harder.
- **Where:** `docs/dev/APP_STATE.md`, `TODO.md`, `PITFALL_LEDGER.md`, `review.md`, `docs/user/README.md`, `source/frontend/tests/README.md`, and `summary_bank.json`.
- **How:** Assign one document per knowledge type; create focused model-outliner, animation, and skin groups; archive compatibility/reference routes explicitly; and give every backlog item What/Why/Where/When/How/Subtasks/Done when/Verification.
- **Done when:** Context validation has no warning, every explicit path resolves, default orientation remains comfortably under budget, completed work is absent from the active backlog, and current counts agree across docs.
- **Result:** Done. Context reports 19 groups, 27.5 KiB default orientation, zero warnings, and 7/7 context-tool tests.

## Audit Results

- **Imports/exports:** A production dependency walk found no broken relative import. Files outside the runtime entry graph are intentional test support, ambient declarations, or the test-facing public utility barrel. App and test typechecks pass.
- **Incomplete logic:** No production `TODO`, `FIXME`, placeholder, “not implemented,” stub, or unsafe TypeScript assertion was found. Remaining format limits are explicit product constraints in `APP_STATE.md`, not disguised shipped behavior.
- **Async and run conditions:** Existing latest-intent, abort, timeout, monotonic-progress, single-flight save, root-replacement, and process-lifecycle tests all pass. No new race or unowned timer/listener was found.
- **Research inbox:** No unprocessed research or drop-in review item exists; only inbox instructions remain.
- **Redundancy:** Current state, backlog, latest evidence, pitfalls, and test ownership now each have one document owner. `summary_bank.json` routes focused feature/subsystem slices rather than serving as another progress log.
- **Modularity:** `useLoadModel.ts` and `ThreeViewport.tsx` remain integration owners, now delegating animation actions and display/material mutation through explicit, focused controller contracts. No circular import or pass-through barrel was added.
- **Dependency health:** The installed tree resolves on Windows and `npm audit --omit=optional` reports zero vulnerabilities. Reported unmet optional packages are platform or opt-in feature packages.

## Open Work

The active priority order is maintained in `TODO.md`:

1. Add an independently authored or redistributable skinned, textured, animated FBX compatibility fixture.

Each item is evidence-backed, split into bounded subtasks, and has an explicit completion and verification contract.

## Verification Evidence

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed on 2026-08-01; context 19 groups/zero warnings plus 7/7 tool tests, lint coverage, ESLint, app/test typechecks, production-`any` guard, production build, entry/lazy-worker chunk guards, 241/241 frontend units, and Rust check.
- Prior browser evidence (2026-07-30): `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye` passed 54/54 with zero skipped across eight domain-owned browser suites. Current rerun is blocked at Chromium process launch with `spawn EPERM`, before any test step executes.
- Focused shared-camera reset and invalid-file regression slice: 2/2 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: 2/2 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: release Tauri build passed, Rust tests 9/9, and native IPC browser tests 9/9.
- `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings`: passed.
- `npm ls --all --omit=optional`: passed with expected Windows/platform and opt-in packages omitted.
- `npm audit --omit=optional`: zero vulnerabilities.

## Non-blocking Toolchain Warnings

- Node emits `DEP0205` while Playwright loads its TypeScript configuration. A traced run locates the call in Playwright 1.60.0’s internal `registerESMLoader`, not repository code. Recheck on the next Playwright update; do not suppress it globally.
- Cargo can warn that the managed environment cannot canonicalize `C:\Users\jc816`; Rust check, Clippy, tests, and release build still complete successfully.
- The native fallback test intentionally logs its mocked dialog-open warning while proving fallback behavior.
- Managed Playwright launch currently returns `spawn EPERM` for the installed Chromium headless shell; resolve the local execution-policy/process-permission issue before treating a new browser run as authoritative.
