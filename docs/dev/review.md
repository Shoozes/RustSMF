# RustSMF Review Snapshot

Last reviewed: 2026-08-01

This is the latest integrity-pass evidence. `APP_STATE.md` owns current behavior, `TODO.md` owns active work, `HISTORY.md` owns completed work, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused context routing.

## Scope and outcome

The pass covered current-state docs, local skill alignment, context routing, SMF bounds/fidelity, skin authoring, viewport timing, native I/O, async ownership, controller wiring, FBX import/export compatibility, tests, verification commands, and main-branch hygiene.

The active P1 browser-evidence and P2 independent-FBX items are complete. No broken runtime relative import/export was found in the reviewed graph. The implementation remains intentionally concentrated in `useLoadModel.ts` and `ThreeViewport.tsx`; narrow controller, codec, brush-index, skinned-position, and FBX-writer boundaries have focused tests and explicit disposal/ownership rules.

## Durable changes

- Frontend unit discovery is recursive and deterministic; new `src/**/*.test.ts` files enter the canonical unit gate automatically.
- Skin sampling fails closed on invalid public Three.js state, caches only across stable pose/attribute signatures, and exposes actionable diagnostics.
- SMF browser/native boundaries reject malformed counts, sections, strings, ranges, non-finite values, and oversized work before allocation or save; native blocking file work is size-bounded and offloaded.
- Latest-intent load/export ownership, animation controller activation, resize cleanup, and native cancel/no-op behavior now have current-head regression coverage.
- FBX texture loading waits for loader-owned asynchronous resources. The vendored FBX writer emits typed integer arrays and required layer names, preserving Three.js roundtrip behavior while making Blender import valid.
- A Blender-authored independent FBX fixture, generator, provenance record, validator, browser roundtrip, and ignored app-output artifact provide a second-application compatibility proof without broadening claims beyond Blender 5.0.0.
- The follow-up audit reconciled the legacy selected-bone weight shaders with the current non-destructive vertex-color preview and fixed the browser harness fallback, favicon, IK drag reuse, and animated-fixture brush determinism.
- The final audit also fixed null-coordinate readiness and newly mounted IK-handle transform timing; the focused IK case passed five repeated runs before the complete browser rerun.
- The weight-preview state audit now snapshots the source color attribute and every material's prior `vertexColors` mode, with focused coverage for existing colors, absent colors, and invalid-selection restoration.
- The SMF codec client now rechecks abort state after worker handler setup and before `postMessage`; the setup-race regression proves cancellation terminates without posting stale work.
- The follow-up implementation pass now cancels zero-valued viewport RAF handles, coalesces browser file-picker focus timers, clears FBX texture wait timers on early settle, and indexes skin-history snapshots by mesh/vertex key instead of repeatedly scanning the post-edit list.
- Added focused coverage for the shared animation-frame guard and skin snapshot index; the unit discovery contract now reports 42 files and 254 tests.
- Repo-local `monolith-modularization` and `pitfall-ledger` skills were reconciled with the current global guidance while the RustSMF-specific `summary-bank-json` skill remained intentionally specialized.

## Verification evidence

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed after final code and documentation changes; context validation, lint/type/build/chunk gates, dynamic units, and Rust fmt/Clippy/tests/check are green.
- Historical `npm.cmd run test:e2e -- --reporter=line` with a process-local approved system Chrome executable: 55/55 passed across all eight browser suites after the IK audit fix.
- `npm.cmd run test:visual-strict -- --reporter=line` with the same browser override: 2/2 passed.
- Canonical `desktop-smoke`: optimized no-bundle release build, Rust tests, and native IPC browser coverage passed.
- `npm.cmd audit --omit=optional`: found 0 vulnerabilities (the managed sandbox could not reach the advisory endpoint; the same read-only command passed through the approved external runtime).
- `npm.cmd run test:unit`: 254/254 passed across 42 discovered unit-test files, including the worker setup-cancellation, weight-preview restoration, skin snapshot-index, and animation-frame cases.
- Focused implementation slices: skin weights 21/21, FBX loader 6/6, and animation-frame cleanup 2/2.
- Focused SMF codec client test: 10/10 passed, including cancellation during worker setup before `postMessage`.
- Focused lifecycle browser rerun: all 8 test bodies reached the intended flows, but each case failed only during managed Chrome teardown with `browserContext.close: spawn EPERM`; the runner and preview listener were cleaned up, so the prior complete 55/55 browser run remains authoritative.
- Blender 5.0.0 validator passed the committed independent fixture and the app-exported roundtrip. Both reports contained one mesh, two bones, weighted groups, animation curves, and an embedded material texture.
- Focused checks: FBX/skin units 26/26 passed; independent FBX browser flow passed; `git diff --check` passed.

## Environment notes

The bundled Playwright Chromium executable is rejected by the managed Windows process boundary with `spawn EPERM` before app execution. Direct launch of the installed system Chrome succeeds, so the current evidence uses the process-local `RUSTSMF_PLAYWRIGHT_EXECUTABLE` override. This does not alter app security settings, sandbox policy, PATH, or committed configuration. The current managed sandbox checkup is `blocked` only for the diagnostic `python_unavailable` finding; PowerShell 7, Windows PowerShell, Git, Node, npm, context validation, and the app verification lane remain available. Python is optional for the Blender fixture lane and is not an app-runtime dependency.

Non-blocking test/tool warnings include Node's Playwright `DEP0205`, the managed-path Cargo canonicalization warning, the intentional mocked dialog-open warning in native fallback coverage, and one direct native-suite Node/Windows `UV_HANDLE_CLOSING` assertion printed after 9/9 tests had passed with exit code 0. The canonical desktop-smoke run completed without a failure; final cleanup left no listener on the project ports 5173 or 1420. None caused a failed or skipped test.

A later focused `skin.spec.ts` rerun with the approved system Chrome reached all four test bodies but hit the known managed Windows `browserContext.close: spawn EPERM` boundary during teardown and left a stale preview server that was removed by the launcher cleanup. The run is treated as harness-blocked, not as new app evidence; the previously completed full 55/55 browser run remains the authoritative browser result for this commit line.

The current focused lifecycle rerun shows the same harness-only boundary across all eight lifecycle cases. It reached each test body, then failed at `browserContext.close: spawn EPERM`; the exact runner and preview PIDs were stopped and `netstat` confirmed no listener remained on port 5173. No new product failure was observed.

The latest full Playwright rerun with the same process-local system Chrome override reached all 55 test bodies across all eight suites, but every case failed during managed `browserContext.close` teardown with `spawn EPERM`. The preview listener was stopped afterward. This does not replace the earlier 55/55 pass as product evidence, but it confirms the teardown boundary is still environment-dependent and must remain visible in handoff reports.

## Remaining limits

- FBX compatibility is proven for the covered Three.js paths and Blender 5.0.0 target; other exporters/importers can differ.
- True OS-dialog automation remains separate from deterministic Tauri IPC mocks.
- Direct Tauri/Vite launches have fewer Windows process-tree cleanup guarantees than `run.ps1`/`run.bat`.

These are intentional current-state limits, not open integrity TODOs. New work should be added to `TODO.md` only with a measurable done condition and verification command.
