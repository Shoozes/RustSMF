---
name: monolith-modularization
description: Find, rank, and safely split monolithic code files into focused modules during integrity passes, scalability reviews, context-bank cleanup, grep/summary-bank organization, or requests to reduce large-file context pressure. Use when Codex needs to identify high-line-count files, decide whether a split is justified, preserve public imports/exports, update docs/TODO/summary_bank.json, and verify behavior after modularization.
---

# Monolith Modularization

## Purpose

Use this skill to reduce context-heavy files without turning a working codebase into a refactor project. Follow the repo priority order: Safety, Courtesy, Show, Efficiency.

## Workflow

1. Rank candidates before editing.
   - Count tracked code files by lines and ignore generated/dependency folders.
   - Prefer `rg --files`; use native shell line counting.
   - Record the top candidates and the selected split boundary in `docs/CODEX_WORKFLOW.md`, `NOTES.md`, or another existing project-state doc.

2. Choose a safe boundary.
   - Split only when there is a clear responsibility boundary such as runtime asset sync, generation orchestration, validation helpers, planner logic, view shell, widget rendering, or domain templates.
   - Prefer leaf/helper extraction before core state or route rewrites.
   - Keep the existing public import surface compatible when tests or callers import from the old module.
   - Do not move unrelated code just because it is nearby.

3. Preserve behavior while moving code.
   - Move code mechanically first, then improve names only where needed for the new boundary.
   - Keep data contracts, node IDs, route paths, test IDs, workflow names, and exported function names stable unless the user explicitly asked for a behavior change.
   - If a module is too coupled to split cleanly, add a TODO subtask describing the next prerequisite instead of forcing it.

4. Update context maps and docs.
   - Add or update focused `summary_bank.json` groups for the new modules.
   - Keep groups narrow enough that future grep/context pulls find the right files.
   - Update `docs/CODEX_WORKFLOW.md` or `NOTES.md` when the split changes current architecture.
   - Add pitfall-ledger entries only when the split exposed a regression-prone failure mode or took multiple attempts.

5. Verify the split.
   - Run the smallest relevant compile/test slice immediately after the move.
   - Then run broader checks proportional to risk: frontend build for TypeScript moves, backend pytest for Python route/helper moves, browser slices for UI/generation flows.
   - Run the summary-bank path guard when `summary_bank.json` changes.
   - Report any skipped live/model checks explicitly.

## Candidate Heuristics

Treat files as candidates, not automatic targets, when they meet one or more:

- More than about 500 lines and multiple responsibilities.
- Repeatedly appears in unrelated summary-bank groups.
- Hard to grep because UI, orchestration, validation, and persistence are mixed.
- Blocks a planned feature because a change requires loading a broad file.
- Already has nearby tests that can protect a mechanical split.

Avoid splitting when:

- The file is long because it is declarative data with stable local structure.
- The module is tightly coupled and lacks enough tests to prove a safe move.
- A split would create circular imports, unclear ownership, or many pass-through barrels.

## Recommended Split Order

1. Standalone helpers with existing tests.
2. UI shell versus orchestration hooks.
3. Domain-specific planners, validators, or serializers.
4. Store slices only after orchestration is thin and fixtures are stable.
5. Backend route modules only after helper extraction clarifies request/response contracts.

## Line Count Command

PowerShell:

```powershell
$rows = @()
$files = rg --files source scripts .tools .agents | Where-Object {
  $_ -match '\.(ts|tsx|py|js|mjs)$' -and
  $_ -notmatch '(^|[\\/])artifacts[\\/]' -and
  $_ -notmatch '(^|[\\/])dist[\\/]' -and
  $_ -notmatch '(^|[\\/])node_modules[\\/]'
}
foreach ($f in $files) {
  $count = (Get-Content -LiteralPath $f | Measure-Object -Line).Lines
  $rows += [PSCustomObject]@{ Lines = $count; Path = $f }
}
$rows | Sort-Object Lines -Descending | Select-Object -First 40 | Format-Table -AutoSize
```

## Done Criteria

- The old file is smaller and has a clearer responsibility.
- New module names match the extracted responsibility.
- Existing imports still work or are intentionally updated.
- Focused tests, build, and appropriate browser/backend checks pass.
- `summary_bank.json` and the relevant project docs describe the new boundary and remaining candidates.
