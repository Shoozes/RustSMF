# RustSMF History

This file is the canonical home for completed repo/app work and its durable verification record. Current behavior belongs in `APP_STATE.md`; active work belongs in `TODO.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

## 2026-08-01 — Guarded replacement, bounded history, and native I/O ownership

- Added a shared dirty predicate and accessible Cancel/Discard replacement dialog. Browser, drop, and native open paths defer byte materialization until discard is explicit; cancel, stale completion, parse failure, and native/browser errors retain the existing model and authoring state.
- Added a 512 MiB decoded SMF-memory estimate covering texture, mesh, rig, and animation allocations, with checked arithmetic and stable `SMF_DECODED_MEMORY_BUDGET_EXCEEDED` diagnostics.
- Moved native dialog ownership into Rust, authorized reads against dialog-selected canonical paths, removed the arbitrary native write-path command, and routed saves through a Rust-owned save dialog with the shared 256 MiB bound. The frontend now passes typed byte views instead of constructing an explicit number array.
- Aligned the Tauri Rust and frontend dialog-plugin declarations at 2.7.1 after the native smoke audit found the prior manifest-version drift; the frontend does not invoke the JS dialog API, but the declaration is required for Tauri's build contract.
- Added byte-aware editor and skin history limits with oldest-entry eviction, current-edit preservation, and status feedback. Editor history is capped at 64 MiB; skin history is capped at 32 MiB per direction.
- Kept mixer advancement imperative in the viewport and throttled parent timeline publication to a 50 ms display cadence, with immediate setters for scrub and playback intent changes.
- Repaired browser stress-fixture triangle metadata, made dirty-overlap tests explicitly confirm each replacement decision, and kept skin telemetry on the final collected hit so semantic validation and interaction probes remain deterministic.

### Verification

- `npm.cmd run test:unit`: 269/269 passed across 45 discovered unit-test files.
- Frontend app/test typechecks and ESLint passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed on the final tree, including context validation, build/chunk checks, 269 frontend tests, Rust fmt/clippy/check, and 10 Rust tests.
- Rust `cargo check --all-targets` and `cargo test`: 10/10 passed, including native path-authority coverage.
- `npm.cmd audit --omit=optional`: found 0 vulnerabilities.
- Current full browser run reached all 56 bodies with no product assertion failures; teardown reported only managed `browserContext.close: spawn EPERM`, and the preview listener was cleaned. Strict visual reached both bodies with the same teardown-only result.
- Current desktop smoke built the unbundled Tauri executable and passed all 10 Rust tests; its native IPC browser phase was stopped after managed teardown failed to complete, with no listener left behind.

## 2026-08-01 — Restored validated GLB/FBX-to-SMF conversion

- Repaired the non-SMF converter's space contract: mesh positions/normals/tangents are baked once into model-root Three space, the binary serializer owns the single Three-to-SMF conversion, and source-root transforms are removed exactly once.
- Captured bind and sampled bone poses as root-relative world dual quaternions so nested parent transforms survive SMF hierarchy reconstruction.
- Replaced direct quaternion-component interpolation with cloned Three animation-mixer sampling and stable frame-time collection.
- Restored compatible non-SMF SMF export and roundtrip actions while retaining diagnostic blocks for static roots, scale tracks, incomplete skin data, semantic failures, and unsupported structure.
- Added numeric parity tests for translated/rotated mesh transforms, nested bind matrices, mixer quaternion interpolation, and the app-facing conversion candidate.

### Verification

- Focused converter/candidate/coordinate slice: 58/58 passed.
- App and test typechecks passed.
- Targeted browser bodies reached the restored conversion assertions; managed Windows `browserContext.close: spawn EPERM` still blocked clean teardown, so no new browser-green claim is made.

## 2026-08-01 — Conversion safety gate and shared model boundaries

- Fail-closed the app-facing GLB/FBX-to-SMF candidate and SMF roundtrip action with `SMF_NON_SOURCE_CONVERSION_UNVERIFIED` after confirming the isolated converter did not yet prove coordinate, rig-space, or animation spatial parity.
- Kept the low-level Three-to-SMF builder available only for focused parity work and updated browser/unit contracts so source-SMF export remains enabled while non-SMF sources use GLB/FBX output.
- Added `smfSemantics.ts` as the shared finite/relational `ImportedSmf` validator for parser, worker fallback, and serializer boundaries; added checks for malformed mesh/skin references, rig cycles, animation times, DQ shape, and texture payloads.
- Fixed constructed SMF node-list parent resolution when a child precedes its parent, and added the regression test.
- Added one 256 MiB model-input limit shared by browser metadata, native/test-injected bytes, and SMF binary input/output; oversized browser files are rejected before `File.arrayBuffer()`.
- Reconciled app/user/test state docs, active TODO done-whens, summary-bank routing, and pitfall-ledger entries.

### Verification

- Focused conversion candidate/converter, semantic-validation, and model-input slice: 34/34 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context routing, lint, app/test typechecks, production-any/build/chunk gates, 259 frontend units across 43 files, and 9 Rust tests are green.
- The affected five-case browser slice reached all targeted test bodies, but managed `browserContext.close: spawn EPERM` occurred during teardown; no assertion failure was emitted and ports 5173/1420 were clear after exact test-process cleanup. The result is harness-blocked, not product-green browser evidence.

## 2026-08-01 — Lifecycle cleanup and skin-history indexing

- Made viewport RAF cleanup explicit for zero-valued handles and cleared both frame refs after cancellation.
- Coalesced and canceled browser file-picker focus timers, and canceled FBX texture wait timers as soon as texture loading settles.
- Replaced repeated linear skin-history snapshot searches with a shared mesh/vertex key index; added focused coverage for the indexing contract.

### Verification

- Focused skin unit slice: 21/21 passed; FBX loader slice: 6/6 passed; animation-frame slice: 2/2 passed.
- Frontend app and test typechecks passed; ESLint passed after the timer guard correction.
- Latest system-Chrome Playwright run reached all 55 test bodies but was blocked only by managed teardown `browserContext.close: spawn EPERM`; the earlier complete 55/55 run remains the authoritative browser result for this environment.

## 2026-08-01 — Worker setup cancellation and guidance alignment

- Hardened the SMF codec client against an abort arriving after worker handlers are installed but before the request is posted. The client now rechecks the signal, skips stale `postMessage` work, and safely clears an uninitialized timer during early cleanup.
- Added a focused regression test and updated the current-state/test-contract/context-bank docs. The repo-local modularization and pitfall skills now include the latest global workflow guidance without replacing the RustSMF-specific summary-bank rules.

### Verification

- Focused SMF codec client test: 10/10 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context validation, lint, typechecks, build/chunk guards, 251 frontend units, and 9 Rust tests are green.

## 2026-08-01 — Weight-preview state restoration audit

- Fixed selected-bone weight preview cleanup so it restores the source color attribute and each material's prior `vertexColors` mode instead of forcing materials to `false`.
- Added focused unit coverage for existing source colors, models without source colors, and invalid selected-bone cleanup. The test runner now discovers 41 files and reports 250 passing frontend unit tests.
- Updated `APP_STATE.md`, the frontend test contract, the legacy shader parity map, the pitfall ledger, and `summary_bank.json` to keep the current behavior and source route explicit.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context, lint, typechecks, build/chunk guards, 250 frontend units, and 9 Rust tests are green.
- Focused weight-preview unit test: 3/3 passed.
- A focused four-case skin browser rerun reached its test bodies but was blocked during managed Chrome teardown by `browserContext.close: spawn EPERM`; the prior complete 55/55 browser run remains the authoritative browser result, and the stale server was cleaned up.

## 2026-08-01 — Follow-up browser and legacy-shader audit

- Corrected the Playwright executable override to use `use.launchOptions`, where Playwright actually consumes it; the managed Windows fallback now runs against an explicitly approved installed Chrome executable without changing app configuration.
- Added a served SVG favicon, reused the viewport IK drag helper in visual coverage, froze animated skin fixtures for deterministic brush sampling, and widened probe points to cover narrow quad-view geometry.
- Audited the old selected-bone weight shaders and recorded their four-slot/HSV behavior alongside the current export-safe vertex-color equivalent. The legacy shader paths remain reference material, not an untracked implementation stub.
- Fixed the workspace-transition IK readiness race: browser telemetry now rejects absent coordinates, and newly mounted target handles refresh their world matrix before raycasting. The focused IK case passed 5/5 repeated runs; the full browser suite passed 55/55.
- Completed the dependency audit with `npm.cmd audit --omit=optional`: 0 vulnerabilities reported.

## 2026-08-01 — Integrity and external FBX compatibility pass

- Replaced the hardcoded frontend unit-test list with deterministic recursive discovery.
- Hardened posed skin-brush sampling, invalid skin diagnostics, cache invalidation, viewport resize cancellation, animation snapshot/controller ownership, and latest-intent load/export timing.
- Added bounded SMF reader/writer sections, counts, strings, numeric/range checks, output preflight, native 256 MiB I/O limits, blocking-task adapters, UNC normalization, explicit CSP, and truthful native header-check wording.
- Added current-head browser regressions for skin cancellation/no-op edits, native export cancellation, indexed geometry, material policy, and independent FBX compatibility.
- Added an independently authored Blender 5.0.0 skinned, textured, animated FBX fixture with provenance and a repeatable external validator. The fixture is intentionally test-only and carries no third-party source asset.
- Corrected FBX export integer-array typing and layer metadata so the vendored binary writer is accepted by Blender as well as Three.js. FBX texture loading now waits on the loader-owned resource manager before attaching the scene and removes unavailable maps before render.
- Updated the local Codex skill pack, pitfall ledger, current-state docs, history, and context routing to remove stale paths and repeated progress prose.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed after the final changes.
- `npm.cmd run test:e2e -- --reporter=line` with the process-local `RUSTSMF_PLAYWRIGHT_EXECUTABLE` override: 55/55 passed.
- `npm.cmd run test:visual-strict -- --reporter=line` with the same browser override: 2/2 passed.
- `npm.cmd run tauri:build:smoke`: optimized no-bundle Tauri release executable built successfully.
- Canonical `desktop-smoke`: release build, Rust tests, and native IPC browser coverage passed.
- Blender 5.0.0 validated both the committed independent fixture and the app-exported roundtrip: one mesh, two bones, weighted groups, animation curves, embedded material texture.
- `git diff --check`: passed.
