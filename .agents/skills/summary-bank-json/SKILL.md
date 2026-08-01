---
name: summary-bank-json
description: Maintain RustSMF summary_bank.json context groups with narrow feature, subsystem, issue, investigation, and workflow paths while preserving global context-bank size, fan-out, archive, and overlap policy.
---

# RustSMF Summary Bank

## Goal

`summary_bank.json` is a focused context router. It should help agents and developers load the files needed for a task without pulling generated output, dependency folders, or the full old-src reference tree.

Use the global `summary-bank-context` skill for general policy. This repo-local skill adds RustSMF-specific checks, ownership, and the native verifier route.

## Current Durable Docs

- `docs/dev/APP_STATE.md`: current behavior, architecture, limits, and verified commands.
- `docs/dev/TODO.md`: active backlog and compact integrity findings.
- `docs/dev/PITFALL_LEDGER.md`: durable regression-prevention records.
- `docs/README.md` and `docs/dev/README.md`: doc routing policy.

Do not put progress logs or TODO prose into the context bank.

## Group Rules

- Use `paths`; the obsolete `files` field is rejected by the current validator.
- Keep defaults minimal. Defaults should orient a normal task, not load every group.
- Use stable prefixes: `feature__`, `subsystem__`, `issue__`, `investigation__`, `workflow__`.
- Include source, tests, scripts, docs, fixtures, and reference files only when they are needed to understand that group.
- Avoid broad `docs/references/old-src/**` globs. Use targeted old-src screenshots, SMF samples, or GLBtoSMF files.
- Keep ignored/runtime paths out: `node_modules`, `dist`, `target`, `runtime-data`, `playwright-report`, `test-results`, model weights, logs, caches.
- Keep completed progress, forward work, and broad review prose in their owning docs rather than the context bank.
- Keep defaults conservative; do not add every new group to normal orientation.
- Archive broad legacy groups instead of loading them by default, using the repository's existing archive fields.

## Maintenance Workflow

1. Read `AGENTS.md`, `docs/dev/APP_STATE.md`, and `docs/dev/TODO.md`.
2. Inspect the relevant group and remove stale paths before adding new ones.
3. Add or update only the narrowest useful group for the current feature, subsystem, issue, or workflow.
4. Update group `status` only when it helps future task routing.
5. Run:

```powershell
node scripts/verify-context-bank.mjs
node --test scripts/context-bank.test.mjs
```

`pwsh -File run.ps1 -Task context` runs both commands; `verify` includes the same gate.

6. Audit expanded bytes, largest-file share, repeated canonical docs, fan-out, generated share, and archived groups in defaults. The native verifier's configured budgets are authoritative.

7. If overlap is intentional, preserve the repository-supported duplicate/overlap declaration rather than silently copying the same authority into unrelated groups.

## Artifact-Aware Routing

- Include the owner implementation, nearest focused tests, exact contract/doc, and required fixtures.
- Avoid whole source trees, unrelated integration suites, broad barrels, lockfiles, generated schemas, minified assets, model files, and raw runtime evidence.
- Route one work unit at a time; a few dense files can cost more context than many small files.

## Overlap Boundaries

- Use this skill only for context banks, route maps, and focused context packs.
- Use `core-skill-gate` for skill selection and context-load limits.
- Use `repo-steward` for broader project-state docs.
- Use `repo-integrity-pass` when route drift is one part of a repo-wide audit.
- Use `skill-repo-maintainer` when the overlap is between Codex skills rather than repo files.

## Failure Modes To Catch

- A moved doc path such as old `docs/TODO.md` remains in a current group.
- A group includes a generated report or local runtime artifact.
- Default groups become too broad for ordinary orientation.
- A glob prefix no longer exists after a folder move.
- Issue groups duplicate pitfall-ledger content instead of pointing at the files needed to investigate.
- A large canonical document is repeated across many groups without an ownership reason.
