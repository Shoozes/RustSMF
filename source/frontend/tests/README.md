# Frontend Tests

Current coverage:
- `src/loaders/*.test.ts`: Node unit tests for SMF coordinate/DQ math, binary bounds, roundtrips, guarded Three-to-SMF conversion, structured SMF export diagnostics, count-based SMF roundtrip summary comparison, modern skeleton helper metadata, and (post 2026-06-15) SMF rig hierarchy (head-dummy skip, parent resolution, deform-only skel, SMF_Node names, golden fixture asserts on tree; direct `buildRigHierarchy` unit test with multi-head chain cases; makeBoneLabel + makeBoneHighlightMarker + updateHighlightPosition util tests with polyfill; labels truncation + canvas quality polish branch; createSeqGuard for async stale + modularity). Async load guards in useLoadModel covered by e2e smoke multi-load scenarios (no isolated hook unit to avoid extra deps). 2026-06-15 full review: canvas 2d polyfill hardened. Added related tests (this cycle): smfBoneNameToIndex (SMF_Node_N + _head suffix safety for pose/regex); buildRigHierarchy root-head + zero-bones edges; updateHighlightPosition with parented bone world pos (hierarchy for RAF marker); makeBoneLabel DPR/devicePixelRatio scaling; threeToSmf rig node list coverage; SMF diagnostics for missing skeleton, scale tracks, missing UVs/normals, and missing skin attrs; pure seq guard simulation for stale read-error rejection (newer succeeds, old error ignored, no mutation). e2e smoke exercises labels-toggle wiring + multi-load seq guards.
- `tests/smoke.spec.ts`: Browser Playwright smoke coverage for app boot, real SMF load, viewport/animation/bone flows, modern skeleton helper rendering/picking, export UI, SMF diagnostics panel readiness, in-memory SMF roundtrip check, diagnostic report save, invalid-load UX, FBX UI dispatch, and OBJ static load parity. Added mode-tab exercise (toggle rig/view/skin/animate/export post-load) for the modern editor foundation + mode-edge coverage, constrained-width mode switching without forced clicks, visible quad-pane overlay assertions, model-safe wireframe toggle assertions, plus endpoint-handle drag checks in single + quad modes. Added async overlap coverage proving a delayed file-input read cannot overwrite a newer drop read result.
- `tests/helpers/skinned-glb-fixture.ts`: Generated self-authored skinned GLB fixture for non-SMF skinned load, guarded SMF export, and GLB export coverage.
- `tests/test.fbx`: Self-authored static ASCII FBX fixture for FBX loader and GLB-export dispatch coverage.
- `tests/visual.spec.ts`: Browser Playwright visual confirmations for desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, and loaded SMF visual state.
- `tests/native.spec.ts`: Deterministic Tauri IPC mock coverage for native open/read/status, path-based non-SMF desktop binary reads, save/write, cancel behavior, and delayed-write rapid-export overlap (single-flight save guard).

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
- The static FBX fixture lives in `tests/test.fbx` so basic FBX parsing/export coverage does not depend on machine-local assets.
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

Recent additions:
- 2026-06-16: SMF root-head/self-parent regression coverage now proves the real `mixamo_smf_baldguy.smf` fixture loads without hanging, bind-pose skinning remains stable, and skipped head dummy nodes do not emit missing-target animation warnings. Run the targeted SMF unit slice plus `npm --workspace frontend run test:e2e -- tests/smoke.spec.ts -g "can load a real SMF sample"` after hierarchy changes.
- 2026-06-16 (launcher process safety): dev server lifetime / no-rogue-on-close covered by harness (run.ps1 Job+tree+scans+stale + mjs wrapper). Manual verification: `pwsh -File run.ps1`; load; close cmd X or Tauri window; confirm no node listening on 5173 (`Get-NetTCPConnection -LocalPort 5173` or tasklist); re-launch clean. Risk: orphan processes post-close (fixed layered; see PITFALL + summary_bank subsystem__dev_process_lifecycle). E2e uses preview (playwright-managed).
- 2026-06-18 review: loader clips contract direct after removing legacy root.attach casts + fallback (smf/glb/fbx/obj); tauri client memoized for reduced repeated dynamic import timing; Tauri window/selected path casts narrowed with typed interfaces/helpers. Re-ran units (47 pass), cargo (5), typechecks, verify (green) post-edit. Related coverage: existing clip roundtrips + seq guard tests exercise load paths.
- Prior: e2e mode-tab interaction expanded (exercises new editorMode state flow + combinations with labels toggle and bone picker/selection after mode changes); reset to default view; verifies no crash, status updates, canvas stable. Dedicated Skin/Animate/Export mode panels are now asserted in the same smoke path. Risk covered: mode UI edges + mode-specific workspace visibility + interactions for scalability of workspaces.

Practical commands for recent work (bone hierarchy, labels/highlight makers, seqGuard, name index/regex):
- Targeted: `cd source/frontend; npx tsx --test --test-name-pattern="smfBoneNameToIndex|root-head|resolves world position|DPR scaling|buildRigHierarchy directly|createSeqGuard|makeBoneLabel util|makeBoneHighlightMarker" src/loaders/coord.test.ts`
- Full relevant units (slower due to real SMF skin regression test + canvas polyfills): `cd source; npm --workspace frontend run test:unit`
- Type safety for tests: `cd source; npm --workspace frontend run typecheck:test`
- Full repo gate (includes the above + lint/build/chunk/cargo; units can take >5min in some envs): `pwsh -File run.ps1 -Task verify`

Run from the repo root:

```powershell
pwsh -File run.ps1 -Task verify
pwsh -File run.ps1 -Task test:e2e
pwsh -File run.ps1 -Task test:e2e -GenEyeRoot C:\DevStuff\Three-sisters\GenEye
pwsh -File run.ps1 -Task test:e2e -NoGenEye
pwsh -File run.ps1 -Task test:visual-strict
```

Use `npm --workspace frontend run typecheck:test` after editing tests or Playwright helpers.
