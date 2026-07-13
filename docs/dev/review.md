# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused implementation and integrity review for SMF Rig edit policy, bind reset, head-node/world-pose export, skin-index roundtrip fidelity, and the existing IK/TransformControls ownership contract.

## Current Findings

- SMF Rig policy is now exact and visible. Rename cannot persist because SMF has no name field; detach/connect would rewrite `isBone`, node, skin, and animation identity; mirror has no owned legacy command or left/right metadata. Those controls remain absent or disabled with format-specific reasons.
- Bind reset is the one enabled SMF metadata/pose-parity action. It restores the selected deform bone's actual local bind transform from inverse binds, records one pose-history transaction, and supports undo/redo; it does not zero child locals.
- SMF pose export now serializes edited children from rig-space `matrixWorld`, which preserves effective-parent semantics across skipped head nodes.
- The review fixture exposed and fixed a skin contract mismatch: export had converted deform-order skin indices into full node IDs. Export now writes deform-order indices unchanged, and diagnostics fail on skin-index or out-of-tolerance weight drift.
- Real-SMF unit and browser evidence covers policy gating, bind reset, dirty state, undo/redo, node/head/skin/animation identity, and export/reimport. The completed SMF-aware Rig parity task has moved out of the active backlog.

## Next Tasks

### Global shelf and material policy

- What: Finish or retire global snap, texture repeat/filter, merge-same-textures, and include-textures actions.
- Why: These actions can blur preview-only sampler state with export-affecting material conversion.
- Where: `Toolbar.tsx`, `Outliner.tsx`, `textureCompat.ts`, `threeToSmf.ts`, Export preflight UI, and old `common_add_buttons`/`combine_textures` references.
- When: Next old-editor parity slice.
- How: Keep preview state non-destructive, require validated undo for conversion, and make per-format texture inclusion explicit.
- Done when: Every mapped shelf action ships with clear preview/export semantics and browser proof or is deliberately absent with a format/ownership reason.

### Workspace transition and async continuity

- What: Close remaining no-model and dirty-state transition/race cases across workspace, layout, load, and export entrypoints.
- Why: Shared authoring state is now broad enough that a stale async completion or mode transition could hide or overwrite a valid edit.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, panel components, `source/frontend/tests/smoke.spec.ts`, and `source/frontend/tests/native.spec.ts`.
- When: Before workerizing SMF import/export or adding another authoring surface.
- How: Add a compact transition matrix and deterministic delayed-entrypoint tests; preserve existing sequence and single-flight guards.
- Done when: Tests prove no reload, stale status/error, selection loss, scrub reset, or dirty-edit overwrite across the supported transition and overlap matrix.

## Verification

- Focused SMF/Rig units pass 68/68, including real-fixture pose export/reimport identity and diagnostic skin-drift failure coverage.
- App and test typechecks pass.
- Focused browser policy/reset/undo/roundtrip flow passes 1/1.
- Full `pwsh -File run.ps1 -Task verify` passed with 179/179 units, context validation, lint, app/test typechecks, production-any guard, build/chunk checks, and Rust cargo check.
- Browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passed 43/43, including the new real-SMF policy/reset/roundtrip flow.
