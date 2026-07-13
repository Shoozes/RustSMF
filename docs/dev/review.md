# RustSMF Review Snapshot

Last reviewed: 2026-07-13

## Scope

Focused implementation and integrity review for async load/export ownership, atomic replacement, stale completion rejection, and save single-flight behavior.

## Current Findings

- Picker, file input, drop, desktop path read, and loader completion now carry one token created at user intent. A delayed result cannot become artificially newest merely because it enters `loadModel` last.
- Model replacement is atomic: the current root, selection, and dirty authoring state remain live until a current replacement parses successfully. Failed replacements preserve them; stale parsed roots are explicitly disposed.
- New load intent invalidates old export UI ownership. GLB/FBX exporter, validation, diagnostic save, SMF save, and generic save paths check freshness after every await, so stale success/error cannot overwrite the newer load's status or error.
- Save serialization remains global across diagnostic and model actions. Stale export cleanup always releases the save lock but does not clear a newer load's busy state.
- Deterministic browser/native matrices cover stale success after newer error, stale error after newer success, picker and desktop reads, input/drop, export-versus-load, browser cross-action downloads, canceled saves, root/selection/status/error, and pose/skin/animation dirty ownership.

## Next Tasks

### Typed interop boundaries

- What: Eliminate or isolate remaining broad casts and external-library type mismatches at Three.js, loader, exporter, Tauri, and disposal boundaries.
- Why: The async ownership contract is now explicit; loose boundary types are the next source of assumptions that could bypass it during dependency upgrades or worker extraction.
- Where: `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, loaders/exporters, `ThreeViewport.tsx`, and `threeDisposal.ts`.
- When: Before workerizing SMF import/export.
- How: Keep errors `unknown`, introduce narrow named guards/adapters, and document only unavoidable external type skew.
- Done when: App/test typechecks and production-any pass, with every remaining production cast narrow and justified.

## Verification

- Focused async evidence passes 7/7 under four-worker concurrency, with targeted reruns after strengthening failed-replacement assertions and replacing fixed write sleeps with explicit start/settlement telemetry.
- Full `pwsh -File run.ps1 -Task verify` passes with 187/187 units, zero-warning context validation, lint, app/test typechecks, production-any guard, build/chunk checks, and Rust cargo check.
- Browser-only `pwsh -File run.ps1 -Task test:e2e -NoGenEye` passes 50/50 under four-worker concurrency after auditing and fixing one test-only save-start timing assumption.
