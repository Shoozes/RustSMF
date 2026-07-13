# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused implementation and integrity review for Rig IK, TransformControls lifecycle/ownership, endpoint/gizmo conflicts, authoring history completeness, and SMF/GLB preservation.

## Current Findings

- IK is a bounded, reversible Rig pose tool. The historical head-motion report predates both IK and SMF-to-GLB recovery, so ancestry/playback/serialized-world-pose evidence remains the correct diagnostic boundary.
- Three.js r182 TransformControls now mounts its public `getHelper()` root. A real picker-handle browser drag proves Rig writes pose history and Animate writes key history without cross-domain dirty state.
- Select, Endpoint, and IK have separate visible tools and input ownership. Endpoint raycasts only marked cyan sphere meshes; its connector is visual-only. The one-camera freeform gizmo is limited to single perspective, while quad/ortho keep their pane-aware tools.
- Current pose, Rig, Animate, Skin, and Outliner mutators are classified in `source/frontend/tests/README.md`. Destructive actions are undoable; selection, playback, display, and tool settings are explicitly non-destructive.
- The direct-handle, endpoint, IK, export, and visual flows retain typed telemetry and deterministic tests. The completed P1 interaction/history work has moved out of the active backlog.

## Next Tasks

### SMF-safe rig metadata decision

- What: Implement the next safe SMF rig-edit layer or explicitly reject each metadata operation with format-grounded proof.
- Why: Pose rotations preserve indexed nodes, but rename, detach/connect, mirror, and reset can alter node, skin, animation, or head-dummy identity.
- Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/components/RigPanel.tsx`, real head-node fixtures, and `docs/dev/TODO.md`.
- When: Next format-authoring slice, before exposing any new SMF structural control.
- How: Source-map old semantics, freeze indexed identity, add pure validators/helpers, then prove import/export/reimport over head-node fixtures before enabling UI.
- Done when: Every proposed control is either visibly blocked with an exact reason or passes node-index, skin-index, animation-target, pose, and head-node roundtrip assertions.

### Workspace transition and async continuity

- What: Close remaining no-model and dirty-state transition/race cases across workspace, layout, load, and export entrypoints.
- Why: Shared authoring state is now broad enough that a stale async completion or mode transition could hide or overwrite a valid edit.
- Where: `source/frontend/src/App.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, panel components, `source/frontend/tests/smoke.spec.ts`, and `source/frontend/tests/native.spec.ts`.
- When: Before workerizing SMF import/export or adding another authoring surface.
- How: Add a compact transition matrix and deterministic delayed-entrypoint tests; preserve existing sequence and single-flight guards.
- Done when: Tests prove no reload, stale status/error, selection loss, scrub reset, or dirty-edit overwrite across the supported transition and overlap matrix.

## Verification

- Full `pwsh -File run.ps1 -Task verify` passed with 172/172 units, app/test typechecks, lint, production-any guard, build/chunk check, context-bank validation, and Rust cargo check.
- Browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passed 42/42, including real TransformControls Rig/Animate ownership, explicit Endpoint single/quad behavior, Rig IK, export, native race, and visual flows.
- Focused visual confirmations passed 6/6, including the six-tool Rig row and IK target/settings state.
