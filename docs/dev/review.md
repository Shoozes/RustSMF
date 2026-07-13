# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused implementation and integrity review for the player-head/IK question, recent SMF world-pose/head-node pitfalls, reversible Rig posing, pose history, and SMF/GLB export preservation.

## Current Findings

- IK is working as an explicit Rig pose tool. It is no longer accurate to call endpoint dragging or TransformControls IK.
- The solver owns a private cloned solve chain, ordered-chain validation, bounded CCD iterations, tolerance, unreachable clamping, reference-pose joint limits, world-axis pole guidance, stale-chain detection, and local-length invariants in `source/frontend/src/utils/rigIk.ts`; only final rotations reach live bones.
- A completed drag is one pose transaction; Escape and pointer cancel restore the complete chain. SMF structural edits remain blocked, while solved rotations are allowed as export-tracked pose edits for SMF and live rig state for GLB.
- The historical odd-head report predates SMF-to-GLB conversion and predates any IK solver. Diagnose it through selected ancestry, playback ownership, and serialized-world-pose/effective-parent conversion. The real SMF and old editor remain positive controls.
- The real-SMF browser flow passes IK drag, cancel, undo/redo, SMF export/reimport diagnostics, GLB post-export reparse validation, and saved visual review. The initial five-column tool row was cramped; the reviewed UI now wraps cleanly and uses a larger `IK TARGET` label.
- The completed IK backlog entry moved out of `docs/dev/TODO.md`. Current behavior lives in `APP_STATE.md`, regression reasoning in `PITFALL_LEDGER.md`, tests in `source/frontend/tests/README.md`, and focused routing in `summary_bank.json`.

## Next Tasks

### Direct TransformControls browser proof

- What: Add a stable real-handle drag test for Rig pose ownership and Animate key ownership.
- Why: Event ownership is typed and covered, but direct browser manipulation of the Three.js gizmo remains the main interaction proof gap.
- Where: `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests/smoke.spec.ts`.
- When: Next viewport interaction slice or before changing TransformControls lifecycle code.
- How: Expose minimal stable handle telemetry, drag a real axis, and assert the correct pose-versus-animation history domain.
- Done when: One browser test proves a Rig gizmo drag writes pose state and another proves an Animate gizmo drag writes a key without cross-domain dirty state.

### SMF-safe rig metadata decision

- What: Decide and implement or explicitly reject SMF rename/detach/head-node metadata behavior before adding mirror/reset helpers.
- Why: IK safely rotates existing indexed nodes, but structural or metadata mutation can still corrupt SMF node, skin, and animation identity.
- Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/components/RigPanel.tsx`, real fixtures, and `docs/dev/TODO.md`.
- When: When an SMF authoring workflow requires more than pose edits.
- How: Preserve indexed identity, add pure validators first, then prove import/export/reimport against head-node fixtures.
- Done when: UI behavior is explicit and tests show no node-index, skin-index, animation-target, or head-node drift.

## Verification

- Full `pwsh -File run.ps1 -Task verify` passed with 172/172 units, app/test typechecks, lint, production-any guard, build/chunk check, context-bank validation, and Rust cargo check.
- Browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passed 41/41, including the real-SMF IK smoke and saved visual confirmation.
