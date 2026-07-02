# RustSMF Review Snapshot

Last reviewed: 2026-07-02

## Scope

Repo/app integrity pass focused on current-state docs, active backlog shape, summary-bank routing, incomplete logic markers, import/export surfaces, async/race risk notes, and verification posture. Latest implementation slice resolved the importable real-SMF strict pose roundtrip mismatch class.

## Current Findings

- Docs needing update: `docs/dev/TODO.md` needed the latest clip metadata state reflected in its review line and explicit `Done when` completion wording. `docs/dev/review.md` was referenced by repo stewardship guidance but did not exist.
- Summary bank: `summary_bank.json` validated cleanly before edits. It needed one route update so future review/stewardship tasks load this snapshot with the other state/backlog docs.
- Code scan: no production `TODO`, `FIXME`, `stub`, `todo!`, or `unimplemented!` implementation gaps were found under active source. Remaining `expect` hits are Rust app/test bootstrap paths already covered by Rust checks; no immediate broken import/export issue was found.
- Edge-case backlog: active TODOs already cover the main risk classes: viewport click/raycast parity, quad/ortho precision, async race coverage, typed interop boundaries, SMF-aware rig-editing policy, rig tool modes, and workerized SMF import/export.
- Redundancy: root README still carried dated progress narration that duplicates durable docs; it should stay a concise index plus command surface.

## Directions

- Keep implementation work in small slices from `docs/dev/TODO.md`; avoid adding new progress logs.
- For every new TODO, include What, Why, Where, When, How, Subtasks when useful, `Done when`, and Verification.
- Update `docs/dev/APP_STATE.md` only for current behavior, `docs/dev/TODO.md` only for active work, `docs/dev/PITFALL_LEDGER.md` only for recurring hazards, and `summary_bank.json` only for routing changes.
- Run `python scripts/verify-context-bank.py` after summary-bank edits and `pwsh -File run.ps1 -Task verify` before delivery when practical.

## Next Best Task

Pick the highest active user-facing risk from `docs/dev/TODO.md`: viewport click/raycast parity or quad/ortho precision, depending on whether the next session is interaction-contract or precision-editor focused.
