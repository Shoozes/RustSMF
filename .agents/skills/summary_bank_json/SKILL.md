---
name: summary_bank_json
description: Maintain RustSMF summary_bank.json context groups with narrow feature, subsystem, issue, and workflow paths.
---

# RustSMF Summary Bank

## Purpose

`summary_bank.json` is a focused context router. It should help agents and developers load the files needed for a task without pulling generated output, dependency folders, or the full old-src reference tree.

Use the global `summary-bank-context` skill for general policy. This repo-local skill adds RustSMF-specific checks and ownership.

## Current Durable Docs

- `docs/dev/APP_STATE.md`: current behavior, architecture, limits, and verified commands.
- `docs/dev/TODO.md`: active backlog and compact integrity findings.
- `docs/dev/PITFALL_LEDGER.md`: durable regression-prevention records.
- `docs/README.md` and `docs/dev/README.md`: doc routing policy.

Do not put progress logs or TODO prose into the context bank.

## Group Rules

- Prefer `paths` over `files`; keep `files` empty unless a tool requires legacy support.
- Keep defaults minimal. Defaults should orient a normal task, not load every group.
- Use stable prefixes: `feature__`, `subsystem__`, `issue__`, `investigation__`, `workflow__`.
- Include source, tests, scripts, docs, fixtures, and reference files only when they are needed to understand that group.
- Avoid broad `docs/references/old-src/**` globs. Use targeted old-src screenshots, SMF samples, or GLBtoSMF files.
- Keep ignored/runtime paths out: `node_modules`, `dist`, `target`, `runtime-data`, `playwright-report`, `test-results`, model weights, logs, caches.

## Maintenance Workflow

1. Read `AGENTS.md`, `docs/dev/APP_STATE.md`, and `docs/dev/TODO.md`.
2. Inspect the relevant group and remove stale paths before adding new ones.
3. Add or update only the narrowest useful group for the current feature, subsystem, issue, or workflow.
4. Update group `status` only when it helps future task routing.
5. Run:

```powershell
python scripts/verify-context-bank.py
python -m json.tool summary_bank.json > $null
```

`pwsh -File run.ps1 -Task verify` also runs the context-bank verifier.

## Failure Modes To Catch

- A moved doc path such as old `docs/TODO.md` remains in a current group.
- A group includes a generated report or local runtime artifact.
- Default groups become too broad for ordinary orientation.
- A glob prefix no longer exists after a folder move.
- Issue groups duplicate pitfall-ledger content instead of pointing at the files needed to investigate.
