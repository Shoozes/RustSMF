# RustSMF Review Snapshot

Last reviewed: 2026-08-29

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

Complete. The repository-wide update pass reconciled code, tests, durable docs, research intake, and context routes, then exercised the browser, recorded journey, strict visuals, native shell, and dependency boundary.

- One P1 product defect was found after the original green gate: the mini-node precision path treated `getSkinnedVertexWorldPosition`'s `Failure | null` result as a success boolean. Valid vertices were rejected and invalid data could continue with an origin vector. `resolveSkinPointSourceVertex` now owns point-index, stride, geometry, and skin validation and exposes a positive target-or-null contract; focused and end-to-end regressions pass.
- No production TODO/FIXME/stub marker, skipped frontend unit, unchecked production `any`, unresolved relative frontend import/re-export, unresolved Rust module, or tracked runtime/build artifact was found. Test-only assertions and deliberate documented format limits remain correctly classified.
- The research inbox contains no active architect, feedback, or source-review note. No unproven research claim was promoted into current state or the backlog.
- All 31 context groups have existing task-relevant paths, narrow defaults, no runtime/generated paths, and no warnings. Recent bone-alias, journey, viewport, Skin, and external-FBX work is already routed. The Original-theme QA record now lives beside its four comparison artifacts under `docs/references/theme-qa/`; `summary_bank.json` follows the move.
- The active backlog remains closed. Completed implementation evidence is in `HISTORY.md`, the new recurring failure rule is in `PITFALL_LEDGER.md`, and this snapshot no longer repeats the full feature history.
- Manual inspection of the recorded checkpoints confirmed the bad torso influence, corrected sleeve ownership/dirty state, full-character framing, readable controls, and contained final playback.

## Verification

- Focused `skinPointOverlay` unit suite: 7/7 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with project-integrity checks (188 frontend source/test files and 11 durable docs), 31 focused groups, 41.0 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with project-integrity/context checks, lint coverage, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 353/353 frontend units across 61 files, Rust fmt/clippy/check, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 74/74 browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 at 1440x900 and 125% device scale, producing 12 reviewed PNG checkpoints plus `output/playwright/hand-wave-journey/hand-wave-journey.webm`.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 without refreshing baselines.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 15/15 Rust tests, and 11/11 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.
- `git diff --check`: passed.

## Verified limits

There is no code, test, documentation, or context-routing blocker in the reviewed scope.

- A managed sandbox may reject Chromium with `spawn EPERM`; that is a process-boundary limitation, not an app assertion result. The approved local browser lane is green.
- Universal third-party FBX behavior, unreferenced material-map inference, producer-specific influences beyond Three.js's four retained weights, true OS-dialog automation, and future strict-baseline refreshes remain explicit evidence-gated limits in `APP_STATE.md`, not hidden implementation TODOs.

## Next direction

No active implementation task remains. Open a new What/Why/When/Where/How/Done-when item only when new product evidence, an external compatibility fixture, or a requested feature creates executable work.
