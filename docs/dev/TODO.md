# RustSMF TODO

Last reviewed: 2026-08-03

This file contains executable forward work only. Current behavior belongs in `APP_STATE.md`; completed work and command evidence belong in `HISTORY.md` and `review.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

## Current status

The current review slice is implemented: New Animation works from Rest or Current pose, including zero source clips; Skin pts follows posed vertices; Set paint separates target weight from flow/falloff; Bone/Branch/Full Rig key operations have a guarded scope/fingerprint contract; and bounded animation duration set/extension plus retime are undoable and export-aware. The remaining items below are product-scope work identified by the old-editor comparison, not claims about missing integrity fixes in the shipped paths.

## P1 — Animation trim and lock policy

- What: Complete scoped animation authoring with explicit trim behavior, locked-bone policy, and export/browser proof for the existing Bone/Branch/Full Rig operations.
- Why: Bounded duration set/extension and retime are now explicit, but trimming and lock policy are still absent; edits must not silently drop untouched or locked tracks.
- Where: `source/frontend/src/components/AnimatePanel.tsx`, `Timeline.tsx`, `animationAuthoringController.ts`, `animationEdits.ts`, `animationScope.ts`, `editorSnapshots.ts`, and GLB/SMF export tests.
- When: Next animation-authoring slice.
- How: Add a pure trim transform with finite bounds and an explicit key-retention policy, make locked bones a validated immutable set, and route every action through one workspace snapshot. Keep the shipped duration set/extension and retime transforms, the existing skeleton fingerprint, and explicit target-scope rejection for clipboard operations.
- Subtasks: trim math; retained-key policy; locked-bone state and UI; scope export roundtrip; targeted browser undo/redo matrix.
- Done when: retime and duration transforms preserve relative key times, trim removes only documented keys, locked bones are byte-for-byte unchanged, each scoped action still has one undo, clipboard mismatch remains fail-closed, and GLB/SMF exports preserve the resulting tracks/times.
- Verification: focused `animationEdits`/controller/history tests, `npm.cmd run typecheck`, `npm.cmd run test:unit`, targeted `animation.spec.ts` browser coverage, and export roundtrip assertions.

## P1 — Skin diagnostics and pose context

- What: Add a skin diagnostics view with an influence legend, selected-vertex exact slots/bone names/percentages, sum/unweighted/invalid-reference counts, and an explicit Rest/Bind versus Frozen Current paint-pose choice.
- Why: The current heat map and corrected brush semantics are safer, but they do not expose enough data to diagnose bad weights or distinguish rest-pose authoring from live animation.
- Where: `source/frontend/src/components/SkinPanel.tsx`, `ThreeViewport.tsx`, `skinWeights.ts`, new pure diagnostics utility/tests.
- When: Before bulk skin operations or animation-on-pose workflows.
- How: Read-only diagnostics must use the same validated skin attributes as paint/export; freeze a captured pose for brush sampling; warn before Live Animation; keep the legend independent of export materials.
- Subtasks: influence sampler; legend renderer; invalid-data report; Rest/Frozen/Live selector; selected/visible-submodel scope contract.
- Done when: every displayed vertex report lists four bounded slots and a finite sum, invalid data is surfaced with a stable code, frozen-pose painting is deterministic, and the selected mode is visible in UI telemetry.
- Verification: pure diagnostics tests, `skinWeights`/overlay tests, `npm.cmd run test:unit`, and targeted skin browser assertions.

## P2 — Model workspace authoring

- What: Build guarded model/submodel operations: rename, duplicate, reorder, delete, append static model, object transforms, material assignment, winding, normals/tangents, and per-submodel diagnostics.
- Why: The current Model workspace is primarily inspection/visibility; destructive geometry actions from the old editor are not represented by a safe modern contract.
- Where: `source/frontend/src/components/Outliner.tsx`, `App.tsx`, new model-authoring utility, export diagnostics, and editor snapshots.
- When: After animation/skin scope contracts are stable.
- How: Start with reversible non-destructive metadata and visibility operations; add compatibility guards for skinned append/retarget; use one root-owned snapshot per action and never mutate source materials without restoration.
- Done when: supported operations are undoable, blocked compatibility cases explain why without mutation, and GLB/FBX/SMF diagnostics state exactly what survives export.
- Verification: pure model-authoring/history tests, export roundtrips, browser smoke, and full `verify`.

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

New work remains here only when it has What/Why/Where/When/How, a measurable “Done when” condition, and a verification command.
