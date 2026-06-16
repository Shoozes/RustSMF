# RustSMF TODO

Last reviewed: 2026-06-15 (breakdown pass: expanded #1 Modern editor 1.2+ into concrete small subtasks 1.4-1.8 (quad toggle, larger glyphs, mode defaults, tabs, ortho prep) with incremental scope + done criteria; builds directly on 1.3 editorMode. No new code yet; pure planning per query. Gates unchanged. Prior: 1.3 editorMode + e2e + review updates). + prior items.

## Current Focus

Keep the app show-ready and scalable: launchers start the desktop app by default, verification fails loudly, e2e uses production preview, strict visual baselines are maintained intentionally, and docs describe current state instead of pass history.

## Current Integrity Findings

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

No P0/P1 integrity backlog is open after this pass (bone hierarchy + doc consolidation included in 2026-06-15 work).

1. Modern editor workspace design.
   What: Recreate the current software as a modern, flexible editor while preserving the old editor's strongest ergonomics: optional quad/ortho view, large clickable bone glyphs, numeric/name labels, endpoint handles, contextual mode tools, and clear skinning state.
   Why: The old GameMaker UI made rigging/skinning easier through split ortho panes and oversized bones, while the current React/Three app has a cleaner stack but weaker precision-edit affordances.
   Where: `source/frontend/src/components/ThreeViewport.tsx`, future viewport/workspace components, `source/frontend/src/components/Inspector.tsx`, `docs/references/old-src/screenshots/`.
   How: Design a workspace shell with `Model`, `Rig`, `Skin`, `Animate`, and `Export` modes; keep single perspective as default; add optional quad view for rig/skin precision; implement screen-space bone handles/labels before expanding authoring tools.
   Subtasks/progress:
   - 1.1 Name labels + small bone visual markers: COMPLETED (toggleable per-bone: small AxesHelper + floating canvas name sprite, cheap, attached to bones, off default, wired from Inspector via hook state; advances "labels" + "glyphs" for future quad/rig mode). See ThreeViewport labels effect + Inspector button.
   - 1.2.1 Extract highlight/selection marker creation to util (done: makeBoneHighlightMarker in boneHighlight.ts for modularity, consistent with labels extracts; tested; viewport effect cleaned).
   - 1.2.2 Polish bone labels for long names (truncate with ... for readability/perf; branch covered in unit test) + canvas quality (DPR scale, textBaseline for crisp labels). 1.2.3 Use extracted updateHighlightPosition in creation (remove duplicate world pos code).
   - 1.3 Basic editorMode state + wiring + minimal UI toggle (this pass): added 'view'|'rig'|'skin'|'animate'|'export' to UiState/useUiSlice, exposed via useLoadModel (with clear reset), wired to Toolbar (visible <select> control), Viewport+Inspector (props ready). Small complete foundation for mode-specific workspaces per old GM inspiration; no quad yet, no behavior change outside state. (Built 2026-06-15 auto pass.)
   - 1.4 Basic quad/single view toggle (smallest step for 1.2+): add editorMode-driven prop to ThreeViewport for optional 2x2 split layout (using CSS grid or multiple ThreeViewport instances with shared scene/camera sync). Default single. No ortho yet. Done when: toggle via mode or button switches layout without breaking existing orbit/labels/selection; typecheck + smoke e2e green.
   - 1.5 Larger bone glyphs/handles in rig/skin modes: scale up existing makeBoneLabel / makeBoneHighlightMarker / Axes (e.g. 2x-3x size when editorMode==='rig' or 'skin'), add simple endpoint spheres or hit areas for future dragging. Build on current small markers. Done when: visual size increases in rig mode (verifiable in e2e or manual), no perf regression, labels still readable.
   - 1.6 Mode-specific default behaviors (non-breaking): e.g. auto-enable boneLabels in 'rig'/'skin' (user can still toggle), different default transformMode or highlight size per mode. Wire via useLoadModel effect on editorMode. Done when: mode change auto-adjusts one behavior (e.g. labels on in rig), existing manual controls unaffected, tests pass.
   - 1.7 Workspace shell / mode tabs (UI layer): add simple mode tabs or segmented control (beyond current <select>) in Toolbar or new WorkspaceBar, that drive setEditorMode. Keep single default. Prep for future tools per mode. Done when: clickable tabs change mode (and thus any auto-behaviors), accessible, no layout shift.
   - 1.8 Optional ortho/quad precision views (deeper 1.2+): extend 1.4 with ortho cameras (top/front/side + perspective) in quad mode, synced navigation where sensible. Use Three.js OrthographicCamera + multiple viewports. Done when: quad mode shows 4 views, basic orbit works independently or linked, bone selection/hit works across views; gated behind editorMode.
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
   Why: Bone fix + stub added for UX; full coverage + graceful labels would make editor show-ready for complex/quad future; prevent regression on skip logic or name regex.
   Where: `source/frontend/src/loaders/coord.test.ts`, `source/frontend/src/components/Inspector.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, smfRig.
   How: Extend golden + add cases (self-parent guard already in walk); labels: cheap per-bone Group (small AxesHelper marker + canvas name Sprite attached to bone for follow, toggle via lifted hook state, off default, traverse dispose for maps). Update summary_bank + tests/README. (No CSS2D dep needed.)
   Done when: new asserts pass (added), labels wired cleanly (perf off default, Axes+name for visual), verify green, no stubs. (Completed via canvas sprites + Axes in group, edges tests, type/unit pass.)

9. Modularity watch.
   What: Extract helpers only at clear, test-backed boundaries.
   Why: Current largest files are manageable; blind splits would reduce clarity.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Re-run line-count ranking before any split, preserve public imports/status strings/test IDs, update barrels and `summary_bank.json`, and grep for duplicate helpers.
   2026-06-15 review (monolith skill heuristic): top ~smf.ts(>600), ThreeViewport(~530), useLoadModel; recent smfRig extract already helped; labels logic kept local (coupled to viewport bones); no split justified now (risk to safety/tests > benefit). Revisit on next feature adding responsibilities. Updated TODO only.
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
