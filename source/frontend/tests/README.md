# Frontend Test Contract

The test layout mirrors runtime ownership. Keep behavior in the narrowest suite that owns the risk; do not rebuild a single catch-all smoke file.

## Verification Gates

- `pwsh -File run.ps1 -Task verify`: context-bank validation/tests, fail-closed ESLint coverage, lint, app and test typechecks, production `any` guard, production build, chunk checks, frontend units, and Rust fmt/clippy/tests/check.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright through the checked `geneye-playwright.json` argv manifest with deterministic GenEye artifact review; add `-NoGenEye` for the independent browser-only lane.
- `pwsh -File run.ps1 -Task test:journey`: opt-in recorded hand-wave workflow through `geneye-journey.json` at 1440x900 and 125% device scale; writes the current Calm Modern UI WebM and 12 checkpoints under ignored `output/playwright/hand-wave-journey/` and retains GenEye keyframe/temporal evidence under ignored runtime data.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native tests, and the native IPC browser suite.
- Rust owns dialog invocation through its pinned `tauri-plugin-dialog` dependency; the frontend has no unused dialog-plugin package. Native resource-bundle reads, staged writes, and project recovery remain deterministic IPC contracts; true OS-dialog interaction is evidence-gated.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in committed WebGL snapshots.
- `pwsh -File run.ps1 -Task test:visual-update`: intentional strict-baseline refresh only.

Playwright may require execution outside a managed sandbox when Chromium launch is rejected with `spawn EPERM`. That is a harness permission failure, not an application test failure. The local browser lane is authoritative; exact suite counts and outcomes belong in the dated verification record in `docs/dev/HISTORY.md`.

The local Node 26.5 lane emits `[DEP0205] module.register()` from Playwright 1.60's TypeScript ESM loader. It is an upstream runner deprecation warning, not an app/test failure; do not suppress it or disable Playwright's TypeScript loader. The repository continues to require Node 22 or newer.

If a managed run reaches the test bodies but exits with `browserContext.close: spawn EPERM`, classify it as teardown-only harness evidence, keep the nonzero exit honest, and verify that the runner-owned preview server on port 5173 is stopped before the next command. Do not weaken teardown assertions or label the command green.

For a process-local browser executable override, use an approved existing absolute path without changing repo or sandbox policy:

```powershell
$env:RUSTSMF_PLAYWRIGHT_EXECUTABLE = '<approved-absolute-Chrome-or-Edge-path>'
npm.cmd run test:e2e -- --reporter=line
```

## Browser Suite Ownership

| Suite | Primary ownership |
| --- | --- |
| `shell-model.spec.ts` | App boot, real SMF load, responsive workspaces, scale-independent camera fitting, viewport layouts/shared camera focus, selection, material-repair apply/undo/redo, invalid input |
| `lifecycle.spec.ts` | Latest-intent load races, atomic replacement, dirty replacement decisions, save single-flight, worker progress/responsiveness |
| `rig.spec.ts` | Pose history, reversible static-root preparation/export, SMF Rig policy, Endpoint, IK, TransformControls ownership |
| `animation.spec.ts` | Timeline gestures, clip management, scoped animation keys, and SMF checks |
| `skin.spec.ts` | Paint/Smooth gating and shortcuts, cancel, undo/redo, Auto Skin, rest-pose ownership, SMF export |
| `export-formats.spec.ts` | GLB/GLTF/FBX sidecar, SMF, FBX, and OBJ flows; indexed-mesh conversion; non-SMF rename/order/duplicate/delete/static surface authoring persistence; material policy; non-SMF-to-SMF fail-closed diagnostics; FBX re-import |
| `native.spec.ts` | Deterministic Tauri IPC dialog-owned open/read/save/cancel, stale-completion, project recovery, and autosave-coalescing matrices |
| `modern-shell.spec.ts` | Modern command/workspace reachability, one-drawer focus ownership, coarse-pointer targets, and DPR backing dimensions |
| `visual.spec.ts` | Modern/Original geometry/defaults, source texture thumbnails, reference-derived shelves/top strip/keyframe lane, narrow layout, viewport/menu visual coherence |

The 37 tests formerly in `smoke.spec.ts` retain their titles across the current domain-owned browser suites. Use `npm.cmd run test:e2e:list` for the authoritative count after adding or moving cases. The dedicated script prevents npm from consuming Playwright's `--list` flag and accidentally starting the full suite.

`tests/journeys/hand-wave.journey.spec.ts` is intentionally excluded from the default browser gate. Its dedicated config records one deterministic real-SMF path through clip creation, viewport selection and hover aliases, Branch-keyed animation, precision Skin repair, and corrected playback.

The GenEye manifests execute the pinned Playwright CLI through `scripts/run-playwright-geneye.mjs` with `shell=false`. The journey keeps Playwright's raw artifact inside `test-results/hand-wave-journey` for deterministic ingestion, saves the review copy under repo-level ignored output, and deletes the redundant raw video after the attachment copy is secure so GenEye reviews one source video rather than duplicate bytes.

The journey fails on document overflow, blocked or disabled primary controls, missing pointer/alias telemetry, unchanged poses, missing scoped keys, unreachable Skin targets, critical browser errors, or missing evidence. Precision targets use deterministic camera fallbacks when occluded.

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

The deterministic `src/**/*.test.ts` inventory is grouped by runtime boundary:

- Input and persistence: model-size/resource-bundle guards, native payload validation, worker protocol/cancellation, SMF bounds/semantics, versioned projects, editor snapshots, and bounded history.
- Format and export: SMF coordinate/DQ fidelity, indexed Three-to-SMF expansion, GLB/FBX/OBJ geometry preparation, source-material isolation, pre-save reparse checks, and external-GLTF fixture integrity.
- Model and rig: Outliner/static authoring, root-skeleton preparation, rig edits/metadata/IK, explicit rig mapping, normalized proportion diagnostics, retarget timing/direction/recovery, strict material repair, and partial-load resource disposal.
- Viewport and Skin: layout/focus/hit math, scale-aware fitting, listener/RAF/grid/overlay disposal, display telemetry, weight previews, indexed brush lookup, smoothing, diagnostics, and Rest/Frozen/Live sampling.
- Animation and UI policy: clip creation/controller/scope/history, duration/retime/trim/lock rules, float32 and partial-terminal timing, playback cadence, themes, aliases, labels, and material thumbnails.
- Game-ready workflow: pure job-schema ambiguity checks, same-handle per-file/aggregate read limits, embedded texture/STEP validation, and finite deformation sampling.

`source/frontend/scripts/run-unit-tests.mjs` discovers all unit files and forwards extra Node test flags. A focused command such as `npm.cmd run test:unit -- --test-name-pattern "duration formatting"` still loads the complete discovered-file set so registration and type boundaries remain covered. Exact counts belong in the latest dated `HISTORY.md` verification record.

The generated indexed GLB is a required compatibility shape for GLB/FBX export and converter coverage: conversion must duplicate indexed vertex attributes into complete SMF triangle soup before the worker guard accepts it, bake mesh transforms once, capture root-relative world bone poses, and sample animation through Three's mixer. Missing optional normals/UVs/tangents receive correctly sized zero arrays; incomplete triangle or skin layouts fail preflight. Skin browser coverage owns paint gating, diagnostics visibility, and Rest/Frozen/Live pose telemetry.

## Fixture Policy

`mixamo_smf_baldguy.smf`, `test.fbx`, `test.obj`, `fixtures/invalid-model.gml`, `fixtures/external-gltf/{scene.gltf,mesh.bin,texture.png}`, and `fixtures/independent-fbx/independent_skinned.fbx` are committed verification dependencies. The external GLTF's nine-byte `mesh.bin` is an explicit exception to the global model/weight exclusion and is tracked as binary; its focused unit contract verifies the exact payload/hash and requires every relative URI in `scene.gltf` to resolve to a regular file inside that fixture directory. `helpers/smoke-helpers.ts` resolves the browser fixtures directly and throws an actionable error during test registration if one is missing; it does not generate the sidecar at runtime, scan archived old-source assets, or silently fall back to a deleted spec. The generated external-FBX helper contains its own tiny ASCII FBX and PNG in test code, so it proves selected sidecar handling without relying on an owner-local asset. The independent FBX fixture's generator, provenance, and Blender validator live beside the asset; the validator can also inspect the ignored app-exported roundtrip under `test-results/`.

The Rust native tests are fixture-independent and exercise path authority, bounded reads, staged writes, rotating project generations, recovery allowlisting, and write serialization. SMF structure and real-fixture parsing remain owned by the TypeScript worker/unit/browser lanes.

The native sidecar browser case applies `tauri.conf.json`'s connection policy before loading its bundle. The foreground-save case starts an active autosave and proves one click completes without overlapping writes. Actual Windows dialog acceptance is recorded in `docs/dev/HISTORY.md`; mocks do not replace that proof. Run browser suites and `desktop-smoke` sequentially because both own the same preview port.

## Visual Policy

Default e2e uses `expectRenderedScreenshot()` byte-size assertions to prove meaningful rendering without machine-specific WebGL baselines. Strict snapshots cover the real-SMF loaded bone state, export state, and Original-theme shell and live beside `shell-model.spec.ts`, `export-formats.spec.ts`, and `visual.spec.ts`.

Do not commit `playwright-report/`, `test-results/`, or repo-level `output/`; all generated captures and journey media are reproducible review artifacts. Keep the Playwright server on build + preview, keep one server owner per command, and preserve test titles when moving ownership so filters and pitfall references remain stable.

When adding or moving a test:

1. Update this ownership map if the domain changes.
2. Run the smallest relevant unit/spec first.
3. Run `typecheck:test`, then the full appropriate gate.
4. Update `docs/dev/PITFALL_LEDGER.md` only for a durable recurring failure mode.
