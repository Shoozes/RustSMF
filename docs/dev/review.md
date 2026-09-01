# RustSMF Review Snapshot

Last reviewed: 2026-09-01

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

Complete. The Calm Modern shell, direct-paint Skin workflow, setup-pose ownership, model authoring, verification contracts, and focused context routes are reconciled.

- Skin Smooth is now real regional weight averaging instead of an alias for Auto. It works without a selected bone, shares the simple rail and Advanced mode contract, records undoable edits, and indexes skinned meshes once per stroke instead of traversing the scene for every candidate vertex.
- Async static-model append commits only while the initiating model root remains current. A replacement during file loading disposes the stale loaded subtree and cannot attach it to a detached scene or create misleading history.
- Global undo/redo chronology now uses one data-driven selector rather than duplicated filtering and reduction logic.
- Project integrity rejects relative imports that resolve only to a directory, accepts a deliberately empty backlog only through the explicit marker, rejects silently empty TODO files, and catches machine-local absolute paths in current-facing docs.
- Generated browser, journey, and design-review output is ignored under one repository-level `output/` rule. The durable design QA record now references only checked, portable evidence.
- The active TODO is genuinely empty; completed work lives here and in `HISTORY.md`. The research inbox contains no actionable drop-in, and the production source contains no unresolved TODO/FIXME/stub marker or broken relative import/export seam.
- `summary_bank.json` retains 31 narrow groups. Existing Skin, model-authoring, load-orchestration, external-resource, and project-integrity routes were updated instead of adding redundant groups; validation reports 43.2 KiB of default context and zero warnings.

## Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed 8/8 project-integrity tests, 7/7 context-bank tests, 2/2 main-sync safety tests, ESLint, app/test typechecks, production-`any` and entry-chunk guards, the Vite production build, 359/359 frontend units across 62 files, Rust fmt/clippy/check, and 10/10 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 86/86 browser cases across nine files after the scale-parity assertion was made tolerant of one-pixel screenshot quantization.
- Focused Skin browser coverage: passed 7/7. Focused scale-parity browser coverage: passed 1/1.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 31 groups, 43.2 KiB default context, and zero warnings.
- Final `git diff --check` and marker/path searches passed.

## Blockers and verified limits

There is no code, test, documentation, context-routing, or local verification blocker in the reviewed scope.

- Node 26.5 emits Playwright 1.60's upstream `[DEP0205] module.register()` and `NO_COLOR`/`FORCE_COLOR` warnings while the suites remain green; neither warning originates in application code.
- Universal third-party FBX behavior, automatic assignment of unreferenced material maps, producer-specific influences beyond Three.js's four retained weights, true OS-dialog automation, and future evidence-driven strict-baseline refreshes remain explicit limits in `APP_STATE.md`, not hidden implementation TODOs.

## Next direction

The active backlog is closed. Add a new What/Why/Where/When/How/Done-when/Verification item only when product evidence, an external compatibility fixture, or a requested feature creates executable work.
