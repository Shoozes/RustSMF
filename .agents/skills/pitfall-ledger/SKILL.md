---
name: pitfall-ledger
description: Record recurring repo-specific mistakes as evidence-grounded developer stories with context, observable investigation steps, ranked solutions, decision rationale, detection, and verification. Use when a bug, false claim, broken workflow, model/runtime issue, contract drift, failed attempt, or repeated Codex mistake should become regression guidance or training-ready engineering decision data.
---

# Pitfall Ledger

## Purpose

Use this skill to turn recent debugging context into a compact, ranked regression-prevention ledger. The output should help a future agent avoid repeating bad paths while still filtering out stale context.

A pitfall is not a progress note. Record observable facts, tested hypotheses, decision criteria, rejected alternatives, and verification; do not fabricate hidden reasoning or unsupported certainty.

## Owned Files

Use the repo's established ledger location, preferably `docs/dev/PITFALL_LEDGER.md`. Update `docs/dev/TODO.md`, `docs/dev/HISTORY.md`, or `summary_bank.json` only when the lesson creates unresolved prevention work, completed fix detail, or a high-risk routing need.

## Overlap Boundaries

- Use this skill for recurring mistakes and regression-prevention rules.
- Use `backlog-surgeon` for active work items.
- Use `repo-steward` for general project-state synchronization.
- Use `repo-integrity-pass` for broad audits that may discover pitfalls as one output.
- Do not store completed progress, current-state summaries, or broad review notes here.

## Workflow

1. Identify recent pitfalls from diffs, test failures, logs, docs, runtime artifacts, and user reports.
2. Reconstruct the observable developer story: starting context, symptom, competing hypotheses that were tested, evidence, turning point, decision, verification, and residual uncertainty.
3. Write each pitfall in Q&A form using the required fields below.
4. Score each solution with the effectiveness rubric.
5. Run the relevance/rerank check.
6. Update the pitfall ledger doc and context routing if the lesson should become part of routine review.
7. Keep obsolete context only when it explains a retired path or a decision boundary. Mark it clearly as superseded.

## Required Q&A Shape

Use this structure for each entry:

```md
### Q: What pitfall are we preventing?
**What:** One concrete failure mode.
**Context and constraints:** Starting identity, intended outcome, and relevant safety/product constraints.
**Why it happened:** Root cause, not just symptom.
**Where:** Files, commands, docs, tests, runtime artifacts, or external dependency.
**Evidence:** Exact observed outputs, comparisons, test failures, or artifacts.
**Developer story:** Concise chronological narrative from symptom through turning point to decision.
**How to catch it:** Test, log, visual check, command, assertion, or review step.
**Solutions tried:** Short ranked list with outcome.
**Current solution:** The active fix or mitigation.
**Decision rationale:** Why the current solution won and which tempting alternative was rejected.
**Effectiveness:** `NN/100`, label, and one-sentence rationale.
**Relevance check:** Current, watch, superseded, or retired, with reason.
**Next prevention step:** One small action if the score is below 90 or relevance is not current.
```

## Effectiveness Rubric

Score solutions on a 100 point scale:

- Evidence fit, 30 points: verified by failing/passing tests, logs, screenshots, artifacts, or live run.
- Regression prevention, 25 points: prevents recurrence through validation, tests, contracts, or capability gates.
- Maintainability, 20 points: modular, low coupling, discoverable, and consistent with repo patterns.
- User-visible quality, 15 points: improves or protects the real user flow, not only internal cleanliness.
- Cost and risk, 10 points: low runtime cost, low setup burden, no fragile environment assumptions.

Labels:

- `90-100`: durable. Keep as default guidance.
- `75-89`: good. Keep, but track remaining risks.
- `60-74`: partial. Useful mitigation, not a complete solution.
- `40-59`: weak. Diagnostic or temporary only.
- `0-39`: failed. Keep only if it prevents repeated dead ends.

## Relevance and Rerank Check

Before preserving or promoting an entry, rerank it:

1. Current code check: referenced files, symbols, tests, workflows, or configs still exist.
2. Contract check: the entry matches current product direction and public API/schema behavior.
3. Verification freshness: the entry has a recent command, artifact, or test result, or is explicitly historical.
4. Supersession check: a newer fix, removal, or design decision did not replace it.
5. Blast-radius check: the pitfall still affects a core route, setup path, app workflow, or planned feature.

Relevance labels:

- `Current`: directly applies to current code and should guide future work.
- `Watch`: applies, but conditions are narrow or verification is stale.
- `Superseded`: useful history, but a newer implementation replaced it.
- `Retired`: tied to removed behavior. Keep only as a warning not to reintroduce it.

Rerank rule:

- Sort first by relevance: Current, Watch, Superseded, Retired.
- Then sort by risk: data loss, runtime crash, user-blocking, quality regression, test-only.
- Then sort by effectiveness score descending.
- Move `Retired` entries to a historical section unless they protect against reintroducing a removed path.

## Integrity-Pass Integration

During an integrity pass:

- Scan recent failures and changed areas for undocumented pitfalls.
- Add or update Q&A entries for any fix that required more than one attempt, affected runtime/model behavior, changed contracts, or exposed a test harness weakness.
- Add summary-bank groups for high-risk issue clusters.
- Remove duplication by linking to the pitfall ledger from project state docs instead of repeating long diagnostic history everywhere.
- Keep TODO items action-oriented; do not bury unresolved prevention work inside the ledger.

## When To Add An Entry

Add or update an entry when the same mistake happens twice, docs claim behavior tests do not enforce, a mock/stub/gated surface is mistaken for shipped behavior, a route/command/schema/file-format contract drifts, a build/test/launcher/model issue recurs, or a large refactor risk needs a durable guard.

## Reference

Use `references/pitfall_record_template.md` when creating or updating ledger entries.
