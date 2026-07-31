# RustSMF TODO

Last reviewed: 2026-07-30

This file contains executable forward work only. Current behavior belongs in `APP_STATE.md`, latest pass evidence in `review.md`, recurring hazards in `PITFALL_LEDGER.md`, and test ownership in `source/frontend/tests/README.md`.

## Priority Order

### P1 — Extract bounded controllers from the two integration owners

**What:** Reduce unrelated context in `useLoadModel.ts` and `ThreeViewport.tsx` through two independent, tested leaf-controller extractions.

**Why:** Both files exceed 3,000 lines and coordinate several domains. Recent safe helper extraction proves leaf seams are viable, but moving shared React or Three lifecycle state without an explicit contract would create stale-closure, circular-import, or double-disposal risk.

**Where:**

- `source/frontend/src/hooks/useLoadModel.ts`
- `source/frontend/src/components/ThreeViewport.tsx`
- new focused modules beside their owning hook/component
- nearest unit and browser suites
- `summary_bank.json`

**When:** Before adding the next substantial animation-authoring feature or viewport Display/material feature. Do not perform both extractions in one unreviewed change.

**How and subtasks:**

1. Animation controller:
   - Define an explicit input/output contract for clip CRUD, metadata, selected-key editing, snap, and animation history.
   - Extract those callbacks/state transitions into a focused hook without moving load/export sequence ownership.
   - Keep the public `useLoadModel` return shape stable while callers migrate internally.
   - Run animation units, `animation.spec.ts`, typechecks, build, and the full verification gate.
2. Viewport display controller:
   - Define explicit ownership for texture toggle, opacity, legacy lighting, preview-material registration, and cleanup.
   - Extract display mutation from the renderer component while keeping renderer/root/requestAnimationFrame ownership in `ThreeViewport`.
   - Prove async source-material restoration and root-replacement disposal with focused units plus `export-formats.spec.ts`.
3. Recount context sizes and update the owning summary-bank groups after each extraction.

**Done when:** Each new module has one responsibility and focused tests; no circular import or pass-through barrel is introduced; `useLoadModel` no longer owns animation-authoring implementation details; `ThreeViewport` no longer owns material-preview implementation details; public component/hook contracts and test IDs remain stable; all focused and full gates pass.

**Verification:** `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, focused Node tests, the owning Playwright spec, `pwsh -NoProfile -File .\run.ps1 -Task context`, and `pwsh -NoProfile -File .\run.ps1 -Task verify`.

### P2 — Add camera-aware direct manipulation in fixed panes

**What:** Allow direct translate/rotate authoring from Top, Front, and Side panes without reusing a gizmo bound to the wrong camera.

**Why:** Quad and single-ortho views now share focus and support explicit Rig tools, but freeform TransformControls intentionally detach outside single perspective. Original-editor familiarity remains incomplete for users who expect direct fixed-plane manipulation.

**Where:**

- `source/frontend/src/components/ThreeViewport.tsx`
- `source/frontend/src/utils/viewportTransformControls.ts`
- `source/frontend/src/utils/viewportInteractionRouter.ts`
- `source/frontend/src/utils/viewportLayout.ts`
- Rig/Animate browser suites and viewport interaction helpers

**When:** Before claiming full old-editor direct-manipulation parity or enabling the freeform gizmo in quad/ortho.

**How and subtasks:**

1. Decide whether one camera-rebound TransformControls instance or pane-owned explicit handles has the safer lifecycle.
2. Route pointer ownership by pane and authoring mode; never let orbit, Skin paint, Endpoint, IK, and direct transform compete.
3. Map Top/Front/Side translate and rotate axes into one undoable world/local transaction.
4. Preserve the shared focus target, fixed camera directions/zoom, and SMF scale restriction.
5. Add single/quad/ortho browser coverage for complete, cancel, undo, redo, and workspace switching.

**Done when:** A selected bone can be translated and rotated from each fixed pane; the active pane camera owns hit testing and handle projection; cancellation restores the pre-drag pose; completion creates one correct history entry; no gesture conflicts or cross-pane jumps occur; SMF export preserves supported edits; focused and full browser gates pass.

**Verification:** Viewport interaction/layout units, Rig and Animate Playwright slices, workspace continuity coverage, `test:visual-strict`, and the full verification gate.

### P2 — Add an independent skinned FBX compatibility fixture

**What:** Add one redistributable third-party or independently authored skinned FBX fixture with a texture and animation, plus import/export/reimport assertions.

**Why:** Current basic FBX support is strongly guarded but relies on a self-authored static parser fixture and generated GLB-to-FBX output. That proves internal consistency, not broad external FBX dialect compatibility.

**Where:**

- `source/frontend/tests/fixtures/`
- `source/frontend/src/loaders/fbx.test.ts`
- `source/frontend/tests/export-formats.spec.ts`
- fixture provenance/license documentation

**When:** Before broadening user-facing FBX claims beyond “basic” or diagnosing a real third-party skinned FBX failure.

**How and subtasks:**

1. Select or author a small fixture with explicit redistribution permission and record provenance.
2. Pin expected mesh, material/texture, skeleton, clip, and endpoint counts.
3. Test app import, binary export validation, app reimport, and at least one external target application.
4. Keep the asset out of default context packs; route only its test/provenance contract.

**Done when:** The committed fixture loads without console warnings/errors, representative skin/texture/animation structure survives export and app reimport, the target application opens the output, licensing is documented, and the user docs describe only the compatibility actually proved.

**Verification:** Focused FBX units, `export-formats.spec.ts`, manual target-application evidence, build, and the full verification gate.
