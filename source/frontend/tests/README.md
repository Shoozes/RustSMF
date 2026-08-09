# Frontend Test Contract

The test layout mirrors runtime ownership. Keep behavior in the narrowest suite that owns the risk; do not rebuild a single catch-all smoke file.

## Verification Gates

- `pwsh -File run.ps1 -Task verify`: context-bank validation/tests, fail-closed ESLint coverage, lint, app and test typechecks, production `any` guard, production build, chunk checks, frontend units, and `cargo check`.
- `pwsh -File run.ps1 -Task test:e2e -NoGenEye`: browser-only Playwright against one production `vite preview` server.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native tests, and the native IPC browser suite.
- The Rust and frontend Tauri dialog-plugin manifests are pinned to the same 2.7.1 release. Rust owns dialog invocation; the frontend declaration remains part of Tauri's build-time version contract even though no frontend dialog API is imported.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in committed WebGL snapshots.
- `pwsh -File run.ps1 -Task test:visual-update`: intentional strict-baseline refresh only.

Playwright may require execution outside a managed sandbox when Chromium launch is rejected with `spawn EPERM`. That is a harness permission failure, not an application test failure.

If a managed run reaches the test bodies but exits with `browserContext.close: spawn EPERM`, classify it as teardown-only harness evidence, keep the nonzero exit honest, and verify that the runner-owned preview server on port 5173 is stopped before the next command. Do not weaken teardown assertions or label the command green.

For a process-local browser executable override, use an approved existing absolute path without changing repo or sandbox policy:

```powershell
$env:RUSTSMF_PLAYWRIGHT_EXECUTABLE = '<approved-absolute-Chrome-or-Edge-path>'
npm.cmd run test:e2e -- --reporter=line
```

## Browser Suite Ownership

| Suite | Primary ownership |
| --- | --- |
| `shell-model.spec.ts` | App boot, real SMF load, responsive workspaces, viewport layouts/shared camera focus, selection, invalid input |
| `lifecycle.spec.ts` | Latest-intent load races, atomic replacement, dirty replacement decisions, save single-flight, worker progress/responsiveness |
| `rig.spec.ts` | Pose history, SMF Rig policy, Endpoint, IK, TransformControls ownership |
| `animation.spec.ts` | Timeline gestures, clip management, scoped animation keys, and SMF checks |
| `skin.spec.ts` | Paint gating, cancel, undo/redo, Auto Skin, SMF export |
| `export-formats.spec.ts` | GLB/SMF/FBX/OBJ flows, indexed-mesh conversion, material policy, non-SMF-to-SMF fail-closed diagnostics, FBX re-import |
| `native.spec.ts` | Deterministic Tauri IPC dialog-owned open/read/save/cancel and stale-completion matrices |
| `visual.spec.ts` | Modern/Original geometry/defaults, source texture thumbnails, reference-derived shelves/top strip/keyframe lane, narrow layout, viewport/menu visual coherence |

The 37 tests formerly in `smoke.spec.ts` retain their titles across the current domain-owned browser suites. Playwright currently discovers 63 browser cases total; use `npm.cmd run test:e2e:list` for the authoritative count after adding or moving cases. The dedicated script prevents npm from consuming Playwright's `--list` flag and accidentally starting the full suite.

## Shared Browser Helpers

- `helpers/smoke-helpers.ts`: fixtures, browser diagnostics, synthetic drops, tolerant screenshot checks.
- `helpers/viewport-interactions.ts`: pointer, gizmo, Endpoint, IK, Skin, layout, and pane drag actions.
- `helpers/timeline-interactions.ts`: slider and keyframe-lane actions.
- `helpers/smf-codec-probe.ts`: worker progress and page-heartbeat observation.
- `helpers/format-assertions.ts`: selected-bone parsing, regex escaping, base64, and GLB JSON inspection.
- `helpers/skinned-glb-fixture.ts`: generated indexed skinned GLB with optional texture/material variants.
- `helpers/smf-stress-fixture.ts`: bounded 300,000-vertex SMF worker fixture.

## Unit Coverage

The 307 Node tests under `src/**/*.test.ts` cover theme registry/persistence, SMF binary and DQ fidelity, shared semantic validation, bounded malformed-input and export-field checks, model-input size guards, native binary-payload validation, worker protocol and ownership, setup-time worker cancellation, indexed Three-to-SMF triangle expansion and root-relative/mixer-sampled parity, FBX and GLB pre-save reparse validation, export-candidate policy, editor snapshots/history and byte eviction, reversible static-root skin preparation, viewport listener disposal/routing/layout/shared-focus pan/reset math, pending animation-frame cleanup, playback display cadence, theme-grid plane ownership/disposal, Rig/IK/Skin/Animate helpers, bounded keyed skin-history storage, raw four-slot skin diagnostics, rest/frozen/live paint-pose position sampling and viewport telemetry transitions, animation scope resolution/fingerprints/atomic key operations, hostile-name clipboard maps, bounded animation duration/retime/trim edits and stable duration display formatting, locked-channel protection and SMF lock export, animation authoring context/controller guards, unique-bone animation validation, pose-overlay invalidation/cadence, material and weight-preview isolation/restoration, raw texture thumbnail sampling, and resource disposal. `source/frontend/scripts/run-unit-tests.mjs` discovers all unit files deterministically, so new tests are included without editing a hardcoded package list.

The generated indexed GLB is a required compatibility shape for GLB/FBX export and converter coverage: conversion must duplicate indexed vertex attributes into complete SMF triangle soup before the worker guard accepts it, bake mesh transforms once, capture root-relative world bone poses, and sample animation through Three's mixer. Missing optional normals/UVs/tangents receive correctly sized zero arrays; incomplete triangle or skin layouts fail preflight. Skin browser coverage owns paint gating, diagnostics visibility, and Rest/Frozen/Live pose telemetry.

## Fixture Policy

`mixamo_smf_baldguy.smf`, `test.fbx`, `test.obj`, `fixtures/invalid-model.gml`, and `fixtures/independent-fbx/independent_skinned.fbx` are committed verification dependencies. `helpers/smoke-helpers.ts` resolves them directly and throws an actionable error during test registration if one is missing; it does not scan archived old-source assets or silently fall back to a deleted spec. The independent FBX fixture's generator, provenance, and Blender validator live beside the asset; the validator can also inspect the ignored app-exported roundtrip under `test-results/`.

The Rust native tests anchor the same committed SMF to `CARGO_MANIFEST_DIR` and fail closed when it is unavailable, independent of the caller's working directory. `desktop-smoke` must therefore prove a real binary parse, not only report a green optional-sample branch.

## Visual Policy

Default e2e uses `expectRenderedScreenshot()` byte-size assertions to prove meaningful rendering without machine-specific WebGL baselines. Strict snapshots are limited to the real-SMF loaded bone state and export state and live beside `shell-model.spec.ts` and `export-formats.spec.ts`.

Do not commit `playwright-report/` or `test-results/`. Keep the Playwright server on build + preview, keep one server owner per command, and preserve test titles when moving ownership so filters and pitfall references remain stable.

When adding or moving a test:

1. Update this ownership map if the domain changes.
2. Run the smallest relevant unit/spec first.
3. Run `typecheck:test`, then the full appropriate gate.
4. Update `docs/dev/PITFALL_LEDGER.md` only for a durable recurring failure mode.
