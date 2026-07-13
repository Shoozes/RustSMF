# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused implementation and integrity review for viewport/material policy, source-safe export boundaries, and the remaining workspace/async continuity backlog.

## Current Findings

- SMF Rig policy is now exact and visible. Rename cannot persist because SMF has no name field; detach/connect would rewrite `isBone`, node, skin, and animation identity; mirror has no owned legacy command or left/right metadata. Those controls remain absent or disabled with format-specific reasons.
- Bind reset is the one enabled SMF metadata/pose-parity action. It restores the selected deform bone's actual local bind transform from inverse binds, records one pose-history transaction, and supports undo/redo; it does not zero child locals.
- SMF pose export now serializes edited children from rig-space `matrixWorld`, which preserves effective-parent semantics across skipped head nodes.
- The review fixture exposed and fixed a skin contract mismatch: export had converted deform-order skin indices into full node IDs. Export now writes deform-order indices unchanged, and diagnostics fail on skin-index or out-of-tolerance weight drift.
- Real-SMF unit and browser evidence covers policy gating, bind reset, dirty state, undo/redo, node/head/skin/animation identity, and export/reimport. The completed SMF-aware Rig parity task has moved out of the active backlog.
- The old global material shelf is resolved. Rig and Animate retain scoped snap because they use different units; repeat/wrap and filter are labeled viewport previews; merge-same-textures is a non-mutating shared-texture preflight; and texture inclusion is stated per Export/GLB/SMF action.
- GLB and FBX exporters now enter a source-material boundary for the full asynchronous export. Tex, Mesh fade, Legacy material, sampler overrides, and Skin weight colors cannot leak into saved assets, and the preview is restored after completion.

## Next Tasks

### Workspace transition and async continuity

- What: Close remaining no-model and dirty-state transition/race cases across workspace, layout, load, and export entrypoints.
- Why: Shared authoring state is now broad enough that a stale async completion or mode transition could hide or overwrite a valid edit.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, panel components, `source/frontend/tests/smoke.spec.ts`, and `source/frontend/tests/native.spec.ts`.
- When: Before workerizing SMF import/export or adding another authoring surface.
- How: Add a compact transition matrix and deterministic delayed-entrypoint tests; preserve existing sequence and single-flight guards.
- Done when: Tests prove no reload, stale status/error, selection loss, scrub reset, or dirty-edit overwrite across the supported transition and overlap matrix.

## Verification

- Focused material policy/isolation/texture units pass 12/12, including async source restoration, root replacement, duplicate-use grouping, and static-plus-skinned model summaries.
- Focused browser evidence passes 2/2 for real-SMF format policy and textured-GLB export under active preview overrides.
- Full `pwsh -File run.ps1 -Task verify` passed with 187/187 units, zero-warning context validation, lint, app/test typechecks, production-any guard, build/chunk checks, and Rust cargo check.
- Browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passed 43/43, including downloaded GLB image/texture proof and preview restoration.
