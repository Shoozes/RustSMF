# Frontend Tests

Current coverage:
- `src/loaders/*.test.ts` and `src/utils/*.test.ts`: Node unit tests for SMF coordinate/DQ math, binary bounds, roundtrips, guarded Three-to-SMF conversion, structured SMF export diagnostics, material texture summaries, structured SMF roundtrip check serialization, bounded worst-pose-delta details, legacy SMF display material cloning, skin point overlay helpers, modern skeleton helper metadata, skin-weight edit helpers, autoskin/normalize helpers, rig validation/edit helpers, and touched-vertex snapshot restore, model outliner summaries, animation timeline/keyframe summaries, editable animation keyframe helpers, edited clip conversion, SMF-source dirty animation patching, and (post 2026-06-15) SMF rig hierarchy (head-dummy skip, parent resolution, deform-only skel, SMF_Node names, golden fixture asserts on tree; direct `buildRigHierarchy` unit test with multi-head chain cases; makeBoneLabel + makeBoneHighlightMarker + updateHighlightPosition util tests with polyfill; labels truncation + canvas quality polish branch; createSeqGuard for async stale + modularity). Async load guards in useLoadModel covered by e2e smoke multi-load scenarios (no isolated hook unit to avoid extra deps). 2026-06-15 full review: canvas 2d polyfill hardened. Added related tests (this cycle): smfBoneNameToIndex (SMF_Node_N + _head suffix safety for pose/regex); buildRigHierarchy root-head + zero-bones edges; updateHighlightPosition with parented bone world pos (hierarchy for RAF marker); makeBoneLabel DPR/devicePixelRatio scaling; threeToSmf rig node list coverage; SMF diagnostics for missing skeleton, scale tracks, missing UVs/normals, missing skin attrs, material texture metadata, pose delta detail shape, and top-20 pose detail capping; legacySmfLighting coverage for viewport-only material clone, texture disable, opacity clamp, and source-material preservation; skinPointOverlay coverage for selected-bone color weights, point capping, attach/dispose safety, and source geometry preservation; pure seq guard simulation for stale read-error rejection (newer succeeds, old error ignored, no mutation); skinWeights helper coverage for set/add/subtract/clamp/normalize/autoskin/invalid targets/dirty export block reason; rigValidation helper coverage for duplicate names, orphan parents, cycles, missing skin attrs, and invalid skin references; rigEdits helper coverage for selected-bone rename validation, animation track retargeting, reparent cycle/self-parent validation, reparent world-transform preservation, create-child validation, Skeleton inverse/buffer refresh, delete weighted-reference blocking, skinIndex remapping, and deleted-track removal. e2e smoke exercises labels-toggle wiring + multi-load seq guards.
- `tests/smoke.spec.ts`: Browser Playwright smoke coverage for app boot, real SMF load, viewport/animation/bone flows, modern skeleton helper rendering/picking, export UI, SMF diagnostics panel readiness, structured in-memory SMF roundtrip checks, diagnostic report save, invalid-load UX, FBX UI dispatch, and OBJ static load parity with blocked SMF diagnostics. Added mode-tab exercise (toggle rig/view/skin/animate/export post-load) for the modern editor foundation + mode-edge coverage, constrained-width mode switching without forced clicks, visible quad-pane overlay assertions, model-safe wireframe toggle assertions, Legacy SMF display mode assertions, Skin pts overlay assertions, Rig workspace validation plus selected-bone rename/reparent/create-child/delete rows, Outliner submodel visibility toggling, imported keyframe marker assertions, selected-bone keyframe authoring with Insert/Update/Delete/Copy/Paste and supported generated-skinned SMF roundtrip status, skin paint Undo/Redo stroke checks, Skin workspace Auto Skin button wiring, plus endpoint-handle drag checks in single + quad modes. Added async overlap coverage proving a delayed file-input read cannot overwrite a newer drop read result.
- `src/loaders/fbx.test.ts`: Unit coverage for true binary FBX export bytes and a static FBX export -> `loadFBX` roundtrip.
- `tests/helpers/skinned-glb-fixture.ts`: Generated self-authored skinned GLB fixture for non-SMF skinned load, guarded SMF export, material texture summary rows, and GLB export coverage.
- `tests/test.fbx`: Self-authored static ASCII FBX fixture for FBX loader coverage.
- `tests/visual.spec.ts`: Browser Playwright visual confirmations for desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, loaded SMF visual state, compact Display menu behavior, and single-view Ortho rendering.
- `tests/native.spec.ts`: Deterministic Tauri IPC mock coverage for native open/read/status, path-based non-SMF desktop binary reads, save/write, cancel behavior, dirty skin/animation edit preservation across canceled saves, and delayed-write rapid-export overlap (single-flight save guard).
- Rust native tests in `source/src-tauri/src/smf_core.rs` and `source/src-tauri/src/main.rs` cover desktop SMF header parsing, malformed versions, missing null terminators, invalid section offsets, count widths, and real-sample peeks when a sample is present.

Use `pwsh -File ../../run.ps1 -Task test:visual-strict` from `source/frontend` or `pwsh -File run.ps1 -Task test:visual-strict` from the repo root when intentionally enforcing committed SMF screenshot snapshots. Use `pwsh -File run.ps1 -Task test:visual-update` only when a renderer change intentionally updates those baselines. Default e2e uses tolerant rendered-byte checks to avoid machine-specific WebGL drift.

Playwright e2e is served from a production build through `vite preview`, not `vite dev`. Vite dev-server HMR websocket failures after the Vite 8 upgrade could reload pages during parallel WebGL/file-flow tests and create false failures, so `source/frontend/playwright.config.ts` builds first and starts preview on `127.0.0.1:5173`.

From the repo root, `pwsh -File run.ps1 -Task test:e2e` first tries GenEye as an optional advisory subagent. When GenEye is available, RustSMF passes its own Playwright command (`npm run test:e2e -- --reporter=json`) to GenEye `playwright-full -AllowGenEyeFailure`, which writes `summary.json`, `subagent-handoff.json`, and related evidence under ignored `runtime-data\geneye-playwright-runs\`. RustSMF's Playwright config owns the app server/navigation, so GenEye's built-in scenario is only a plumbing check; use the `project_tests` block and discovered RustSMF Playwright artifacts as app evidence. Use `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` for a browser-only run. If GenEye is missing or cannot produce project-test evidence, the launcher runs browser-only Playwright. RustSMF test failures remain blocking in either mode.

## How Visual Tests Are Made

What:
- Use Playwright specs in `source/frontend/tests/` for user-visible browser behavior.
- Use `expectRenderedScreenshot()` for tolerant visual confirmation by default, not committed pixel snapshots.
- Use `test:visual-strict` / `test:visual-update` only when deliberately maintaining screenshot baselines.

Why:
- Visual tests should prove the app is not blank, the viewport renders meaningful pixels, core controls remain visible, and responsive layout does not introduce horizontal overflow.
- They should catch user-visible regressions that lint, typecheck, build, and loader unit tests cannot catch.

Where:
- Shared fixtures and diagnostics live in `tests/helpers/smoke-helpers.ts`.
- The static FBX fixture lives in `tests/test.fbx` so basic FBX parsing coverage does not depend on machine-local assets. Export coverage also creates a self-authored static scene in `src/loaders/fbx.test.ts`.
- The generated skinned GLB fixture lives in `tests/helpers/skinned-glb-fixture.ts` so e2e does not depend on redistributable FBX assets.
- Broad workflow coverage lives in `tests/smoke.spec.ts`.
- Focused visual layout coverage lives in `tests/visual.spec.ts`.
- Tauri desktop IPC behavior lives in `tests/native.spec.ts`.

How:
- Start from a real user flow: initial app shell, loaded SMF state, invalid file, export, native open/save, or static OBJ load.
- Assert DOM state first, then capture a rendered screenshot on the smallest surface that proves the visual behavior.
- Check console/page errors through `setupBrowserDiagnostics()` and `getBrowserErrors()`.
- Keep tests deterministic: prefer local fixtures, explicit viewport sizes, and tolerant rendered-byte screenshots unless strict snapshots are intentionally updated.
- Do not commit `playwright-report/` or `test-results/`; they are generated diagnostics and are ignored.
- Run `npm --workspace frontend run typecheck:test` after editing tests and `pwsh -File run.ps1 -Task test:e2e` before marking coverage current.
- Keep the Playwright web server on `build && preview` unless a replacement is proven against the full e2e suite.

## Relevance Rules

Keep a test only while it protects a current user path or a known pitfall.

Update or remove a test when:
- The feature, format, or UI surface it covers is intentionally removed.
- The assertion checks old copy/status text instead of the current user contract.
- The test duplicates another spec without adding a distinct risk check.
- The fixture is no longer representative of supported behavior.
- A strict snapshot fails from acceptable WebGL variance; convert to tolerant visual confirmation unless exact pixels are the intended contract.

When adding a test, document the covered risk in this README or `docs/dev/TODO.md` if it is tied to an active backlog item.

Current focused slices:
- Rig edit coverage lives in `src/utils/rigValidation.test.ts`, `src/utils/rigEdits.test.ts`, generated-skinned smoke coverage, and native canceled-save coverage where export state matters.
- Skin edit coverage lives in `src/utils/skinWeights.test.ts`, generated-skinned smoke coverage for paint/undo/redo/autoskin/normalize/export, and native canceled-save coverage for dirty state.
- Animation authoring coverage lives in `src/utils/animationEdits.test.ts`, timeline summary tests, generated-skinned smoke coverage, and native canceled-save coverage for dirty authored keys.
- Export cockpit coverage lives in `src/loaders/smfDiagnostics.test.ts`, `src/loaders/threeToSmf.test.ts`, generated-skinned smoke pass checks, static OBJ blocked diagnostics, and diagnostic report save assertions.
- Display/precision coverage lives in `src/utils/viewportLayout.test.ts`, `src/utils/skinPointOverlay.test.ts`, `tests/smoke.spec.ts`, and `tests/visual.spec.ts`.

Practical commands:
- Focused frontend unit gate: `cd source; npm --workspace frontend run test:unit`
- Test type safety: `cd source; npm --workspace frontend run typecheck:test`
- Full repo gate: `pwsh -File run.ps1 -Task verify` (includes context-bank validation, lint, app/test typecheck, production `any` boundary check, build, chunk guard, frontend units, and Rust cargo check)

Run from the repo root:

```powershell
pwsh -File run.ps1 -Task verify
pwsh -File run.ps1 -Task test:e2e
pwsh -File run.ps1 -Task test:e2e -GenEyeRoot C:\DevStuff\Three-sisters\GenEye
pwsh -File run.ps1 -Task test:e2e -NoGenEye
pwsh -File run.ps1 -Task test:visual-strict
```

Use `npm --workspace frontend run typecheck:test` after editing tests or Playwright helpers.
