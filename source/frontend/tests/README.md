# Frontend Tests

Current coverage:
- SMF Rig policy coverage proves exact disable reasons for rename/structure/bind-transform/mirror controls, enables only inverse-bind local reset, and exercises reset dirty-state plus undo/redo against the real SMF fixture.
- TransformControls coverage mounts the public `getHelper()` scene root, projects a real picker handle for deterministic browser drag, proves Rig drags write pose history while Animate drags write animation history, and keeps the explicit Endpoint tool isolated from the gizmo.
- Rig IK coverage spans pure bounded CCD/reach/constraint/stale-chain/local-length tests, pointer-owner routing, real SMF drag/Escape cancel/atomic undo-redo, SMF export/reimport diagnostics, validated GLB export, and a saved browser visual artifact for the labeled target/settings/posed-model state.
- `src/loaders/*.test.ts`, `src/hooks/*.test.ts`, `src/store/*.test.ts`, and `src/utils/*.test.ts`: Node unit tests for SMF coordinate/DQ math, binary bounds, roundtrips, guarded Three-to-SMF conversion, typed DOM/Three/settings boundaries, identity-deduplicated geometry/material/texture/skeleton disposal, structured SMF export diagnostics, material texture summaries/shared-use groups, source-safe preview/export restoration, per-format texture policy, bounded pose/skin drift detection, real-fixture identity, inverse-bind reset, editor history, animation editing, viewport routing/layout, display helpers, skin authoring/indexing, rig validation/editing/hierarchy, model outliner, and timeline behavior. Shared Node canvas/image setup lives in `src/test/installImageTestPolyfill.ts`; tests do not maintain duplicate DOM shims.
- `tests/smoke.spec.ts`: Browser Playwright smoke coverage for app boot, real SMF load, viewport/animation/bone flows, modern skeleton helper rendering/picking, export UI, SMF diagnostics, invalid-load UX, FBX/OBJ dispatch, workspace/layout continuity, non-SMF Rig tools, Outliner actions, timeline/animation authoring, TransformControls/Endpoint/IK ownership, Skin authoring, async overlap, and export behavior. Async browser paths cover delayed input/drop success and error in both arrival orders, atomic failed replacement with retained root/selection/pose/animation edits, winning-load reset of pose/skin/animation edits, and one global browser download across simultaneous diagnostic/model save actions. The loaded-authoring transition matrix proves stable model-root identity, object/bone selection, paused playback time, export status, pose/skin/animation dirty state, and exclusive Select/Endpoint/IK handles across single/quad/Ortho and all workspace modes. The real-SMF Rig policy flow asserts exact reasons, disabled structural controls, bind-reset dirty-state transitions, roundtrip success, and undo/redo.
- `src/loaders/fbx.test.ts`: Unit coverage for true binary FBX export bytes and a static FBX export -> `loadFBX` roundtrip.
- `tests/helpers/skinned-glb-fixture.ts`: Generated self-authored skinned GLB fixture for non-SMF skinned load, guarded SMF export, material texture summary rows, and GLB export coverage.
- `tests/test.fbx`: Self-authored static ASCII FBX fixture for FBX loader coverage.
- `tests/visual.spec.ts`: Browser Playwright visual confirmations for desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, loaded SMF visual state, compact Display menu behavior, narrow quad label/divider overlap safety, and single-view Ortho rendering.
- `tests/native.spec.ts`: Deterministic Tauri IPC mock coverage for native open/read/status, path-based non-SMF desktop binary reads, delayed picker/read/write success and error races, export completion invalidation by newer successful/failed loads, save/write global single-flight, cancel behavior, dirty skin/animation edit preservation across canceled saves and subsequent panel changes, and model-root/status/selection continuity.
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

## Authoring History Contract

| Current action | Classification | Transaction/proof owner |
| --- | --- | --- |
| Pose nudge/bind reset | Undoable pose mutation | Editor pose snapshots; inverse-bind local reset unit plus real-SMF dirty/undo/redo/roundtrip smoke |
| Select-tool TransformControls | Undoable pose in Rig; undoable key upsert in Animate; detached in Skin | Real picker-handle smoke proves owner separation and SMF roundtrip; Skin smoke proves paint-exclusive ownership |
| Endpoint tool | Undoable pose mutation | One completed drag per pose transaction; single/quad proof and pointer-cancel restoration without history |
| Rig IK | Undoable multi-bone pose mutation | Whole-chain cancel plus one transaction; pure solver, real-SMF, export, and visual proof |
| Non-SMF rig rename/reparent/create/delete | Undoable structural mutation | Rig snapshots plus unit and browser undo/redo coverage |
| Non-SMF Add child/Move/Rotate/Detach/Connect/Spin | Undoable structural mutation | One transaction per action/drag; unit and browser undo/redo coverage |
| Animation key CRUD/paste/marker drag and clip CRUD/order/loop/sample metadata | Undoable animation mutation | Animation key/workspace snapshots plus browser undo/redo and export checks |
| Skin stroke/Normalize/Auto Skin/Auto Paint | Undoable skin mutation | Touched-vertex/batch snapshots plus unit, browser, and canceled-save checks |
| Outliner individual/bulk visibility | Undoable display-session mutation | Outliner snapshots plus chronological toolbar/keyboard smoke |
| Selection, hover, workspace/layout, playback/scrub, tool/snap/brush settings, copied-key clipboard, and Display toggles | Selection, display, or configuration only | Intentionally excluded from destructive history; continuity and visual smoke protect state |
| Load/open/drop and export/save | Lifecycle operations, not authoring history | Unified latest-intent load sequence, atomic replacement, stale-root disposal, load-aware export sequence, global save single-flight, native/browser delayed-result matrices, roundtrip validation, and canceled-save tests |

Any new model, rig, pose, skin, animation, or persistent visibility mutator must join one undoable row or be explicitly classified as non-destructive before shipping.

Current focused slices:
- Rig edit coverage lives in `src/utils/rigValidation.test.ts`, `src/utils/rigEdits.test.ts`, generated-skinned smoke coverage, and native canceled-save coverage where export state matters.
- Skin edit coverage lives in `src/utils/skinWeights.test.ts`, `src/utils/skinBrushIndex.test.ts`, generated-skinned smoke coverage for empty-space miss safety, paint/Auto Paint/candidate bounds/toolbar undo-redo/autoskin options/normalize/export, and native canceled-save coverage for dirty state.
- Animation authoring coverage lives in `src/utils/animationEdits.test.ts`, timeline summary tests, generated-skinned smoke coverage for key tools, lane gestures, snap-step authoring, active-clip duplicate/rename/delete/reorder plus loop/sample metadata undo-redo, and native canceled-save coverage for dirty authored keys.
- Export cockpit coverage lives in `src/loaders/smfDiagnostics.test.ts`, `src/loaders/threeToSmf.test.ts`, `src/hooks/poseEdits.test.ts`, generated-skinned smoke pass checks, static OBJ blocked diagnostics, SMF scale-edit blocking, and diagnostic report save assertions.
- Editor history coverage lives in `src/utils/editorHistory.test.ts` plus generated-skinned smoke coverage for global pose Undo/Redo and cross-domain Outliner/pose chronology.
- Display/precision coverage lives in `src/utils/viewportLayout.test.ts`, `src/utils/skinPointOverlay.test.ts`, `src/utils/materialPreview.test.ts`, `src/utils/materialPolicy.test.ts`, `tests/smoke.spec.ts`, and `tests/visual.spec.ts`. The textured generated-GLB smoke activates Tex-off, repeat, linear filter, Legacy, and Mesh fade together, then proves the downloaded GLB still contains image/texture records and that preview telemetry is restored.
- Viewport interaction routing coverage lives in `src/utils/viewportInteractionRouter.test.ts` plus smoke assertions on `data-pointer-owner`, `data-viewport-pane-role`, `data-viewport-picked-bone`, View-mode model picking, Outliner selection sync, context readiness, explicit Endpoint ownership, and real TransformControls helper/axis/drag/owner telemetry.

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
