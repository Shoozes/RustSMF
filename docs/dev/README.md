# Developer Docs

Keep developer docs concise and evidence-based. This repo has one current-state doc, one backlog, one pitfall ledger, and one context bank.

## Durable Homes

- `APP_STATE.md`: what the app currently does, architecture ownership, limits, and verified commands.
- `TODO.md`: active work only. Use `Backlog status: empty` when no work remains; otherwise every task states What, Why, Where, When, How, Done when, and Verification.
- `HISTORY.md`: completed work and durable verification evidence.
- `review.md`: latest concise repo/app integrity snapshot, linking the dated command record in `HISTORY.md`.
- `PITFALL_LEDGER.md`: repeated or high-risk failures, written as prevention records rather than progress history.
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

Avoid copying the same completed-work narrative into multiple docs. Link to the durable owner instead. Canonical verification commands and launch instructions are centralized in APP_STATE.md "Primary commands" / "Verification" (other surfaces link or summarize to reduce duplication of lists).

Exact discovered test counts belong in dated verification evidence, not repeated current-state prose. Gated backlog tasks must identify the missing external evidence or interactive lane and define completion conditions; completed items move to `HISTORY.md`.
