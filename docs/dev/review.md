# RustSMF Review Snapshot

Last reviewed: 2026-07-02

## Scope

Repo/app integrity pass focused on current-state docs, summary-bank routing, incomplete logic markers, import/export surfaces, async/race risk notes, and active backlog shape after recent viewport interaction, Skin pts overlay, narrow quad Display-menu coverage, quad pane-role telemetry, quad rig-select mutation coverage, quad endpoint-drag pane coverage, quad Skin paint mutation coverage, quad Animate selection/key coverage, Rig Add child ortho placement, Rig Move ortho drag coverage, and Rig snap placement/move coverage.

## Current Findings

- Docs needing update: `docs/dev/APP_STATE.md` had stale wording that described Model workspace pointer ownership as a placeholder even though View-mode model/submodel picking is implemented. That wording is now corrected. `docs/dev/review.md` was stale and has been refreshed as the current concise review snapshot.
- Summary bank: `summary_bank.json` validates cleanly. Current feature, viewport, and quality groups route recent Skin pts no-pick behavior, narrow quad Display-menu overlap coverage, quad pane-role pointer telemetry, quad rig-select mutation coverage, quad endpoint-drag pane coverage, quad Skin paint mutation coverage, quad Animate selection/key coverage, Rig Add child ortho placement, Rig Move ortho drag coverage, and Rig snap placement/move coverage. No new file groups were required for this pass.
- Code scan: no production `TODO`, `FIXME`, `stub`, `todo!`, or `unimplemented!` implementation gaps were found under active source. Production import/export surfaces are covered by TypeScript/Rust gates; the only production `expect` remains Tauri app startup, while other `expect` hits are test assertions.
- Import/export status: FBX export is real binary FBX 7500 through the vendored writer, GLB/OBJ/SMF paths remain routed through current loader/export helpers, and context docs no longer imply FBX fallback behavior.
- Edge-case backlog: active TODOs already cover the main remaining risk classes: future rotate rig-tool policy, viewport click/raycast parity, TransformControls browser drag hardening, authoring mutator inventory, async race expansion, typed interop cleanup, SMF-aware rig policy, global shelf/outliner parity, and workerized SMF import/export.
- Redundancy: durable docs are split correctly: current state in `APP_STATE`, active work in `TODO`, recurring hazards in `PITFALL_LEDGER`, test coverage in `source/frontend/tests/README.md`, and routing in `summary_bank.json`. Avoid adding dated progress recaps outside this snapshot.

## Directions

- Next precision-editor slice:
  - What: extend the proven non-SMF Rig tool-mode foundation into mirror/reset helpers or the next SMF-safe rig metadata decision.
  - Why: Select/Add child/Move/Rotate/Detach/Connect/Spin are now browser-proven as undoable non-SMF rig operations; old-editor parity still has mirror/reset and SMF head-node-aware metadata policy gaps.
  - Where: `source/frontend/src/components/RigPanel.tsx`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/viewportLayout.ts`, `source/frontend/src/utils/viewportInteractionRouter.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/tests/smoke.spec.ts`, `docs/dev/old_editor_source_map.md`.
  - How: keep SMF-source structural edits blocked, keep the shared hierarchy display contract and deform-only edit controls gated to `skeleton.bones`, and add pure helper coverage before exposing any new mirror/reset/metadata UI.
  - Done when: unit and smoke coverage prove the next helper/UI cannot corrupt skeleton, skin-index, animation, or selected-bone state.
- Next interaction-contract slice:
  - What: add stable browser-level TransformControls handle-drag automation.
  - Why: owner telemetry and Animate key authoring are covered, but direct gizmo dragging remains a verification gap.
  - Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests/smoke.spec.ts`.
  - How: prefer stable test metadata around the Three TransformControls handle over brittle screen-coordinate guessing.
  - Done when: smoke proves a real gizmo drag mutates Rig pose state and Animate key state through the intended owner paths.
- Next docs/backlog hygiene slice:
  - What: keep removing completed-work narration from `TODO` after each implementation lands.
  - Why: `TODO` is still long and easiest to keep scalable when completed details live in app state, tests README, pitfalls, or summary-bank status.
  - Where: `docs/dev/TODO.md`, `docs/dev/APP_STATE.md`, `source/frontend/tests/README.md`, `summary_bank.json`.
  - How: after each feature slice, leave only active risk and Done-when criteria in TODO; route proof to the appropriate durable doc.
  - Done when: `TODO` contains only active work, no duplicate dated recaps, and `python scripts/verify-context-bank.py` passes.

## Verification

- `python scripts/verify-context-bank.py` passed.
- `python -m json.tool summary_bank.json > $null` passed.
- Focused production-source incomplete-marker scan found no actionable production stubs/TODOs.
- `npm run typecheck`, `npm run typecheck:test`, `npm run test:unit`, focused Playwright smoke for viewport layout/pane-role routing, and full `pwsh -File run.ps1 -Task verify` passed after the pane telemetry slice.
- Focused Playwright smoke for viewport layout also passed after adding actual quad rig-select picked-bone telemetry and mutation coverage.
- Focused Playwright smoke for endpoint drag passed after asserting the quad endpoint mutation is routed through the perspective pane.
- Focused Playwright smoke for Skin paint passed after moving the first mutation-proven Skin paint stroke into quad layout and returning to single layout for later auto-paint assertions.
- Focused Playwright smoke for animation keyframe authoring passed after selecting a bone through quad `animate-select` before key insertion.
- Related Playwright smoke for viewport layout, endpoint drag, Skin paint, and animation keyframe authoring passed together with default workers after the Skin paint helper was tightened to require a dirty-state transition.
- Full `pwsh -File run.ps1 -Task verify` passed after the latest smoke helper, rig world-position placement helper, test README, TODO, review, and summary-bank updates.
- Old ray-sphere/ray-plane behavior is now classified in `docs/dev/old_editor_source_map.md`; TODO and summary-bank routing were updated, then JSON/context validation passed.
- `npm run test:unit -- src/utils/rigEdits.test.ts` passed after adding requested world-position child placement coverage for future ortho add tools.
- Focused Playwright smoke for generated skinned GLB load/export passed after Rig Add child mode was made to own Top/Front/Side placement before ordinary bone selection.
- Related parallel Playwright smoke for generated-skinned Rig Add child, viewport layout, endpoint drag, Skin paint, and animation key authoring passed after viewport layout specs moved to a layout-effect update path.
- Focused Playwright smoke for generated skinned GLB load/export passed after Rig Move was added as a Top/Front/Side drag tool and endpoint drag fallback was gated to Select mode.
- Related parallel Playwright smoke for generated-skinned Rig Add child/Move, viewport layout, endpoint drag, Skin paint, and animation key authoring passed after the tool-mode gesture conflict was fixed.
- `npm run typecheck`, `npm run typecheck:test`, `npm run test:unit -- src/utils/rigEdits.test.ts`, focused generated-skinned Playwright smoke, and the related five-test smoke slice passed after adding Rig snap settings for Add child and Move.
- `npm run typecheck`, `npm run typecheck:test`, `npm run test:unit -- src/utils/rigEdits.test.ts`, `python scripts/verify-context-bank.py`, `git diff --check`, full `pwsh -File run.ps1 -Task verify`, and browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passed after aligning detach/connect docs and hardening rig history snapshots for hierarchy-only bones.
- `npm run typecheck`, `npm run typecheck:test`, and `npm run test:unit -- src/utils/rigEdits.test.ts` passed after adding pure `spinRig` helper coverage for old 90-degree X/Y/Z spin behavior.
