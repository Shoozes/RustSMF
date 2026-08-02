---
name: summary-bank-json
description: Maintain RustSMF summary_bank.json routes as a project-specific overlay on the global context-bank policy, using narrow feature, subsystem, issue, investigation, and workflow groups with native validation.
---

# RustSMF Summary Bank

## Scope

Use the global `summary-bank-context` skill for general context-bank policy. This file owns only the RustSMF delta: local authority paths, supported group conventions, old-editor reference boundaries, and the native verification route.

`summary_bank.json` is a route map, not a progress log, TODO list, or second current-state document.

## Authorities and budgets

- `docs/dev/APP_STATE.md` owns current behavior, architecture, limits, and verified commands.
- `docs/dev/TODO.md` owns executable forward work and done-when conditions.
- `docs/dev/PITFALL_LEDGER.md` owns recurring regression-prevention records.
- `docs/dev/README.md` owns developer-document routing policy.
- `summary_bank.json` owns focused paths, group descriptions, and context budgets.

The current generation ceiling is `defaults.max_kb: 256`; the default `docs__orientation` group remains intentionally narrow. Treat the ceiling as room for a focused work unit, not a reason to load broad defaults. Measure expanded content, largest-file share, and fan-out before raising a group or root budget.

## Group Rules

- Use `paths`; the obsolete `files` field is rejected by the native validator.
- Keep defaults minimal. Defaults should orient a normal task, not load every group.
- Use stable prefixes: `feature__`, `subsystem__`, `issue__`, `investigation__`, and `workflow__`.
- Include source, tests, scripts, docs, fixtures, and reference files only when they are needed to understand that group.
- Route one work unit: owner implementation, nearest focused tests, exact contract/doc, and required fixtures.
- Keep broad state, history, TODO, and whole-suite verifiers out of focused groups unless the task changes them.
- Avoid broad `docs/references/old-src/**` globs. Use targeted shaders, screenshots, SMF samples, or GLBtoSMF files for a named parity question.
- Keep ignored/runtime paths out: `node_modules`, `dist`, `target`, `runtime-data`, `playwright-report`, `test-results`, model weights, logs, caches.
- Keep completed progress and forward work in their owning docs rather than the context bank.
- Archive broad legacy groups instead of loading them by default; the old-editor and former combined browser packs are archived examples.
- Do not add a repo-local copy of a global skill solely to repeat its workflow. Use `skill-repo-maintainer` for overlap decisions and retain only project-specific skill deltas.

## Maintenance Workflow

1. Read `AGENTS.md`, `docs/dev/APP_STATE.md`, `docs/dev/TODO.md`, and the relevant group before editing.
2. Inspect the relevant group and remove stale paths before adding new ones.
3. Add or update only the narrowest useful group. Keep descriptions short and status metadata purposeful.
4. Run:

```powershell
node scripts/verify-context-bank.mjs
node --test scripts/context-bank.test.mjs
```

`pwsh -NoProfile -File .\run.ps1 -Task context` runs both commands; `verify` includes the same gate.

5. Audit expanded bytes, largest-file share, repeated canonical docs, fan-out, generated share, and archived groups in defaults. The native verifier's configured budgets are authoritative.

6. If overlap is intentional, preserve the repository-supported duplicate/overlap declaration rather than silently copying the same authority into unrelated groups.

## RustSMF-specific references

- `workflow__context_bank` routes the bank, verifier, generator, controller, `AGENTS.md`, and this local skill.
- `workflow__old_editor_reference` is archived and contains only targeted weight-preview shader and screenshot parity references.
- `subsystem__smf_format_and_fidelity` and `issue__smf_resource_contract` own SMF limits and malformed-input routes; update `APP_STATE.md` and focused tests when limits change.
- `tests__quality` owns the canonical unit-discovery and verification contract; do not copy its entire harness into feature groups.

## Failure modes

- A moved current-doc path remains in a group.
- A group contains generated/runtime output or a broad old-src glob.
- Defaults include an archived group or grow beyond the narrow orientation purpose.
- A focused group duplicates a canonical doc or pitfall entry without an ownership reason.
- A local skill repeats global guidance instead of routing to its project-specific delta.

## Done when

- Every active group has existing, task-relevant paths and a clear owner.
- Defaults remain narrow and no archived group is selected by default.
- Focused groups remain within their configured budgets, with overlap and large-file pressure understood.
- `node scripts/verify-context-bank.mjs` and `node --test scripts/context-bank.test.mjs` pass after the change.
- Current-state or backlog docs are updated only when the route change changes their contract.
