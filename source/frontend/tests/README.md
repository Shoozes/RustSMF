# Frontend Tests

Current coverage:
- `src/loaders/*.test.ts` and `src/utils/*.test.ts`: Node unit tests for SMF coordinate/DQ math, binary bounds, roundtrips, guarded Three-to-SMF conversion, structured SMF export diagnostics, structured SMF roundtrip check serialization, modern skeleton helper metadata, skin-weight edit helpers, autoskin/normalize helpers, rig validation/edit helpers, and touched-vertex snapshot restore, model outliner summaries, animation timeline/keyframe summaries, editable animation keyframe helpers, edited clip conversion, SMF-source dirty animation patching, and (post 2026-06-15) SMF rig hierarchy (head-dummy skip, parent resolution, deform-only skel, SMF_Node names, golden fixture asserts on tree; direct `buildRigHierarchy` unit test with multi-head chain cases; makeBoneLabel + makeBoneHighlightMarker + updateHighlightPosition util tests with polyfill; labels truncation + canvas quality polish branch; createSeqGuard for async stale + modularity). Async load guards in useLoadModel covered by e2e smoke multi-load scenarios (no isolated hook unit to avoid extra deps). 2026-06-15 full review: canvas 2d polyfill hardened. Added related tests (this cycle): smfBoneNameToIndex (SMF_Node_N + _head suffix safety for pose/regex); buildRigHierarchy root-head + zero-bones edges; updateHighlightPosition with parented bone world pos (hierarchy for RAF marker); makeBoneLabel DPR/devicePixelRatio scaling; threeToSmf rig node list coverage; SMF diagnostics for missing skeleton, scale tracks, missing UVs/normals, and missing skin attrs; pure seq guard simulation for stale read-error rejection (newer succeeds, old error ignored, no mutation); skinWeights helper coverage for set/add/subtract/clamp/normalize/autoskin/invalid targets/dirty export block reason; rigValidation helper coverage for duplicate names, orphan parents, cycles, missing skin attrs, and invalid skin references; rigEdits helper coverage for selected-bone rename validation, animation track retargeting, reparent cycle/self-parent validation, reparent world-transform preservation, create-child validation, Skeleton inverse/buffer refresh, delete weighted-reference blocking, skinIndex remapping, and deleted-track removal. e2e smoke exercises labels-toggle wiring + multi-load seq guards.
- `tests/smoke.spec.ts`: Browser Playwright smoke coverage for app boot, real SMF load, viewport/animation/bone flows, modern skeleton helper rendering/picking, export UI, SMF diagnostics panel readiness, structured in-memory SMF roundtrip checks, diagnostic report save, invalid-load UX, FBX UI dispatch, and OBJ static load parity with blocked SMF diagnostics. Added mode-tab exercise (toggle rig/view/skin/animate/export post-load) for the modern editor foundation + mode-edge coverage, constrained-width mode switching without forced clicks, visible quad-pane overlay assertions, model-safe wireframe toggle assertions, Rig workspace validation plus selected-bone rename/reparent/create-child/delete rows, Outliner submodel visibility toggling, imported keyframe marker assertions, selected-bone keyframe authoring with Insert/Update/Delete/Copy/Paste and supported generated-skinned SMF roundtrip status, skin paint Undo/Redo stroke checks, Skin workspace Auto Skin button wiring, plus endpoint-handle drag checks in single + quad modes. Added async overlap coverage proving a delayed file-input read cannot overwrite a newer drop read result.
- `src/loaders/fbx.test.ts`: Unit coverage for true binary FBX export bytes and a static FBX export -> `loadFBX` roundtrip.
- `tests/helpers/skinned-glb-fixture.ts`: Generated self-authored skinned GLB fixture for non-SMF skinned load, guarded SMF export, and GLB export coverage.
- `tests/test.fbx`: Self-authored static ASCII FBX fixture for FBX loader coverage.
- `tests/visual.spec.ts`: Browser Playwright visual confirmations for desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, loaded SMF visual state, compact Display menu behavior, and single-view Ortho rendering.
- `tests/native.spec.ts`: Deterministic Tauri IPC mock coverage for native open/read/status, path-based non-SMF desktop binary reads, save/write, cancel behavior, dirty skin/animation edit preservation across canceled saves, and delayed-write rapid-export overlap (single-flight save guard).

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

Recent additions:
- 2026-06-29: Non-SMF Rig delete now blocks root and weighted-skin-reference deletes, compacts Skeleton data, remaps surviving skinIndex attributes, strips deleted animation tracks/authored keys/pose edits, and is covered by generated-skinned create -> transform -> delete -> SMF roundtrip/export smoke. Related commands: `cd source/frontend; npm run typecheck`, `cd source/frontend; npm run typecheck:test`, `cd source/frontend; npx tsx --test src/utils/rigEdits.test.ts src/utils/animationEdits.test.ts`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "generated skinned GLB load"`.
- 2026-06-29: Non-SMF Rig create-child now validates parent/name inputs, initializes inverse bind data, refreshes Skeleton buffers, selects the new child, and is covered by generated-skinned create -> transform -> SMF roundtrip/export smoke. Related commands: `cd source/frontend; npm run typecheck`, `cd source/frontend; npm run typecheck:test`, `cd source/frontend; npx tsx --test src/utils/rigEdits.test.ts`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "generated skinned GLB load"`.
- 2026-06-29: Non-SMF Rig reparent now validates selected/parent bones, rejects self-parenting/cycles, preserves the selected bone's world transform, and is covered by generated-skinned GLB smoke after rename. Inspector hierarchy expansion now survives rename by tracking bone UUIDs. Related commands: `cd source/frontend; npm run typecheck`, `cd source/frontend; npm run typecheck:test`, `cd source/frontend; npx tsx --test src/utils/rigEdits.test.ts`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "generated skinned GLB load"`.
- 2026-06-29: Non-SMF Rig rename now validates selected-bone names, retargets runtime animation tracks, moves authored animation edit keys, and is covered in the generated-skinned GLB export smoke path. Related commands: `cd source/frontend; npm run test:unit`, `cd source/frontend; npm run typecheck`, `cd source/frontend; npm run typecheck:test`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "generated skinned GLB load"`.
- 2026-06-29: Rig validation now has pure unit coverage for no skeleton, duplicate names, orphan parents, cycles, missing skin attributes, and skin indices outside the skeleton; smoke coverage asserts no-model warning and generated-skinned pass state in Rig mode. Related commands: `cd source/frontend; npx tsx --test src/utils/rigValidation.test.ts`, `cd source/frontend; npm run typecheck`, `cd source/frontend; npm run typecheck:test`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "mode switching without model|skin dirty state resets"`.
- 2026-06-29: Skin autoskin/normalize helpers now have pure unit coverage for full-mesh normalization and inverse-distance bone segment scoring; Skin workspace Auto Skin/Normalize buttons are covered in the generated-skinned smoke path. Related commands: `cd source/frontend; npm run typecheck`, `cd source/frontend; npm run typecheck:test`, `cd source/frontend; npm run test:unit -- skinWeights`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "skin paint updates edit state"`.
- 2026-06-29: Skin paint undo/redo coverage now asserts no-model disabled state, touched-vertex snapshot restore helpers, deterministic dirty true -> undo false -> redo true browser behavior, and supported SMF export after redo. Related commands: `cd source/frontend; npm run test:unit`, `cd source/frontend; npm run typecheck:test`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "skin paint updates edit state"`.
- 2026-06-29: Export cockpit roundtrip results now expose structured check rows/codes for counts, geometry, bounds, animation timing/metadata, and first/last-frame pose; saved report serialization is unit-covered, generated skinned GLB e2e asserts pass checks, and static OBJ e2e asserts blocked SMF diagnostics. Related commands: `cd source/frontend; npm run test:unit`, `cd source/frontend; npm run typecheck:test`, and `cd source/frontend; npx playwright test tests/smoke.spec.ts -g "generated skinned GLB load|OBJ static"`.
- 2026-06-29: Outliner submodel visibility and timeline/keyframe authoring coverage now asserts real model-derived rows, display-only hide/show state, active clip keyframe markers, Animate workspace summary data, Insert/Update/Delete/Copy/Paste controls, interpolation selection, and generated-skinned SMF roundtrip status after dirty keyframe edits. Related commands: `npm --workspace frontend run test:unit`, `npm --workspace frontend run typecheck:test`, `npx playwright test tests/smoke.spec.ts -g "can load a real SMF sample and basic UI updates"`, and `npx playwright test tests/smoke.spec.ts -g "animation keyframe authoring"`.
- 2026-06-19: Toolbar/display and Ortho regression coverage now asserts the grouped Display menu opens without horizontal overflow, real SMF single-view Ortho renders after the camera toggle, and tiny ortho pane math stays finite/pickable. Related commands: `npm --workspace frontend run test:unit`, `npx playwright test tests/smoke.spec.ts -g "viewport layout toggle works in single/quad modes"`, and `npx playwright test tests/visual.spec.ts`.
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
