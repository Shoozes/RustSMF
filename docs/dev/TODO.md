# RustSMF TODO

Last reviewed: 2026-08-13

This file contains executable forward work only. Current behavior belongs in `APP_STATE.md`; completed work and command evidence belong in `HISTORY.md` and `review.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

## P2 — Model workspace authoring

- What: Extend guarded model/submodel operations beyond reversible static-root preparation, visibility, rename, and same-parent ordering: duplicate, delete, append static model, object transforms, material assignment, winding, normals/tangents, and per-submodel diagnostics.
- Why: The current Model workspace has inspection, visibility, safe metadata editing, and one bounded structural action. Static-root preparation has all-mesh preflight and transform-safe binding; rename has binding/source/animation guards; reorder preserves exact parent child order without storing cyclic scene graphs. All three have focused coverage, and the registered static-root, rename, and reorder browser flows passed 66/66 as part of the approved full suite on 2026-08-13. Broader destructive geometry actions from the old editor still lack a safe modern contract.
- Where: `source/frontend/src/components/Outliner.tsx`, `source/frontend/src/App.tsx`, `source/frontend/src/utils/modelAuthoring.ts`, export diagnostics, and editor snapshots.
- When: After animation/skin scope contracts are stable.
- How: Extend the ID-only snapshot owner only for state it can restore, and use explicit structural transactions for duplicate/delete rather than storing cyclic scene graphs in generic snapshots; add compatibility guards for skinned append/retarget; never mutate source materials without restoration.
- Subtasks: duplicate/delete transactions; transform actions; skinned append/retarget compatibility; material and geometry diagnostics.
- Done when: each promoted operation is undoable, blocked compatibility cases explain why without mutation, and GLB/FBX/SMF diagnostics state exactly what survives export.
- Verification: pure model-authoring/history tests, export roundtrips, browser smoke, and full `verify`.

## P2 — Sidecar-aware GLTF and OBJ import

- What: Add an explicit multi-file/resource-resolution contract for `.gltf` buffers and images and, if OBJ material import is retained, neighboring `.mtl` and texture assets.
- Why: The picker and drop paths currently provide one file's bytes to a loader with an empty resource base. A self-contained `.gltf` works, but external URIs cannot resolve; OBJ geometry loads while `.mtl` sidecars are ignored. Accepting the extensions without stating this boundary can make a valid asset look corrupt or incomplete.
- Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/loaders/glb.ts`, `source/frontend/src/loaders/obj.ts`, a new bounded resource-bundle utility, native capability/I/O code if desktop directory access is chosen, and `source/frontend/tests/export-formats.spec.ts`.
- When: Before advertising general `.gltf` or material-complete OBJ compatibility.
- How: Define one normalized bundle of the selected primary asset plus user-authorized sidecars; canonicalize and percent-decode relative URIs, reject traversal/remote/data-size violations, generate and revoke object URLs in one owner, and keep browser directory selection and native dialog authority explicit. Prefer `.glb` guidance when a bundle is unavailable.
- Subtasks: URI parser and traversal guard; aggregate/per-file limits; browser multi-file/drop contract; native authorization contract; GLTF loading-manager resolver; optional MTL policy; cleanup and stale-load cancellation; missing-resource diagnostics.
- Done when: a committed external-buffer `.gltf` fixture and texture load in browser and native-mock flows, missing or ambiguous resources name the unresolved URI without replacing the mounted model, traversal and over-budget bundles fail before allocation, stale loads revoke every generated URL, and self-contained GLB/GLTF plus OBJ geometry behavior remains unchanged.
- Verification: pure URI/bundle tests, targeted lifecycle and export-format browser cases, native IPC mocks if native bundle access is added, `pwsh -NoProfile -File .\run.ps1 -Task verify`, and full browser e2e.

## P2 — Project save and recovery

- What: Add a versioned RustSMF project envelope separate from asset export, with atomic rotating autosave, recovery discovery, and explicit Save Project versus Export Asset actions.
- Why: Current authoring state is in-memory; a crash or replacement can lose pose, skin, animation, and workspace edits even when the source asset remains available.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, Tauri save/read adapters, a versioned project codec, recovery UI, and native/frontend tests.
- When: After the current authoring snapshots have stable serializable schemas.
- How: Serialize only validated state and source references, write to a temp path then atomically replace, retain bounded generations, and make recovery opt-in and clearly labeled.
- Done when: a saved project reloads the same model/rig/skin/animation state, interrupted writes leave the previous generation intact, corrupt projects fail closed, and asset export remains independent.
- Verification: codec property/roundtrip tests, native file-boundary tests, replacement/recovery browser flow, and `desktop-smoke`.

## P2 — Rig and keyed IK expansion

- What: Add standalone rig load/save/clear, primary-axis/lock/pin metadata, branch transforms, child-preserving edits, IK rest/current controls, and explicit solve-and-bake animation keys.
- Why: Current rig editing is strong for guarded in-scene pose work, but standalone rig interchange and keyed IK remain absent by design.
- Where: `source/frontend/src/utils/rigEdits.ts`, `rigIk.ts`, `animationAuthoringController.ts`, `RigPanel.tsx`, and format adapters.
- When: Only after project-state and scoped-history contracts exist.
- How: Keep IK solve pure; capture drag-start state; bake only on an explicit command; preserve child/world transforms and format-specific policy diagnostics.
- Done when: cancel restores the full chain, bake creates one undoable animation transaction, locked bones remain unchanged, and supported exports roundtrip the resulting rig/keys.
- Verification: rig/IK/controller/history unit tests, GLB/SMF export tests, and targeted browser interaction coverage.

## P3 — Geometry, UV, and shader diagnostics

- What: Add read-only normals/tangents/handedness, UV/material/submodel identifiers, rest-pose ghost/trails/onion and shader capability diagnostics using the retained old shader sources only as references.
- Why: These diagnostics improve parity and debugging without importing the old editor’s unsafe display mutation or destructive merge/atlas behavior.
- Where: `source/frontend/src/components/ExportPanel.tsx`, viewport display utilities, loader diagnostics, and focused tests.
- When: After model workspace boundaries are explicit.
- How: Keep every surface read-only first; route capability results through existing diagnostic codes; test display cleanup across async export and root replacement.
- Done when: each diagnostic reports a finite, named result; unsupported features are explained rather than silently approximated; and toggling overlays never changes export payloads.
- Verification: diagnostics/unit tests, export-preservation tests, visual/browser smoke, and full `verify`.

## P3 — Evidence-led integration-owner decomposition

- What: Continue reducing `useLoadModel.ts`, `ThreeViewport.tsx`, and `App.tsx` only at stable policy, timing, or lifecycle seams; remove dead internal barrels when repository-wide import analysis proves they have no consumers.
- Why: These files legitimately compose cross-cutting state, but their size increases review cost and makes duplicated status wording, gesture cleanup, and async ownership easier to miss. Blind file splitting would only spread coupled state and make disposal harder.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/App.tsx`, existing `animationAuthoringController.ts`, `viewportDisplayController.ts`, `viewportInteractionRuntime.ts`, and new focused pure/controller modules only where evidence supports them.
- When: During the next behavior change that touches a repeated block or independently testable seam; do not run as a line-count-only rewrite.
- How: Identify one repeated policy or lifecycle with a single owner, define typed inputs/outputs and cancellation/disposal semantics, move it with focused tests, then re-run the static relative-import graph to prevent cycles or orphaned exports. Keep React state composition in hooks/App and renderer ownership in the viewport.
- Subtasks: record candidate seams during reviews; rank by defect/repetition evidence; extract one seam per slice; delete superseded helpers/barrels; update the architecture table and summary-bank route only for structural changes.
- Done when: each extraction removes real duplicated policy from its integration owner, has a focused testable contract, introduces no circular or unresolved imports, retains one async/disposal owner, and leaves browser behavior and export bytes unchanged.
- Verification: focused unit tests for the extracted contract, lint/app/test typechecks, production build/chunk checks, affected browser suites, static relative-import resolution, and full `verify`.

New work remains here only when it has What/Why/Where/When/How, a measurable “Done when” condition, and a verification command.
