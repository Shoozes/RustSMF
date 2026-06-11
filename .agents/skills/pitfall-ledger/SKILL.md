---
name: pitfall-ledger
description: Document recent regressions, failed attempts, pitfalls, and durable fixes in question-and-answer form during integrity passes, bug hunts, model/runtime changes, test hardening, or repo state updates. Use when Codex needs to preserve what failed, why it failed, where it happened, how it was fixed, how effective the fix was, and whether the context is still relevant or obsolete.
---

# Pitfall Ledger

## Purpose

Use this skill to turn recent debugging context into a compact, ranked regression-prevention ledger. The output should help a future agent avoid repeating bad paths while still filtering out stale context.

## Workflow

1. Identify recent pitfalls from diffs, test failures, logs, docs, runtime artifacts, and user reports.
2. Write each pitfall in Q&A form using the required fields below.
3. Score each solution with the effectiveness rubric.
4. Run the relevance/rerank check.
5. Update the pitfall ledger doc, `summary_bank.json`, and the integrity-pass workflow if the lesson should become part of routine review.
6. Keep obsolete context only when it explains a retired path or a decision boundary. Mark it clearly as superseded.

## Required Q&A Shape

Use this structure for each entry:

```md
### Q: What pitfall are we preventing?
**What:** One concrete failure mode.
**Why it happened:** Root cause, not just symptom.
**Where:** Files, commands, docs, tests, runtime artifacts, or external dependency.
**How to catch it:** Test, log, visual check, command, assertion, or review step.
**Solutions tried:** Short ranked list with outcome.
**Current solution:** The active fix or mitigation.
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

## Reference

Use `references/pitfall_record_template.md` when creating or updating ledger entries.
