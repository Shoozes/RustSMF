# Frontend Test Contract

`RUSTSMF_PLAYWRIGHT_PORT=53173` avoids occupied 5173; keep gates sequential.

## Original Sable asset pack

`blackCatAsset.test.ts` checks hashes, topology/skin, dense loop/floor motion
and mutation controls. Browser/journey checks cover playback, recovery, project
and queued GLB, including texture/influences and 424 motion times. The sample
guide owns rebuilding/limits; private media stays excluded.

## Export queue

`export-queue.spec.ts` covers four explicit presets through ordinary chooser, pointer and keyboard paths. Independent GLB accessors prove geometry, raw influences, hierarchy and known motion after each format's re-import. FBX and DAE also receive structural checks; SMF expects generated joint names and byte-weight quantization. Decoded PNG pixels and source materials prove texture capture. Other cases cover owned captures after edits/replacement, mesh-only options, safe names, imported SMF fidelity, preparation cancellation, retry without repeated successes, mocked destination cancel/write failure, issued saves, recovery serialization and cancellation while waiting for recovery. Six viewport sizes, DPR 1/1.25/2, coarse targets, overflow, Escape and focus return cover the disclosed controls.

A generated `EXT_mesh_gpu_instancing` input independently checks instance translations through queue export/re-import. Snapshot units distinguish repeated private track/attribute copies from interleaved sharing, include texture backing/instance allocations and prove private geometry metadata/morph pixels with owned disposal. Material-reader units defer display changes until the final reader and then restore the latest settings.

`src/utils/exportQueue.test.ts` proves bounded order, cancellation, failure/retry, stale results and disposal. `src/hooks/exportSnapshot.test.ts` proves copied authoring state, source-material restoration and cleanup. `src/utils/materialPreview.test.ts` covers nested/overlapping source readers and material registration replacement during a save. `src/loaders/dae.test.ts` guards joint `sid` output; the browser round-trip verifies named animated joints. Actual native dialogs and installed-app queue acceptance remain separate. [EXPORT_QUEUE.md](../../../docs/dev/EXPORT_QUEUE.md) owns the user and lifecycle contract; HISTORY owns final results.

## Portable sampler

`retargetPortable.test.ts` / `retargetInventory.test.ts` guard copied data and
all solver fields. Runtime proof adds 14 sampler cases, 20 refusals and WASM
cancellation. [Contract and native guards](../../../docs/dev/RETARGET_SAMPLER.md).

## Retarget assistance

`retarget-transfer.spec.ts` exercises actual browser WASM analysis and module-worker baking through ordinary file selection and named controls. It checks canonical project/export preservation during private playback/seek/speed changes, reviewed explicit-map export, mapping correction, discard, apply/history, cancellation during analysis/baking, stale completion, leaving Animate with retained drafts, and actionable WASM failure with continued editing. `native.spec.ts` separately covers mocked preflight/cancel IPC and actual worker baking without a browser WASM request; it is not native Rust execution or OS-dialog evidence.

`src/workers/retargetJobClient.test.ts` owns preparation/analysis/bake cancellation, revision correlation, replacement/disposal, timeouts, invalid responses, startup/post/runtime errors and native cancellation/late-result rejection. `retargetSnapshot.test.ts` guards owned rest/helper transforms, standard interpolation, copied buffers and private preview resource disposal. `retargetCubicSpline.test.ts` decodes a first-party glTF with nonzero Hermite tangents, checks independent known position/rotation/scale values, preserves reference clips and rejects unknown/malformed custom interpolation. The browser cubic-source case verifies those values through actual workers, Apply/history and project reopen. Existing animation, endpoint, twist, constraint and scale fixtures run through `retargetParity.ts` as well as the reference solver, comparing tracks/reports within `1e-6`.

`run.ps1 -Task retarget:runtime-proof` rebuilds the shared core and compares native Rust with actual Chromium WASM across 17 first-party cases for all naming families, fingers, ambiguity, helpers, overrides, opaque rigs, proportions, reference frames and unmapped channels. Mappings/diagnostic structures are exact; numeric fields use `1e-6` relative/absolute tolerance. The retarget continuity journey previews/discards without changing saved work, then applies once and independently inspects sampled exported motion through undo/redo, project reopen and GLB re-import. Final candidate results belong in HISTORY.

## Modern task navigation

Raw cubic authoring is guarded by `src/utils/animationEdits.test.ts` and `animationAuthoringController.test.ts`: independently derived position/scale curves, tangent time units, normalized rotations, decimal key bounds, held endpoints, sub-frame timing, locks, unchanged buffers/channels and atomic refusals. Two `animation.spec.ts` flows use ordinary file chooser, pointer and Enter actions to verify Trim/Retime, a refused rotation cut with dirty work, single-step history, project reopen, continued editing and GLB export/re-import. `helpers/asset-evidence.ts` independently reads accessors and evaluates cubic data as Bezier control points; fixture polynomials provide a separate numerical oracle.

`helpers/modern-shell.ts` follows authoring controls through their visible task tab and native disclosure before acting. It uses pointer/keyboard controls, never editor-state setters or CSS visibility overrides. Existing semantic assertions remain in their feature/journey owners. Model, Rig, Skin and Animate keep inactive task content mounted so drafts survive tab changes. The six-size authoring lane owns selected controls, invalid profiles, Live Skin warnings, overflow and drawer focus return.

`workspace-tasks.spec.ts` guards arrow wrapping/Home/End, one tab stop and named panel relationships, visible focus traversal/Escape return, unfinished clip/profile fields, keyboard file selection with empty-selection cancellation, profile errors after disclosure closure, Skin unsaved visibility/history in Scene at wide/narrow sizes, and 44 px coarse-pointer symbols/tabs in every workspace. Enter/Space press the named picker after its event subscription and focus check. Space activates authoring controls without changing playback; R/S typed in a rig field preserve its transform mode. Companion assertions retain viewer shortcuts outside controls. `ModernSkinWorkspace.test.ts` checks clean/dirty/export-block notice rendering. Picker automation is browser evidence, not native Windows dialog evidence. Prior reviewed task/DPI captures remain source-specific.

## Preview rendering and Help

`preview-readiness.spec.ts` independently inspects the distributed Signal Robot GLB (five bones, three materials, normalized raw skin, two moving two-second clips) and opens it through the ordinary file input. Six viewport cases prove visible model pixels with grid, axes and rig helpers disabled, concise status/disclosed details, offline Help layout, focus wrapping, Escape and close-button focus return.

`helpers/render-evidence.ts` decodes PNG pixels; `expectRenderedScreenshot` masks HTML overlays and polls for actual scene content. `render-evidence.spec.ts` rejects uniform canvases and an image larger than the former byte threshold whose only content is surrounding chrome. It also rejects truncated PNGs. Empty-shell captures prove layout, not loaded model rendering. Strict references retain their existing owners.

The authored sample generator and its unit checks are `scripts/generate-preview-demo.ts` and `src/utils/previewDemo.test.ts`; fixture/provided-asset grants are documented separately in `fixtures/PROVENANCE.md`.

Installed Windows evidence is separate from these browser/IPC assertions. The local integrity candidate passed desktop smoke, NSIS packaging and ten real UI/cleanup cases on 2026-10-11: invalid selections with preserved history, Open/Save cancellation, project reopen/continued editing, independently parsed GLB export/re-import, valid sidecars, recovery and Help focus return. Exact source/installer/executable/resource identities, two reviewed captures and restored recovery/owned cleanup are in `output/windows-integrity-20261011/` and HISTORY. Fault-injected reply counts and browser quota refusal retain their automated lane; the public preview keeps its original installer acceptance.

The test layout mirrors runtime ownership. Keep behavior in the narrowest suite that owns the risk; do not rebuild a single catch-all smoke file.

Skin paint and cancellation use shared viewport probes in `helpers/viewport-interactions.ts`. Require a confirmed mesh hover hit before pointer-down so missed probes cannot orbit the camera. Cancellation still verifies unchanged raw influences and history through the actual gesture path.

Run `verify` and browser/preview gates sequentially in one checkout. Both build
the same production output; a concurrent rebuild can replace assets while the
browser requests them, causing startup 404s before any app assertions run.

## Routine report retention

Browser-only runs, journeys and strict checks default to the list reporter plus one bounded `summary.json` in the configured test output directory. The compact reporter preserves native status, outcome/final-result counts, retries, skipped/unrun tests, global errors and up to eight bounded failure details with artifact paths; omitted counts stay explicit. It emits at most 64 KiB. `src/test/playwrightReporter.test.ts` exercises actual passing/flaky/expected-failure/skipped runs, failures and discovery errors, plus byte bounds and default configuration.

HTML is an explicit diagnostic option: `npm run test:e2e -- --reporter=html,list`. Set `RUSTSMF_CAPTURE_UI_REVIEW=1` for successful layout/Help/profile captures; they use the current test's output directory instead of overwriting a previous evidence batch. The capture helper's unit checks cover default suppression and explicit owner/framing. Failure screenshots/video/traces, decoded-pixel checks, required strict references and hand-wave evidence retain their owning contracts. GenEye's `--reporter=json` manifests retain their existing native JSON transport contract. No existing referenced evidence is retired by changing these defaults.

## Verification Gates

- `pwsh -File run.ps1 -Task verify`: context-bank validation/tests, fail-closed ESLint coverage, lint, app and test typechecks, production `any` guard, production build, chunk checks, frontend units, and Rust fmt/clippy/tests/check.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright through the checked `geneye-playwright.json` argv manifest with deterministic GenEye artifact review; add `-NoGenEye` for the independent browser-only lane.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey -NoGenEye`: runs twelve stories sequentially through `playwright.journey.config.ts`: the retained hand-wave and four core product journeys, a malformed project/recovery story, five authoring-continuity journeys for profiles, Rig, IK/animation, Skin, and Model/materials, and the original Sable project/queue story. The hand-wave capture is written under ignored `output/playwright/hand-wave-journey/`; raw results use ignored `test-results/product-journeys/`.
- `npm.cmd run test:journey:hand-wave`: targeted hand-wave run for focused repair work.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native tests, and the native IPC browser suite.
- `pwsh -File run.ps1 -Task retarget:runtime-proof`: native/real-browser-WASM mapping and diagnostics parity, with an ignored compact receipt.
- `pwsh -NoProfile -File .\run.ps1 -Task package:windows`: NSIS installer build; prints the artifact path and SHA-256.
- Rust owns dialog invocation through its pinned `tauri-plugin-dialog` dependency; the frontend has no unused dialog-plugin package. Native resource-bundle reads, staged writes, and project recovery remain deterministic IPC contracts; true OS-dialog interaction is evidence-gated.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in committed WebGL snapshots.
- `pwsh -File run.ps1 -Task test:visual-update`: intentional strict-baseline refresh only.

Playwright may require execution outside a managed sandbox when Chromium launch is rejected with `spawn EPERM`. That is a harness permission failure, not an application test failure. The local browser lane is authoritative; exact suite counts and outcomes belong in the dated verification record in `docs/dev/HISTORY.md`.

The local Node 26.5 lane emits `[DEP0205] module.register()` from Playwright 1.60's TypeScript ESM loader. It is an upstream runner deprecation warning, not an app/test failure; do not suppress it or disable Playwright's TypeScript loader. The workspace's declared Node range is `^22.13.0 || >=24`, matching the pinned build tools.

If a managed run reaches the test bodies but exits with `browserContext.close: spawn EPERM`, classify it as teardown-only harness evidence, keep the nonzero exit honest, and verify that the runner-owned preview server on port 5173 is stopped before the next command. Do not weaken teardown assertions or label the command green.

For a process-local browser executable override, use an approved existing absolute path without changing repo or sandbox policy:

```powershell
$env:RUSTSMF_PLAYWRIGHT_EXECUTABLE = '<approved-absolute-Chrome-or-Edge-path>'
npm.cmd run test:e2e -- --reporter=line
```

## Supported Feature Evidence Matrix

This matrix covers supported fixture behavior in Chromium and deterministic
Tauri IPC mocks. Each reference below names executable assertions, not a manual
checklist. The final candidate must pass every referenced owning suite and the
separate journey gate. Real Windows dialogs and arbitrary third-party assets
are separate acceptance lanes. Known format restrictions remain explicit.

Paths in this table are relative to this directory unless prefixed `src/`
(relative to the frontend). `journeys/` stories exercise ordinary pointer,
keyboard, and file-selection paths without forced clicks or editor-state setters.

| Supported capability | Positive evidence | Protection, history, or continuity evidence |
| --- | --- | --- |
| Browser Open: SMF, GLB, GLTF, FBX, DAE, OBJ | `format-dispatch.spec.ts`: six Open/default-export/re-import cases, independent geometry/bone/clip/motion checks | `lifecycle.spec.ts`: selected read failures and latest-intent success/error races |
| ZIP bundle intake | `archive-intake.spec.ts`: all formats, nested sidecars, explicit choice, parsed geometry/weights/motion and project continuity through the real worker | Parser/client units: unsafe records/paths, CRC/size bounds, cancel/timeout/stale results; browser: preserved edits, mocked native read cancel/retry and six-size keyboard/touch checks |
| Native Open/read/save boundaries | `native.spec.ts`: native open/read/export and bounded GLTF bundle | Multiple-model/no-model rejection before reads, short/extra payload rejection, preserved edits/history/retry, native cancel, malformed bytes, delayed picker/read and write serialization |
| Drag/drop loading | `lifecycle.spec.ts`: latest async load wins between file input and drop | Stale read errors and dirty replacement cases in that suite |
| Selected FBX/GLTF sidecars and ready textures | `journeys/format-roundtrip.journey.spec.ts`: decoded embedded PNG, named bones and animated FBX round trip | `journeys/failure-preserves-work.journey.spec.ts`: missing buffer cancel/discard retains semantic asset and continued edits |
| OBJ/MTL, DAE resources, PNG/JPEG bounds | `export-formats.spec.ts` sidecar cases; `src/utils/modelResourceBundle.test.ts`, `src/utils/materialRepair.test.ts`, `src/utils/imagePayload.test.ts` | Missing/ambiguous/unsafe URI, signature, dimension, aggregate decoded-memory and cleanup cases in those owners |
| Original Sable model/animation pack | `black-cat.spec.ts`: ordinary Open, four clips and moving decoded model pixels | `blackCatAsset.test.ts`: independent topology/raw skin/known motion; Sable journey: project/queue/re-import and continued history |
| Project save/open and new edits | `journeys/project-continuity.journey.spec.ts`: decoded envelope/GLB, rename/reopen/edit/undo/redo | Malformed project and dirty cancel/discard in `journeys/failure-preserves-work.journey.spec.ts` |
| Serialized selection, clip, time, speed and rig metadata | `project-recovery.spec.ts`: restored explicit state, semantic saved motion and subsequent edits | Recovery cancel retains dirty root; discard restores project; new history remains usable |
| Recovery generations and corrupt storage | `project-recovery.spec.ts`: IPC recovery, save and single write ownership | Browser quota refusal is visible, keeps prior recovery bytes and live edits, permits independently decoded manual save, and retries when storage returns; malformed recovery journey and `src/utils/projectCodec.test.ts` envelope bounds |
| Foreground save and autosave ownership | `native.spec.ts`: export waits for active autosave and coalesces newest edits; `export-queue.spec.ts`: serialized queue and cancelable recovery wait | Native rapid save, stale completion, replacement waits and cancel; issued queue writes settle honestly; successful autosave keeps an unrelated load error visible; recovery retry clears only its own warning |
| Modern commands, workspace chooser and one drawer | `modern-shell.spec.ts`: six visible desktop command buttons, one strip under 48 px, hidden workspace choices and tools closed on load; all choices/actions remain reachable | Keyboard trap, menu/drawer Escape and focus return, coarse-pointer targets, backing DPR 1/1.25/2 |
| Themes and compact layouts | `visual.spec.ts`: Modern six-size matrix and Original persisted shell | Original strict snapshot; `src/theme.test.ts`, project integrity palette/scope guards |
| Bone/clip keyboard selection | `modern-shell.spec.ts`: keyboard hierarchy expansion, selection, clip switching and visible focus | Pointer selection remains exercised by all authoring journeys |
| Camera orbit/pan/zoom/reset, scale fitting, single/quad and 3D/ortho | `shell-model.spec.ts`: shared camera focus, scale-independent fitting and layouts; `visual.spec.ts` viewport/menu cases | `src/utils/viewportLayout.test.ts` and browser camera-state checks |
| Bone aliases, labels and viewport picking | `journeys/hand-wave.journey.spec.ts`: hover/pick aliases and real character hierarchy | `rig.spec.ts` and `src/utils/boneAliases.test.ts` preserve source identifiers |
| Outliner selection, multiselect and visibility | `shell-model.spec.ts`: select/hide/unhide/context actions and overlays | Global chronology in `lifecycle.spec.ts`; post-reopen visibility undo in Model/material journey |
| Static rename/order/duplicate/delete | `journeys/model-material-continuity.journey.spec.ts`; `export-formats.spec.ts` static authoring and sibling order | Undo/redo, project/GLB continuity; SMF/source-binding disabled contracts |
| Static transforms and material assignment | Model/material journey verifies decoded matrix TRS; `export-formats.spec.ts` surface authoring | `src/utils/modelSurfaceAuthoring.test.ts` rejects animated/skinned/SMF targets and invalid materials |
| Flip winding, normals/tangents and append | Model/material journey and `export-formats.spec.ts` static authoring | Undo and restored geometry; `src/utils/modelSurfaceAuthoring.test.ts` bounded append/failure guards |
| Rigged material repair and texture embedding | Model/material journey: independent image signature and source geometry/skin preservation | Semantic undo/redo and project reopen; `src/utils/materialRepair.test.ts` PBR maps, failure cleanup and source isolation |
| Display overlays, opacity, textures and diagnostics | `shell-model.spec.ts` display controls; `visual.spec.ts` menus/quad labels | `src/utils/viewportDisplayController.test.ts`, `src/utils/materialPreview.test.ts`, `src/utils/geometryDiagnostics.test.ts`: disposable/read-only source and export isolation |
| Static root skeleton preparation | `journeys/rig-continuity.journey.spec.ts`: hierarchy, raw root influences and compatible SMF export | `rig.spec.ts`: undo/redo, dirty replacement and unsupported static-SMF gate |
| Rig rename/add/delete/reparent/detach/spin | Rig continuity journey covers creation, rename, deletion and restored hierarchy; `src/utils/rigEdits.test.ts` owns structural operations | `rig.spec.ts` SMF policy; rig edit tests cover cycles, weighted deletion, clip bindings and source-safe index remapping |
| Rig metadata axis/lock/pin/save/load/clear | Rig continuity journey verifies actual standalone JSON and project state | Rename preserves metadata, created bones gain defaults, delete/undo restores it; IK journey respects root locks/pins |
| Pose nudges, bind reset and gizmo ownership | `rig.spec.ts`: pose undo, bind reset and real TransformControls | `animation.spec.ts`: Rig pose versus Animate key ownership; `src/hooks/poseEdits.test.ts` |
| Endpoint and constrained IK gestures | `rig.spec.ts`: single/quad Endpoint, IK settings and bounded drag | Cancel/atomic history; IK journey independently checks restored rotations and locked/pinned root |
| Explicit IK solve-and-bake | `journeys/ik-animation-continuity.journey.spec.ts`: fresh target bake and saved authored clip | Undo/redo invalidates stale target; clip locks and bounded solver cases in `src/utils/rigIk.test.ts` and animation owners |
| Clip create/duplicate/rename/delete/order/duration/retime/trim | `animation.spec.ts` clip tools, pose-based creation and finite trim | Transaction undo/redo and locked-bone policy; IK and hand-wave project continuity |
| Bone/Branch/Full Rig key insert/update/delete/copy/paste/move | `animation.spec.ts` scoped keys and timeline gestures; IK journey Branch clipboard/editing | `src/utils/animationScope.test.ts`, `src/utils/animationEdits.test.ts`: scope fingerprints, locks, incompatible clipboard and finite timing |
| Playback, scrub, speed, snap, loop/sample/interpolation metadata | `animation.spec.ts`; hand-wave preview; recovery serialized time/speed | IK journey exposes Quadratic's linear preview; `src/utils/animationTimeline.test.ts`, `src/utils/workspacePlayback.test.ts` preserve timing/workspace ownership |
| Named-rig retarget source selection | `animation.spec.ts` named GLTF retarget; profile journey mapped moving clips | One transaction undo/redo; explicit maps and missing/ambiguous source guards in retarget unit owners |
| Portable profile import/edit/export and session draft | `journeys/retarget-continuity.journey.spec.ts`: normalized standalone file, workspace switch and selected source | Strict invalid JSON disables application; profile paths are never opened; applied clip project/GLB continuity |
| Advanced profile contacts/endpoints/twist/head/ranges/replacement | `retarget-profile.spec.ts`: all seven bounded profile scenarios | Invalid ownership/conflicts, missing clips, reject/report diagnostics, explicit replacement and undo |
| Skin Pick/Paint/Erase/Smooth and brush controls | `skin.spec.ts`: direct tools/shortcuts, target/flow/falloff and pointer state; Skin journey real surface Set/Smooth | Gesture cancel and workspace cleanup; semantic paint undo/redo and raw influence comparison |
| Skin normalize/auto-weight algorithms | Skin journey: nearest-segment disabled-option contract and configurable inverse-distance batch | `src/utils/skinWeights.test.ts` owns all six algorithms, influence caps, invalid weights and indexed regional smoothing |
| Skin Rest/Frozen/Live, diagnostics, heatmap and precision vertices | Skin journey explicit pose/warning states; `skin.spec.ts` diagnostics; hand-wave exact mini-node repair | Workspace cleanup and raw slots; `src/utils/weightPreview.test.ts`, `src/utils/skinDiagnostics.test.ts`, sampling/unit owners |
| Skin project/export persistence | Skin journey GLB/project tuples and independently quantized SMF weights/joints | Hand-wave saved/reopened corrected wave; export guards reject malformed skin layouts |
| Default source-aware export | `format-dispatch.spec.ts`: SMF→SMF, FBX→FBX, DAE→DAE, GLB/GLTF/OBJ→GLB | Static OBJ's SMF action is blocked; one-shot FBX encoder failure produces semantically preserved GLB with a visible fallback reason |
| Explicit GLB/FBX/DAE/SMF export and conversion | `export-formats.spec.ts`; strengthened SMF/FBX and authored journeys | Loader/export unit gates reject dropped moving tracks, invalid geometry and unsupported SMF structures before save |
| Semantic round-trip assertions | `asset-evidence.spec.ts`: known indexed tuples, hierarchy and independently sampled tracks | Deliberate weight/hierarchy/motion corruption and truncated containers must fail; compare all key times plus start/mid/end |
| Rig comparison viewer and capture receipts | `rig-comparison.spec.ts`: synchronized real poses, aliases, duration and backward seek | Missing/short/oversized clips and partial-load cleanup; receipts bind actual rendered inputs |

Project envelopes persist their existing model/clip state, rig metadata and
selection/playback fields. Undo history, camera/brush settings and profile
drafts are not project fields. Saving does not clear authoring histories or
dirty replacement protection. SMF weight checks model uint8 quantization and
decoded normalization explicitly. Held FBX object channels may be omitted only
when every source key equals the retained static transform; moving channels
remain required. No tolerance is increased to make an unexplained loss pass.

## Browser Suite Ownership

| Suite | Primary ownership |
| --- | --- |
| `shell-model.spec.ts` | App boot, real SMF load, responsive workspaces, scale-independent camera fitting, viewport layouts/shared camera focus, selection, material-repair apply/undo/redo, invalid input |
| `lifecycle.spec.ts` | Latest-intent load races, atomic replacement, dirty replacement decisions, save single-flight, worker progress/responsiveness |
| `rig.spec.ts` | Pose history, reversible static-root preparation/export, SMF Rig policy, Endpoint, IK, TransformControls ownership |
| `animation.spec.ts` | Timeline gestures, clip management, scoped animation keys, and SMF checks |
| `skin.spec.ts` | Paint/Smooth gating and shortcuts, cancel, undo/redo, Auto Skin, rest-pose ownership, SMF export |
| `export-formats.spec.ts` | GLB/GLTF/FBX/DAE format and sidecar flows, SMF, FBX, DAE, and OBJ flows; indexed-mesh conversion; non-SMF rename/order/duplicate/delete/static surface authoring persistence; material policy; non-SMF-to-SMF fail-closed diagnostics; FBX/DAE re-import |
| `native.spec.ts` | Deterministic Tauri IPC dialog-owned open/read/save/cancel, stale-completion, project recovery, and autosave-coalescing matrices |
| `modern-shell.spec.ts` | Modern command/workspace reachability, one-drawer focus ownership, coarse-pointer targets, and DPR backing dimensions |
| `visual.spec.ts` | Modern/Original geometry/defaults, source texture thumbnails, reference-derived shelves/top strip/keyframe lane, narrow layout, viewport/menu visual coherence |
| `retarget-profile.spec.ts` | Collapsed saved-profile UI, strict error visibility, app-owned draft persistence, source selection, and undoable application |
| `rig-comparison.spec.ts` | Real-GLB three-state strict clip/duration coverage, deterministic multi-frame clocking, exact nested game transforms, mapped/unmapped skeleton colors, mesh opacity, selected-joint axes/bend plane, draw receipts, and partial-load cleanup |
| `asset-evidence.spec.ts` | Independent container/accessor decoding, known skin tuples, sampled motion, and deliberate corruption detection |
| `format-dispatch.spec.ts` | Six browser Open/default-export/re-import paths and blocked static-SMF control |
| `project-recovery.spec.ts` | IPC recovery cancel/discard, explicit serialized state, semantic continued save and history |
| `modern-authoring-layout.spec.ts` | Six selected Rig/profile-error/Skin layouts, ordinary control reachability, fractional DPI and Escape/focus return |

The 37 tests formerly in `smoke.spec.ts` retain their titles across the current domain-owned browser suites. Use `npm.cmd run test:e2e:list` for the authoritative count after adding or moving cases. The dedicated script prevents npm from consuming Playwright's `--list` flag and accidentally starting the full suite.

All `tests/journeys/*.journey.spec.ts` files are intentionally excluded from the default browser gate. The dedicated config uses one worker and disables parallel execution. The hand-wave story records a deterministic real-SMF path through clip creation, viewport selection and hover aliases, Branch-keyed animation, precision Skin repair, corrected playback, and saved/reopened semantic continuity. Core stories cover file conversion, project continuity, external resource readiness, and failed replacement/recovery safety. Five authoring stories extend those checks across profile application, rig structure/metadata, IK and keyed animation, raw skin influences, and Model/material editing.

The GenEye manifests execute the pinned Playwright CLI through `scripts/run-playwright-geneye.mjs` with `shell=false`. The hand-wave journey keeps Playwright's raw artifact inside `test-results/product-journeys` for deterministic ingestion, saves the review copy under repo-level ignored output, and deletes the redundant raw video after the attachment copy is secure so GenEye reviews one source video rather than duplicate bytes.

The hand-wave journey fails on document overflow, blocked or disabled primary controls, missing pointer/alias telemetry, unchanged poses, missing scoped keys, unreachable Skin targets, critical browser errors, or missing evidence. Product journeys assert mounted-root continuity, export/re-import, sidecar readiness, project persistence, and dirty-work preservation through failures. Precision targets use deterministic camera fallbacks when occluded.

## Shared Browser Helpers

- `helpers/smoke-helpers.ts`: fixtures, browser diagnostics, synthetic drops, tolerant screenshot checks.
- `helpers/modern-shell.ts`: ordinary workspace-chooser and Tools actions, disclosure readiness and focus ownership; Original still uses its visible tabs.
- `helpers/viewport-interactions.ts`: pointer, gizmo, Endpoint, IK, Skin, layout, and pane drag actions.
- `helpers/timeline-interactions.ts`: slider and keyframe-lane actions.
- `helpers/smf-codec-probe.ts`: worker progress and page-heartbeat observation.
- `helpers/format-assertions.ts`: selected-bone parsing, regex escaping, base64, and GLB JSON inspection.
- `helpers/asset-evidence.ts`: independent binary accessors, hierarchy/binds, raw influences, image signatures, matrix/TRS, clips and every keyed pose; held/looping motion avoids endpoint aliasing.
- `helpers/product-journey.ts`: ordinary downloads, project chooser, bone selection, playback and strict unexpected-error checks.
- `helpers/skinned-glb-fixture.ts`: option-keyed generated indexed skinned GLB variants for texture, material, and sibling-order coverage.
- `helpers/external-fbx-fixture.ts`: generated ASCII FBX plus referenced PNG sidecar for deterministic selected-resource resolution.
- `helpers/smf-stress-fixture.ts`: bounded 300,000-vertex SMF worker fixture whose grid layout stresses codec volume without pathological render overdraw.

## Unit Coverage

The deterministic `src/**/*.test.ts` inventory is grouped by runtime boundary:

- Input and persistence: model-size/resource-bundle guards, native payload validation, worker protocol/cancellation, SMF bounds/semantics, versioned projects, editor snapshots, and bounded history.
- Format and export: SMF coordinate/DQ fidelity, indexed Three-to-SMF expansion, GLB/FBX/OBJ geometry preparation, source-material isolation, pre-save reparse checks, and external-GLTF fixture integrity.
- Model and rig: Outliner/static authoring, root-skeleton preparation, rig edits/metadata/IK, explicit rig mapping, normalized proportion diagnostics, retarget timing/direction/recovery, target-length natural torso/leg/contact solving, clip-scoped leg limits, portable profile validation, strict material repair, and partial-load resource disposal.
- Viewport and Skin: layout/focus/hit math, scale-aware fitting, listener/RAF/grid/overlay disposal, display telemetry, weight previews, indexed brush lookup, smoothing, diagnostics, and Rest/Frozen/Live sampling.
- Animation and UI policy: clip creation/controller/scope/history, duration/retime/trim/lock rules, float32 and partial-terminal timing, playback cadence, themes, aliases, labels, and material thumbnails.
- Game-ready workflow: pure strict v2 job-schema and natural-motion range/selection checks, shared profile option resolution, same-handle per-file/aggregate read limits, PNG/JPEG signature and dimension checks, bounded aggregate decoded-image memory, preserve-existing texture/MIME roundtrips, embedded texture/STEP validation, finite deformation sampling, executable-dependency generation identity, immutable publication, manifest hashes, competing attempts, and injected write failures.
- Fitted-rig workflow: explicit grid-plus-terminal timing, strict all-clip/duration/sample coverage, worst-vertex diagnostics, float32 terminal aliasing, and hash-bound preview routing.

`source/frontend/scripts/run-unit-tests.mjs` discovers all unit files and forwards extra Node test flags. A focused command such as `npm.cmd run test:unit -- --test-name-pattern "duration formatting"` still loads the complete discovered-file set so registration and type boundaries remain covered. Exact counts belong in the latest dated `HISTORY.md` verification record.

The generated indexed GLB is a required compatibility shape for GLB/FBX export and converter coverage: conversion must duplicate indexed vertex attributes into complete SMF triangle soup before the worker guard accepts it, bake mesh transforms once, capture root-relative world bone poses, and sample animation through Three's mixer. Missing optional normals/UVs/tangents receive correctly sized zero arrays; incomplete triangle or skin layouts fail preflight. Skin browser coverage owns paint gating, diagnostics visibility, and Rest/Frozen/Live pose telemetry.

## Fixture Policy

`mixamo_smf_baldguy.smf`, `test.fbx`, `test.obj`, `fixtures/invalid-model.gml`, `fixtures/external-gltf/{scene.gltf,mesh.bin,texture.png}`, and `fixtures/independent-fbx/independent_skinned.fbx` are committed verification dependencies. The external GLTF's nine-byte `mesh.bin` is an explicit exception to the global model/weight exclusion and is tracked as binary; its focused unit contract verifies the exact payload/hash and requires every relative URI in `scene.gltf` to resolve to a regular file inside that fixture directory. `helpers/smoke-helpers.ts` resolves the browser fixtures directly and throws an actionable error during test registration if one is missing; it does not generate the sidecar at runtime, scan archived old-source assets, or silently fall back to a deleted spec. The generated external-FBX helper contains its own tiny ASCII FBX and PNG in test code, so it proves selected sidecar handling without relying on an owner-local asset. The independent FBX fixture's generator, provenance, and Blender validator live beside the asset; the validator can also inspect the ignored app-exported roundtrip under `test-results/`.

The Rust native tests are fixture-independent and exercise path authority, bounded reads, staged writes, rotating project generations, recovery allowlisting, and write serialization. SMF structure and real-fixture parsing remain owned by the TypeScript worker/unit/browser lanes.

The native sidecar browser case applies `tauri.conf.json`'s connection policy before loading its bundle. The foreground-save case starts an active autosave and proves one click completes without overlapping writes. Actual Windows OS-dialog acceptance is recorded separately in `docs/dev/HISTORY.md`; IPC mocks do not replace that proof. Run browser suites, journeys, and `desktop-smoke` sequentially because they own the same preview port.

## Visual Policy

Default e2e uses `expectRenderedScreenshot()` decoded canvas-pixel assertions, excluding overlapping HTML controls. The preview rendering lane disables grid, axes and rig helpers to prove the model itself is visible; encoded byte size is not rendering evidence. Strict snapshots cover the real-SMF loaded bone state, export state, and Original-theme shell and live beside `shell-model.spec.ts`, `export-formats.spec.ts`, and `visual.spec.ts`. A palette refresh may update affected Modern baselines only; the Original strict baseline must remain unchanged.

Do not commit `playwright-report/`, `test-results/`, or repo-level `output/`; all generated captures and journey media are reproducible review artifacts. Keep the Playwright server on build + preview, keep one server owner per command, and preserve test titles when moving ownership so filters and pitfall references remain stable.

When adding or moving a test:

1. Update this ownership map if the domain changes.
2. Run the smallest relevant unit/spec first.
3. Run `typecheck:test`, then the full appropriate gate.
4. Update `docs/dev/PITFALL_LEDGER.md` only for a durable recurring failure mode.

---
AI-edited: 2026-10-15T11:43:47.1745884-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=review-cleanup | change=reviewed export ownership and selected original asset acceptance

AI-edited: 2026-10-15T17:05:37.137Z | agent=Codex/root | model=unknown | effort=unknown | task=original-assets | change=added original Sable pack and acceptance routes
