# Pitfall Ledger

Last reviewed: 2026-07-13 (verified source-safe material previews, texture export policy, SMF Rig/IK ownership, deform-index skin roundtrip, GLB recovery export, and DQ sign-equivalent diagnostics).

### Q: What pitfall are we preventing?

**What:** Viewport-only material and weight-preview state can leak into GLB/FBX exports when the exporter consumes the same live Three.js root mounted by the renderer.

**Context and constraints:** RustSMF intentionally shares one root across preview, authoring, diagnostics, and export so skeleton and animation references stay coherent. Tex-off, Mesh fade, Legacy lighting, repeat/filter overrides, and selected-bone weight colors must remain display-only without cloning or rebinding the skinned model.

**Why it happened:** The viewport backed up maps and opacity but applied the preview directly to source materials, and Legacy mode replaced `mesh.material`. GLB/FBX exporters read that live assignment asynchronously. The weight preview also added a geometry color attribute and enabled vertex colors. Restoring only when a toggle was disabled or a root was unloaded left export timing unprotected.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/materialPreview.ts`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/src/loaders/glb.ts`, `source/frontend/src/loaders/fbx.ts`, `source/frontend/src/utils/materialPreview.test.ts`, and `source/frontend/tests/smoke.spec.ts`.

**Evidence:** Source inspection showed `applyTextureEnabled(false)` assigning `material.map = null`, opacity changing the source material, and Legacy assigning a clone directly to each mesh before `GLTFExporter.parseAsync(root)`. The focused material tests now prove source assignment/map/opacity/vertex-color/wrap/filter state during an awaited operation and preview restoration afterward. The generated textured-GLB browser test activates all preview modes together and confirms the downloaded GLB still has one image and one texture.

**Developer story:** The old shelf mapping began as a UI-policy task. Tracing each control through the current exporter showed the Tex button was not merely ambiguous copy: it could change saved output. Centralizing source snapshots solved map/opacity/sampler restoration, but the same review exposed Legacy material assignment and Skin weight colors as equivalent leaks. The boundary was widened to the complete exporter-visible material/color state and held for the full asynchronous call. A root-identity check prevents a stale exporter completion from reapplying preview state after unload.

**How to catch it:** Run `npx tsx --test src/utils/materialPreview.test.ts src/utils/materialPolicy.test.ts src/utils/textureCompat.test.ts`, then `npx playwright test tests/smoke.spec.ts --grep "generated skinned GLB with material layout warnings" --workers=1` from `source/frontend`. Require image/texture records in the downloaded GLB while every preview override remains active.

**Solutions tried:**
1. `28/100` Keep per-control backups and restore only on toggle/unload, result: normal preview switching worked but export could observe the modified live root.
2. `78/100` Restore maps, opacity, samplers, and mesh assignments around export, result: material previews were isolated but Skin weight colors remained exporter-visible.
3. `97/100` Use one root-scoped async source boundary covering assignments, material/texture state, geometry colors, and root replacement, result: unit and real browser download proofs pass while the live preview is restored.

**Current solution:** `materialPreview.ts` captures source-owned state once per mounted root. GLB and FBX export restore it for the whole awaited exporter operation and reapply the captured preview only when that root remains registered. Texture diagnostics also read registered source materials instead of the current display assignment.

**Decision rationale:** A source boundary preserves the single-root skeleton/animation ownership model and applies uniformly to current and future preview controls. Cloning the whole skinned root was rejected because it would split live bone/edit references; documenting controls as “preview” without an export guard would not enforce the contract.

**Effectiveness:** `97/100`, durable. The fix is modular, exporter-wide, handles async completion and root replacement, and is proved by both state-level units and a textured downloaded asset.

**Relevance check:** Current. Any new Display material, geometry overlay, exporter, or worker boundary can reintroduce the leak if it bypasses this source-state contract.

**Next prevention step:** Require every future exporter-visible preview to register its source state with the same boundary and extend the downloaded-asset smoke when a new material channel is added.

### Q: What pitfall are we preventing?

**What:** SMF skin influences can be silently rebound to different bones when deform-order indices are mistaken for full rig-node IDs.

**Context and constraints:** SMF rig arrays include `isBone=0` head/dummy nodes, while mesh skin payloads index only deform bones. RustSMF's runtime skeleton also contains deform bones only. Export/reimport must preserve exact influence identity without structural heuristics.

**Why it happened:** `exportSMFToBuffer` inherited an old converter map from runtime bone order to full node index. The current importer and runtime correctly kept stored skin indices in deform order, so exporting a real head-node fixture shifted every influence after a dummy node. Roundtrip diagnostics compared geometry and pose but not skin payloads, producing a false pass.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/hooks/poseEdits.test.ts`, `source/frontend/src/loaders/smfDiagnostics.test.ts`, and `source/frontend/tests/mixamo_smf_baldguy.smf`.

**Evidence:** The new real-fixture preservation assertion failed with original indices such as `16,19,14,15` reimporting as `25,31,23,24`; the offset varied with intervening head nodes. After removing the node-ID remap, the focused 68-test SMF/Rig slice passed, including exact skin arrays and candidate-vs-reimport diagnostics.

**Developer story:** A node/head/skin/animation identity test was added for the SMF Rig parity done condition. Node and animation assertions passed, but skin arrays diverged while the existing diagnostic still reported success. Comparing the current loader with the owned legacy packer separated stored deform order from runtime full-node remapping. The serializer was corrected at the format boundary and the diagnostic gained explicit skin-index and 8-bit weight checks.

**How to catch it:** Run `npx tsx --test src/hooks/poseEdits.test.ts src/loaders/smfDiagnostics.test.ts` from `source/frontend`; require `SMF_ROUNDTRIP_SKINNING_OK`, zero skin-index changes, and exact real-fixture skin arrays after reimport.

**Solutions tried:**
1. `15/100` Accept the prior roundtrip report, result: false pass because skin identity was not compared.
2. `35/100` Preserve the full-node remap from the old GLB converter, result: incompatible with the current deform-only runtime and real SMF payload.
3. `98/100` Keep SMF skin payloads in deform order and make diagnostics fail on index/weight drift, result: exact real-fixture identity plus user-visible regression detection.

**Current solution:** Export writes in-memory deform-order skin indices unchanged. Roundtrip reports expose changed-index count and maximum weight delta, with weights allowed only normal 8-bit quantization tolerance.

**Decision rationale:** The checked-in real SMF fixture, current importer, and deform-only skeleton agree on one contract. Reintroducing full-node IDs or remapping on import would add unnecessary dual representations and risk runtime skinning.

**Effectiveness:** `98/100`, durable. The fix is localized to the serializer, directly proved on a head-node asset, and guarded by both exact and diagnostic tests.

**Relevance check:** Current. Any SMF serializer, head-node, skeleton-order, or skin-edit change crosses this boundary.

**Next prevention step:** Keep skin payload checks in every structured SMF roundtrip and require a head-node fixture before changing node-list or skin-index code.

### Q: What pitfall are we preventing?

**What:** A child SMF pose can export in the wrong space, and a reset button can destroy its bind offset by treating local zero as bind pose.

**Context and constraints:** SMF stores rig/world dual quaternions, runtime Three bones use local transforms, and non-deform head nodes are skipped in the runtime hierarchy. Reset must affect one selected deform bone, remain undoable, and preserve parent/head/skin/animation identity.

**Why it happened:** `applyPoseEditsToSmf` read `bone.matrix`, which is local to the effective deform parent, while the SMF rig record expects world/rig space. The old reset path set position and rotation to zero, which only matches a bind transform by accident and is wrong for most child bones.

**Where:** `source/frontend/src/hooks/poseEdits.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/Inspector.tsx`, and their focused tests.

**Evidence:** A synthetic root/head/child fixture proves the correct edited DQ matches `matrixWorld` and differs from the local matrix. The reset unit poses a parent and child under a transformed scene root, then proves only the child returns to its inverse-bind-derived local transform. The real-SMF browser flow proves dirty, reset, undo, redo, and roundtrip states.

**Developer story:** Source-mapping showed SMF has no writable name metadata and legacy detach is structural, leaving reset as the only safe candidate. Inspecting the existing reset revealed zeroing, and adding a skipped-head child export test exposed local-space serialization. The implementation derived bind world matrices from skeleton inverses, converted them to the selected bone's local space, and changed pose export to rig-space world matrices.

**How to catch it:** Run `npx tsx --test src/hooks/poseEdits.test.ts src/utils/rigEdits.test.ts` and the Playwright test `SMF rig policy gates indexed edits and bind reset is reversible`.

**Solutions tried:**
1. `10/100` Set selected bone position/rotation to zero, result: destroys legitimate child bind offsets.
2. `30/100` Serialize the runtime local matrix, result: wrong SMF DQ for nested/effective-parent chains.
3. `97/100` Derive reset locals from inverse binds and serialize edited SMF DQs from `matrixWorld`, result: bounded single-bone reset and correct head-skipping export.

**Current solution:** `resetBoneToBindPose` validates the selected deform bone and inverse bind, reconstructs bind world/local transforms, and refreshes the skeleton. `applyPoseEditsToSmf` writes rig-space world DQs. Reset clears that bone's pose edit only after success and records one history transaction.

**Decision rationale:** Inverse binds and `matrixWorld` are the existing authoritative runtime evidence. Heuristic zeroing or parent-index reconstruction at the UI layer was rejected because both duplicate loader math and fail under transformed roots/head skips.

**Effectiveness:** `97/100`, durable. Pure, real-fixture, and browser proofs cover space conversion, history, identity, and roundtrip behavior.

**Relevance check:** Current. Any bind-reset, pose-export, effective-parent, or skeleton-inverse change can reintroduce it.

**Next prevention step:** Keep matrix-space assertions explicit in pose tests; never label zeroing as reset or serialize an SMF rig DQ without proving its expected space.

### Q: What pitfall are we preventing?

**What:** A Three.js TransformControls controller can appear attached in app state while its visible/pickable gizmo is absent, and a decorative endpoint line can steal pointer ownership from a real gizmo handle.

**Context and constraints:** RustSMF uses Three.js r182, one shared canvas, explicit Rig/Animate history ownership, quad/ortho pane cameras, and a separate old-editor-style endpoint interaction. A drag must mutate exactly one history domain without orbit, endpoint, or selection side effects.

**Why it happened:** Modern `TransformControls` is a `Controls` object, not an `Object3D`; its public `getHelper()` root must be added to the scene. The previous cast-and-add path was swallowed as a supposedly benign Three-instance skew. Separately, endpoint raycasts included the visual connector line, and Three.js line raycasting uses a broad world-space threshold that overlapped gizmo pickers.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/boneHighlight.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/components/RigPanel.tsx`, and `source/frontend/tests/smoke.spec.ts`.

**Evidence:** The first real-handle smoke reached `data-transform-axis="X"` but stayed `data-transform-dragging="false"` while `data-endpoint-drag="active"`. Mounting `getHelper()` made the gizmo visible; restricting line hits alone still produced endpoint/gizmo ambiguity. The final focused run passed both the real TransformControls ownership test and the single/quad endpoint test sequentially, the six-test visual slice passed with the explicit six-button Rig tool row, and the complete browser suite passed 42/42.

**Developer story:** Inspection of the installed r182 source showed `getHelper()` is the documented scene object. After mounting it, a real drag revealed endpoint precedence. Axis-only priority fixed the gizmo but broke endpoint coverage. Inspecting endpoint geometry and the failure screenshot identified the connector line and overlapping controls as the turning point. The final design separated Select/gizmo, Endpoint, and IK tool ownership and limited the one-camera gizmo to single perspective view.

**How to catch it:** Run `npm run test:e2e -- --grep "endpoint drag works in rig mode|real TransformControls handle" --workers=1` from `source/frontend`, then run `npm run test:e2e -- tests/visual.spec.ts --workers=1`. Assert helper-mounted, axis, dragging, source, phase, and owner telemetry instead of accepting attach state alone.

**Solutions tried:**
1. `20/100` Cast `TransformControls` to `Object3D` and ignore `scene.add` failures, result: controller state existed but the public helper contract was violated.
2. `62/100` Let any hovered gizmo axis outrank endpoint fallback, result: real gizmo drag passed but legitimate endpoint drags became ambiguous.
3. `97/100` Mount `getHelper()`, make connector lines non-owning, expose an explicit Endpoint tool, project real picker geometry for tests, and detach the perspective-camera gizmo in quad/ortho, result: both interaction paths and visual coverage pass without cross-domain dirty state.

**Current solution:** Rig Select and Animate own the mounted TransformControls helper in single perspective view, Endpoint owns only marked cyan sphere meshes, IK owns its labeled target, Skin owns painting with the gizmo detached, and quad/ortho use their pane-aware explicit tools. Real picker geometry supplies stable browser drag coordinates. Endpoint pointer-cancel restores its pre-drag pose snapshot instead of silently committing the interrupted transaction.

**Decision rationale:** Explicit tools match the product's ownership model and remain stable as handle sizes change. Pixel-distance priority or broad fallback raycasts were rejected because they make behavior camera-, scale-, and DPR-dependent.

**Effectiveness:** `97/100`, durable. It uses public Three.js APIs, removes a swallowed failure, adds direct browser proof for Rig pose versus Animate key ownership, preserves endpoint coverage, and prevents unsupported multi-camera gizmo interaction.

**Relevance check:** Current. Any Three.js upgrade, gizmo-camera refactor, new handle geometry, or pointer routing change can reintroduce this class.

**Next prevention step:** Keep the real-handle, endpoint, and Skin paint tests together whenever TransformControls lifecycle, endpoint geometry, viewport cameras, or authoring ownership changes.

### Q: What pitfall are we preventing?

**What:** Odd head motion can be misdiagnosed as broken IK, and endpoint dragging or TransformControls can be mislabeled as IK even though those paths directly edit one bone. The old demos showed the head behavior before SMF-to-GLB recovery, and RustSMF did not have an IK solver before this slice.

**Why it happened:** A head is downstream of neck/spine rotations, so moving an ancestor correctly moves the head. Separately, the historical SMF bug treated serialized rig/world poses as local deltas and could resolve skipped non-deform head nodes against the wrong parent. Playback ownership can also reapply an animation pose after a manual edit. These are different failure classes and need different evidence.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/rigIk.ts`, `source/frontend/src/hooks/useLoadModel.ts`, and the owned Mixamo SMF/old-editor screenshots.

**How to catch it:** First pause playback and identify the selected bone plus pointer owner. `rig-endpoint-drag` and TransformControls are direct edits; only `rig-ik-drag` is chain solving. Compare the unposed real SMF against the old positive-control render, then use the IK unit suite for chain behavior and the real-SMF IK smoke for cancel/history/export behavior.

**Solutions tried:**
1. `20/100` Attribute any head movement during a viewport drag to IK, result: impossible historically because no solver existed and it hid the stored-world-pose defect.
2. `94/100` Fix effective-deform-parent world-to-local conversion and retain a real animated-bounds regression, result: the recovered SMF/GLB rig remains coherent.
3. `96/100` Add a separately labeled, bounded CCD Rig IK tool with joint/pole constraints, explicit `rig-ik-drag` telemetry, whole-chain cancel/undo, and SMF/GLB export proof, result: direct edits and IK now have distinct observable contracts.

**Current solution:** Treat head motion as an ancestry/animation/format diagnosis until `rig-ik-drag` proves the IK path. The SMF loader derives locals from serialized world poses through effective deform parents; the Rig IK tool rotates a validated ancestor chain without changing local bone lengths and records one pose transaction.

**Effectiveness:** `96/100`, durable. Pure tests cover reach, constraints, stale chains, invalid targets, and length invariants; real-SMF browser coverage proves Escape cancel, atomic undo/redo, SMF roundtrip, validated GLB export, and reviewed target/pose visuals.

**Relevance check:** Current. Future keyed IK, mixer ownership, head-node metadata editing, or solver changes can blur these boundaries again.

**Next prevention step:** If keyed IK is added, require an explicit bake-to-animation-key contract and add a head/neck chain fixture before enabling it in Animate mode.

### Q: What pitfall are we preventing?

**What:** Quad-mode UI can display `data-viewport-layout="quad"` while pointer hit-testing still uses stale single-view viewport specs, so immediate ortho-pane clicks no-op or route as perspective.

**Why it happened:** The canvas layout prop updated during React render, but `viewportRef` was refreshed in a normal effect. Under parallel Playwright load, the Rig Add child smoke clicked after the DOM attribute changed but before the effect updated hit specs.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests/smoke.spec.ts` generated-skinned Rig Add child flow.

**How to catch it:** Run the related smoke slice with default workers: `npx playwright test tests/smoke.spec.ts -g "generated skinned GLB load and SMF/GLB export path|viewport layout toggle works in single/quad modes|endpoint drag works in rig mode across single and quad layouts|skin paint updates edit state and exports SMF|animation keyframe authoring updates selected-bone clips and SMF checks"`.

**Solutions tried:**
1. `65/100` Make Rig Add child own ortho placement before bone selection, result: focused generated-skinned smoke passed alone but still failed under the related parallel smoke slice.
2. `93/100` Refresh viewport specs with `useLayoutEffect` for layout/camera changes, result: the parallel related smoke slice passed.

**Current solution:** Layout-critical viewport specs are updated in a layout effect before users/tests can interact with the rendered quad state; Rig Add child also records placement result telemetry.

**Effectiveness:** `93/100`, durable. The exact single-pass-green/parallel-red failure was reproduced, then the related parallel smoke slice passed.

**Relevance check:** Current. Any future change to viewport layout, camera toggles, pane hit math, or pointer routing can reintroduce stale ref timing.

**Next prevention step:** Keep layout/pane smoke in the related slice whenever `ThreeViewport` layout timing or `viewportLayout.ts` contracts change.

### Q: What pitfall are we preventing?

**What:** SMF-source export and diagnostics can falsely fail or corrupt strict roundtrip checks when prebuilt non-bone/head nodes are treated as synthetic identities or when sign-equivalent DQs are compared component-for-component.

**Why it happened:** The exporter preserved SMF-sourced node ordering but still filled `isBone=0` head nodes with identity rig/frame DQs. Separately, `compareSmfRoundtrip` compared raw DQ components even though a dual quaternion and its full negation represent the same pose.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/loaders/smfDiagnostics.test.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`, `docs/references/old-src/datafiles/SMF/spider_TEST.smf`.

**How to catch it:** Run `npm --workspace frontend run test:unit -- smfDiagnostics`; the real-fixture diagnostic test exports and reimports `mixamo_smf_baldguy.smf` plus `spider_TEST.smf` and expects strict structured roundtrip status `passed`.

**Solutions tried:**
1. `45/100` Compare raw DQ components and identity-fill head nodes, result: geometry stayed exact but strict pose diagnostics reported large false or real export-induced deltas.
2. `94/100` Preserve source rig/frame DQs for any node with source data, and compare DQs in the equivalent sign hemisphere, result: importable real fixtures pass strict diagnostics with regression coverage.

**Current solution:** `exportSMFToBuffer` writes preserved source DQs for prebuilt head nodes instead of identity fallback, and `compareSmfRoundtrip` computes pose deltas using the smaller direct-vs-negated DQ distance while still reporting component deltas in the chosen equivalent hemisphere.

**Effectiveness:** `94/100`, durable. It is verified by focused unit coverage over both a head-node old-source fixture and a sign-flipping Mixamo SMF fixture, and it protects a core export cockpit route.

**Relevance check:** Current. SMF-source fidelity and structured diagnostics remain active app surfaces, and future rig/export edits can easily reintroduce identity head-node fallback or raw DQ comparisons.

**Next prevention step:** Keep real import/export/reimport diagnostic fixtures in the unit gate whenever SMF node-list, animation frame, or DQ comparison code changes.

### Q: What pitfall are we preventing?

**What:** Context docs can move while README, run scripts, agent instructions, and `summary_bank.json` keep pointing at deleted or nonexistent planning paths.

**Why it happened:** The backlog moved from `docs/TODO.md` to `docs/dev/TODO.md`, and old local agent/tool instructions still referenced `plan.md`, but there was no automated summary-bank path guard to catch stale explicit paths.

**Where:** `README.md`, `run.ps1`, `docs/dev/APP_STATE.md`, `source/frontend/tests/README.md`, `.agents/*`, `.tools/project.json`, `summary_bank.json`, `scripts/verify-context-bank.py`.

**How to catch it:** Run `rg -n "docs/TODO\.md|plan\.md"` for current-path drift and `python scripts/verify-context-bank.py` for context-bank JSON/path validation.

**Solutions tried:**
1. `55/100` Move the TODO file without a verifier, result: current docs and context groups could drift.
2. `93/100` Add docs indexes/policy, redirect active references to `docs/dev/TODO.md`, update local agent/tool guidance to durable docs, and wire `scripts/verify-context-bank.py` into `verify`, result: stale current context paths fail locally.

**Current solution:** `docs/dev/TODO.md` is the active backlog; `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json` are the durable state/context surfaces; `run.ps1 -Task verify` runs the context-bank verifier before frontend/Rust gates.

**Effectiveness:** `93/100`, durable. It converts a docs-drift class into an executable check and keeps historical references separated from active links.

**Relevance check:** Current. This repo intentionally keeps multiple docs and local skills, so path drift is likely during future consolidation.

**Next prevention step:** Keep active docs under `docs/dev/`; if a doc moves, update `summary_bank.json` in the same change and run the verifier.

### Q: What pitfall are we preventing?

**What:** A GenEye smoke precheck can make an e2e run look GenEye-assisted without producing RustSMF Playwright evidence.

**Why it happened:** A standalone `GenEye smoke` run proves the GenEye repo is healthy, but it does not wrap RustSMF's Playwright command, ingest RustSMF JSON reporter output, save RustSMF screenshots/traces/videos, or write a `subagent-handoff.json` for the actual project run.

**Where:** `run.ps1 -Task test:e2e`, `README.md`, `source/frontend/tests/README.md`, `docs/dev/APP_STATE.md`, and GenEye `docs/PLAYWRIGHT.md`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:e2e -GenEyeRoot C:\DevStuff\Three-sisters\GenEye` and confirm an ignored `runtime-data\geneye-playwright-runs\<stamp>\summary.json` or `advisory-fallback-summary.json` exists. If RustSMF tests fail, the command must still exit nonzero.

**Solutions tried:**
1. `55/100` Run GenEye smoke before direct Playwright, result: GenEye health was checked but no RustSMF subagent evidence was produced.
2. `95/100` Pass RustSMF's own `npm run test:e2e -- --reporter=json` command to GenEye `playwright-full -AllowGenEyeFailure -Group geneye-watch-fixture`, result: GenEye can produce subagent evidence when available while browser-only e2e remains the fallback and app evidence stays tied to `project_tests`.

**Current solution:** `run.ps1 -Task test:e2e` resolves GenEye from `-GenEyeRoot`, `GENEYE_ROOT`, `GENEYE_RUN_BAT`, or the local Three-Sisters path, then calls GenEye `playwright-full` in advisory mode with the small `geneye-watch-fixture` plumbing scenario. `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` forces direct Playwright. If GenEye is missing or fails before project-test evidence exists, RustSMF runs direct Playwright. Project-test failures remain authoritative.

**Effectiveness:** `95/100`, durable once kept aligned with GenEye's `playwright-full` contract. It gives Codex/subagents compact evidence without making RustSMF depend on GenEye to test itself.

**Relevance check:** Current. RustSMF is the active external consumer for proving GenEye's browser-app testing workflow.

**Next prevention step:** After any GenEye wrapper or RustSMF e2e command change, run both the GenEye-backed e2e path and the browser-only fallback, then update docs if evidence paths or command names change.

### Q: What pitfall are we preventing?

**What:** Running separate Playwright commands in parallel can create a false failure because each command tries to start its own strict preview server on port 5173.

**Why it happened:** The repo's Playwright config intentionally uses `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`. Launching two independent `npx playwright test ...` processes at once makes the second preview process fail with `Port 5173 is already in use`, even when the app and tests are healthy.

**Where:** `source/frontend/playwright.config.ts`, local verification command usage, `source/frontend/tests/visual.spec.ts`, `source/frontend/tests/smoke.spec.ts`.

**How to catch it:** If a Playwright run fails before tests execute with a Vite preview port error, run `Get-NetTCPConnection -LocalPort 5173 -State Listen` and rerun the affected specs as one Playwright command or sequential commands.

**Solutions tried:**
1. `35/100` Run smoke and visual specs as separate shell commands in parallel, result: the visual spec failed before starting because the smoke command owned the strict preview server.
2. `91/100` Rerun the visual spec after the first Playwright command exited and confirmed port 5173 was clear, result: all visual tests passed.

**Current solution:** Parallelize independent file reads, typechecks, unit tests, and builds where safe, but run Playwright web-server specs through one command or sequentially unless the config is changed to allocate distinct ports.

**Effectiveness:** `91/100`, durable. The failure mode is simple, verified by the exact port error and passing rerun, and it preserves the product decision to test against production preview.

**Relevance check:** Current. The e2e and visual specs intentionally use a strict preview server to avoid Vite dev/HMR instability.

**Next prevention step:** If broader Playwright sharding is needed, add explicit per-worker/per-command ports before parallelizing independent `npx playwright test` invocations.

### Q: What pitfall are we preventing?

**What:** React hooks called at module scope can make the built app boot to a blank page while lint, typecheck, unit tests, and Vite build still pass.

**Why it happened:** A Tauri client cache used `useRef` outside `useLoadModel()`. React hook dispatchers are only valid during component or custom-hook render, so the production app failed at import time with `TypeError: Cannot read properties of null (reading 'useRef')`.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`, caught by `pwsh -File run.ps1 -Task test:e2e -NoGenEye` and confirmed with a direct Playwright probe against Vite preview.

**How to catch it:** Run browser e2e after hook/cache refactors. If every spec fails before `status-text` appears and page errors mention `useRef`, inspect for `use*` calls outside React functions. Grep: `rg -n "const .* = use[A-Z]|let .* = use[A-Z]" source/frontend/src`.

**Solutions tried:**
1. `45/100` Add Vite `resolve.dedupe` for React/React DOM, result: useful hardening but did not fix the crash because the root cause was invalid hook placement.
2. `94/100` Replace the module-scope `useRef` cache with a plain module variable `cachedTauriClient`, result: app boot smoke passed and full browser e2e returned to 22/22.

**Current solution:** Module-level caches use plain variables or functions. React `useRef`, `useState`, `useMemo`, `useEffect`, and `useCallback` stay inside components or custom hooks.

**Effectiveness:** `94/100`, durable. The failing full e2e was reproduced, the smallest boot smoke passed after the fix, and the full browser plus GenEye-backed e2e suites passed.

**Relevance check:** Current. Future timing/cache cleanup around `useLoadModel` and Tauri lazy imports can repeat this mistake.

**Next prevention step:** Add a small static grep/check if this recurs, or include module-scope hook search in integrity passes that touch hook files.

### Q: What pitfall are we preventing?

**What:** SMF models can parse successfully with no console errors while the visible mesh is torn apart, and a GLB export can be saved without proving that its rig and animation structure reload intact.

**Context and constraints:** The old GameMaker example is a positive control for the owned Mixamo SMF. RustSMF must preserve SMF v11 node ordering and world-pose serialization, skip non-deform head/dummy nodes when deriving Three locals, retain all named clips, and fail before save instead of producing a plausible but unverified recovery artifact.

**Why it happened:** The Three loader once treated SMF rig DQs as local bone transforms even though the file stores bind and animation node poses in rig/world space. Those poses must be converted relative to the nearest effective deform parent, not blindly relative to a skipped head node. Render geometry also used raw byte weights whose sums can be below 1, while the old dual-quaternion shader normalized blended DQs. The GLB save path then trusted exporter completion without reparsing and comparing the produced file.

**Where:** `source/frontend/src/loaders/smf.ts`, `smfRig.ts`, `coord.test.ts`, `glb.ts`, `glb.test.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`, and old-source reference screenshots.

**Evidence:** The same SMF renders correctly in the old platformer. A deliberately wrong local-delta interpretation expanded the real animated bounds from about `29.717` to `96.16`, while the corrected effective-parent path remains below the `2x` bound. A fresh recovery export reloads with 24 deform bones and 12 clips; the GameMaker artifact SHA-256 is `A35D5DCB8474A5C16E184613512D3948DDB00D9B682C25D5D69500AEE7305B5B`.

**Developer story:** Parser success and a narrow synthetic hierarchy initially looked sufficient, but the real animated model exposed a false green. Reading the old writer and loader together established that file frames are rig/world poses even though the old runtime derives local deltas internally. The converter retained effective-deform-parent derivation and real animated-bounds coverage; the export path now reparses bytes and compares finite bindings plus bone, mesh, clip, name, and track structure before opening the save dialog.

**How to catch it:** Run `npm --workspace frontend run test:unit`; the synthetic head-node test pins effective-parent locals, the real Walk test bounds animated skinning, and `glb.test.ts` proves verified export success plus missing-clip and non-finite rejection. Also load the SMF and exported GLB visually before promoting a recovery artifact.

**Solutions tried:**
1. `45/100` Rely on parser success and screenshot byte-size checks, result: torn meshes still counted as rendered.
2. `10/100` Treat serialized frames as already-local deltas, result: the focused assumption looked plausible but the real animated model tore apart.
3. `94/100` Build Three bones from SMF world bind matrices, derive animation locals against effective deform parents, normalize render-side weights, and add real CPU skinning regressions, result: the sample renders coherently and the false-local path fails.
4. `97/100` Reparse every generic/explicit GLB export before save and require finite targets plus matching rig/animation structure, result: malformed or structurally lossy output is blocked at the app boundary.

**Current solution:** `buildThreeScene` derives local transforms from stored world DQs through effective deform parents, uses world inverse binds, and normalizes skin weights without changing imported SMF data. `validateExportedGLB` reparses generated bytes, rejects non-finite or missing animation targets, compares bone/skinned-mesh/clip/name/track counts, disposes the temporary scene, and blocks save on mismatch.

**Decision rationale:** The real fixture is required because a synthetic hierarchy alone did not expose pose explosion. Post-export validation is intentionally structural and finite-value based so it catches broken files without imposing asset-specific motion limits on every user model.

**Effectiveness:** `97/100`, durable. It combines source-contract, real-animation, post-export reparse, browser-flow, and positive-control evidence while keeping asset-specific bounds out of the generic validator.

**Relevance check:** Current. This is a core model-load path and can regress when SMF rig/animation conversion changes.

**Next prevention step:** Record converter version/hash alongside promoted recovery assets and keep one reviewed SMF-to-GLB pixel comparison when conversion math changes.

### Q: What pitfall are we preventing?

**What:** Optional strict visual snapshots can preserve a stale broken render after the actual loader has been fixed, and generated Playwright reports can dirty the repo after every run if tracked.

**Why it happened:** Default e2e uses tolerant screenshot byte-size checks for WebGL stability, so stale committed strict baselines were not exercised by normal `verify`. Separately, `playwright-report/index.html` and `test-results/.last-run.json` were tracked despite ignore rules.

**Where:** `source/frontend/tests/smoke.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `source/frontend/package.json`, `source/package.json`, `run.ps1`, `source/frontend/playwright-report/`, `source/frontend/test-results/`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:visual-strict` after SMF renderer, camera, skeleton, or visual snapshot changes; inspect the resulting PNGs; run `git status --short` after e2e and confirm reports/results do not appear as tracked modifications.

**Solutions tried:**
1. `45/100` Rely on tolerant screenshot byte-size checks, result: old torn SMF snapshots stayed committed while default tests passed.
2. `93/100` Add explicit strict visual check/update tasks, refresh coherent SMF load/export baselines, and untrack generated Playwright report files, result: visual baselines are intentional and e2e diagnostics no longer churn source.

**Current solution:** Use `test:visual-strict` for opt-in SMF baseline enforcement and `test:visual-update` only for intentional baseline refreshes. `playwright-report/` and `test-results/` remain ignored and untracked.

**Effectiveness:** `93/100`, durable. It gives visual baseline maintenance a named command without making default e2e brittle.

**Relevance check:** Current. SMF visual fidelity and future quad/bone-overlay work will keep changing renderer output.

**Next prevention step:** Add tighter semantic visual heuristics once quad/ortho view or large bone handles are implemented, so default e2e can catch obvious coherence failures without exact pixel matching.

### Q: What pitfall are we preventing?

**What:** Work can remain stranded on temp/review branches or auto-stashes, then docs can make the wrong source of truth look authoritative.

**Why it happened:** Execute-plan refs contained old-src docs/screenshots/proof artifacts and source review fixes, but the newer old-src GameMaker `.gml`/`.yy`/`SMF.yyp` state lived in `stash@{0}` from an auto-stash before pull. A branch-only audit made docs claim GML/YY hash verification against the execute-plan tip even though that branch did not contain the recovered GML work.

**Where:** remote `origin/execute-plan/*` refs, `stash@{0}`, `AGENTS.md`, `docs/references/old-src/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/*`.

**How to catch it:** Run `git branch --all --verbose --no-abbrev`, inspect `git log main..branch`, diff branch-only files, and also run `git stash list` plus `git stash show --name-status` before deleting branches or stash entries. Confirm needed work is present on local `main`.

**Solutions tried:**
1. `55/100` Leave branch work as branch-only context, result: main missed old-src screenshots/docs and export-path review fixes.
2. `70/100` Reconcile branch-only artifacts and fixes onto local `main` while assuming old-src GML/YY lived in the execute-plan tip, result: docs preserved screenshots but misidentified the backing source for the GameMaker source edits.
3. `96/100` Keep execute-plan docs/screenshots/proof artifacts and `options/reddit` metadata, restore tracked old-src `.gml`/`.yy`/`SMF.yyp` paths from `stash@{0}`, apply whitespace-only cleanup where needed before commit, document push semantics in `AGENTS.md`, keep generated reports/test-results out of source, and confirm the old-src GameMaker project manually after recovery, result: temp branches and the auto-stash each have a clear role and the recovered GML was user-tested.

**Current solution:** Work locally on `main`; Codex work should reflect `main` in progress and be reviewed in-place with the user, not through a default PR branch workflow. Temp branches are scratch/review only; explicit `push to git` means push/sync `main` only unless the user names another branch. Do not drop `stash@{0}` until the recovered old-src `.gml`/`.yy`/`SMF.yyp` state is committed or separately archived, and account for expected execute-plan-only metadata or whitespace-only cleanup if comparing against the stash.

**Effectiveness:** `96/100`, durable once committed. The workflow rule is documented, branch cleanup can be validated with git diffs, stash cleanup now has an explicit guard, and the restored old-src GameMaker state was manually verified by loading/testing it.

**Relevance check:** Current. The repo had execute-plan refs and an auto-stash with different useful old-src work.

**Next prevention step:** After verification, delete local temp branches only once their unique work is represented on `main`; do not delete remote branches or stash entries without an explicit cleanup request and a current diff check.

### Q: What pitfall are we preventing?

**What:** JSX text nodes do not interpolate `${}` template syntax — wrapping in `{}` is required.

**Why it happened:** The clip duration in the Inspector was written as `(${(c.duration || 0).toFixed(2)}s)` inside a JSX text node. In JSX, `${}` outside of a JS expression block `{}` is rendered as literal characters, not as a template expression.

**Where:** `source/frontend/src/components/Inspector.tsx` clip list item label.

**How to catch it:** Typecheck does not flag this (it is valid JSX text), lint does not flag it, and unit tests did not cover the rendered clip label string. Manual visual inspection or a targeted Playwright assertion on the clip item text would catch it.

**Solutions tried:**
1. `92/100` Changed JSX text `(${...}s)` to a JSX expression `({(c.duration || 0).toFixed(2)}s)`, result: clip label now shows the real duration value like `walk (1.23s)`.

**Current solution:** All dynamic values in JSX are inside `{}` expression blocks.

**Effectiveness:** `92/100`, durable. The fix is minimal and the root cause is a JavaScript/JSX syntax distinction that is easy to repeat.

**Relevance check:** Current. Any JSX-heavy component can repeat this mistake.

**Next prevention step:** When writing JSX with dynamic text mixed with static text, always wrap computed parts in `{}`. Consider a Playwright assertion for at least one clip item label format to catch future regressions.

### Q: What pitfall are we preventing?

**What:** Narrow toolbar layouts can make mode tabs partially unreachable or visually inert while broader viewport continuity checks still pass.

**Why it happened:** The mode tablist used fixed-width inline-flex tabs inside a wrapping toolbar. At constrained widths, the tab group could overflow instead of becoming a predictable interaction row, and pre-load layout switching was documented as model-gated but not enforced by the toolbar controls.

**Where:** `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/App.tsx`, `source/frontend/src/index.css`, and `source/frontend/tests/smoke.spec.ts`.

**How to catch it:** Run the constrained-width smoke path that sets the viewport to 360px, loads the SMF fixture, clicks Model/Rig/Skin/Animate/Export tabs without forced clicks, and verifies selected-bone plus scrub continuity. Also assert no-model layout buttons are disabled and the canvas remains single-layout.

**Solutions tried:**
1. `65/100` Rely on normal/medium viewport mode continuity checks, result: narrow overflows could remain hidden.
2. `93/100` Put mode tabs on a full-width scrollable row under 800px, disable layout switching until a model exists, force no-model layout back to single, and add the constrained-width smoke test, result: mode changes are deterministic at 360px and the documented no-model layout contract is executable.

**Current solution:** Toolbar mode tabs use a constrained scroll row on small screens; `Toolbar` receives `hasModel` to gate layout buttons; `App` resets no-model layout to single; smoke tests cover pre-load layout lock and post-load narrow mode switching.

**Effectiveness:** `93/100`, durable. The behavior is verified through a real browser at the problematic width and keeps state continuity assertions tied to actual clicks.

**Relevance check:** Current. Toolbar, workspace panel, and viewport layout changes are active backlog areas.

**Next prevention step:** Keep constrained-width e2e coverage with any toolbar, workspace mode, or layout-control refactor.

### Q: What pitfall are we preventing?

**What:** PowerShell test wrappers can report success even when npm/Playwright fails.

**Why it happened:** PowerShell functions return everything written to the success stream. `Invoke-FrontendNpm` emitted npm output plus a boolean, so `if (-not (Invoke-FrontendNpm ...))` evaluated the non-empty output array as truthy even when `$LASTEXITCODE` was nonzero.

**Where:** `run.ps1` `Invoke-FrontendNpm` and `test:e2e`; caught when full Playwright initially failed but `pwsh -File run.ps1 -Task test:e2e` returned exit code 0.

**How to catch it:** Run a known-failing npm script through the wrapper and inspect the process exit code, not just console text. Keep helper output on the host stream and store `$LASTEXITCODE` before returning a boolean.

**Solutions tried:**
1. `42/100` Return `$LASTEXITCODE -eq 0` after invoking npm directly, result: npm output leaked into the function return and masked failures.
2. `92/100` Pipe npm output to `Write-Host`, capture `$LASTEXITCODE`, and make `test:e2e` exit on false, result: wrapper status now matches direct Playwright status.

**Current solution:** `Invoke-FrontendNpm` writes command output to host and returns only a boolean; `test:e2e` exits nonzero when the helper returns false.

**Effectiveness:** `92/100`, durable. The wrapper now propagates pass/fail correctly for npm tasks that use it.

**Relevance check:** Current. Future run-script helpers can repeat this PowerShell success-stream mistake.

**Next prevention step:** When adding wrapper helpers around native commands, test at least one failing path and inspect the shell exit code.

### Q: What pitfall are we preventing?

**What:** Progress docs can claim a gate, fixture, or coverage path exists after planned work, while the repo does not actually contain the file or script.

**Why it happened:** Long pass-history sections were appended over time, and later reviews trusted those claims instead of checking referenced files, scripts, and test execution.

**Where:** `docs/TODO.md`, `docs/dev/APP_STATE.md`, `summary_bank.json`, `source/frontend/package.json`, missing `source/frontend/tsconfig.test.json`, missing `source/frontend/tests/native.spec.ts`, and previously absent default skinned non-SMF fixture coverage.

**How to catch it:** For every documented gate or fixture, run `rg` for the referenced file/script, run the command directly, and confirm skipped tests are intentional backlog items rather than completed coverage.

**Solutions tried:**
1. `45/100` Keep appending pass recaps, result: important coverage claims became hard to verify and some were stale.
2. `90/100` Add missing `typecheck:test`, `tsconfig.test.json`, direct Node types, and `native.spec.ts`; then rewrite TODO/APP_STATE into current state plus active backlog, result: docs matched runnable gates and remaining fixture work became explicit.
3. `95/100` Add generated self-authored skinned GLB fixture coverage and remove the sample-dependent FBX skip, result: default e2e now covers non-SMF skinned load, guarded SMF export, and GLB export without external asset assumptions.

**Current solution:** `run.ps1 -Task verify` runs app and test typechecks; `tests/native.spec.ts` covers mocked Tauri open/read/save/cancel; `tests/helpers/skinned-glb-fixture.ts` provides default non-SMF skinned fixture coverage.

**Effectiveness:** `95/100`, durable. The fix adds executable gates, removes duplicated progress logs, and closes the default skinned fixture skip with generated self-authored data.

**Relevance check:** Current. Integrity passes and feature docs will continue to reference gates and fixtures.

**Next prevention step:** Before marking coverage complete, require file existence checks or generated-fixture source checks plus a fresh command result in TODO or APP_STATE.

### Q: What pitfall are we preventing?

**What:** TypeScript/TSX app code can drift while `npm run lint` and Vite build still pass.

**Why it happened:** The ESLint flat config intentionally ignores `*.ts` and `*.tsx`, and Vite transpiles TypeScript without full typechecking. That allowed ambiguous barrel exports, stale typed-array contracts, missing type imports, and obsolete Three.js material props to remain hidden.

**Where:** `source/frontend/eslint.config.js`, `source/frontend/package.json`, `run.ps1`, `source/frontend/src/loaders/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/backend-client/tauri.ts`.

**How to catch it:** Run `npm run typecheck` in `source/frontend`, or `pwsh -File run.ps1 -Task verify` after this pass. Treat typecheck as required for import/export or loader contract changes.

**Solutions tried:**
1. `55/100` Rely on Vite build and current lint, result: runtime build passed but static type drift stayed hidden.
2. `88/100` Add app `tsc --noEmit` to package and verify, result: caught and fixed source contract drift without adding new dependencies.
3. `94/100` Add separate test-source typecheck with Node/Playwright types, result: caught unsafe test buffers and implicit helper types, then made `verify` cover app and test contracts.

**Current solution:** `source/frontend/package.json` has `typecheck` and `typecheck:test`; `run.ps1 -Task verify` and `source/package.json` verify run both before build/tests.

**Effectiveness:** `94/100`, durable. It catches app and test source regressions with low cost and keeps Node/Playwright types out of the browser app config.

**Relevance check:** Current. The app is TypeScript-heavy and future loader/viewport changes can regress contracts without this check.

**Next prevention step:** Keep app and test tsconfigs separate; do not silence failing test files with excludes.

### Q: What pitfall are we preventing?

**What:** Desktop SMF parser simulations can diverge from the Rust/Tauri command behavior.

**Why it happened:** The Playwright helper read animation count as `u32` while Rust `get_smf_desktop_info`, Rust tests, and the TS SMF loader read the SMF animation count as `u8`.

**Where:** `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`, `source/frontend/src/loaders/smf.ts`.

**How to catch it:** Keep Rust native tests for `parse_smf_header_info` and run Playwright desktop-info simulation against real `.smf` bytes. When parser width/offset semantics change, update Rust, TS loader, and JS simulation together.

**Solutions tried:**
1. `60/100` Comment-only documentation of desktop simulation, result: stale behavior remained possible.
2. `91/100` Align JS simulation with Rust `u8` behavior and add a pitfall entry, result: simulation now matches the runtime contract and the failure mode is documented.

**Current solution:** `simulateGetSmfDesktopInfo` reads `bytes[p.offAnim]` as `u8`; Rust has a fixture proving `u8` width.

**Effectiveness:** `91/100`, durable. The fix is verified by the app test suite and aligns all three parser surfaces.

**Relevance check:** Current. Desktop validation status is user-visible for `.smf` loads and easy to regress when extending parser peeks.

**Next prevention step:** Factor shared parser-width notes into a small SMF format doc if Rust parser work expands beyond peeks.

### Q: What pitfall are we preventing?

**What:** Native save dialog cancellation can be reported as a successful export.

**Why it happened:** `saveFile` returned `void`, so callers could not distinguish a completed write/download from a Tauri save dialog cancel.

**Where:** `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:e2e`; the native IPC mock covers open, save, write, cancel, and status behavior.

**Solutions tried:**
1. `52/100` Treat no returned file path as a silent no-op, result: export handler still showed success.
2. `93/100` Make `saveFile` return `boolean` and assert cancel status through the native IPC mock, result: canceled exports show `Export canceled.` and no write is recorded.

**Current solution:** `saveFile` returns `false` for native save cancel and `true` for native write/browser download; export handlers branch on that result.

**Effectiveness:** `93/100`, durable. The behavior is user-visible, covered by e2e, and keeps the API contract clear.

**Relevance check:** Current. Native save/export is core desktop behavior and easy to regress during export-path changes.

**Next prevention step:** Keep native dialog tests in `source/frontend/tests/native.spec.ts` whenever save/open behavior changes.

### Q: What pitfall are we preventing?

**What:** Invalid SMF edge cases can produce opaque parser failures, NaN dual-quaternion transforms, or invalid animation timing during export.

**Why it happened:** `BinaryReader` relied on raw `DataView` range errors, `dqNormalize` divided by a zero/invalid rotation length, and animation export normalized keyframe time by duration without guarding zero-duration clips.

**Where:** `source/frontend/src/loaders/smfBinary.ts`, `source/frontend/src/loaders/coord.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`.

**How to catch it:** Run `npm --workspace frontend run test:unit` or `pwsh -File run.ps1 -Task verify`; unit tests cover truncated SMF input, zero/invalid DQ normalization, and zero-duration animation export.

**Solutions tried:**
1. `58/100` Let low-level `DataView` and float math fail naturally, result: failures were hard to interpret and could serialize NaN/Infinity.
2. `90/100` Add bounded reads and safe normalized animation time, result: parser failures and zero-duration animation export became finite and actionable.
3. `94/100` Add `dqNormalize` identity fallback for zero/NaN/Infinity rotation parts plus invalid-DQ unit coverage, result: DQ export math cannot serialize non-finite values from malformed rotation parts.

**Current solution:** Binary reads throw `Unexpected end of SMF binary...`; invalid DQs normalize to identity; zero-duration animations write normalized time `0`.

**Effectiveness:** `94/100`, durable for malformed input and partial conversion work. It does not prove future non-SMF-to-SMF animation fidelity by itself.

**Relevance check:** Current. Exact GLB/FBX-to-SMF work will stress DQ construction and animation timing.

**Next prevention step:** Keep malformed-input and invalid-DQ unit tests close to any new SMF rig/animation serialization helper.

### Q: What pitfall are we preventing?

**What:** Non-SMF save-as-SMF can silently lose fidelity if static meshes, mismatched skeletons, duplicate bone names, object-level tracks, morph tracks, material data, or scale animation are accepted as if they were fully representable in the current SMF DQ path.

**Why it happened:** The earlier removed GLB-to-SMF helper attempted rough DQ construction without fixture-backed animation proof, and SMF stores rig/animation as DQs without a scale channel.

**Where:** `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/Toolbar.tsx`.

**How to catch it:** Run `npm --workspace frontend run test:unit` or `pwsh -File run.ps1 -Task verify`; converter tests assert skeletal animation roundtrip and rejection of scale animation/static roots.

**Solutions tried:**
1. `35/100` Keep the old approximate helper, result: misleading incomplete conversion path with empty animation frames.
2. `74/100` Remove the helper and keep GLB as the only non-SMF export, result: safe but missing save-as-SMF for valid skinned cases.
3. `92/100` Add a guarded Three skinned-source converter with fixture-backed DQ roundtrip and explicit rejection of unsupported cases, result: verified SMF export for compatible GLB/FBX runtime roots without pretending all source fidelity is covered.

**Current solution:** `Export SMF` uses `buildImportedSmfFromThree` only for skinned roots with one shared named skeleton and supported bone position/quaternion tracks; unsupported cases show a clear status and should use GLB export.

**Effectiveness:** `92/100`, durable. It covers the intended animation path and prevents silent scale/static conversion loss, while leaving texture/material fidelity to GLB.

**Relevance check:** Current. This is now a user-visible export path and should guide any future expansion of SMF conversion.

**Next prevention step:** Add real-file skinned GLB/FBX fixtures if converter support expands to materials, morphs, multiple skeletons, or scale-aware formats.

### Q: What pitfall are we preventing?
**What:** Module moves/refactors (e.g. extracting BinaryReader/Writer + bytes util to smfBinary.ts) can leave duplicate code behind in the original files + consumers, plus the new file stays untracked, while docs claim "deduped".

**Why it happened:** The integrity pass added smfBinary.ts and updated some notes, but smf.ts retained its local copies of the classes + bytes fn; useLoadModel and tauri kept their buffer copies; barrel was not updated to expose the util; no follow-up grep or consumer audit + `git add` for the moved file.

**Where:** loaders/smf.ts (full dupe classes), hooks/useLoadModel.ts + backend-client/tauri.ts (bytes copy), loaders/index.ts, the untracked smfBinary.ts, docs/TODO/APP_STATE/summary_bank over-claims.

**How to catch it:** After any cross-file move/extract: 1) grep -r for the fn/class name in src (should appear only in new home + imports), 2) run full `npm run typecheck && npm run lint`, 3) `git status` (new file must be intentional), 4) update barrel if the util is meant for sharing, 5) re-verify. Independent full review greps + file reads caught it.

**Solutions tried:**
1. 40/100 Assume the pass "took care of wiring", result: latent dupes + doc/code drift.
2. 95/100 Full discovery grep + read of all buffer sites + consumers + barrel + status, plus immediate replace + tests, result: single source of truth, improved bounds active everywhere, doc claims corrected same pass.

**Current solution:** smfBinary.ts is the owner (with header note); imports + barrel + deletions done; smfBinary now tracked in tree; paired entry added to TODO + new issue__ group in summary_bank.

**Effectiveness:** 95/100, durable for this class of refactor. Prevents silent fidelity or error-handling drift (old check vs ensure impls).

**Relevance check:** Current (and future P2 splits of smf/ThreeViewport will re-apply same discipline).

**Next prevention step:** Consider a small CONTRIBUTING or AGENTS note, or pre-commit grep guard for known helper names. Use monolith-modularization skill explicitly on >400 line files before extract.

### Q: What pitfall are we preventing?

**What:** SMF flat node lists + explicit `isBone=0` head dummies can either produce crossed editor bones or hang the loader when a skipped head node self-parents.
**Why it happened:** The original hierarchy path created `THREE.Bone` for every node and attached by direct parent index. The first head-skip fix added effective-parent walking, but root head dummies in real SMF files can parent to themselves; without a visited set, the walk never terminated. Once that was fixed, inverse bind matrices still needed fresh world matrices before `Skeleton.calculateInverses()`, and animation tracks for skipped head nodes emitted missing-target warnings because those dummies are not scene objects.
**Where:** `source/frontend/src/loaders/smf.ts` (old bone loop + threeBones + attach + skel ctor + remap + name gen), `source/frontend/src/loaders/smfRig.ts` (export only), poseEdits regex, ThreeViewport (helper on root + findBoneByName on skel), Inspector (getRoot + recursive children filter), coord.test golden fixture (heads present but only export/roundtrip tested), mixamo sample (14 heads, 24 deform, skins 0-22 seq).
**How to catch it:** Load `source/frontend/tests/mixamo_smf_baldguy.smf` through the UI and assert the loading overlay clears; run the root-head unit regression plus the real bind-pose skinning test; watch Playwright console output for `THREE.PropertyBinding: No target node found` head-track warnings.
**Solutions tried:**
1. Direct attach + mixed skel (original), result: skin ok by compensation, editor broken for any head-using rig.
2. Effective ancestor walk without cycle detection (2026-06-15), result: crossed bones fixed but root-head self-parent files could spin forever.
3. `96/100` Add `findEffectiveBoneParentIndex` with visited-set cycle guard, reuse it for hierarchy and animation local-parent resolution, update root world matrices before inverse binds, and skip non-scene head animation tracks; result: real SMF load completes, bind-pose test passes, and smoke test has no head-track warnings.
**Current solution:** Dedicated builder in `smfRig`; called from `buildThreeScene`; only `isBone=1` nodes enter the skeleton and scene hierarchy; effective parents skip heads with cycle protection; names are prefixed for readability + regex safety; userData carries original indices; animation clips target only scene bones.
**Effectiveness:** `96/100`, durable. It is verified by the real `.smf` fixture, root-head regression, bind-pose skinning invariant, Playwright SMF load, native IPC mock, and full `verify`.
**Relevance check:** Current. Any future SMF rig changes (more head synth, glb->smf heads) or editor viz work will touch this.
**Next prevention step:** Keep root-head/self-parent and real-sample load tests near any SMF hierarchy change; before changing bone parent logic, rerun targeted units plus `npm --workspace frontend run test:e2e -- tests/smoke.spec.ts -g "can load a real SMF sample"`.

### Q: What pitfall are we preventing?

**What:** Project launchers can look healthy while not actually starting the app for the default user path.

**Why it happened:** `run.ps1` defaulted to help text, `run.bat` assumed `pwsh` was available, and the Tauri path could depend on a globally installed CLI instead of the repo-local npm dependency.

**Where:** `run.ps1`, `run.bat`, `README.md`, `source/frontend/package.json`.

**How to catch it:** Run the exact user-facing commands with no extra task arguments: `.\run.bat` and `pwsh -File run.ps1`. Confirm Vite starts and the Tauri desktop app process launches, not only that help text prints.

**Solutions tried:**
1. `55/100` Keep launch instructions as explicit tasks only, result: documented commands worked but the user-facing default failed the "run this project" expectation.
2. `94/100` Make no-arg `run.ps1` start desktop dev, make `run.bat` fall back to Windows PowerShell, and invoke the local npm Tauri CLI, result: default launchers run the app without global CLI assumptions.

**Current solution:** `run.ps1` defaults to Tauri dev, `run.bat` uses `pwsh` when present and `powershell` otherwise, and Tauri commands route through local npm scripts.

**Effectiveness:** `94/100`, durable for local Windows launch. It still depends on repo dependencies being installed.

**Relevance check:** Current. Launcher behavior is the first user-visible health check.

**Next prevention step:** After changing run scripts or package scripts, run both default launchers, not only `-Task verify`.

### Q: What pitfall are we preventing?

**What:** Vite dev-server HMR websocket failures can masquerade as Playwright app regressions.

**Why it happened:** After the Vite 8 upgrade, the dev server could emit `ws error: RangeError: Max payload size exceeded` during parallel WebGL/file-flow tests. Affected pages reloaded to initial state, so assertions failed even though the built app behavior was valid.

**Where:** `source/frontend/playwright.config.ts`, `source/frontend/tests/README.md`, `run.ps1 -Task test:e2e`.

**How to catch it:** Run the full e2e suite after dependency or server changes. Look for websocket max-payload errors, status text resetting to the initial viewport-ready state, and failures clustered after file-load flows.

**Solutions tried:**
1. `45/100` Cap Playwright workers while still using `vite dev`, result: failures persisted.
2. `50/100` Disable Vite HMR while still using `vite dev`, result: failures persisted.
3. `93/100` Build first and serve tests with `vite preview`, result: full e2e passed and later generated skinned GLB coverage removed the old FBX/skinned fixture skip.

**Current solution:** Playwright webServer runs `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`, does not reuse an existing server, and caps local workers at 4.

**Effectiveness:** `93/100`, durable for current e2e coverage. It adds a build step to e2e runtime but removes dev-server HMR noise from product-flow tests.

**Relevance check:** Current. Any future Vite/Playwright server change should retest the full suite.

**Next prevention step:** Keep e2e on production preview unless a replacement passes the full suite and does not reintroduce websocket/page-reset symptoms.

### Q: What pitfall are we preventing?

**What:** Node/DOM polyfills for canvas 2d (used by SMF texture decode in import + extracted canvas-sprite label makers) can be partial or mutually clobbering after modularity extracts, causing silent test failures or typecheck breaks only on full gate runs.

**Why it happened:** makeBoneLabel (and future 2d viz) + importSMF both execute document.createElement('canvas').getContext('2d') + assign/use fill*/scale/textBaseline/createImageData; tests mutated global document in install + per-it overrides without full coverage of props/methods or restore, and no types on mock fns.

**Where:** `source/frontend/src/loaders/coord.test.ts` (polyfills + label its), `source/frontend/src/utils/boneLabels.ts` (and any future 2d canvas code), coord.test imports of the makers + SMF sample load it.

**How to catch it:** Run `npm --workspace frontend run typecheck:test` + `npm --workspace frontend run test:unit` (or targeted name pattern for labels/hierarchy) + full `pwsh -File run.ps1 -Task verify` after any canvas-using util extract or change; inspect for "createImageData is not a function" or TS7006 implicit in mocks.

**Solutions tried:**
1. `60/100` Minimal imageData-only global + ad-hoc override per label it (no restore, incomplete styles/scale/textBaseline), result: later tests (SMF texture) or type gates broke after bone labels extract.
2. `95/100` Single rich shared install mock (imageData + fillRect/fillText/scale + textBaseline + writable styles + explicit param types); capture its patch temporarily + restore in finally; base always capable, verified slice + type, result: gates green and resilient to order.

**Current solution:** installImageTestPolyfill now always emits capable 2d ctx stub; label capture its use non-destructive override + restore; any new 2d canvas helper must add to this shared mock and run the unit/type slice.

**Effectiveness:** `95/100`, durable for test-only canvas paths. Prevents latent breakage when 2d features (labels, future overlays) are extracted or polished.

**Relevance check:** Current. Modularity extracts + canvas for labels/glyphs + SMF tex will recur for viz work or quad.

**Next prevention step:** When adding canvas 2d code (or new utils/ tests touching document.createElement canvas), extend the shared polyfill first, add explicit types to mock fns, and include a "labels-or-2d" + "real-smf-sample" test slice in PR verification. Document the polyfill contract in the test file header.

### Q: What pitfall are we preventing?

**What:** Verification scripts can pass while an expected production chunk split is missing.

**Why it happened:** `check-entry-chunks.mjs` printed a warning and exited 0 when `three-vendor` was absent, and also skipped with a success exit when `dist` could not be read.

**Where:** `source/frontend/scripts/check-entry-chunks.mjs`, `run.ps1 -Task verify`, `source/package.json` verify script.

**How to catch it:** Temporarily remove or rename the built `dist/index.html` or the Vite manual chunk config, then run `node scripts/check-entry-chunks.mjs` and verify the process exits nonzero.

**Solutions tried:**
1. `58/100` Warn but continue, result: humans could miss the warning and automated gates stayed green.
2. `92/100` Emit errors and `process.exit(1)` on missing split or missing dist, result: `verify` now fails closed.

**Current solution:** The chunk check exits 1 when the production build artifact cannot be inspected or the expected `three-vendor` split is absent.

**Effectiveness:** `92/100`, durable for this check. It intentionally treats a missing build as a verification failure.

**Relevance check:** Current. Three.js bundle splitting is a performance and startup integrity concern.

**Next prevention step:** Keep guard scripts fail-closed unless a skipped state is explicitly part of the command contract.

### Q: What pitfall are we preventing?

**What:** Stale file-open or browser file/drop read results can overwrite newer load state.

**Why it happened:** `handleOpen` awaited the dialog result without its own sequence guard. Browser file-input/drop reads checked freshness only on success; an older read rejection could still set error/status after a newer read began.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`.

**How to catch it:** Mock two overlapping `openFile()` or browser read promises in a focused hook/component test or native IPC flow, resolve/reject the older one last, and assert it does not mutate status or load the old file.

**Solutions tried:**
1. `70/100` Rely on `loadSeqRef` inside `loadModel`, result: stale loads were guarded but stale dialog status/error paths were not.
2. `88/100` Add `openSeqRef` around `openFile()` success and error handling, result: stale dialog results return before mutating state.
3. `90/100` Add read-sequence checks to browser file-input/drop catch paths, result: stale read failures return before mutating error/status.

**Current solution:** `handleOpen` increments `openSeqRef`; browser file-input/drop reads increment `fileReadSeqRef`; success and catch paths check the captured sequence before setting status, error, or loading.

**Effectiveness:** `90/100`, durable for the current async boundaries. A future focused async race test would raise confidence further.

**Relevance check:** Current. Open dialogs and fallback file inputs are user-facing async boundaries.

**Next prevention step:** Add a focused overlapping-open/read test if open/load orchestration changes again.

### Q: What pitfall are we preventing?

**What:** Rogue Node.js / Vite dev servers (and intermediate tauri-cli parent processes) left listening on 5173 (or holding resources) after the cmd/pwsh launcher window is closed via its title-bar X button, or after the Tauri desktop app window is closed, or on hard Ctrl+C / parent kill. Subsequent launcher runs then hit "address in use" or leave stray node processes.

**Why it happened:** `tauri dev` (via beforeDevCommand in tauri.conf.json) spawns a long-lived child (`npm run dev` → Vite) that outlives the Tauri Rust process and the outer CLI in many Windows console-close scenarios; no process-group ownership, recursive tree kill, port/cmdline reaper on entry, or explicit child lifetime tie in the launcher (run.ps1 direct & npm or run.bat delegation). Tauri CLI child mgmt alone was insufficient for X-close of the visible pwsh or direct manual `tauri dev`.

**Where:** `source/src-tauri/tauri.conf.json` (beforeDevCommand), `source/frontend/scripts/start-vite-dev.mjs` (the managed wrapper), `run.ps1` (Stop-ProcessTree, Stop-DevServers sweeps, New-KillOnCloseJob, Start-Process + job assign + try/finally + trap + PowerShell.Exiting + Stop-StaleDevStack), `run.bat` (delegates), `source/frontend/package.json` + `source/package.json` (tauri:dev/dev scripts), runtime-data/*.log (prior sessions), `docs/dev/PITFALL_LEDGER.md` / `APP_STATE.md` / `TODO.md` / `summary_bank.json` (pre-fix references to launcher gaps).

**How to catch it:** Manual reproduction: `pwsh -File run.ps1` (or `run.bat`); load a model; X-close the cmd window or Tauri app; `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue` or `tasklist | findstr /i node`; confirm zero relevant node; re-launch and verify clean port + no "address in use". Automated: `pwsh -File run.ps1 -Task desktop-smoke` (or verify) + explicit post-run port sweep; extend native.spec or a harness test comment with simulated close + recheck. Watch runtime-data logs for prior "dev" lifecycle without clean exit.

**Solutions tried:**
1. `40/100` Rely on Tauri CLI's internal beforeDev child handling + OS console semantics, result: orphans survived cmd X-close and some tauri window closes; next launch often required manual taskkill.
2. `65/100` Add simple finally { Stop-Process ... } around & npm in run.ps1, result: helped Ctrl+C but not title-bar X (pwsh abrupt term) and not the full grandchild tree reliably.
3. `93/100` Multi-layer defense (Windows JobObject with KILL_ON_JOB_CLOSE assigned to owned Start-Process pwsh for the dev subtree + recursive Stop-ProcessTree via Win32_Process + three-sweep Stop-DevServers (exact 5173 node owners + cmdline 'vite|start-vite-dev|tauri') + Stop-Stale on every dev entry + trap + PowerShell.Exiting register + mjs wrapper for the tauri-close path (SIGTERM/'exit'/taskkill /T + parentPid poll + delay)), result: X-close, tauri-close, Ctrl+C, and re-launch all clean; redundant but low-cost and effective on primary Windows launcher path.

**Current solution:** The 3rd (layered) solution above. run.ps1 owns the long-running dev tasks via Start-Process + Job + finally/tree/stale; the mjs (now the beforeDevCommand) guarantees its direct Vite child is reaped on tauri CLI term (signals + poll + tree kill) and now has a unix fallback (`pkill`/`kill`) path when available. Entry sweep + port check makes re-launch robust. (See subsystem__dev_process_lifecycle and issue__rogue_node_servers in summary_bank.json for paths + notes.)

**Effectiveness:** `93/100`, durable. Verified by construction (checks: cargo/context/typecheck/verify all green post-change), manual X-close + re-launch scenarios (no rogue node, port free), and the prior orphan class being the exact motivator. Low runtime cost (scans only on dev entry or explicit close paths; poll is 1.8s win32-only in mjs).

**Relevance check:** Current. The canonical Windows launcher path plus direct-launch mjs fallback are the documented expectations; future cross-platform or direct-launch users are intentionally handled as reduced-coverage paths.

**Next prevention step:** Keep explicit reduced-coverage language for direct launches in run.ps1/help and `APP_STATE`/`docs/user`/README, and re-run manual close/re-launch checks when launcher scripts or wrapper logic changes.
