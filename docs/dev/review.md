# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused implementation and integrity review for workspace/layout continuity, shared authoring state, tool ownership, and canceled-save behavior.

## Current Findings

- Workspace changes do not reload the model or overwrite shared authoring state. The generated skinned-GLB matrix preserves one root UUID, selected object and bone, paused playback time, export status, and pose/skin/animation dirty flags through View/Rig/Skin/Animate/Export plus single, quad, and single Ortho transitions.
- Select, Endpoint, and IK attach only their owned viewport handles. Endpoint/IK coordinates and active-gesture telemetry clear outside their owning tool/workspace; TransformControls attach only in supported Select/Animate perspective paths.
- No-model mode cycles retain a single layout, disabled display/layout controls, an empty root identity, and no stale Endpoint/IK handle telemetry.
- Native canceled-save flows preserve skin and animation dirty edits, selected bone, root identity, and cancel status even after changing panels.
- Export intentionally unmounts Timeline, so visible `time-display` was not a valid all-mode continuity probe. The persistent viewport now exposes read-only root/playback telemetry; this closes a test-observability gap without changing app state ownership.

## Next Tasks

### Async operation continuity

- What: Close the remaining stale-success/stale-error and overlapping-save cases across load and export entrypoints.
- Why: Workspace transitions are proven, but asynchronous browser/native completions can still arrive after a newer operation and must not overwrite valid state.
- Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/native.spec.ts`, and shared smoke helpers.
- When: Before workerizing SMF import/export or adding another authoring surface.
- How: Add deterministic delayed-entrypoint tests around the existing sequence and single-flight contracts, asserting the complete committed root, selection, status/error, and dirty state.
- Done when: No older success or error can overwrite a newer root, selection, status/error, dirty edit, or save result for any supported mutable entrypoint.

## Verification

- Focused browser evidence passes 3/3: one loaded-authoring workspace matrix plus both native canceled-save panel-transition paths.
- Full `pwsh -File run.ps1 -Task verify` passed with 187/187 units, zero-warning context validation, lint, app/test typechecks, production-any guard, build/chunk checks, and Rust cargo check.
- Browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passed 44/44 under four-worker concurrency, including the new continuity matrix, no-model negatives, native cancel flows, material export isolation, and existing visual paths.
