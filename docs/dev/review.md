# RustSMF Review Snapshot

Last reviewed: 2026-09-01

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

Complete. The selected focused-studio direction is implemented as a calm, canvas-first Modern shell while Original SMF retains its legacy-parity structure and behavior.

- Modern and Original now have explicit shell variants with shared editor state and command semantics but separately owned chrome. Modern presents two short navigation rows, one supporting panel, compact overlay drawers, and viewport-local layout, camera, and display controls.
- Open, Save, Undo, Redo, and Export remain primary. Project recovery, explicit format exports, diagnostics, and appearance remain reachable through named progressive disclosure; every existing command is exercised in browser coverage.
- The unloaded Modern shell presents one focused Open/drop task. The full Timeline mounts only in Animate, compact drawers are mutually exclusive, and focus is trapped, dismissed, and restored predictably.
- Renderer density refreshes when the viewport or display changes and remains capped at DPR 2. Responsive coverage owns wide, compact, narrow, coarse-pointer, and DPR behavior without document or shell overflow.
- Original SMF keeps its quad default, mode labels, legacy geometry, responsive behavior, and strict visual baseline. Modern screenshot changes are intentional and isolated to the new composition.
- The selected visual, implementation comparison record, current-state docs, test guide, pitfall story, closed backlog, history, and focused context routes are reconciled. No active architect or research-inbox drop-in, production TODO/FIXME/stub, or unresolved import/export seam remains in scope.

## Issues found and resolved

- A shared narrow-layout rule expanded the Modern viewport overlay to full width and clipped controls at 800 pixels. Modern now overrides inherited width, wrapping, overflow, and alignment at the shell boundary.
- Older behavior tests assumed both supporting panels and the Timeline were permanently mounted. Shared helpers now open the required Modern surface, while legacy behavior-heavy suites explicitly select Original when they test Original geometry.
- The recorded animation journey could race active playback and used an obsolete orbit coefficient. It now pauses before authoring, opens the contextual panel, expands the selected hierarchy path, and derives drag distance from the current orbit contract.
- The expanded export-format browser test exceeded its prior summary-bank route budget. The existing narrow route was retained and its explicit budget adjusted; no redundant group was added.

## Verification

- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 31 focused groups, a 43.0 KiB default context, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed project-integrity/context and synchronization guards, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 353/353 frontend units across 61 files, Rust fmt/clippy/check, and 10/10 Rust tests.
- `npm run test:e2e --workspace frontend`: passed 85/85 browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 recorded real-model animation and skinning journey.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 3/3 strict visual cases, including Original SMF.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the Tauri release build, 10/10 Rust tests, and 12/12 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.
- Final test typecheck, context validation, and `git diff --check` passed immediately before commit.

## Blockers and verified limits

There is no code, test, documentation, context-routing, or local verification blocker in the reviewed scope.

- Local Node 26.5 emits Playwright 1.60's upstream `[DEP0205] module.register()` warning while the suites remain green; the warning does not originate in application code.
- Universal third-party FBX behavior, unreferenced material-map inference, producer-specific influences beyond Three.js's four retained weights, true OS-dialog automation, and future evidence-driven strict-baseline refreshes remain explicit limits in `APP_STATE.md`, not hidden implementation TODOs.

## Next direction

The active backlog is closed. Add a new What/Why/When/Where/How/Done-when item only when new product evidence, an external compatibility fixture, or a requested feature creates executable work.
