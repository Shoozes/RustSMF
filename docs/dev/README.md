# Developer Docs

## Maintainer workflow and ownership

Work locally on `main`, preserve existing changes, and publish only an explicitly reviewed scope through `.tools/gitpush.ps1`. AGENTS.md and `GIT_PUBLISH.md` own the full guarded synchronization contract. Public user/contributor entry points stay in the root README and CONTRIBUTING.md.

RustSMF owns import/export, rig inspection, skin editing, retargeting, generic pose constraints, animation sampling and reproducible asset processing. `fight-game-study` owns fighter definitions, moves, candidate selection and game visual acceptance. `GaimEngine` owns scheduling, hosts, packages and target delivery. Jobs and game-specific mappings/appearance remain caller-owned; tool work reopens for a reproducible defect with a bounded noncombat fixture.

The 0.2.1 preview adds first-party MIT metadata, installed dependency notices and a project-generated sample. `docs/user/PREVIEW_0_2_1.md` owns the observed installed-app acceptance and limits; current source state and dated proof remain in APP_STATE and HISTORY. Real Windows UI checks are separate from browser and mocked IPC evidence.

Keep developer docs concise and evidence-based. This repo has one current-state doc, one backlog, one pitfall ledger, and one context bank.

### Source launcher

From the repository root, `run.bat` or `pwsh -File run.ps1` opens the numbered menu. Choose `2. Run if already installed`, or use `run.bat 2` / `pwsh -File run.ps1 -Task run` directly. `-Task dev` launches browser development.

Use the canonical launcher for close-safe sessions. Direct `npm run dev` and `npm run tauri:dev` launches are supported for ad-hoc use but do not provide the same orphan-prevention guarantees. Process ownership belongs to the launcher; stop only the processes owned by the current run.

## Durable Homes

- `APP_STATE.md`: what the app currently does, architecture ownership, limits, and verified commands.
- `TODO.md`: active work and the retained v0.2 outcome criteria. State the backlog status explicitly; use `Backlog status: empty` when no work or retained release criteria remain. Every active task states What, Why, Where, When, How, Done when, and Verification.
- `HISTORY.md`: completed work and durable verification evidence.
- `review.md`: latest concise repo/app integrity snapshot, linking the dated command record in `HISTORY.md`.
- `PITFALL_LEDGER.md`: repeated or high-risk failures, written as prevention records rather than progress history.
- `HUMANOID_POSE_REVIEW.md`: calibrated angular-review schema, CLI and diagnostic limits; candidate progress stays in HISTORY/TODO.
- `POSE_CONTACT.md`: versioned Rust support-pose correction API, calibration/sign convention, and verbatim vendoring boundary.
- `../../summary_bank.json`: context groups for features, subsystems, and issue clusters.
- `../../source/frontend/tests/README.md`: frontend test policy and Playwright coverage map.

## Update Rules

- Update `APP_STATE.md` only when current behavior, architecture, verification, or limits change.
- Update `TODO.md` when work remains or a completed change materially changes the active backlog.
- Update `review.md` after repo-wide integrity or stewardship passes; keep detailed completed changes and command ledgers in `HISTORY.md`.
- Update `PITFALL_LEDGER.md` when a failure mode is likely to recur or took investigation to understand.
- Update `summary_bank.json` when paths move, groups become stale, or a new feature/issue needs focused context.
- Keep repo-local Codex skills project-specific; use the global skill when it already owns the workflow instead of maintaining a duplicate copy.
- Run `pwsh -File run.ps1 -Task context` after editing project docs or the context bank; it checks durable-doc/TODO/portable-path/import/module contracts plus context routing. `pwsh -File run.ps1 -Task verify` includes the same validators, the main-synchronization safety regression, and application checks.
- The `source` workspace `npm.cmd run verify` owns the application/Rust gate, including the game-ready dependency guard; the root launcher adds repository documentation, context, process-ownership, and main-synchronization checks.

Avoid copying the same completed-work narrative into multiple docs. Link to the durable owner instead. Canonical verification commands and launch instructions are centralized in APP_STATE.md "Primary commands" / "Verification" (other surfaces link or summarize to reduce duplication of lists).

Exact discovered test counts belong in dated verification evidence, not repeated current-state prose. Gated backlog tasks must identify the missing external evidence or interactive lane and define completion conditions. Completed-work narratives and proof move to `HISTORY.md`; the selected release's measurable outcome criteria may remain in `TODO.md` as an explicitly completed closeout record.
