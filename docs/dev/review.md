# RustSMF Review Snapshot

Last reviewed: 2026-08-08

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

The review covered the dirty worktree on local `main` at `27d6a9cbde3474797832ab5c5aa2cdf758dbf315`, current-state docs, source/test import surfaces, async and replacement ownership, static-root authoring, native payload validation, marker scans, and summary-bank organization. Existing user changes were preserved.

The concrete integrity defects found and repaired were static-root preparation and the missing P1 animation/skin authoring safety contracts. Static-root preparation now stores a reversible rig-history transaction, restores original skin attributes on undo, reapplies the same objects on redo, and is included in the focused Rig route. Animation trim/lock policy and skin diagnostics/paint-pose policy now have pure contracts, UI telemetry, guarded runtime behavior, export-aware state, and focused regression coverage.

No unresolved TypeScript import/export surface, production `TODO`/`FIXME`/stub marker, unchecked production `any`, or Rust production panic placeholder was found in the scoped scan. Rust `expect`/`panic` matches are test-only fixtures/assertions. The untracked `source/test-assets/female256_mix2.fbx` is not referenced by source, tests, docs, or the context bank; it remains untouched as user-owned workspace data and should either be integrated deliberately or removed by its owner.

## Current verification

- `npm.cmd run verify` from `source`: passed. This includes lint coverage/ESLint, app and test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 305/305 frontend units across 50 files, Rust fmt/clippy/check, and 10/10 Rust tests.
- `node scripts/verify-context-bank.mjs`: passed with 23 groups, 36.1 KiB default orientation, and zero warnings.
- `node --test scripts/context-bank.test.mjs`: 7/7 passed.
- `npm.cmd run test:e2e:list` from `source/frontend`: discovered 63 cases across eight suites, including trim/lock and skin diagnostics/pose-mode regressions.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: attempted but blocked before test bodies by managed Chromium `browserType.launch: spawn EPERM`; this is not browser-green evidence. The owner session was stopped after ports 5173 and 1420 were verified clear.
- `git diff --check`: passed.

## Remaining risks and next direction

- Add browser/export proof for static OBJ/FBX root preparation, including undo/redo and dirty replacement behavior; this is now explicit in the P2 model-authoring backlog item.
- `.gltf` remains self-contained only and OBJ does not resolve neighboring MTL/texture sidecars; keep the bounded resource-bundle design in TODO before advertising broader compatibility.
- The next actionable priority is browser/export proof for static OBJ/FBX root preparation, followed by the explicit P2 project persistence and sidecar-resource contracts. Broader model authoring and keyed IK remain documented P2 work rather than hidden stubs.
- True OS-dialog automation, managed Chromium launch, and universal third-party FBX compatibility remain evidence limits; deterministic IPC/Rust coverage and the documented Blender fixture are the current contracts.

Next implementation should start with the P2 static-root browser/export proof slice in `TODO.md`.
