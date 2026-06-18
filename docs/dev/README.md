# Developer Docs

Keep developer docs concise and evidence-based. This repo has one current-state doc, one backlog, one pitfall ledger, and one context bank.

## Durable Homes

- `APP_STATE.md`: what the app currently does, architecture ownership, limits, and verified commands.
- `TODO.md`: active work only. Each concern should state what, why, where, when, how, subtasks, and done criteria when applicable.
- `PITFALL_LEDGER.md`: repeated or high-risk failures, written as prevention records rather than progress history.
- `../../summary_bank.json`: context groups for features, subsystems, and issue clusters.
- `../../source/frontend/tests/README.md`: frontend test policy and Playwright coverage map.

## Update Rules

- Update `APP_STATE.md` only when current behavior, architecture, verification, or limits change.
- Update `TODO.md` when work remains or a completed change materially changes the active backlog.
- Update `PITFALL_LEDGER.md` when a failure mode is likely to recur or took investigation to understand.
- Update `summary_bank.json` when paths move, groups become stale, or a new feature/issue needs focused context.
- Run `python scripts/verify-context-bank.py` after editing the context bank; `pwsh -File run.ps1 -Task verify` includes this check.

Avoid copying the same completed-work narrative into multiple docs. Link to the durable owner instead. Canonical verification commands and launch instructions are centralized in APP_STATE.md "Primary commands" / "Verification" (other surfaces link or summarize to reduce duplication of lists).
