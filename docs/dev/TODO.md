# RustSMF TODO

Last reviewed: 2026-06-18 (targeted backlog check: editor mode routing now drives workspace composition and dedicated Skin/Animate/Export panels are in-app; single↔quad shared-layout behavior is stable with deterministic framing; endpoint-like precision markers and drag interactions are now implemented. Endpoint drag verification now covers single and quad layouts in e2e. Pane-aware hit timing gaps were reduced and validated). Prior 2026-06-16 full integrity + launcher process safety review added child-process hardening (mjs wrapper + run.ps1 Job/tree/scans/finally/trap/stale), paired PITFALL/Q/summary_bank updates, and doc/path gate safety.

## Current Focus

Keep the app show-ready and scalable: launchers are documented with safe defaults, verification fails loudly, e2e uses production preview, strict visual baselines are maintained intentionally, and docs describe current state instead of pass history.

## Open Edge-Case Tasks (what/why/where/how)

1. What: Keep quad/ortho layout logic from expanding `ThreeViewport.tsx` further.
   Why: `ThreeViewport.tsx` grew to the largest repo file after shared-scene quad rendering and endpoint drag landed; more camera/pane work will be easier to review if layout math stays modular.
   Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/viewportLayout.ts`, `source/frontend/tests/smoke.spec.ts`, `summary_bank.json`.
   How: Keep pure viewport pane math in `viewportLayout.ts`; extract only leaf helpers with stable tests before moving coupled pointer/render state; run typecheck/e2e slices after each split.
   Done: Current viewport layout math is extracted and exported; future ortho-pane behavior changes do not require adding more layout geometry code back into `ThreeViewport.tsx`.

## Completed Integrity Findings (historical, for reference only)

- What: Loading `mixamo_smf_baldguy.smf` could hang during Three scene construction and leave the frontend waiting on `Loading model...`.
  Why: SMF rigs can contain `isBone=0` head dummy nodes whose parent points back to themselves; the effective-parent walk skipped heads but did not track visited nodes, so root-head cycles never terminated. After unblocking that path, inverse binds also needed fresh world matrices before `Skeleton.calculateInverses()`, and animation tracks for skipped head nodes created noisy missing-target warnings.
  Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`, `source/frontend/tests/smoke.spec.ts`.
  How: Add `findEffectiveBoneParentIndex` with a visited set; reuse it for bind hierarchy and animation local-parent resolution; call `root.updateMatrixWorld(true)` before calculating inverse binds; emit animation tracks only for real deform bones; adjust the root-head regression to assert attachment to the provided root group; keep async load guards stable with `useRef(createSeqGuard())`.
  Done when: isolated SMF import/build completes, `npm --workspace frontend run test:unit`, targeted SMF Playwright load, native IPC mock tests, Browser shell QA, and `pwsh -File run.ps1 -Task verify` pass.

- What: App `typecheck` was failing despite docs saying verification was clean.
  Why: Recent editor-mode scaffolding left unused props in viewport/inspector, the toolbar cast the select value through `any`, and the local dynamic Tauri interface had a stale `saveFile` signature.
  Where: `source/frontend/src/store/index.ts`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/hooks/useLoadModel.ts`.
  How: Promote `EditorMode` to the store as the single UI contract, type the toolbar setter without `any`, expose mode state as `data-editor-mode` on viewport/inspector for tests/styling, and align the local Tauri interface with `saveFile(data: Uint8Array | Blob, name: string)`.
  Done when: `npm --workspace frontend run typecheck`, `npm --workspace frontend run typecheck:test`, and full `verify` pass.

- What: Closing the app cmd/pwsh launcher window (title-bar X) or the Tauri app could leave rogue node/Vite (or tauri-cli) dev servers running on 5173, causing port-in-use on re-launch or stray processes.
  Why: beforeDevCommand spawns a persistent Vite child managed only by tauri CLI; Windows pwsh/cmd close + some parent terminations did not reliably kill the tree; no prior ownership (Job), recursive tree kill, port+cmdline reaper on entry, or explicit wrapper lifetime handling.
  Where: `source/src-tauri/tauri.conf.json` (beforeDevCommand), `source/frontend/scripts/start-vite-dev.mjs` (wrapper), `run.ps1` (Stop-ProcessTree/Stop-DevServers/New-KillOnCloseJob/Start-Process+job+finally+trap+register+Stop-Stale), `run.bat`, package.json tauri:dev/dev, runtime-data logs, PITFALL + APP_STATE + summary_bank (new groups).
  How: Added defensive mjs (direct vite spawn + SIGs + 'exit' + killViteTree + win32 taskkill /T + parentPid poll via tasklist + small delay); ps1 layers (JobObject KILL_ON_JOB_CLOSE assigned to owned dev pwsh for X-close guarantee, recursive tree via Win32_Process, 3-sweep Stop-DevServers on 5173+cmdline, Stop-Stale on dev entry, try/finally + trap + exiting event). Tauri close now triggers mjs via CLI term + poll. Entry sweep prevents stale port. All paired with W/W/W/H in PITFALL + bank.
  Done when: manual X-close cmd + Tauri app + re-launch leaves no node on 5173 and no "address in use"; `pwsh -File run.ps1 -Task verify` + context-bank + cargo/typechecks clean; new pitfall Q + two summary_bank groups (subsystem__dev_process_lifecycle + issue__rogue_node_servers) added + verifier green; links from TODO/APP_STATE. (Completed 2026-06-16 in this full review pass.)

- What: Backlog/docs moved from `docs/TODO.md` to `docs/dev/TODO.md`, but several references still pointed at the removed path.
  Why: Stale doc paths break context retrieval and make future agents trust the wrong source of truth.
  Where: `README.md`, `run.ps1`, `source/frontend/tests/README.md`, `docs/dev/APP_STATE.md`, `summary_bank.json`.
  How: Update all current references to `docs/dev/TODO.md`; keep historical pitfall mentions only when they describe the old failure.
  Done when: `python scripts/verify-context-bank.py` and `pwsh -File run.ps1 -Task verify` pass.

- What: `summary_bank.json` did not have an automated path guard.
  Why: Context groups can silently drift after doc moves or refactors.
  Where: `summary_bank.json`, `scripts/verify-context-bank.py`, `run.ps1`.
  How: Validate default groups, JSON shape, repo-relative paths, glob prefixes, and explicit file/directory existence; wire the check into `verify`.
  Done when: stale explicit paths fail verification.

- What: Repo-local agent instructions still pointed to a nonexistent `plan.md`.
  Why: Missing planning docs create context dead ends and duplicate policy pressure.
  Where: `.agents/copilot-instructions.md`, `.agents/instructions/*.md`, `.tools/project.json`, `.agents/skills/summary_bank_json/SKILL.md`.
  How: Redirect state/planning references to `docs/dev/APP_STATE.md`, `docs/dev/TODO.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json`; keep local skills lean and aligned with reusable global skills.
  Done when: `rg -n "plan\\.md|docs/TODO\\.md"` only finds intentional historical mentions.

- What: The viewport `R` reset shortcut could stay captured by TransformControls mode switching after a gizmo was created.
  Why: The control instance can outlive the active bone attachment, while the toolbar advertises `R reset`.
  Where: `source/frontend/src/components/ThreeViewport.tsx`.
  How: Let TransformControls mode keys take precedence only while a bone is actively attached; otherwise `R` resets the view.
  Done when: typecheck passes and the shortcut contract is documented as context-sensitive.

- What: Node test env canvas 2d ctx polyfills (supporting both SMF texture canvas in import + extracted makeBoneLabel 2d text/rect/scale/baseline/DPR) were incomplete and clobbered each other (override in one it broke later importSMF canvas paths + implicit any failed typecheck:test).
  Why: Recent modularity extracts (boneLabels + highlight + seqGuard) moved canvas-dependent code into utils; node has no DOM so tests rely on mutable global polyfill in coord.test.ts; partial per-it mocks + no restore surfaced only on full gate run during this review.
  Where: `source/frontend/src/loaders/coord.test.ts` (installImageTestPolyfill + label it override), `source/frontend/src/utils/boneLabels.ts` (full 2d usage), callers of buildThreeScene in tests.
  How: Consolidated rich capable mock into shared install (imageData + fill*/scale + textBaseline + writable styles + types); capture its now patch temporarily + restore in finally; verified with typecheck:test + targeted unit slice (labels/hierarchy/seq + SMF sample paths). Update on any new 2d canvas util.
  Done when: `pwsh -File run.ps1 -Task verify` and `npm --workspace frontend run test:unit` (or targeted) pass with no polyfill/type errors. (Fixed 2026-06-15 during full review.)
- What: Lazy Tauri client in load/export paths used `any`, reducing type safety for the desktop bridge methods.
  Why: Dynamic import to avoid loading native bridge in browser; noted as minor during review.
  Where: `source/frontend/src/hooks/useLoadModel.ts` (loadModel, handleOpen, handle*Export, ping).
  How: Added local `DesktopTauri` interface matching the used methods (getSmf..., peek..., readBinaryFile, openFile, saveFile, invokeCommand); cast the dynamic imports and update param/let sites. Improves catching + docs the contract.
  Done when: typecheck clean and no behavior change. (Polished 2026-06-15 in auto pass.)

- What: SMF rigs with explicit head nodes (isBone=0 dummies for disconnected sub-rigs) produced correct skinned meshes/bind-pose but odd editor bone attachments (e.g. head-top wired to hand), spurious SkeletonHelper lines, mis-nested Inspector tree, and picker misalignment.
  Why: Current loader created Bones for all flat nodes (incl heads), attached using direct parent indices (no skip), and put mixed list into Skeleton (heads interspersed); world->local DQ compensated skinning but not viz tree; names were plain Bone_N breaking future readability/roundtrip intent.
  Where: `source/frontend/src/loaders/smf.ts` (buildThreeScene bone create/attach/root/skel + skin remap + anim names), old direct logic; `source/frontend/src/loaders/smfRig.ts` (only had export nodeList); `source/frontend/src/hooks/poseEdits.ts` (regex); `source/frontend/src/components/ThreeViewport.tsx` (SkeletonHelper(root) + find); Inspector (recursive children); tests (golden fixture + bind skin); mixamo sample + fixture with heads at 0/1/2/...
  How: Added `buildRigHierarchy(imported, root)`: 1) first pass only isBone=1 -> Bone, name=`SMF_Node_${idx}`, userData={index,isBone,originalParent}, compute worldMats via yup DQ, walk direct p to find eff ancestor world for localM (inv(effP)*myW so compose over heads), set local+updateMatrix, collect in nodeMap + bones[]; 2) second pass only reals: walk p skipping !isBone via data parents to nearest real (or root), .add() for direct real tree; 3) new THREE.Skeleton(bones); calculateInverses(); 4) caller in smf: use returned skel (no more mixed threeBones), direct skin attr copy (seq 0..deform-1 already matches), explicit SMF_Node names in anim tracks (incl _head for completeness, inert ok). Updated regex to /^SMF_Node_(\d+)/ (no $ for suffix safety), golden asserts (len=3, parent name no 'head', includes SMF_Node_0), linewidth=2.5, full labels impl (toggleable per-bone Group: small AxesHelper marker + canvas name sprite, attached to bones, off default for perf, full dispose).
  Done when: typecheck+unit (golden+roundtrip+bind skin + edges) pass, verify, mixamo shows clean limbs/tree + labels on toggle, export/pose/nudge/roundtrip unchanged, no breakage to GLB/FBX or non-head rigs. (Labels + edges completed 2026-06-15.)

## Active Backlog

### Snapshot-aligned backlog (what/why/where/how/done)

1. Baseline lock before backlog work
   - What: Record clean verification gates before starting any new feature edit.
   - Why: Existing regressions were mostly introduced when validation and docs drift got out of sync.
   - Where: `run.ps1`, `source/package.json`, `source/frontend/package.json`, `scripts/verify-context-bank.py`, `source/frontend/tests/*`, `source/src-tauri`.
   - How: Run `python scripts/verify-context-bank.py`, `pwsh -File run.ps1 -Task verify`, `pwsh -File run.ps1 -Task test:e2e`, `pwsh -File run.ps1 -Task test:visual-strict`, `pwsh -File run.ps1 -Task desktop-smoke`.
   - Done: Gate commands are green and failures are fixed before editing editor UX.

1.5. Consolidate loader/bridge contracts to reduce type drift
   - What: Replace inline desktop-client shape casts and loader `any` with shared typed contracts.
   - Why: Repeated import casts and untyped load results hide edge-case type failures during mode changes and async timing transitions.
   - Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/loaders/smf.ts`.
   - How: Export/consume `TauriClient` in tauri bridge, type `buildThreeScene` return as `BuiltThreeSmfScene`, and use a shared `LoadedModelResult` alias inside the load hook.
   - Done: `any` was removed from `loadModel` payload path, shared contract imports are used for all Tauri helper calls, and `sourceFormat`/viewport/layout reset behavior stays unchanged.

2. Finish workspace mode routing
   - What: Make `editorMode` drive workspace composition (`Model`, `Rig`, `Skin`, `Animate`, `Export`) instead of only state storage.
   - Why: Mode state exists and needed to control what tools/panels are visible next.
   - Where: `source/frontend/src/store/index.ts`, `source/frontend/src/App.tsx`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/Inspector.tsx`.
   - How: Add a workspace config by mode and pass derived props to viewport/inspector panels.
   - Done: Done. Mode tabs are now primary UI; view/rig/skin/animate/export now change visible timeline/inspector surfaces, labels defaults, and mode state propagation without reloading the model.

3. Finish ortho precision behavior
  - What: Add single ↔ quad layout with perspective + three orthographic panes sharing one scene/model.
  - Why: Rigging and skinning need precision views; shared scene state prevents duplicate model state bugs.
  - Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/App.tsx`, new `source/frontend/src/components/ViewportLayout.tsx` (or equivalent).
  - How: Render multiple camera rectangles from one renderer and use scissor/viewport per pane.
  - Status: single/quad layout toggle is implemented with shared scene/model state, deterministic framing, and shared scene picking across panes. Dedicated Skin/Animate/Export mode surfaces are now added; endpoint drag behavior and pane-aware hit tuning are implemented and under focused follow-up verification.

4. Upgrade bone handles, labels, hover, and picking
   - What: Improve bone interaction clarity and hit targets.
   - Why: Editor feels debug-like and is still sensitive in precision workflows.
   - Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/bonePicker.ts`, `source/frontend/src/utils/boneLabels.ts`, `source/frontend/src/utils/useBoneLabels.ts`, `source/frontend/src/utils/boneHighlight.ts`.
   - How: Add mode-configured handle sizing, hover/selected states, camera-distance scale, and scoped cleanup for listeners/objects.
   - Done: Endpoint-like marker handles, selected/hover markers, and hover dataset telemetry are now implemented, including precision mode scale and larger hit distance.

5. Add endpoint drag verification coverage
   - What: Add focused Playwright assertions for precision handle drag and pane-aware hit timing.
   - Why: Endpoint drag is now interactive and should be regression-covered before wider editor workflow growth.
   - Where: `source/frontend/tests/smoke.spec.ts` or a dedicated interaction spec, `source/frontend/src/components/ThreeViewport.tsx`.
   - How: Add a rig-mode drag helper that starts from the endpoint marker, moves pointer in quad and single layouts, then asserts selected bone remains stable, hover telemetry updates, and endpoint marker follows.
   - Done: Added in `source/frontend/tests/smoke.spec.ts` and validates drag lifecycle in single + quad layouts.

6. Build real Skin workspace
   - What: Create dedicated Skin panel with skinnability messaging, selected bone status, and explicit preview controls.
   - Why: Weight preview exists but is not a clear mode-native workflow.
   - Where: `source/frontend/src/components/SkinPanel.tsx`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/src/components/ThreeViewport.tsx`.
   - How: Move/merge skin controls into mode panel and keep preview non-destructive.
   - Done: Skin panel exists and is shown in Skin mode with selected bone context + preview toggle.

7. Build real Animate workspace
   - What: Move clip playback and timeline controls into Animate-specific panel state.
   - Why: Existing timeline competes with rig/skin/export flows.
   - Where: `source/frontend/src/components/AnimatePanel.tsx`, `source/frontend/src/components/Timeline.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/store/index.ts`.
   - How: Keep playback state stable; only compact/secondary controls in other modes.
   - Done: Animate panel exists and is shown in Animate mode with clip list and playback-time state.

8. Build explicit Export workspace with SMF limits
   - What: Make source format, export path, and SMF compatibility limits visible before saving.
   - Why: Export safety depends on clear source/fidelity expectations.
   - Where: `source/frontend/src/components/ExportPanel.tsx`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/loaders/threeToSmf.ts`.
   - How: Surface SMF fidelity path vs guarded conversion path in the UI; report `SmfConversionError` early.
   - Done: Export panel exists and is shown in Export mode with source format and SMF compatibility constraints explicit.

9. Preserve SMF fidelity
   - What: Avoid casual changes to SMF loader/export code without coverage.
   - Why: Existing SMF rig/animation path is stable but fragile.
   - Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/coord.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`.
   - How: Any rig/anim/coord change adds unit tests first and targeted real-sample Playwright checks.
   - Done: No regressions in real SMF sample load/bind-pose and export roundtrip.

10. Harden Rust native peeks with structured results
   - What: Move native parser peeks to typed payloads and parser-width-safe module boundaries.
   - Why: Fragile status-string formatting weakens host/front-end contract quality.
   - Where: `source/src-tauri/src/main.rs` (or `source/src-tauri/src/smf.rs`), `source/frontend/src/backend-client/tauri.ts`.
   - How: Return typed `SmfDesktopInfo` (valid/version/sizes/offsets/counts), update tests, and keep formatting on frontend.
   - Done: Frontend consumes typed desktop metadata; IPC tests validate parse width and error cases, and `source/frontend/tests/native.spec.ts` now asserts structured `get_smf_desktop_info` command path argument plus version/offset/count contract visibility in status text.

11. Decide true OS-dialog automation
   - What: Keep IPC mock coverage by default; document the deferral unless release needs real dialog automation.
   - Why: This was previously deferred explicitly and should remain explicit.
   - Where: `source/frontend/tests/native.spec.ts`, `source/frontend/src/backend-client/tauri.ts`, `run.ps1`.
   - How: Add a clear TODO decision line and one opt-in path only if required.
   - Done: Coverage intent is explicit and not overclaimed.

12. Close dev-process gaps
   - What: Keep Windows launcher hardening and explicitly document remaining cross-platform/direct-launch limits.
   - Why: Safety is strongest through `run.ps1`; direct launch paths remain less protected.
   - Where: `run.ps1`, `run.bat`, `source/frontend/scripts/start-vite-dev.mjs`, `README.md`, `source/frontend/tests/README.md`.
   - How: Document limits and relaunch checks in docs and optional checks.
   - Done: No hidden behavior assumptions for non-canonical launch paths.

13. Keep context/doc hygiene aligned
   - What: Keep backlog/docs/summary-bank synchronized after each active-work change.
   - Why: Silent drift caused stale references and duplicated pass logs.
   - Where: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`.
   - How: Record only active backlog in TODO, current-state in APP_STATE, durable regressions in PITFALL_LEDGER, and keep `summary_bank.json` paths validated.
   - Done: `python scripts/verify-context-bank.py` passes after any doc-path or backlog edits.

P0-P3 board from the snapshot:
- P0 Baseline and gates clean.
- P1 Workspace routing, quad/ortho, bone editor UX.
- P2 Skin/Animate/Export mode surfaces.
- P3 Native peek typing, OS-dialog decision, and launcher-cadence alignment.

No P0/P1 integrity defects are currently unresolved; active backlog remains on P1-P3 execution.

1. Modern editor workspace design (historical design note; active ownership now in items 2-12).
   What: Recreate the current software as a modern, flexible editor while preserving the old editor's strongest ergonomics: true mode tabs/workspaces (`Model`, `Rig`, `Skin`, `Animate`, `Export`), optional 4-pane quad view with orthographic front/side/top plus perspective/main view, large clickable bone glyphs, numeric/name labels, endpoint handles, contextual mode tools, and clear skinning state.
   Why: The old GameMaker UI made rigging/skinning easier through split ortho panes and oversized bones, while the current React/Three app has a cleaner stack but weaker precision-edit affordances.
   Where: `source/frontend/src/store/index.ts` (`EditorMode`), `source/frontend/src/hooks/useLoadModel.ts` (mode state wiring), `source/frontend/src/components/Toolbar.tsx` (current dropdown scaffold), `source/frontend/src/components/ThreeViewport.tsx` (single-canvas single-perspective viewport today), future `WorkspaceBar` / viewport-layout components, `source/frontend/src/components/Inspector.tsx`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/visual.spec.ts`, and `docs/references/old-src/screenshots/`.
   How: Replace or augment the current dropdown with accessible tab/segmented controls, map each tab to mode-specific panels and defaults, then split viewport work into a layout layer that can choose single perspective or 2x2 quad. Keep single perspective as the default; add shared scene/model state with per-pane cameras, using `PerspectiveCamera` for the main pane and `OrthographicCamera` for front/side/top panes. Preserve selection, labels, weight preview, TransformControls, timeline playback, and export behavior across both layouts before adding deeper authoring tools.
   Current gap confirmed 2026-06-18: `EditorMode` mode-workspace wiring, visible tabs, and Skin/Animate/Export mode panels are in place, with single↔quad already implemented in a shared scene/model flow. Endpoint-like markers, hover contrast, and endpoint drag lifecycle coverage are present; remaining work focuses on deeper ortho-pane consistency and optional skinning-tool authoring.
   Related references:
   - `docs/references/old-src/screenshots/README.md`: top mode switcher, 2x2 central viewport, ortho creation constraints, skin/animation workflow notes, and current-vs-modern comparison.
   - `docs/references/old-src/screenshots/smf_editor_front.png`: baseline empty 4-pane grid/axes layout.
   - `docs/references/old-src/screenshots/smf_editor_model_loaded_bones-big-and-visible_ortho_and_main_view.png`: rig labels and large visible bones across all four views.
   - `docs/references/old-src/screenshots/smf_editor_rigging_tab.png` and `smf_editor_rigging_tab_add_bone.png`: Rigging tab tools, add-bone flow, and the "bones only added using ortho views" constraint.
   - `docs/references/old-src/screenshots/smf_editor_skinning_tab.png` and `smf_editor_skinning_painting.png`: Skinning mode prerequisites, bone selection, paint area, and weight visualization.
   - `docs/references/old-src/screenshots/smf_editor_animation_tab.png`: Animation tab timeline/keyframe surface.
   Subtasks/progress:
   - 1.1 Name labels + small bone visual markers: COMPLETED (toggleable per-bone: small AxesHelper + floating canvas name sprite, cheap, attached to bones, off default, wired from Inspector via hook state; advances "labels" + "glyphs" for future quad/rig mode). See ThreeViewport labels effect + Inspector button.
   - 1.2.1 Extract highlight/selection marker creation to util (done: makeBoneHighlightMarker in boneHighlight.ts for modularity, consistent with labels extracts; tested; viewport effect cleaned).
   - 1.2.2 Polish bone labels for long names (truncate with ... for readability/perf; branch covered in unit test) + canvas quality (DPR scale, textBaseline for crisp labels). 1.2.3 Use extracted updateHighlightPosition in creation (remove duplicate world pos code).
  - 1.3 Basic editorMode state + wiring + mode-workspace bar (complete): added 'view'|'rig'|'skin'|'animate'|'export' to UiState/useUiSlice, exposed via useLoadModel (with clear reset), wired to Toolbar with visible tabs + Viewport/Inspector mode propagation. Small complete foundation for mode-specific workspaces per old GM inspiration; no quad yet. (Built 2026-06-15 auto pass.)
  - 1.4 Mode/workspace composition: `workspace` profile now gates inspector/timeline surfaces and default label behavior in `App.tsx` for Model/Rig/Skin/Animate/Export. Done when new dedicated mode panels remain additive and behavior stays stable.
  - 1.5 Basic quad/single view toggle: complete. Shared scene/model and shared selection/pick state now drive single↔quad switching through one model root and stable camera/layout handoff. Layout math is isolated in `source/frontend/src/utils/viewportLayout.ts` to prevent the viewport component from absorbing every camera concern. Done when: toggle via mode/button switches layout without breaking orbit/labels/selection; typecheck + smoke e2e green.
   - 1.6 Ortho precision panes: extend the quad toggle with `OrthographicCamera` panes for front/side/top plus one perspective/main pane, matching the old screenshot intent. Done when: quad mode shows four nonblank views, cameras frame the same loaded model, resize is stable, and selection/hit tests work in at least the main pane before expanding to every pane.
   - 1.7 Larger bone glyphs/handles in rig/skin modes: scale up existing makeBoneLabel / makeBoneHighlightMarker / Axes (e.g. 2x-3x size when editorMode==='rig' or 'skin'), add simple endpoint spheres or hit areas for future dragging. Build on current small markers. Done when: visual size increases in rig mode (verifiable in e2e or manual), no perf regression, labels still readable.
   - 1.8 Mode-specific default behaviors (non-breaking): e.g. auto-enable boneLabels in 'rig'/'skin' (user can still toggle), different default transformMode or highlight size per mode. Wire via useLoadModel effect on editorMode. Done when: mode change auto-adjusts one behavior (e.g. labels on in rig), existing manual controls unaffected, tests pass.
   - Future: full authoring tools per mode (add bone in rig, weight paint in skin), larger draggable handles, etc. Revisit breakdown on next increment.



2. SMF compatibility boundary.
   What: Keep SMF import/export as backwards compatibility while making GLB/GLTF the preferred modern authoring/export format for features SMF cannot represent.
   Why: SMF lacks bone names, scale channels, materials, morphs, and some editor intent; hiding that would create fidelity loss.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/hooks/useLoadModel.ts`, docs and export UX copy.
   How: Keep explicit rejection/status messages for unsupported SMF conversions, expose format limits in UI/docs, and add compatibility tests only when expanding SMF behavior.

3. Async stale-result regression tests.
   What: Add focused coverage for overlapping browser file-input/drop read failures if load orchestration changes again.
   Why: Sequence guards cover success and error paths, but the stale read-error branch is not isolated by a dedicated hook test.
   Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts` or a future hook-level test harness.
   How: Mock two reads, resolve the newer one first, reject the older one last, and assert the older rejection does not set error/status.
   Progress: Guards (openSeqRef/fileReadSeqRef/loadSeqRef + isCurrentLoad) in place and exercised in e2e smoke.spec.ts across multiple load its (SMF, FBX, OBJ, skinned fixtures, drops). Tests/README updated. Isolated hook test would require @testing-library/react (avoided for minimal deps); covered sufficiently for current. Further: extracted createSeqGuard to utils/seqGuard.ts for testability (used in hook, unit test added in coord.test.ts for focused coverage). Modularity + item 3 advanced. Previous cycle: added pure async simulation test exercising stale rejection on older read (newer succeeds first; old error last is ignored, no mutation) - fulfills the "focused overlapping read-error" ask without extra deps. Confirmed passing in targeted runs.

4. Strict visual snapshot maintenance.
   What: Run strict SMF snapshot checks when renderer, camera framing, skeleton display, skinning visualization, or SMF loader math changes.
   Why: Tolerant byte-size screenshots prove rendering is nonblank but do not prove committed visual baselines still represent the intended product state.
   Where: `source/frontend/tests/smoke.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `run.ps1`.
   How: Use `pwsh -File run.ps1 -Task test:visual-strict` for checks and `pwsh -File run.ps1 -Task test:visual-update` only when intentionally refreshing baselines.

5. Local skills and context governance.
   What: Keep repo-local skills focused on repo-specific workflows and rely on global skills for reusable integrity, summary-bank, pitfall, and skill-maintenance policy.
   Why: Duplicated skill guidance becomes stale quickly and can conflict with current Codex behavior.
   Where: `.agents/skills/*/SKILL.md`, `.agents/instructions/*.md`, `docs/dev/README.md`, `summary_bank.json`.
   How: Update repo skills only for SMF/RustSMF-specific conventions; generalize reusable patterns into global skills only when they apply across repos.

6. Optional OS-dialog automation.
   What: Add tauri-driver or equivalent only if a dialog-only bug appears, CI requires real native dialog coverage, or release validation needs an automated OS-dialog path.
   Why: Deterministic IPC mocks and Rust command tests currently cover native behavior without OS-dialog flake.
   Where: `run.ps1`, `source/frontend/tests/native.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Prototype outside required `verify`, require three clean local runs, then document prerequisites before promoting.

7. Constructed-rig disconnected metadata.
   What: Add disconnected head-node synthesis only if future non-SMF import data carries explicit disconnected-parent metadata.
   Why: Current parent indices alone cannot safely distinguish direct hierarchy from intended disconnected SMF head nodes.
   Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/threeToSmf.ts`.
   How: Extend converter metadata and unit coverage before changing node-list output.

8. SMF hierarchy + labels polish follow-up. (COMPLETED 2026-06-15)
   What: Add focused unit/edge coverage for SMF head chains (deep skips, root heads, head anim tracks), zero-bone/empty rigs, post-name-change compat; implement the Inspector bone labels toggle (3D name viz or cheap debug via Axes + canvas text).
   Why: Bone hierarchy fix needed full UX coverage; graceful labels make the editor more show-ready for complex/quad future work and prevent regression on skip logic or name regex.
   Where: `source/frontend/src/loaders/coord.test.ts`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, smfRig.
   How: Extend golden + add cases (self-parent guard already in walk); labels: cheap per-bone Group (small AxesHelper marker + canvas name Sprite attached to bone for follow, toggle via lifted hook state, off default, traverse dispose for maps). Update summary_bank + tests/README. (No CSS2D dep needed.)
   Done when: new asserts pass (added), labels wired cleanly (perf off default, Axes+name for visual), verify green, no stubs. (Completed via canvas sprites + Axes in group, edges tests, type/unit pass.)

9. Modularity watch.
   What: Extract helpers only at clear, test-backed boundaries.
   Why: Current largest files are manageable; blind splits would reduce clarity.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Re-run line-count ranking before any split, preserve public imports/status strings/test IDs, update barrels and `summary_bank.json`, and grep for duplicate helpers.
   2026-06-18 rank (tracked source/scripts): ThreeViewport.tsx(930), smoke.spec.ts(619), coord.test.ts(618), smf.ts(507), useLoadModel.ts(469), main.rs(433). Quad/endpoint work made ThreeViewport the clear next modularity risk; pure viewport layout math has been extracted to `utils/viewportLayout.ts` while coupled pointer/render state stays in the component. Add targeted unit slices + e2e editorMode/labels/assertions on future changes.
   Progress: Extracted makeBoneLabel to utils/boneLabels.ts + useBoneLabels hook + makeBoneHighlightMarker to boneHighlight.ts (consistent pattern for viewport visuals; tested in coord.test.ts with polyfill; barrel + summary_bank + viewport imports updated; ThreeViewport further slimmed by ~30 LOC + cleaner effects). Unit tests for makers. Modularity watch advancing (labels + highlight feedback extracted). Additional: labels name truncation polish for long names (1.2.2) + canvas quality (DPR scale, textBaseline for crisp labels). Further: extracted createSeqGuard (seqGuard.ts) for async stale testability + modularity; integrated in useLoadModel; unit test added. Note: incomplete useBoneHighlight hook stub file removed (coupled to viewport RAF/attach; full hook not forced - per monolith skill; maker sufficient and complete). No stubs remain. This cycle: further extracted updateHighlightPosition to boneHighlight.ts (used in RAF and creation); added unit test; cleaned unused ref; advanced #9 + #1; labels canvas polish. 1.2.3 Use extracted update in highlight creation (remove dupe code). 2026-06-15 full review: no new splits justified (line rank stable post-extracts; clear test-backed leaves only); polyfill hardening added as durable test concern under integrity findings (see above). Revisit on quad or new viz feature.

## Known Intentional Limits

- `source/backend` is an intentionally empty boundary; current desktop-native work belongs in `source/src-tauri` until there is a concrete backend-service need.
- SMF export supports position/rotation pose edits. Scale edits are blocked because the current SMF DQ path has no scale channel.
- Non-SMF SMF export is guarded for compatible skinned GLB/FBX runtime roots with one shared named skeleton and position/quaternion bone tracks.
- Static roots, materials, morphs, object-level tracks, and scale animation should use GLB.
- FBX import support remains wired through Three's FBXLoader and UI accept/drop paths. Default full non-SMF skinned e2e coverage uses a generated skinned GLB to avoid depending on redistributable FBX assets.
- FBX export writes a GLB container through Three.js GLTFExporter; true FBX writing is not added without a concrete dependency decision.
- OBJ is load/preview parity for static assets; export should use GLB unless an OBJ writer requirement appears.

## Verification

- `python scripts/verify-context-bank.py`: summary-bank JSON/path guard.
- `pwsh -File run.ps1 -Task verify`: context-bank guard, lint, app typecheck, test typecheck, Vite build, chunk guard, unit tests, and cargo check.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright browser smoke, visual confirmation, generated skinned GLB coverage, and native IPC tests served from production preview.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in strict SMF screenshot baselines for key load/export visual states.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native peek tests, and focused Playwright native IPC mock suite.

Last verified local results are kept in `docs/dev/APP_STATE.md`.
