# RustSMF Review Snapshot

Last reviewed: 2026-08-09

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

The review started from clean local `main` at `65d8b9171d428c88452430c7ff13e2fa0421ae05` and covers the two repaired app regressions, their source/test import surfaces, declarative versus imperative viewport telemetry ownership, duration display precision, test-runner argument handling, current-state docs, and context routing. The current working tree contains only the integrity-pass changes recorded here; existing user-owned workspace data was preserved.

The concrete defects repaired in this follow-up were the animation duration display boundary and Skin telemetry cleanup contract. Animation duration inputs now format a bounded display string without changing stored precision. Skin pose and live-warning telemetry now have one pure mapping contract, declarative canvas attributes, and reapplication on pose/editor-mode changes while transient brush fields retain view-mode cleanup. The earlier static-root and P1 animation/skin authoring contracts remain covered by the historical review entries below.

No unresolved TypeScript import/export surface, production `TODO`/`FIXME`/stub marker, unchecked production `any`, or Rust production panic placeholder was found in the scoped scan. Rust `expect`/`panic` matches are test-only fixtures/assertions. The untracked `source/test-assets/female256_mix2.fbx` is not referenced by source, tests, docs, or the context bank; it remains untouched as user-owned workspace data and should either be integrated deliberately or removed by its owner.

The integrity scan also found that `run-unit-tests.mjs` discarded extra Node test flags, making the documented focused-unit command silently run the full set. The runner now forwards those flags while retaining deterministic discovery; the focused duration-formatting command reaches the matching test case successfully.

## Current verification

- `npm.cmd run verify` from `source`: passed. This includes lint coverage/ESLint, app and test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 307/307 frontend units across 50 files, Rust fmt/clippy/check, and 10/10 Rust tests.
- `node scripts/verify-context-bank.mjs`: passed with 24 groups, 36.6 KiB default orientation, and zero warnings.
- `node --test scripts/context-bank.test.mjs`: 7/7 passed.
- `npm.cmd run test:unit -- --test-name-pattern "animation duration formatting"` from `source/frontend`: passed with the matching duration-formatting case after argument forwarding was repaired; all 50 discovered files still load for deterministic registration.
- `npm.cmd run test:e2e:list` from `source/frontend`: discovered 63 cases across eight suites, including trim/lock and skin diagnostics/pose-mode regressions.
- The optional `npx` Playwright-CLI prerequisite is environment-blocked: the installed `npx.ps1` shim points to missing `C:\Users\jc816\AppData\Roaming\npm\node_modules\npm\bin\npx-cli.js`. The canonical repo path `npm.cmd` remains healthy (`11.17.0`), so this does not block the repository's existing Playwright test command and no global install was attempted.
- Current `npm.cmd run test:e2e -- tests/animation.spec.ts tests/skin.spec.ts --reporter=line --workers=1` from `source/frontend`: passed 13/13 with approved local process access, including the repaired duration and Skin telemetry assertions.
- Current `npm.cmd run test:e2e -- --reporter=line --workers=1` from `source/frontend`: passed 63/63 with approved local process access. The earlier unprivileged attempts that reported Chromium `browserType.launch: spawn EPERM` were sandbox launch failures before test bodies; the bounded elevated rerun closed that environment gap without installing or changing browser dependencies.
- `git diff --check`: passed.

## Remaining risks and next direction

- Add browser/export proof for static OBJ/FBX root preparation, including undo/redo and dirty replacement behavior; this is now explicit in the P2 model-authoring backlog item.
- `.gltf` remains self-contained only and OBJ does not resolve neighboring MTL/texture sidecars; keep the bounded resource-bundle design in TODO before advertising broader compatibility.
- The next actionable priority is browser/export proof for static OBJ/FBX root preparation, followed by the explicit P2 project persistence and sidecar-resource contracts. Broader model authoring and keyed IK remain documented P2 work rather than hidden stubs.
- True OS-dialog automation, managed Chromium launch, and universal third-party FBX compatibility remain evidence limits; deterministic IPC/Rust coverage and the documented Blender fixture are the current contracts.

Next implementation should start with the P2 static-root browser/export proof slice in `TODO.md`.
