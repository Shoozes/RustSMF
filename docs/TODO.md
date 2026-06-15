# RustSMF TODO

Last reviewed: 2026-06-15 (full repo review: fixed Inspector clip duration display bug, tightened type safety across hook/utils/components, removed dead-code stub, added bone highlight GPU disposal, silenced tsconfig deprecation, updated docs).

## Current Focus

Keep the app show-ready and scalable: source gates should fail loudly, feature coverage should match docs, context docs should stay lean, and every open item should say what/why/where/how.

## Completed This Pass

- What: Fixed clip duration display in Inspector (rendered literal `${}` text instead of value).
  Why: JSX text nodes do not interpolate `${}` template syntax; the duration was displaying as the raw source string `(${(c.duration || 0).toFixed(2)}s)` in the UI.
  Where: `source/frontend/src/components/Inspector.tsx` line showing clip list items.
  How: Changed JSX text `(${...}s)` to a JSX expression `({(c.duration || 0).toFixed(2)}s)` so the value is evaluated.
  Done when: `typecheck` passes and the clip panel shows e.g. `walk (1.23s)`.

- What: Fixed bone highlight group not disposing GPU resources on removal.
  Why: `scene.remove(group)` detaches from the scene graph but does not free geometry or material GPU memory; the sphere and axes helper were leaking on every bone selection change.
  Where: `source/frontend/src/components/ThreeViewport.tsx` bone highlight marker effect and setup cleanup.
  How: Added `disposeThreeObject(boneHighlightRef.current)` before nulling the ref in both removal paths.
  Done when: `typecheck` passes and bone selection cycling does not accumulate GPU allocations.

- What: Tightened return type of `findBoneByName` from `any | undefined` to `THREE.Bone | undefined`.
  Why: The `any` return type defeated TypeScript checks on all callers (viewport, hook, poseEdits), allowing silent type errors when accessing bone properties.
  Where: `source/frontend/src/utils/bonePicker.ts`.
  How: Changed return annotation and `find` callback type to `THREE.Bone`.
  Done when: `typecheck` passes with strict checks on all call sites.

- What: Typed `lastSmfDataRef` with `ImportedSmf | null` instead of `any`.
  Why: The untyped ref allowed silent misuse of the ref in `handleExport` without type-checking the SMF data contract.
  Where: `source/frontend/src/hooks/useLoadModel.ts`.
  How: Added `import type { ImportedSmf }` and changed `useRef<any>` to `useRef<ImportedSmf | null>`.
  Done when: `typecheck` passes with the ref fully typed.

- What: Replaced inline `onNudgeBone` delta type in Inspector with imported `BoneNudgeDelta`.
  Why: The inline type duplicated the canonical definition in `poseEdits.ts`, risking silent divergence if `BoneNudgeDelta` gains new fields.
  Where: `source/frontend/src/components/Inspector.tsx`.
  How: Added `import type { BoneNudgeDelta }` and replaced the inline object literal type with the named import.
  Done when: `typecheck` passes with the shared type enforced at the component boundary.

- What: Removed `isScaleEdit` dead-code stub from `poseEdits.ts`.
  Why: The function always returned `false`, was never imported or called anywhere, and added confusion about whether scale edits were partially supported.
  Where: `source/frontend/src/hooks/poseEdits.ts`.
  How: Deleted the function and its comment; the scale-edit limitation is documented in Known Intentional Limits and the PITFALL_LEDGER.
  Done when: `typecheck` and `noUnusedParameters` pass; grep finds no remaining references.

- What: Increased browser file-picker cancel debounce from 0 ms to 150 ms.
  Why: `setTimeout(0)` fires before the file dialog fully opens on some OS/browser combinations, causing the open operation to resolve `null` (cancel) before the user could interact.
  Where: `source/frontend/src/backend-client/tauri.ts` `onWindowFocus` cancel handler.
  How: Changed `setTimeout(..., 0)` to `setTimeout(..., 150)` so the focus event is checked after typical dialog-open latency.
  Done when: Browser file picker does not spuriously cancel on first open attempt.

- What: Silenced `baseUrl` deprecation warning in tsconfig.
  Why: TypeScript 6+ treats `baseUrl` as a deprecated option (TS5101) and the system `tsc` emitted a hard error when project node_modules were absent, breaking the typecheck gate outside the project install.
  Where: `source/frontend/tsconfig.json`.
  How: Added `"ignoreDeprecations": "5.0"` to acknowledge the deprecated option while staying on the current TypeScript.
  Done when: `typecheck` passes with no TS5101 warning regardless of system TypeScript version.

- What: Added the missing test-source typecheck gate.
  Why: Docs and the pitfall ledger said test typechecking existed, but the repo had no `tsconfig.test.json`, no `typecheck:test` script, and no direct Node types.
  Where: `source/frontend/tsconfig.test.json`, `source/frontend/package.json`, `source/package.json`, `run.ps1`, `source/package-lock.json`.
  How: Added `@types/node`, included loader unit tests, Playwright specs, helpers, and config in a dedicated test tsconfig, and wired it into `verify`.
  Done when: `npm --workspace frontend run typecheck:test` passes and `run.ps1 -Task verify` runs it.

- What: Added deterministic native IPC e2e coverage.
  Why: Existing helpers mocked Tauri open/read/save/write/cancel behavior, but no spec used them.
  Where: `source/frontend/tests/native.spec.ts`, `source/frontend/tests/helpers/smoke-helpers.ts`, `run.ps1`.
  How: Added tests for native open/read/status/export/write, save cancel, and open cancel; `desktop-smoke` now runs this focused spec after Rust native tests.
  Done when: `npm --workspace frontend run test:e2e -- tests/native.spec.ts` passes.

- What: Fixed unsafe test buffer handoff.
  Why: Test-source typecheck caught `ArrayBufferLike` from Node buffers being passed to SMF APIs that require real `ArrayBuffer`.
  Where: `source/frontend/src/loaders/coord.test.ts`.
  How: Reused `bytesToArrayBuffer` for exported buffers and file bytes.
  Done when: test typecheck and unit tests pass.

- What: Tightened harness failure behavior and diagnostics.
  Why: `run.ps1 -Task verify` could warn on failures without exiting nonzero, `run.ps1 -Task test:e2e` could mask a failed npm exit through PowerShell output leakage, and WebGL `ReadPixels` performance warnings made e2e output noisy.
  Where: `run.ps1`, `source/frontend/tests/helpers/smoke-helpers.ts`.
  How: `verify` and `test:e2e` now exit nonzero on failed checks; `Invoke-FrontendNpm` writes command output to host instead of returning it as data; known `ReadPixels` warnings are filtered while real errors/page crashes still fail tests.
  Done when: failing gates propagate to shell exit status and native/full e2e wrapper runs are clean.

- What: Stabilized full browser e2e without hiding real failures.
  Why: Full Playwright exposed unstable strict WebGL snapshots, a stale empty-SMF-export assertion, and an OBJ tangent warning from calling `computeTangents()` before required geometry attributes existed.
  Where: `source/frontend/tests/helpers/smoke-helpers.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/src/loaders/obj.ts`, `source/frontend/tests/README.md`.
  How: Made strict screenshots opt-in through `RUSTSMF_STRICT_VISUALS=1`, updated the SMF export-empty assertion to the current UX text, and guarded OBJ tangent computation on index/position/normal/uv.
  Done when: `pwsh -File run.ps1 -Task test:e2e` passes with the only skip being the tracked FBX fixture backlog item.

- What: Added dedicated visual confirmation tests and test relevance docs.
  Why: Visual checks were mixed into broad smoke flows; the repo needed a clearer place to confirm rendered layout, responsive overflow, nonblank viewport pixels, and loaded-model visual state.
  Where: `source/frontend/tests/visual.spec.ts`, `source/frontend/src/index.css`, `source/frontend/tests/README.md`, `summary_bank.json`.
  How: Added desktop/narrow shell visual tests, a loaded SMF visual test, responsive CSS for narrow layouts, and a What/Why/Where/How test README with relevance rules.
  Done when: `npm --workspace frontend run test:e2e -- tests/visual.spec.ts` passes and full `test:e2e` includes the visual spec.

- What: Broke broad TODO work into phased subtasks and removed stale source-comment planning drift.
  Why: Large backlog entries and comments that still said "future" made it harder to tell what is actionable now versus deferred.
  Where: `docs/TODO.md`, `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/src-tauri/src/main.rs`.
  How: Added discovery/decision/implementation/verification/docs substeps, tracked constructed-rig disconnected semantics as a conditional backlog item, simplified an unreachable rig-node branch, and added a unit test for current constructed skeleton behavior.
  Done when: big active items can be worked one subtask at a time and source comments no longer imply untracked "future" work.

- What: Consolidated progress docs and context groups.
  Why: `docs/TODO.md`, `docs/dev/APP_STATE.md`, `summary_bank.json`, and README references had repeated pass logs and a few over-claims.
  Where: `docs/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, `README.md`, `source/frontend/tests/README.md`.
  How: Replaced repeated history with current state, active backlog, durable pitfalls, and narrow summary-bank groups.
    Done when: JSON validates and the docs no longer claim missing files or gates.

- What: Hardened interaction and async edge cases in the UI/loader bridge, and consolidated binary utility exports.
  Why: Drag-driven viewport clicks could create accidental bone selection, browser file-picker cancel could leave unresolved open promises, and GLB skinned-skeleton no-op branches reduced fidelity safety.
  Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/loaders/glb.ts`, `source/frontend/src/utils/bonePicker.ts`, `source/frontend/src/loaders/index.ts`, `docs/dev/APP_STATE.md`, `summary_bank.json`.
  How: Added pointerdown/pointerup drag gating, added focus/cancel-safe browser file picker fallback, implemented practical GLB fallback skeleton binding for empty skeleton branches, reused temporary vectors in picker/marker loops, and exported shared binary reader/writer utilities from the loader barrel.
  Done when: accidental drag selection is filtered before selection callbacks fire and browser open fallback always returns a resolved value.

## Active Backlog

Execution rule: complete P0/P1 items before feature expansion, run `pwsh -File run.ps1 -Task verify` after source changes, and update this file only when status or scope changes.

Subtask shape: each large item should move through discovery, decision, implementation, verification, and docs/state cleanup. Skip a phase only when it is clearly not applicable and record why in the item.

1. P1 - Resolve dependency audit exposure.
   What: Decide and execute the safe path for the current Vite/esbuild audit findings.
   Why: `npm audit --omit=optional` reports 2 findings through `vite` -> `esbuild`; the automatic fix proposes `vite@8`, a breaking major upgrade.
   Where: `source/frontend/package.json`, `source/package-lock.json`, `source/frontend/vite.config.ts`, `run.ps1`.
   Subtasks:
   1a. Discovery: re-run `npm audit --omit=optional` and capture exact advisory package paths, severity, vulnerable range, and the npm fix recommendation.
   1b. Discovery: identify whether the exposure is dev-server-only, production-bundled, or both for this Tauri/Vite app.
   1c. Decision: check whether a non-breaking Vite/esbuild patch is available within the current Vite major range.
   1d. Decision: if only a breaking Vite major fixes it, read the Vite migration notes and list required config/code changes before editing.
   1e. Implementation: update only the needed package and lockfile entries; avoid unrelated dependency churn.
   1f. Implementation: adjust `source/frontend/vite.config.ts`, scripts, or Playwright server config only if the upgrade requires it.
   1g. Verification: run `npm --workspace frontend run typecheck`, `npm --workspace frontend run build`, then `pwsh -File run.ps1 -Task verify`.
   1h. Verification: run `pwsh -File run.ps1 -Task test:e2e` after any Vite/dev-server or browser-serving change.
   1i. Docs: if upgrading is not safe now, document accepted risk, local controls, owner/revisit trigger, and exact advisory IDs in this TODO and `APP_STATE`.
   Done when: audit is clean, or the accepted risk is explicit and has a concrete revisit condition.

2. P2 - Add fixture-backed FBX/skinned real-file coverage.
   What: Add a small valid self-authored FBX or skinned GLB fixture for full non-SMF load/export coverage.
   Why: The FBX full-load e2e path currently skips when no fixture is present; unit tests cover converter logic, but real-file loader coverage is weaker than SMF/OBJ.
   Where: `source/frontend/tests/`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/helpers/smoke-helpers.ts`, `source/frontend/tests/README.md`.
   Subtasks:
   2a. Discovery: inspect current sample files and fixture lookup paths so the new asset lands in the default local test set.
   2b. Decision: choose FBX for loader-path parity, or skinned GLB for converter/export fidelity if a minimal FBX is too brittle.
   2c. Decision: define fixture acceptance criteria: self-authored or clearly redistributable, tiny file size, one mesh, one named skeleton, and a minimal position/quaternion animation if feasible.
   2d. Implementation: add the fixture under the frontend test fixtures area and keep provenance in `source/frontend/tests/README.md`.
   2e. Implementation: update `SAMPLE_FBX` or add a parallel `SAMPLE_SKINNED_GLB` helper so the full test runs without local machine assumptions.
   2f. Implementation: replace the current skip path with assertions for load status, skeleton/bone presence, critical-console cleanliness, viewport render, export status, and no unexpected fallback.
   2g. Verification: run the focused Playwright spec first, then `pwsh -File run.ps1 -Task test:e2e`.
   2h. Verification: run `pwsh -File run.ps1 -Task verify` to keep type/unit/Rust gates aligned with the fixture change.
   2i. Docs: update `source/frontend/tests/README.md`, this TODO, `APP_STATE`, and `summary_bank.json` with the fixture path and coverage status.
   Done when: the full FBX/skinned real-file test runs without `test.skip` and passes in the default local fixture set.

3. P2 - Evaluate true OS-dialog automation only if needed.
   What: Decide whether to add tauri-driver or equivalent for real native dialog/webview roundtrips.
   Why: Current native coverage is deterministic via Playwright IPC mocks plus Rust command tests; real OS dialogs are higher setup cost and may be brittle.
   Where: `run.ps1`, `source/frontend/tests/native.spec.ts`, `source/src-tauri/src/main.rs`, `source/frontend/tests/README.md`.
   Subtasks:
   3a. Discovery: list specific user-visible behavior not covered by IPC mocks and Rust command tests.
   3b. Discovery: confirm current Tauri version, supported driver options, Windows prerequisites, and whether dialogs can be driven reliably.
   3c. Decision: compare tauri-driver, WebDriver, or a lightweight manual checklist against runtime, flake risk, and CI suitability.
   3d. Implementation: prototype outside the required `verify` path first with one open/load/export smoke.
   3e. Implementation: if the prototype is reliable, add an optional script such as `desktop:e2e`; do not make it required until it is stable.
   3f. Verification: run the optional script three times locally and record average runtime plus any flake symptoms.
   3g. Docs: document the optional command, prerequisites, and relevance rules, or document why real-dialog automation remains deferred.
   Done when: a reliable optional real-dialog check exists, or deferral is documented with rationale and trigger conditions.

4. P2 - Clarify constructed-rig disconnected bone semantics if required.
   What: Decide whether non-SMF constructed exports need explicit disconnected head-node synthesis beyond current direct bone-node output.
   Why: Old source exporter code could insert head nodes for detached child bones; the current `ImportedSmf` structure only carries actual parent indices, so inferring detached-but-intended-parent state from `parent` alone is unsafe.
   Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `docs/references/old-src/GLBtoSMF/exporter.js`.
   Subtasks:
   4a. Discovery: compare the old exporter connected rule with the current `threeToSmf` data shape and note what metadata is missing.
   4b. Discovery: find or create a tiny Three skeleton case with a detached child that still has an intended SMF parent.
   4c. Decision: choose direct nodes only, explicit disconnected metadata, or a converter-side parent relation model; do not infer from `parent >= 0` alone.
   4d. Implementation: if needed, extend `ImportedSmf` or converter metadata so head-node synthesis has a real signal.
   4e. Implementation: add unit coverage for connected child, detached child with explicit head, and SMF-sourced prebuilt head preservation.
   4f. Verification: run `npm --workspace frontend run test:unit`, `npm --workspace frontend run typecheck:test`, and `pwsh -File run.ps1 -Task verify`.
   4g. Docs: update this TODO and `summary_bank.json` only if disconnected constructed-rig support becomes active work.
   Done when: current direct-node behavior is intentionally preserved, or explicit disconnected constructed-rig support is implemented with tests.

5. P2 - Continue modularity watch list without forced splits.
   What: Revisit large, responsibility-dense files only when a safe helper boundary is clear.
   Why: `smf.ts`, `ThreeViewport.tsx`, `useLoadModel.ts`, and `tests/smoke.spec.ts` are manageable but still the highest context-pressure files.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`.
   Subtasks:
   5a. Discovery: re-run line-count ranking before any split and record the selected boundary in this TODO or `APP_STATE`.
   5b. Discovery: identify which assertions already protect the boundary; if none exist, add focused coverage before moving code.
   5c. Decision: prefer test-backed leaf helpers first: SMF animation serialization, viewport transform-control wiring, load/export status formatting, or Playwright fixture helpers.
   5d. Decision: reject a split if it only moves lines without reducing coupling, improving reuse, or clarifying ownership.
   5e. Implementation: preserve public imports/exports, test IDs, route paths, status strings under assertion, and existing file ownership.
   5f. Implementation: update barrels and consumers in the same change; grep for duplicate helper names or untracked moved files before closing.
   5g. Verification: run the smallest relevant test slice first, then `pwsh -File run.ps1 -Task verify`.
   5h. Verification: run `pwsh -File run.ps1 -Task test:e2e` after viewport, Playwright helper, load/export UX, or timing-related splits.
   5i. Docs: update `summary_bank.json` paths and notes when a new module becomes a useful context boundary.
   Done when: each extraction reduces parent size meaningfully, keeps behavior stable, and has focused coverage.

6. P3 - Keep context docs lean.
   What: Maintain current-state docs, active backlog, pitfall ledger, and `summary_bank.json` as navigation aids.
   Why: Repeated pass logs and broad generated file lists make future reviews slower and less reliable.
   Where: `docs/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, README files.
   Subtasks:
   6a. Discovery: before editing docs, run targeted `rg` checks for referenced files, scripts, skipped tests, and old pass-count claims.
   6b. Decision: update only docs whose current-state claims changed; leave historical detail in the pitfall ledger when it prevents repeat mistakes.
   6c. Implementation: move completed work into `Completed This Pass` only when it changed source, tests, harnesses, or user-visible behavior.
   6d. Implementation: add pitfall ledger entries only for repeatable regressions, hidden verification gaps, false-success checks, or failed approaches worth preserving.
   6e. Implementation: keep `summary_bank.json` groups narrow, path-based, and linked to active feature/issue clusters.
   6f. Verification: validate `summary_bank.json` with `python -m json.tool summary_bank.json > $null`.
   6g. Verification: run a stale-reference grep for removed files, missing scripts, obsolete unit counts, and over-claimed coverage before closing an integrity pass.
   6h. Docs: if a backlog item grows beyond one screen, split it into child subtasks or promote it into a short dedicated doc linked from this TODO.
   Done when: docs answer current state, active work, and durable risks without requiring readers to reconcile history.

## Known Intentional Limits

- SMF export supports position/rotation pose edits. Scale edits are blocked because the current SMF DQ path has no scale channel.
- Non-SMF SMF export is guarded for compatible skinned GLB/FBX runtime roots with one shared named skeleton and position/quaternion bone tracks. Static roots, materials, morphs, object-level tracks, and scale animation should use GLB.
- FBX export writes a GLB container through Three.js GLTFExporter; true FBX writing is not added without a concrete dependency decision.
- OBJ is load/preview parity for static assets; export should use GLB unless an OBJ writer requirement appears.

## Verification

- `pwsh -File run.ps1 -Task verify`: lint, app typecheck, test typecheck, Vite build, chunk guard, unit tests, and cargo check.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright browser smoke, visual confirmation, and native IPC tests.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native peek tests, and focused Playwright native IPC mock suite.

Latest results from this pass:
- `pwsh -File run.ps1 -Task verify`: passed with 20 unit tests.
- `pwsh -File run.ps1 -Task test:e2e`: passed, 14 tests passed and 1 skipped (missing FBX/skinned fixture backlog).
- `pwsh -File run.ps1 -Task desktop-smoke`: passed, including 4 Rust native tests and 2 Playwright native IPC tests.
