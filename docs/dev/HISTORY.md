# RustSMF History

This file is the canonical home for completed repo/app work and its durable verification record. Current behavior belongs in `APP_STATE.md`; active work belongs in `TODO.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

## 2026-09-01 — Integrity guard, real Skin smoothing, and async append ownership

- Replaced Modern Skin's misleading Smooth-to-Auto alias with undoable regional weight averaging that works without a selected bone. The paint loop now indexes skinned meshes once per stroke, and selected-branch lookup avoids repeated skeleton scans.
- Guarded async static-model append by initiating-root identity so a model replacement during loading disposes the stale subtree instead of attaching it to detached state or recording invalid history.
- Consolidated undo/redo domain chronology behind one selector and added focused regressions for history ordering, append ownership, smoothing math, and branch collection.
- Strengthened project integrity so relative imports must resolve to files, current-facing docs cannot contain machine-local paths, and an empty backlog requires the explicit `Backlog status: empty` contract. Generated evidence now shares one ignored `output/` boundary, and the current review/design/backlog docs are portable and non-duplicative.
- Updated the existing project-integrity, model-authoring, load-orchestration, external-resource, and Skin context routes without creating redundant groups.

### Verification

- `run.ps1 -Task verify`: passed 359/359 frontend units across 62 files, 8/8 project-integrity tests, 7/7 context-bank tests, 2/2 main-sync safety tests, lint/type/build guards, and 10/10 Rust tests.
- `run.ps1 -Task test:e2e -NoGenEye`: passed 86/86 browser cases; focused Skin passed 7/7 and focused scale parity passed 1/1.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities. Context validation passed with 31 groups, 43.2 KiB default context, and zero warnings.

## 2026-09-01 — Rest-pose setup workspaces and bounded bone tags

- Stopped viewport animation evaluation in Rig and Skin and restored the pre-animation rest/base pose on entry; Animate reactivates the selected clip at the controlled time.
- Made Rest / Bind the default Skin paint sample, while preserving explicit Frozen Current and Live Animation options in Advanced.
- Removed forced Modern bone-name overlays from Rig and Skin. Optional labels now strip common Mixamo prefixes, use translucent compact tags without redundant axes, and derive world size from model bounds so meter-scale GLB and legacy-scale SMF rigs remain readable.
- Replaced stale Inspector playback guidance, added focused mixer/label unit coverage and Rig/Skin browser assertions, and captured current real-SMF Rig and Skin evidence in the in-app browser.

### Verification

- Focused workspace-playback and bone-label units: 64/64 selected/loaded cases passed across the deterministic 62-file discovery set; app typecheck and ESLint passed.
- Focused production browser cases passed 2/2: Rig rest-pose/label defaults and Skin Rest / Bind telemetry.
- In-app browser verification with `mixamo_smf_baldguy.smf` confirmed Rig and Skin rest-pose telemetry, labels off by default, and model-relative optional tags without the oversized billboard failure.

## 2026-09-01 — Direct-paint Modern Skin workspace

- Implemented the selected hybrid of the contextual floating brush menu and slim left tool rail. Modern Skin now opens without a persistent Properties panel, starts in Pick, selects bones directly in the viewport, and hands off to Paint; Paint, Erase, Smooth, brush size/strength, Undo/Redo, and P/E/S/Q/bracket shortcuts stay on the canvas.
- Kept every existing diagnostic and exact authoring command behind the focused Advanced drawer, preserved source-safe bone identities there, and limited the simple card to friendly fail-closed aliases. Original SMF retains its full legacy Skin panel and shared behavior.
- Added explicit Skin selection ownership to the viewport, aligned hover and click hit radii, removed redundant supporting-panel triggers from Skin, and added responsive/coarse-pointer styling, Advanced focus restoration, a canvas-first browser regression, updated journey/test helpers, current user/app state documentation, focused summary-bank routing, and a passed hybrid design comparison record.

### Verification

- Frontend app and test typechecks passed; ESLint passed; production build passed.
- Frontend units passed 353/353 across 61 files.
- In-app browser verification with the real SMF fixture proved Pick-to-Paint handoff, P/E/Q shortcuts, Advanced open/Escape/focus restoration, zero console errors, DPR 1.5 canvas backing dimensions, and zero document/body overflow at 1280 x 720.
- The full local `verify` gate passed, GenEye-wrapped browser coverage passed 86/86, and the final GenEye-wrapped journey passed 1/1 with 12 refreshed checkpoints and one current 5.6 MB WebM.

## 2026-09-01 — Skin journey and GenEye manifest integration

- Re-ran all six browser Skin flows and 39 focused skin/weight/diagnostic units, including pointer cancellation, Set flow/target/falloff, dirty/export ownership, exact mini-node mapping, weight-preview restoration, and the real SMF torso-wing deformation repair.
- Replaced the stale GenEye shell-command wrapper with checked `geneye.playwright.project_command.v1` manifests and a local pinned-CLI entry. Both the 85-case browser gate and recorded journey now run through `shell=false` argv ownership while `-NoGenEye` preserves the independent product gate.
- Regenerated the journey as one current Calm Modern UI WebM plus 12 checkpoints. The test removes its redundant raw video after securing the report attachment, and GenEye samples the single source instead of double-counting the same recording.

### Verification

- GenEye-wrapped `test:e2e`: passed 85/85 with `execution.boundary=argv_manifest` and completed cleanup.
- GenEye-wrapped `test:journey`: passed 1/1; deterministic temporal verdict `pass`, one 5.6 MB WebM, 12 checkpoints, and no detected temporal defect. The expected low-severity sparse-sampling caveat remains advisory.
- GenEye MCP comparison of the before/corrected Skin checkpoints: both captures `quality=ok`, `quality_disposition=usable`, 1800x1125; changed distance 10 exceeded threshold 8.
- Focused Skin units: passed 39/39.

## 2026-09-01 — Calm canvas-first Modern shell

- Implemented the selected focused-studio visual direction as a separate Modern shell while leaving Original SMF's legacy-parity structure intact. Modern now has a two-row command/workspace header, primary Open/Save/Undo/Redo/Export actions, a named More menu for lower-frequency operations, one Scene/Properties supporting panel, and canvas-overlay layout/camera/display controls.
- Removed persistent empty cockpit surfaces: the unloaded app shows one Open/drop task, compact screens start with drawers closed, and the full Timeline mounts only in Animate. Drawers trap focus, dismiss on Escape, restore their trigger, and remain mutually exclusive.
- Added display-change DPI refresh capped at 2, a shared `ViewportControls` component, Phosphor icons, six responsive overflow lanes, coarse-pointer target checks, DPR 1/1.25/2 backing-size coverage, and a dedicated Modern command/workspace reachability suite. Existing behavior-heavy browser suites run against Original so legacy contracts remain explicit rather than depending on hidden Modern menus.
- Preserved the selected reference under `docs/references/modern-ui/` and recorded same-frame wide/narrow visual QA in `design-qa.md` without turning runtime screenshots into source assets.

### Verification

- The complete 85-case browser suite, recorded hand-wave journey, three strict visual baselines, native desktop smoke lane, frontend/Rust verification gate, context-bank validation, and dependency audit passed.
- The authoritative closing commands are recorded in `docs/dev/review.md`.

## 2026-08-30 — Native I/O ownership and recovery integrity

- Replaced independent native write tasks with one async serialization owner that keeps blocking filesystem work off the async runtime. Export and project saves now use unique staged files, flush payloads before replacement, clean temporary paths, restore the prior destination on install failure, and avoid reporting a false failed save after a successful install whose obsolete-generation cleanup only warned.
- Restricted project recovery discovery and reads to the exact app-owned target, `.bak1`, and `.bak2` regular files. Arbitrary app-data siblings, suffix lookalikes, traversal names, directories, and symlink-shaped inputs fail closed before project bytes are returned.
- Coalesced autosave to the newest trailing request without overlapping foreground/native writes. A successful model replacement invalidates queued old-model work and waits for issued recovery I/O before swapping roots; canceled and failed pickers do not discard recovery work.
- Removed the unused Rust SMF parser module, six dead native peek/info commands, matching frontend bridge and Playwright simulation code, unused direct Rust serialization dependencies, and the unused frontend Tauri dialog package. The TypeScript worker remains the sole structural SMF authority, while Rust owns dialogs and bounded native I/O.
- Reconciled the launcher smoke wording, current app/test contracts, closed TODO, native I/O pitfall, and existing Tauri/project-recovery/SMF-resource context groups. The research inbox had no active architect or source-review drop-in, and no new summary-bank group was needed.

### Verification

- Focused delayed autosave/model-replacement browser regression: 1/1 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed across 188 frontend source/test files and 11 durable docs with 31 groups, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 353/353 frontend units across 61 files, lint/type/build/chunk checks, and 10/10 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 75/75 browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 10/10 Rust tests, and 12/12 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.

## 2026-08-29 — Precision Skin target contract and integrity closeout

- Found a type-correct return-contract inversion in the new mini-node precision path: `getSkinnedVertexWorldPosition` returns `null` on success and a failure code on error, but the component rejected the success case and could continue from an invalid result with an origin vector. Extracted `resolveSkinPointSourceVertex` as the single point-index/stride/source-position guard; valid hits now return the exact world-space source vertex and invalid skin data fails closed.
- Added focused success, out-of-range, and malformed-skin regression coverage. The real recorded journey then completed both torso-seam faces and the outer-sleeve repair through pointer interaction, proving that the helper is wired into the user path rather than only passing in isolation.
- Confirmed that the research inbox has no active architect or source-review drop-ins; no production TODO/FIXME/stub markers, unresolved relative frontend imports/re-exports, or unresolved Rust module declarations remain. Kept all 31 summary-bank groups focused and moved the Original-theme QA record beside its four durable comparison artifacts under `docs/references/theme-qa/`.
- Curtailed the current review snapshot and backlog closure so current behavior, completed evidence, recurring hazards, and forward work remain in their declared owners instead of repeating the full feature history.

### Verification

- Focused `skinPointOverlay` unit suite: 7/7 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 188 frontend source/test files, 11 durable docs, 31 groups, 41.0 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 353/353 frontend units across 61 files, lint/type/build/chunk checks, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 74/74 browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced 12 reviewed checkpoints plus the hand-wave WebM.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 without refreshing baselines.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri build, 15/15 Rust tests, and 11/11 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.

## 2026-08-26 — Scale-independent framing and selected FBX texture bundles

- Replaced fixed-world camera padding and wheel increments with model-relative perspective distance, near/far clipping, orbit limits, orthographic extents, and ratio zoom. Tiny and huge authored roots keep their transforms and occupy comparable perspective/orthographic screen space. Ordinary skinned models retain exact posed bounds; meshes above 100,000 vertices use a conservative bone-transform bound so fitting cost does not scale with every skinned vertex.
- Added canvas scale telemetry and deterministic unit/browser coverage at root scales `1e-5` and `1e5`. The scale browser case verifies authored-transform preservation, proportional camera values, nonblank pixel coverage, and equivalent composition at both extremes.
- Fixed the FBX load branch to pass its selected `ModelResourceBundle` into `FBXLoader`. Referenced relative textures now resolve only from authorized selected sidecars, temporary object URLs are revoked after image readiness, retained texture count is reported, and unrelated maps are not guessed into slots. A generated ASCII FBX plus PNG owns the permanent regression.
- Validated the owner-local Grim FBX with all four supplied images: one mesh, 13,935 vertices, 65 bones, one clip, and the one source-referenced base-color map loaded with finite proportional framing in perspective, orthographic, and quad views. Three.js reported that the source contains vertices with more than four skin influences and retained four; the unreferenced metallic, normal, and roughness files correctly remained unattached.
- Removed a hidden performance coupling from the 300,000-vertex worker fixture by laying its triangles out on a compact grid instead of stacking 100,000 triangles in the same pixels. The worker test now measures codec responsiveness rather than pathological overdraw. TransformControls browser dragging now accepts the actual visible hovered axis, and the hand-wave journey uses deterministic single-view quarter turns when a precision paint target is occluded or too thin in quad view.
- Reviewed the intentional camera composition change, accepted the full-character framing that keeps head, feet, rig, and floor context visible, and refreshed only the two owned strict WebGL baselines.

### Verification

- Focused viewport units passed 17/17; focused FBX sidecar, tiny/huge framing, TransformControls, and 300,000-vertex worker browser cases passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 188 frontend source/test files, 11 durable docs, 31 groups, 39.8 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 352/352 frontend units across 61 files, lint/type/build/chunk checks, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 74/74 browser cases; the large worker case completed in 3.2 seconds in the full parallel run.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced the reviewed 12-checkpoint animation/weight-paint evidence plus `hand-wave-journey.webm`.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 after the two intentional full-character camera baselines were reviewed and refreshed.

## 2026-08-25 — Bone identification and multi-joint hand-wave journey

- Added a fail-closed display alias contract for the exact known 24-bone SMF humanoid. The Inspector and optional labels expose Mixamo-minimal equivalents such as `mixamorig:LeftArm`, while source IDs remain authoritative for selection, tracks, project state, and SMF export.
- Added a reusable dynamic 3D hover badge to the viewport, including source ID plus semantic alias, high-contrast camera-facing presentation, canvas telemetry/title fallback, selected-bone hover visibility, and pointer-leave cleanup under the viewport listener owner.
- Expanded quick pose rotation from Z-only to positive/negative X, Y, and Z controls. Pose-edit state, history equality, SMF candidate capture, status feedback, and focused tests now cover every rotation axis without changing the no-scale SMF policy.
- Reworked the recorded journey to hold the shoulder outside the head silhouette and alternate a bounded elbow-and-hand arc across five Branch-keyed times, including matching posed loop endpoints instead of T-pose transitions. It proves aliases and the hover badge, catches the fixture's forearm-weighted torso wing, and repairs both sides of the seam through the real Skin workflow: subtract stray `LeftForeArm` influence while preserving the torso/upper-arm blend, then Set the outer upper-sleeve edge to `LeftArm`. Show Vertices is now a first-class Skin control whose selected-weight-colored mini nodes follow the posed mesh and provide exact source-vertex targeting with a forgiving hit area; broad surface brushing remains available. The journey previews playback without an obscuring hand gizmo and emits 12 ordered screenshots plus WebM evidence. The reviewed output reads as a controlled, corrected wave rather than a wrist twitch, whole-arm tube-man sweep, stretched shirt triangle, or torso-to-arm wing.
- Narrowed context routing by adding aliases to viewport support, removing duplicated codec-task ownership from the load-editor pack, and extracting the journey-specific deformation proof from the coordinate suite into `handWaveWeightRepair.test.ts`; 31 groups remain within the existing 256 KiB ceiling and 39.8 KiB default orientation.

### Verification

- Focused app/test typechecks, pose/alias/label/listener unit registration, hover browser coverage, and the stale-copy browser regression all passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed across 187 frontend source/test files and 11 durable docs with 31 groups, 39.8 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 346/346 frontend units across 61 files, lint/type/build/chunk checks, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 browser cases after the improved workflow copy and its existing assertion were reconciled.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced the reviewed 12-checkpoint animation/weight-paint evidence plus `hand-wave-journey.webm`.

## 2026-08-24 — Clean-checkout external GLTF fixture repair

- Committed the exact nine-byte `mesh.bin` sidecar required by `scene.gltf`, while preserving the global model/weight exclusion through one narrow ignore exception and marking the fixture as binary in Git attributes.
- Added a focused integrity suite that pins the binary length, ASCII payload, SHA-256 digest, required scene/mesh/texture files, and containment/existence of every relative external URI. The normal unit command is now available as `npm test`; no test generates or repairs the fixture at runtime.
- Routed the fixture contract through the existing external-model-resource context group and reconciled current-state, review, and test-contract documentation.

### Verification

- Focused external-GLTF fixture integrity tests: 2/2 passed.
- `npm test` from `source`: 343/343 frontend units passed across 59 files.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed the complete local repository gate, including 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 browser cases with the committed fixture.

## 2026-08-24 — Recorded hand-wave journey and animation workflow polish

- Added an opt-in headless Playwright journey that loads the committed SMF character, creates a two-second rest-pose clip, selects the visible right forearm through the indexed bone hierarchy, authors three alternating Z-rotation keys, previews the loop, and writes eight ordered screenshots plus a stable WebM under ignored output.
- The journey audits 1440x900 at 125% device scale and fails on document overflow, blocked or disabled controls, unavailable viewport bone picking, unchanged canvas poses, missing timeline keys, critical browser errors, or missing video evidence.
- Corrected the Animate workspace so its bone list and pose controls remain available, contained the wide toolbar internally, added symmetric `-Z rot`/`+Z rot` controls and clearer indexed-SMF/key-authoring guidance, and made pose nudges report the selected bone and resulting angle.
- The closing dependency audit identified two high-severity transitive advisories; the lockfile now resolves `brace-expansion` 5.0.9 and `nanoid` 3.3.18, and the declared audit reports zero vulnerabilities.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced `output/playwright/hand-wave-journey/hand-wave-journey.webm` plus eight checkpoint PNGs.
- `npm audit --omit=optional` from `source`: passed with zero vulnerabilities after the bounded transitive lockfile update.

## 2026-08-24 — Resource bundles, project recovery, rig metadata, and authoring closure

- Added a bounded multi-file resource bundle for browser/drop/native model loading. GLTF external buffers/images and one OBJ MTL/texture bundle now resolve through normalized local names with traversal, remote/data, duplicate/case ambiguity, missing-resource, per-file, aggregate-size, stale-load, and object-URL cleanup guards. The committed external-GLTF fixture proves buffer and texture loading; missing sidecars preserve the mounted model.
- Added a versioned `.rsproj` project envelope that embeds a validated GLB snapshot and bounded workspace state, including playback selection and rig metadata. Native saves use rotating atomic generations with temp-file synchronization and restoration on failure; browser fallback uses local storage/download, and explicit recovery discovery/read rejects corrupt or unsupported input without replacing the mounted model.
- Added versioned per-bone rig metadata with standalone `.rig.json` save/load/clear, project embedding, primary-axis normalization, and lock/pin state. CCD IK skips locked/pinned joints, and explicit Solve & bake IK keys commits one animation history transaction while honoring clip locks.
- Added guarded static model surface authoring: self-contained append, transforms, named material assignment, winding reversal, and normals/tangents preparation. These actions use Outliner history and fail closed for SMF-owned, skinned, animated, or unsupported targets. Added read-only geometry/UV/material/handedness/shader diagnostics and disposable rest-pose ghost, motion-trail, and onion-skin overlays that do not alter export bytes.
- Extracted and tested the resource, project, rig metadata, diagnostics, pose-overlay, and surface-authoring seams; reconciled all durable docs, summary-bank feature/issue routes, stale TODO claims, and test ownership. The active backlog is now closed with evidence-gated external compatibility limits kept in `APP_STATE.md`.

### Verification

- Focused TypeScript checks: `npm run typecheck`, `npm run typecheck:test`, and 14 focused controller/surface tests passed.
- Frontend unit gate: 341/341 tests passed across 58 files.
- Native gate: `cargo fmt --all -- --check` and 15/15 Rust tests passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 30 groups, 36.2 KiB default orientation, zero warnings, 7/7 context-bank tests, and 4/4 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 341/341 frontend units across 58 files, lint/typecheck/build/chunk checks, Rust fmt/clippy/check, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 browser cases with approved local browser-process access; expected missing-resource/read-failure diagnostics remained within their asserted error paths.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 committed visual snapshots without refreshing baselines.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 15/15 Rust tests, and 11/11 native IPC browser cases.

## 2026-08-23 — Project-integrity gate, interrupted-orbit cleanup, and static model transactions

- Added a local project-integrity guard for durable-doc presence, executable TODO fields, research-inbox review status, relative frontend imports, and Rust module declarations. Its focused workflow is routed through `summary_bank.json` and runs before context and application verification.
- Hardened `SimpleOrbit` so touch cancellation, window blur, and disposal cannot leave a stale drag active; added a focused regression covering both interruption paths.
- Added guarded static-submodel duplicate/delete actions to Model. Explicit parent/index structural history restores exact placement, static duplicates own cloned geometry/material/texture resources, and bones, skinned subtrees, unsupported sources, and animation targets fail closed before mutation.
- Added unit and OBJ browser coverage for duplicate/delete guards, exact undo/redo, resource isolation, and GLB export persistence. Reconciled app state, user notes, test ownership, review evidence, TODO review date, and history; the remaining P2/P3 items stay active with duplicate/delete removed from the Model subtasks.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 28 groups, 40.5 KiB default orientation, zero warnings, 7/7 context-bank tests, and 4/4 project-integrity tests.
- `npm.cmd run test:unit -- --test-name-pattern "touch orbit|resets orbit"` from `source/frontend`: passed the focused 53-test registration slice, including both orbit interruption cases.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 326/326 frontend units across 52 files, Rust fmt/clippy/check, and 13/13 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 67/67 browser cases; runner-owned ports 5173 and 1420 were clear after cleanup.

## 2026-08-20 — Native read race hardening and context-route cleanup

- Closed the native read size-of-check/size-of-use gap by opening the authorized canonical file once, rejecting non-regular paths, and bounding the observed stream to 256 MiB plus one sentinel byte before returning data.
- Tightened the Rust SMF envelope parser to reject pre-header, overlapping, undersized, and truncated section offsets before exposing desktop metadata.
- Removed the unused private frontend utility re-export barrel and its stale context-bank path; live code already imports each utility from its owning module.
- Reconciled `APP_STATE.md`, `TODO.md`, `summary_bank.json`, and this history entry with the new native boundary and route ownership.

### Verification

- Focused verification before the full gate: `cargo fmt --all -- --check`, `cargo test --all-targets` (13/13), frontend `test:unit` (323/323), and app/test typechecks all passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with context validation, main-safety checks, lint coverage, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 323/323 frontend units across 52 files, Rust fmt/clippy/check, and 13/13 Rust tests.

## 2026-08-13 — Browser certification and safe main synchronization

- Completed the post-fix browser certification: the focused static-root preparation, guarded rename, and sibling reorder flows passed, then the full Playwright suite passed 66/66 with the approved local browser process. The earlier unprivileged `spawn EPERM` result is retained only as a managed-sandbox launch limitation, not a product test failure.
- Replaced unsafe, duplicated local push/pull automation with shared main-only guards. The controls now require the configured existing origin and `main`, reject active operations, unsafe token state, and mismatches, use a clean fast-forward pull and ordinary post-verified push, and stop for manual resolution instead of force-syncing or selecting conflict sides.
- Added `scripts/git-main-safety.test.mjs` to the root `verify` gate, updated the local Git-control labels, narrowed the overlapping context-bank route, and moved completed browser certification out of the active authoring backlog.

### Verification

- `node --test scripts/git-main-safety.test.mjs`: 2/2 passed, including current-worktree preflight before credential access.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 27 groups, 39.3 KiB default orientation, zero warnings, and 7/7 context-bank tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with the main-safety test, lint/type/build/chunk/production-boundary checks, 323/323 frontend units across 52 files, and 10/10 Rust tests.
- `npm.cmd run test:e2e -- --reporter=line --workers=1`: passed 66/66 with approved local browser-process access.

## 2026-08-12 — Static-root export integrity, shared geometry preparation, and reversible model authoring

- Hardened static-root skin preparation with all-mesh preflight, fail-closed existing-skinned detection, collision-free root naming, and per-mesh world bind matrices. Transformed roots now deform from their actual placement, and a later invalid mesh cannot leave earlier geometry partially mutated.
- Replaced duplicated GLB/FBX/OBJ UV/normal/tangent setup with one tested geometry-attribute contract. Tangents are generated only for compatible source UV/normal data and valid indexed triangles, so non-indexed exported triangle soup no longer emits a Three.js error during validation re-import.
- Made FBX texture readiness waits concurrent under one bounded timeout and cleared the manager timer on early settlement.
- Added focused static-preparation and geometry tests plus a Rig browser flow for prepare/diagnose/roundtrip/export/undo/redo/replacement behavior. Updated non-SMF export wording to name prepared OBJ/FBX sources accurately.
- Added guarded single-selection rename for GLB/FBX/OBJ Outliner items. Rename shares the reversible name/visibility/selection snapshot and global history contract, blocks binding-unsafe, duplicate, animated-target, bone, and source-owned SMF names, and is proven through GLB export/re-import.
- Added guarded same-parent sibling reorder for non-SMF Outliner items. Its ID-only snapshot restores exact child order without retaining a cyclic Three scene graph, preserves interleaved rig/non-Outliner children, participates in global chronology, and is proven through GLB export/re-import.
- Added the inline rename and move-up/down workflows plus export-format browser registrations. Consolidated duplicated Node `FileReader` export-test setup into one helper and replaced coarse generated-GLB fixture caches with one option-keyed cache so texture/material/sibling variants cannot reuse incompatible bytes.
- Reconciled current app/user/test docs, removed stale suite totals from dated visual QA, retained only measurable forward work in TODO, recorded the recurring tangent hazard, and organized 26 context groups with separate model-material, model-authoring, and shared geometry-preparation routes.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 26 context groups at 38.8 KiB default orientation, lint/type/build/chunk/production-boundary checks, 323/323 frontend units across 52 files, and 10/10 Rust tests.
- Focused geometry/static-preparation/FBX and model-outliner/rename/reorder/GLB recovery commands passed with no failures; direct fixture generation produced distinct option variants; `npm.cmd run test:e2e:list` discovered 66 browser cases across eight specs.
- The static-root browser case exposed the pre-fix tangent error only at its final browser-error gate after all functional assertions. The post-fix browser rerun was denied by the local execution-approval usage limit; the repaired static-root and new rename/reorder cases remain explicitly certification-open rather than being reported as browser-green.

## 2026-08-09 — Integrity pass, context routing, and focused-unit runner

- Audited current docs, code and test import surfaces, production TODO/stub/any markers, async cleanup seams, context routes, and the active backlog. No broken imports/exports or production stubs were found.
- Repaired `run-unit-tests.mjs` so extra Node test flags are forwarded while deterministic test-file discovery is preserved; focused commands now provide truthful feedback instead of silently running every case.
- Added viewport-support and missing feature/test/state routes to `summary_bank.json`, corrected the OBJ loader comment to match `OBJLoader`'s static-only behavior, and kept the six active P2/P3 TODO contracts unchanged because none is complete.

### Verification

- `npm.cmd run verify` from `source`: passed with lint/typechecks, build/chunk guards, 307/307 frontend units across 50 files, Rust checks, and 10/10 Rust tests. Managed-environment Rust path-canonicalization warnings were nonfatal.
- `node scripts/verify-context-bank.mjs`: passed with 24 groups, 36.6 KiB default orientation, and zero warnings; `node --test scripts/context-bank.test.mjs`: 7/7 passed.
- `npm.cmd run test:unit -- --test-name-pattern "animation duration formatting"` from `source/frontend`: passed with the matching duration-formatting case while all 50 discovered files still loaded.
- `npm.cmd run test:e2e -- tests/animation.spec.ts tests/skin.spec.ts --reporter=line --workers=1` from `source/frontend`: the unprivileged sandbox attempt was blocked before test bodies by managed Chromium `browserType.launch: spawn EPERM`; the same bounded command with approved local process access passed 13/13.
- `npm.cmd run test:e2e -- --reporter=line --workers=1` from `source/frontend`: passed the complete 63-case browser inventory with approved local process access.

## 2026-08-09 — Animation display and Skin telemetry reconciliation

- Repaired the Animate duration fields so IEEE-754 display noise such as `0.30000000000000004` is shown as `0.3`; numeric duration normalization and edit semantics remain unchanged.
- Reconciled declarative and imperative Skin viewport telemetry: pose and live-warning markers are declared on the canvas, reapplied when pose or editor mode changes, and no longer removed by view-mode cleanup. Transient brush telemetry remains cleaned when leaving Skin.
- Added focused unit contracts for stable duration formatting and Skin telemetry transitions.

### Verification

- `npm.cmd run test:e2e -- tests/animation.spec.ts tests/skin.spec.ts --reporter=line --workers=1`: passed 13/13 focused browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with context validation, lint/typechecks, production build/chunk guards, 307/307 frontend units across 50 files, and 10/10 Rust tests.

## 2026-08-08 — Skin diagnostics and paint-pose safety

- Completed the P1 skin diagnostics slice: the Skin workspace now exposes raw four-slot influence details for hovered vertices, aggregate invalid-reference/weight/unweighted counts, stable issue codes, and an influence legend independent of export materials.
- Added real Rest / Bind, Frozen Current, and Live Animation brush sampling contracts. Frozen Current captures bone matrices until the mode changes; Live Animation follows the mixer and shows an explicit safety warning; viewport telemetry records the selected mode.
- Added pure diagnostics and pose-position/index tests plus a browser registration covering diagnostics and pose-mode telemetry. The active frontend inventory is 305 unit tests across 50 files and 63 browser cases across eight suites.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with context validation, lint/typechecks, production build/chunk guards, 305/305 frontend units, and 10/10 Rust tests.
- `npm.cmd run test:e2e:list`: discovered 63 browser cases. Runtime browser proof remains subject to the documented managed Chromium `spawn EPERM` launch boundary.

## 2026-08-08 — Animation trim and locked-channel safety

- Completed the P1 animation authoring slice: finite range trim samples both boundaries and shifts retained authored keys, while the Animate workspace exposes trim bounds and one-step workspace undo/redo.
- Added per-clip locked-bone state with source-SMF lock discovery, UI lock/unlock, scoped/viewport edit guards, retime/trim fail-closed protection, clip CRUD propagation, and SMF lock-list export preservation.
- Added pure transform, controller, export, and browser regression coverage. Current frontend inventory is 300 unit tests across 49 files; browser inventory is 62 cases across eight suites.

### Verification

- `npm.cmd run typecheck` from `source`: passed.
- `npm.cmd run test:unit` from `source`: passed with 300/300 tests across 49 files.
- The new `animation.spec.ts` trim/lock case is registered in the 62-case browser inventory; runtime proof remains subject to the existing managed Chromium `spawn EPERM` launch block recorded in `docs/dev/review.md`.

## 2026-08-08 — Static-root history safety and current-state reconciliation

- Repaired the static non-SMF root-preparation path so mesh promotion is reversible, preserves original skin attributes on undo, reapplies deterministically on redo, and participates in the dirty replacement guard.
- Added focused restore/reapply coverage, routed the static-root module through the Rig summary-bank group, and updated app/user/test state docs plus the model-authoring backlog with the remaining browser/export proof gap.
- Reconciled current verification inventory to 296 frontend unit tests across 49 files and retained the browser launch limitation as harness-blocked evidence rather than a product result.

### Verification

- `npm.cmd run verify` from `source`: passed with 296/296 frontend units, all lint/type/build/chunk/production-boundary checks, and 10/10 Rust tests.
- `node scripts/verify-context-bank.mjs` and `node --test scripts/context-bank.test.mjs`: passed with 23 groups and no warnings.
- `npm.cmd run test:e2e:list`: discovered 61 cases. Full browser execution was attempted with `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye` but was blocked before test bodies by managed `browserType.launch: spawn EPERM`; ports 5173/1420 were clear after the owner session was stopped.

## 2026-08-06 — Repo integrity, I/O boundaries, and browser regression repair

- Reconciled the app/user/test/controller docs with the current implementation, reduced the root README and review snapshot, removed completed prose from the active backlog, and added measurable sidecar-import and evidence-led modularization tasks.
- Reorganized `summary_bank.json` into 23 validated groups by adding the external-model-resources issue route, routing strict native payload validation through the Tauri subsystem, and replacing stale current-head progress notes with stable verification guidance.
- Centralized animation scope keyframe labels, restored Auto Skin algorithm context for equivalent strokes, and stabilized post-stroke hover telemetry. These changes repaired four product assertions found by a full browser audit.
- Made browser file-read failures visible instead of cancel-like, added strict native IPC byte normalization, added unit/native/lifecycle regressions, and removed doubled punctuation from load guidance.
- Added a safe browser inventory script and retained the tested lightweight utility barrel after test typechecking proved it was a contract surface rather than dead production syntax.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 292/292 frontend units across 48 files, 10/10 Rust tests, all lint/type/build/chunk/production-boundary checks, and 23 context groups at 36.7 KiB default orientation with zero warnings.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: 61/61 passed across eight browser suites.
- `npm.cmd run test:e2e:list`: discovered the same 61 cases without launching them.
- Focused animation/lifecycle/skin browser slice: 21/21 passed; malformed-native-payload browser case passed; ports 5173 and 1420 were clear after the complete run.

## 2026-08-03 — Scoped animation key authoring and hostile-name hardening

- Added Bone/Branch/Full Rig scope resolution from the selected hierarchy, one history transaction per scoped insert/update/delete/move, unioned timeline markers, and a guarded scope selector in Animate.
- Added skeleton fingerprints and source-scope metadata to the animation clipboard. Paste now rejects changed skeletons, mismatched scopes, and missing target bones without mutation.
- Hardened animation edit and clipboard maps with null-prototype records so valid user/model names such as `__proto__` cannot turn into prototype reads or writes. Pose construction also treats snapshot entries as own keys only.
- Added bulk helper, hostile-name, controller, and browser coverage for scoped edits and one-step undo.
- Added bounded clip duration set/extension as a first-class animation edit. Shortening below the latest authored/source key fails closed until trim semantics exist; duration changes share the animation-workspace history and export path.
- Added bounded clip retime as a first-class animation edit. Source tracks and authored keys scale together, relative playback time is preserved, and explicit shorter durations now survive SMF export.

### Verification

- `npm.cmd run test:unit`: 290/290 passed across 47 discovered unit-test files.
- `npm.cmd run typecheck`, `npm.cmd run typecheck:test`, and `npm.cmd run lint`: passed.
- The scoped and retime browser assertions reached their product flows without assertion failures; managed execution then reported only `browserContext.close: spawn EPERM`, so it is harness-blocked rather than browser-green evidence. Exact cleanup left ports 5173/1420 clear.

## 2026-08-03 — Animation validation and skin-overlay cadence

- Added a shared animation-skeleton validation boundary. New animation creation now fails closed for missing, empty, unnamed, or duplicate bone names instead of emitting ambiguous Three.js tracks; pose snapshots use own-key handling for hostile names such as `__proto__`.
- Made posed Skin pts refresh cache pose matrices and position/skin attribute versions, skip unchanged viewport ticks, reuse per-overlay scratch vectors, and batch skeleton updates across changed overlays. Display-only ownership and disposal remain unchanged.
- Added unit coverage for animation validation, hostile snapshot keys, duplicate-name controller status, and unchanged/changed overlay cadence. Added a browser regression for Skin Set target weight, flow, and falloff telemetry.

### Verification

- Focused `npm.cmd run test:unit -- --test-name-pattern "animation creation|animation authoring controller|skinPointOverlay"`: 279/279 discovered tests passed at that slice; the runner currently executes the full discovered set while applying the name filter to Node's test process.
- `npm.cmd run typecheck` and `npm.cmd run lint`: passed.
- The new browser case is included in the current 58-case discovery; managed browser execution remains subject to the documented `browserContext.close: spawn EPERM` teardown boundary.

## 2026-08-03 — Pose-based animation creation and skin authoring semantics

- Added a bounded Animate-panel flow for creating a named clip from either the canonical load-time Rest pose or the current local bone pose. It supports models with zero source clips, creates complete position/quaternion tracks for named skeleton bones, and records one reversible animation-workspace transaction.
- Separated Skin Set mode's Target weight from brush flow and falloff. Set blends toward the bounded target; Add/Subtract retain incremental behavior.
- Made the display-only Skin pts overlay follow posed skinned vertices during the viewport loop while keeping runtime source links outside serializable `userData`.
- Added focused unit coverage for pose capture/clip construction, controller history/metadata, explicit skin targets, and posed overlay refresh, plus a browser regression for create/undo/redo.
- Updated app-state, user, review, backlog, history, and summary-bank documentation to match the current feature contract and remaining old-editor parity work.

### Verification

- `npm.cmd run test:unit`: 275/275 passed across 46 discovered unit-test files.
- `npm.cmd run typecheck`, `npm.cmd run typecheck:test`, and `npm.cmd run lint`: passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed, including context validation, production build/chunk checks, frontend units, Rust fmt/clippy/check, and 10 Rust tests.
- The focused new pose-creation browser case reached all assertions with no product assertion failure, then hit managed `browserContext.close: spawn EPERM`; exact cleanup left no listener on ports 5173/1420. This remains harness-blocked evidence rather than a browser-green claim.
- `git diff --check`: passed.

## 2026-08-01 — Context budget and skill-route consolidation

- Raised the focused context-generation ceiling from 180 KiB to 256 KiB while keeping the 27.5 KiB default orientation narrow; the largest active route remains bounded by its own group cap.
- Routed the RustSMF summary-bank overlay through `workflow__context_bank` and added an explicit 96 KiB cap to the archived old-editor reference route.
- Removed repo-local `monolith-modularization` and `pitfall-ledger` copies because the global skills already own those workflows; retained only the project-specific `summary-bank-json` delta.

### Verification

- Context-bank validation, focused context tests, skill frontmatter validation, and the repository verification gate passed after the routing changes.

## 2026-08-01 — Guarded replacement, bounded history, and native I/O ownership

- Added a shared dirty predicate and accessible Cancel/Discard replacement dialog. Browser, drop, and native open paths defer byte materialization until discard is explicit; cancel, stale completion, parse failure, and native/browser errors retain the existing model and authoring state.
- Added a 512 MiB decoded SMF-memory estimate covering texture, mesh, rig, and animation allocations, with checked arithmetic and stable `SMF_DECODED_MEMORY_BUDGET_EXCEEDED` diagnostics.
- Moved native dialog ownership into Rust, authorized reads against dialog-selected canonical paths, removed the arbitrary native write-path command, and routed saves through a Rust-owned save dialog with the shared 256 MiB bound. The frontend now passes typed byte views instead of constructing an explicit number array.
- Aligned the Tauri Rust and frontend dialog-plugin declarations at 2.7.1 after the native smoke audit found the prior manifest-version drift; the frontend does not invoke the JS dialog API, but the declaration is required for Tauri's build contract.
- Added byte-aware editor and skin history limits with oldest-entry eviction, current-edit preservation, and status feedback. Editor history is capped at 64 MiB; skin history is capped at 32 MiB per direction.
- Kept mixer advancement imperative in the viewport and throttled parent timeline publication to a 50 ms display cadence, with immediate setters for scrub and playback intent changes.
- Repaired browser stress-fixture triangle metadata, made dirty-overlap tests explicitly confirm each replacement decision, and kept skin telemetry on the final collected hit so semantic validation and interaction probes remain deterministic.

### Verification

- `npm.cmd run test:unit`: 269/269 passed across 45 discovered unit-test files.
- Frontend app/test typechecks and ESLint passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed on the final tree, including context validation, build/chunk checks, 269 frontend tests, Rust fmt/clippy/check, and 10 Rust tests.
- Rust `cargo check --all-targets` and `cargo test`: 10/10 passed, including native path-authority coverage.
- `npm.cmd audit --omit=optional`: found 0 vulnerabilities.
- Current full browser run reached all 56 bodies with no product assertion failures; teardown reported only managed `browserContext.close: spawn EPERM`, and the preview listener was cleaned. Strict visual reached both bodies with the same teardown-only result.
- Current desktop smoke built the unbundled Tauri executable and passed all 10 Rust tests; its native IPC browser phase was stopped after managed teardown failed to complete, with no listener left behind.

## 2026-08-01 — Restored validated GLB/FBX-to-SMF conversion

- Repaired the non-SMF converter's space contract: mesh positions/normals/tangents are baked once into model-root Three space, the binary serializer owns the single Three-to-SMF conversion, and source-root transforms are removed exactly once.
- Captured bind and sampled bone poses as root-relative world dual quaternions so nested parent transforms survive SMF hierarchy reconstruction.
- Replaced direct quaternion-component interpolation with cloned Three animation-mixer sampling and stable frame-time collection.
- Restored compatible non-SMF SMF export and roundtrip actions while retaining diagnostic blocks for static roots, scale tracks, incomplete skin data, semantic failures, and unsupported structure.
- Added numeric parity tests for translated/rotated mesh transforms, nested bind matrices, mixer quaternion interpolation, and the app-facing conversion candidate.

### Verification

- Focused converter/candidate/coordinate slice: 58/58 passed.
- App and test typechecks passed.
- Targeted browser bodies reached the restored conversion assertions; managed Windows `browserContext.close: spawn EPERM` still blocked clean teardown, so no new browser-green claim is made.

## 2026-08-01 — Conversion safety gate and shared model boundaries

- Fail-closed the app-facing GLB/FBX-to-SMF candidate and SMF roundtrip action with `SMF_NON_SOURCE_CONVERSION_UNVERIFIED` after confirming the isolated converter did not yet prove coordinate, rig-space, or animation spatial parity.
- Kept the low-level Three-to-SMF builder available only for focused parity work and updated browser/unit contracts so source-SMF export remains enabled while non-SMF sources use GLB/FBX output.
- Added `smfSemantics.ts` as the shared finite/relational `ImportedSmf` validator for parser, worker fallback, and serializer boundaries; added checks for malformed mesh/skin references, rig cycles, animation times, DQ shape, and texture payloads.
- Fixed constructed SMF node-list parent resolution when a child precedes its parent, and added the regression test.
- Added one 256 MiB model-input limit shared by browser metadata, native/test-injected bytes, and SMF binary input/output; oversized browser files are rejected before `File.arrayBuffer()`.
- Reconciled app/user/test state docs, active TODO done-whens, summary-bank routing, and pitfall-ledger entries.

### Verification

- Focused conversion candidate/converter, semantic-validation, and model-input slice: 34/34 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context routing, lint, app/test typechecks, production-any/build/chunk gates, 259 frontend units across 43 files, and 9 Rust tests are green.
- The affected five-case browser slice reached all targeted test bodies, but managed `browserContext.close: spawn EPERM` occurred during teardown; no assertion failure was emitted and ports 5173/1420 were clear after exact test-process cleanup. The result is harness-blocked, not product-green browser evidence.

## 2026-08-01 — Lifecycle cleanup and skin-history indexing

- Made viewport RAF cleanup explicit for zero-valued handles and cleared both frame refs after cancellation.
- Coalesced and canceled browser file-picker focus timers, and canceled FBX texture wait timers as soon as texture loading settles.
- Replaced repeated linear skin-history snapshot searches with a shared mesh/vertex key index; added focused coverage for the indexing contract.

### Verification

- Focused skin unit slice: 21/21 passed; FBX loader slice: 6/6 passed; animation-frame slice: 2/2 passed.
- Frontend app and test typechecks passed; ESLint passed after the timer guard correction.
- Latest system-Chrome Playwright run reached all 55 test bodies but was blocked only by managed teardown `browserContext.close: spawn EPERM`; the earlier complete 55/55 run remains the authoritative browser result for this environment.

## 2026-08-01 — Worker setup cancellation and guidance alignment

- Hardened the SMF codec client against an abort arriving after worker handlers are installed but before the request is posted. The client now rechecks the signal, skips stale `postMessage` work, and safely clears an uninitialized timer during early cleanup.
- Added a focused regression test and updated the current-state/test-contract/context-bank docs. The repo-local modularization and pitfall skills now include the latest global workflow guidance without replacing the RustSMF-specific summary-bank rules.

### Verification

- Focused SMF codec client test: 10/10 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context validation, lint, typechecks, build/chunk guards, 251 frontend units, and 9 Rust tests are green.

## 2026-08-01 — Weight-preview state restoration audit

- Fixed selected-bone weight preview cleanup so it restores the source color attribute and each material's prior `vertexColors` mode instead of forcing materials to `false`.
- Added focused unit coverage for existing source colors, models without source colors, and invalid selected-bone cleanup. The test runner now discovers 41 files and reports 250 passing frontend unit tests.
- Updated `APP_STATE.md`, the frontend test contract, the legacy shader parity map, the pitfall ledger, and `summary_bank.json` to keep the current behavior and source route explicit.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context, lint, typechecks, build/chunk guards, 250 frontend units, and 9 Rust tests are green.
- Focused weight-preview unit test: 3/3 passed.
- A focused four-case skin browser rerun reached its test bodies but was blocked during managed Chrome teardown by `browserContext.close: spawn EPERM`; the prior complete 55/55 browser run remains the authoritative browser result, and the stale server was cleaned up.

## 2026-08-01 — Follow-up browser and legacy-shader audit

- Corrected the Playwright executable override to use `use.launchOptions`, where Playwright actually consumes it; the managed Windows fallback now runs against an explicitly approved installed Chrome executable without changing app configuration.
- Added a served SVG favicon, reused the viewport IK drag helper in visual coverage, froze animated skin fixtures for deterministic brush sampling, and widened probe points to cover narrow quad-view geometry.
- Audited the old selected-bone weight shaders and recorded their four-slot/HSV behavior alongside the current export-safe vertex-color equivalent. The legacy shader paths remain reference material, not an untracked implementation stub.
- Fixed the workspace-transition IK readiness race: browser telemetry now rejects absent coordinates, and newly mounted target handles refresh their world matrix before raycasting. The focused IK case passed 5/5 repeated runs; the full browser suite passed 55/55.
- Completed the dependency audit with `npm.cmd audit --omit=optional`: 0 vulnerabilities reported.

## 2026-08-01 — Integrity and external FBX compatibility pass

- Replaced the hardcoded frontend unit-test list with deterministic recursive discovery.
- Hardened posed skin-brush sampling, invalid skin diagnostics, cache invalidation, viewport resize cancellation, animation snapshot/controller ownership, and latest-intent load/export timing.
- Added bounded SMF reader/writer sections, counts, strings, numeric/range checks, output preflight, native 256 MiB I/O limits, blocking-task adapters, UNC normalization, explicit CSP, and truthful native header-check wording.
- Added current-head browser regressions for skin cancellation/no-op edits, native export cancellation, indexed geometry, material policy, and independent FBX compatibility.
- Added an independently authored Blender 5.0.0 skinned, textured, animated FBX fixture with provenance and a repeatable external validator. The fixture is intentionally test-only and carries no third-party source asset.
- Corrected FBX export integer-array typing and layer metadata so the vendored binary writer is accepted by Blender as well as Three.js. FBX texture loading now waits on the loader-owned resource manager before attaching the scene and removes unavailable maps before render.
- Updated the local Codex skill pack, pitfall ledger, current-state docs, history, and context routing to remove stale paths and repeated progress prose.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed after the final changes.
- `npm.cmd run test:e2e -- --reporter=line` with the process-local `RUSTSMF_PLAYWRIGHT_EXECUTABLE` override: 55/55 passed.
- `npm.cmd run test:visual-strict -- --reporter=line` with the same browser override: 2/2 passed.
- `npm.cmd run tauri:build:smoke`: optimized no-bundle Tauri release executable built successfully.
- Canonical `desktop-smoke`: release build, Rust tests, and native IPC browser coverage passed.
- Blender 5.0.0 validated both the committed independent fixture and the app-exported roundtrip: one mesh, two bones, weighted groups, animation curves, embedded material texture.
- `git diff --check`: passed.
