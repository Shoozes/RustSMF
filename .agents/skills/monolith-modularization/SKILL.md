---
name: monolith-modularization
description: Find, rank, and reduce context-heavy code, documentation, tests, scripts, configuration, and generated artifacts without forcing unnecessary splits. Use during integrity passes, scalability reviews, summary-bank cleanup, large-file or context-clog investigations, test-suite organization, canonical-doc consolidation, or modularization work that must preserve imports, anchors, test discovery, public contracts, and source-of-truth ownership.
---

# Monolith Modularization

## Goal

Reduce the context cost and change risk of oversized artifacts while preserving one clear owner for every contract. Size is a triage signal, not permission to split.

## Fast Route

1. Measure tracked text by bytes, approximate tokens, lines, longest line, artifact type, and context-bank fan-out.
2. Rank files by actual context pressure. Do not use line count alone.
3. Choose the lightest mitigation that fixes the observed problem: targeted loading, narrower context routing, formatting, helper/fixture extraction, or physical splitting.
4. Preserve public contracts and update only the owning docs, tests, and context routes.
5. Run the smallest relevant check, then the repository's broader gate when structural behavior changed.

## Workflow

1. Rank candidates before editing.
   - Measure tracked source and documentation by context pressure, not lines alone.
   - Prefer `rg --files`; use native shell line counting.
   - Record the top candidates and selected boundary in the owning current-state/review doc when the decision affects architecture.

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
   - Update the owning current-state/review doc when the split changes architecture; use `docs/dev/APP_STATE.md` and `docs/dev/review.md` in RustSMF.
   - Add pitfall-ledger entries only when the split exposed a regression-prone failure mode or took multiple attempts.

5. Verify the split.
   - Run the smallest relevant compile/test slice immediately after the move.
   - Then run broader checks proportional to risk: frontend build for TypeScript moves, backend pytest for Python route/helper moves, browser slices for UI/generation flows.
   - Run `pwsh -NoProfile -File .\run.ps1 -Task context` when `summary_bank.json` changes.
   - Report any skipped live/model checks explicitly.

## Mitigation Ladder

Stop at the first level that resolves the context or maintenance problem:

1. Load narrowly with `rg`, symbols, headings, or a focused test filter.
2. Narrow the context-bank group and remove unrelated docs/tests.
3. Reformat dense human-authored text so headings and paragraphs are retrievable.
4. Extract reusable helpers, fixtures, tables, or references with an obvious owner.
5. Split the physical artifact along a stable responsibility boundary.

Do not create summary documents that repeat current state, TODOs, history, or API contracts.

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

- The observed context or maintenance problem is reduced, even if no file was split.
- The old file is smaller when a physical split was justified and has a clearer responsibility.
- New module names match the extracted responsibility.
- Every resulting artifact has one clear responsibility and authority.
- Existing imports, anchors, test discovery, schemas, commands, and user-facing contracts remain compatible or are intentionally migrated.
- Focused tests, build, and appropriate browser/backend checks pass.
- `summary_bank.json` and the relevant project docs describe the new boundary and remaining candidates.
