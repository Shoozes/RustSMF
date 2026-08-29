# Frontend Test Contract

The test layout mirrors runtime ownership. Keep behavior in the narrowest suite that owns the risk; do not rebuild a single catch-all smoke file.

## Verification Gates

- `pwsh -File run.ps1 -Task verify`: context-bank validation/tests, fail-closed ESLint coverage, lint, app and test typechecks, production `any` guard, production build, chunk checks, frontend units, and `cargo check`.
- `pwsh -File run.ps1 -Task test:e2e -NoGenEye`: browser-only Playwright against one production `vite preview` server.
- `pwsh -File run.ps1 -Task test:journey`: opt-in recorded hand-wave workflow at 1440x900 and 125% device scale; writes ignored review evidence under `output/playwright/hand-wave-journey/`.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native tests, and the native IPC browser suite.
- The Rust and frontend Tauri dialog-plugin manifests are pinned to the same 2.7.1 release. Rust owns dialog invocation; the frontend declaration remains part of Tauri's build-time version contract even though no frontend dialog API is imported. Native resource-bundle reads and project recovery remain deterministic IPC contracts; true OS-dialog interaction is evidence-gated.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in committed WebGL snapshots.
- `pwsh -File run.ps1 -Task test:visual-update`: intentional strict-baseline refresh only.

Playwright may require execution outside a managed sandbox when Chromium launch is rejected with `spawn EPERM`. That is a harness permission failure, not an application test failure. The approved local browser lane passed the current full 74-case suite and the 2-case strict visual suite on 2026-08-29; retain the caveat only for future managed-launch failures.

If a managed run reaches the test bodies but exits with `browserContext.close: spawn EPERM`, classify it as teardown-only harness evidence, keep the nonzero exit honest, and verify that the runner-owned preview server on port 5173 is stopped before the next command. Do not weaken teardown assertions or label the command green.

For a process-local browser executable override, use an approved existing absolute path without changing repo or sandbox policy:

```powershell
$env:RUSTSMF_PLAYWRIGHT_EXECUTABLE = '<approved-absolute-Chrome-or-Edge-path>'
npm.cmd run test:e2e -- --reporter=line
```

## Browser Suite Ownership

| Suite | Primary ownership |
| --- | --- |
| `shell-model.spec.ts` | App boot, real SMF load, responsive workspaces, scale-independent camera fitting, viewport layouts/shared camera focus, selection, invalid input |
| `lifecycle.spec.ts` | Latest-intent load races, atomic replacement, dirty replacement decisions, save single-flight, worker progress/responsiveness |
| `rig.spec.ts` | Pose history, reversible static-root preparation/export, SMF Rig policy, Endpoint, IK, TransformControls ownership |
| `animation.spec.ts` | Timeline gestures, clip management, scoped animation keys, and SMF checks |
| `skin.spec.ts` | Paint gating, cancel, undo/redo, Auto Skin, SMF export |
| `export-formats.spec.ts` | GLB/GLTF/FBX sidecar, SMF, FBX, and OBJ flows; indexed-mesh conversion; non-SMF rename/order/duplicate/delete/static surface authoring persistence; material policy; non-SMF-to-SMF fail-closed diagnostics; FBX re-import |
| `native.spec.ts` | Deterministic Tauri IPC dialog-owned open/read/save/cancel and stale-completion matrices |
| `visual.spec.ts` | Modern/Original geometry/defaults, source texture thumbnails, reference-derived shelves/top strip/keyframe lane, narrow layout, viewport/menu visual coherence |

The 37 tests formerly in `smoke.spec.ts` retain their titles across the current domain-owned browser suites. Playwright currently discovers 74 browser cases total; use `npm.cmd run test:e2e:list` for the authoritative count after adding or moving cases. The dedicated script prevents npm from consuming Playwright's `--list` flag and accidentally starting the full suite.

`tests/journeys/hand-wave.journey.spec.ts` is intentionally excluded from the default 74-case gate. Its dedicated config records one deterministic end-to-end authoring path: load the real SMF fixture, create a rest-pose clip, prove viewport bone picking and the camera-facing hover badge are unobstructed, confirm display-only `LeftArm`/`LeftForeArm`/`LeftHand` aliases, hold the shoulder outside the head silhouette, and Branch-key a bounded elbow-and-hand wave at 0, 0.5, 1, 1.5, and 2 seconds with matching loop endpoints. It then finds the visible `Mesh_4` torso seam with stray `LeftForeArm` influence, exposes semantic names in Skin diagnostics, captures the pose with Frozen Current sampling, and enables selected-weight mini vertex nodes for exact source-vertex targeting. It subtracts forearm influence from both seam faces, Set-paints the outer upper-sleeve edge to `LeftArm`, and previews the corrected loop. Precision targeting checks the current view and uses deterministic quarter-turn single-view fallbacks when a seam is occluded or quad panes make a thin edge impractical. The journey fails on document overflow, blocked or disabled primary controls, unavailable viewport picking, missing aliases/hover telemetry, unchanged canvas poses, missing scoped keys, an unreachable or unchanged skin target, critical browser errors, or a missing/empty WebM.

## Shared Browser Helpers

- `helpers/smoke-helpers.ts`: fixtures, browser diagnostics, synthetic drops, tolerant screenshot checks.
- `helpers/viewport-interactions.ts`: pointer, gizmo, Endpoint, IK, Skin, layout, and pane drag actions.
- `helpers/timeline-interactions.ts`: slider and keyframe-lane actions.
- `helpers/smf-codec-probe.ts`: worker progress and page-heartbeat observation.
- `helpers/format-assertions.ts`: selected-bone parsing, regex escaping, base64, and GLB JSON inspection.
- `helpers/skinned-glb-fixture.ts`: option-keyed generated indexed skinned GLB variants for texture, material, and sibling-order coverage.
- `helpers/external-fbx-fixture.ts`: generated ASCII FBX plus referenced PNG sidecar for deterministic selected-resource resolution.
- `helpers/smf-stress-fixture.ts`: bounded 300,000-vertex SMF worker fixture whose grid layout stresses codec volume without pathological render overdraw.

## Unit Coverage

The Node tests under `src/**/*.test.ts` cover theme registry/persistence, SMF binary and DQ fidelity, shared semantic validation, bounded malformed-input and export-field checks, model-input size guards, native binary-payload validation, worker protocol and ownership, setup-time worker cancellation, indexed Three-to-SMF triangle expansion and root-relative/mixer-sampled parity, shared GLB/FBX/OBJ geometry-attribute preparation, FBX and GLB pre-save reparse validation, export-candidate policy, reversible Model name/visibility/selection/order snapshots and guarded rename/reorder/duplicate/delete/static surface authoring with GLB re-import, bounded multi-file resource resolution and cleanup, committed external-GLTF fixture integrity, versioned project envelopes, editor snapshots/history and byte eviction, three-axis pose nudges, fail-closed humanoid display aliases, dynamic bone labels, atomic and transform-safe static-root skin preparation, viewport listener disposal/routing/layout/shared-focus pan/reset math, proportional framing/clipping/orbit limits across extreme scales, bounded skinned-model fit cost, touch-cancel/window-blur/pointer-leave cleanup, pending animation-frame cleanup, playback display cadence, theme-grid plane ownership/disposal, Rig metadata/IK/Skin/Animate helpers, bounded keyed skin-history storage, raw four-slot skin diagnostics, rest/frozen/live paint-pose position sampling, exact mini-node source resolution with invalid-data rejection, hand-wave deformation repair, viewport telemetry transitions, animation scope resolution/fingerprints/atomic key operations, hostile-name clipboard maps, bounded animation duration/retime/trim edits and stable duration display formatting, locked-channel protection and SMF lock export, animation authoring context/controller guards, unique-bone animation validation, pose-overlay invalidation/cadence, geometry/shader diagnostics, material and weight-preview isolation/restoration, raw texture thumbnail sampling, and resource disposal. `source/frontend/scripts/run-unit-tests.mjs` discovers all unit files deterministically and forwards extra Node test flags; use `npm.cmd run test:unit -- --test-name-pattern "duration formatting"` for a focused slice. All discovered files still load so registration and type boundaries remain covered. The current exact count and discovered-file total are recorded by `run.ps1 -Task verify` in `docs/dev/review.md` and `docs/dev/HISTORY.md`.

The generated indexed GLB is a required compatibility shape for GLB/FBX export and converter coverage: conversion must duplicate indexed vertex attributes into complete SMF triangle soup before the worker guard accepts it, bake mesh transforms once, capture root-relative world bone poses, and sample animation through Three's mixer. Missing optional normals/UVs/tangents receive correctly sized zero arrays; incomplete triangle or skin layouts fail preflight. Skin browser coverage owns paint gating, diagnostics visibility, and Rest/Frozen/Live pose telemetry.

## Fixture Policy

`mixamo_smf_baldguy.smf`, `test.fbx`, `test.obj`, `fixtures/invalid-model.gml`, `fixtures/external-gltf/{scene.gltf,mesh.bin,texture.png}`, and `fixtures/independent-fbx/independent_skinned.fbx` are committed verification dependencies. The external GLTF's nine-byte `mesh.bin` is an explicit exception to the global model/weight exclusion and is tracked as binary; its focused unit contract verifies the exact payload/hash and requires every relative URI in `scene.gltf` to resolve to a regular file inside that fixture directory. `helpers/smoke-helpers.ts` resolves the browser fixtures directly and throws an actionable error during test registration if one is missing; it does not generate the sidecar at runtime, scan archived old-source assets, or silently fall back to a deleted spec. The generated external-FBX helper contains its own tiny ASCII FBX and PNG in test code, so it proves selected sidecar handling without relying on an owner-local asset. The independent FBX fixture's generator, provenance, and Blender validator live beside the asset; the validator can also inspect the ignored app-exported roundtrip under `test-results/`.

The Rust native tests anchor the same committed SMF to `CARGO_MANIFEST_DIR` and fail closed when it is unavailable, independent of the caller's working directory. `desktop-smoke` must therefore prove a real binary parse, not only report a green optional-sample branch.

## Visual Policy

Default e2e uses `expectRenderedScreenshot()` byte-size assertions to prove meaningful rendering without machine-specific WebGL baselines. Strict snapshots are limited to the real-SMF loaded bone state and export state and live beside `shell-model.spec.ts` and `export-formats.spec.ts`.

Do not commit `playwright-report/`, `test-results/`, or `output/playwright/`. Keep the Playwright server on build + preview, keep one server owner per command, and preserve test titles when moving ownership so filters and pitfall references remain stable.

When adding or moving a test:

1. Update this ownership map if the domain changes.
2. Run the smallest relevant unit/spec first.
3. Run `typecheck:test`, then the full appropriate gate.
4. Update `docs/dev/PITFALL_LEDGER.md` only for a durable recurring failure mode.
