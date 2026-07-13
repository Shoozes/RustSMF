# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused integrity review of production TypeScript boundaries, Three.js resource ownership, and readiness for workerized SMF processing.

## Current Findings

- Tauri dialog selections, DOM select values, loader animation arrays, GLB exporter results, TransformControls events, Three object traversal, material fields, and disposable resources now enter through narrow guards or adapters rather than broad assertions.
- Shared `Bone`, `Mesh`, and `SkinnedMesh` guards keep loader, viewport, outliner, rig, skin, and preview traversal consistent with Three.js r182.
- Three subtree cleanup now releases geometry, material, texture, and skeleton resources once by identity, including shared resources across multiple meshes/material slots.
- Production scans contain no `any`, double assertions, `as THREE.*`, `@ts-ignore`, or `@ts-expect-error` outside the owned vendor boundary. Remaining assertions are literal `as const` narrowing.
- DOM/settings guards reject malformed editor mode, animation interpolation, auto-weight algorithm, and IK pole-axis values; animation snap uses the existing normalizer.
- SMF texture records are now structured-clone-safe RGBA buffers, `DataTexture` creation stays on the main thread, and import/export expose tested monotonic progress. Worker request/response wiring remains intentionally unshipped rather than leaving an unwired worker stub.

## Next Task

### Workerize heavy SMF import/export with progress

- What: Move synchronous SMF parse/export work off the UI thread while preserving exact load/export ownership and diagnostics.
- Why: Current sequence guards stop stale commits but large binary work can still block interaction.
- Where: a new `source/frontend/src/workers/modelWorker.ts`, `source/frontend/src/hooks/useLoadModel.ts`, SMF loaders/exporters, worker message tests, and Playwright stress coverage.
- When: Next; async and typed boundary contracts are now stable.
- How: Use typed transferable request/progress/success/error messages, monotonic bounded progress, explicit worker cleanup, shared sequence tokens, and a tested synchronous startup fallback.
- Done when: Large-file interaction remains responsive; progress is monotonic and clears terminally; results preserve current roundtrip diagnostics; stale responses cannot commit; startup/runtime failures take an explicit tested path.

## Verification

- Focused typed-boundary/export/disposal evidence passes 67/67.
- Full `pwsh -File run.ps1 -Task verify` passes with 195/195 units, zero-warning context validation, lint, app/test typechecks, production-any guard, build/chunk checks, and Rust cargo check.
- Browser Playwright passes 50/50 under four-worker concurrency, including async lifecycle, workspace continuity, TransformControls, IK, export, and visual flows.
