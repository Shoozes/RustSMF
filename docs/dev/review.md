# RustSMF Review Snapshot

Last reviewed: 2026-08-30

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

Complete. The repository-wide integrity pass reconciled code, tests, durable docs, research intake, and context routes, then exercised the production browser and native shell.

- Native project recovery no longer trusts an arbitrary app-data file name. Discovery and reads share one exact allowlist for the target, `.bak1`, and `.bak2`, require regular files, and reject traversal, sibling, directory, and symlink-shaped inputs before reading.
- All native writes now share one async serialization owner and perform blocking work off the async runtime. Exports and project generations use unique staged files, flush complete payloads before rename, clean temporary files on failure, and restore the previous destination when installation fails. A post-install cleanup warning no longer reports a false failed save.
- Autosave coalesces repeated edits to the newest trailing request. Successful model replacement invalidates queued old-model work and waits for an issued write before swapping roots; canceled or failed pickers leave recovery work intact. Browser coverage holds a delayed write open and proves the model does not swap early or overlap native writes.
- Removed the unused Rust SMF peek/parser module, its six dead Tauri commands, duplicate browser simulations, bridge exports, direct Rust serialization dependencies, and the unused frontend dialog package. The TypeScript worker is now the sole structural SMF authority; Rust owns dialogs and bounded file I/O.
- No production TODO/FIXME/stub marker, skipped frontend unit, unchecked production `any`, unresolved relative frontend import/re-export, unresolved Rust module, or tracked runtime/build artifact was found. The research inbox contains no active architect, feedback, or source-review note.
- The active backlog remains closed. Current behavior, completed evidence, recurring hazards, and focused file routes remain separated across `APP_STATE.md`, `HISTORY.md`, `PITFALL_LEDGER.md`, and the existing 31 `summary_bank.json` groups.

## Verification

- Focused delayed autosave/model-replacement browser regression: 1/1 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with project-integrity checks across 188 frontend source/test files and 11 durable docs, 31 focused groups, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with project-integrity/context checks, synchronization guards, lint coverage, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 353/353 frontend units across 61 files, Rust fmt/clippy/check, and 10/10 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 75/75 browser cases across eight files.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 10/10 Rust tests, and 12/12 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.
- `git diff --check`: passed.

## Verified limits

There is no code, test, documentation, or context-routing blocker in the reviewed scope.

- Native write serialization is deliberately process-wide: a large export can delay project autosave, while the trailing-request queue prevents overlap and preserves the latest edit.
- A managed sandbox may reject Chromium with `spawn EPERM`; that is a process-boundary limitation, not an app assertion result. The approved local browser lane is green.
- Local Node 26.5 emits Playwright 1.60's upstream `[DEP0205] module.register()` warning while the suite remains green. The warning is not suppressed and does not originate in application code.
- Universal third-party FBX behavior, unreferenced material-map inference, producer-specific influences beyond Three.js's four retained weights, true OS-dialog automation, and future strict-baseline refreshes remain explicit evidence-gated limits in `APP_STATE.md`, not hidden implementation TODOs.

## Next direction

No active implementation task remains. Open a new What/Why/When/Where/How/Done-when item only when new product evidence, an external compatibility fixture, or a requested feature creates executable work.
