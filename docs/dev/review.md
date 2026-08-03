# RustSMF Review Snapshot

Last reviewed: 2026-08-03

This is the latest integrity-pass evidence. `APP_STATE.md` owns current behavior, `TODO.md` owns active work, `HISTORY.md` owns completed work, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused context routing.

## Scope and outcome

The pass covered current-state docs, local skill alignment, context routing, SMF bounds/fidelity, non-SMF conversion safety, browser/native input boundaries, skin authoring, viewport timing, native I/O, async ownership, controller wiring, FBX import/export compatibility, tests, verification commands, and main-branch hygiene.

The review found one high-risk correctness issue in the isolated non-SMF-to-SMF converter: coordinate conversion and bone space ownership were not proven by spatial parity fixtures. This pass repaired the boundary and added numeric mesh, nested-rig, matrix, and mixer-sampled animation coverage before restoring the app-facing action. No broken runtime relative import/export was found in the reviewed graph. The implementation remains intentionally concentrated in `useLoadModel.ts` and `ThreeViewport.tsx`; narrow controller, codec, semantic-validator, model-input, brush-index, skinned-position, and FBX-writer boundaries have focused tests and explicit disposal/ownership rules.

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
- Added pose-based animation creation from the canonical rest pose or current bone pose, with bounded duration, complete named-bone position/quaternion tracks, zero-source-clip support, and one reversible workspace transaction.
- Separated Skin Set mode's target weight from brush flow/falloff, preserving incremental Add/Subtract semantics while keeping target edits bounded and export-safe.
- Reworked the display-only Skin pts overlay to refresh posed skinned vertices during the viewport loop without serializing a runtime mesh reference; focused tests cover animated refresh and disposal ownership.
- Added focused animation-creation/controller, skin-target, skin-overlay, and animation browser regression coverage; the unit discovery contract now reports 46 files and 275 tests.
- The follow-up implementation pass now cancels zero-valued viewport RAF handles, coalesces browser file-picker focus timers, clears FBX texture wait timers on early settle, and indexes skin-history snapshots by mesh/vertex key instead of repeatedly scanning the post-edit list.
- Added focused coverage for the shared animation-frame guard and skin snapshot index; the unit discovery contract now reports 45 files and 269 tests.
- Repaired non-SMF-to-SMF conversion ownership: mesh data stays in model-root Three space until the serializer boundary, bones use root-relative world DQs, and animation frames are sampled through a Three mixer rather than direct quaternion-component interpolation. Compatible GLB/FBX export and SMF roundtrip actions are enabled again; unsupported diagnostics still block.
- Added a shared `ImportedSmf` semantic validator for finite values, relational mesh/skin/rig/animation references, parent-cycle detection, and dual-quaternion shape; parser, worker fallback, and serializer paths use the same boundary.
- Added a shared 256 MiB model-input guard checked before browser `File.arrayBuffer()` and again after native/test-injected bytes, plus a child-before-parent rig-node regression fix.
- Added a 512 MiB decoded-memory budget for SMF allocations, with checked reservations for textures, meshes, bones, and animation payloads before allocation.
- Dirty replacement now queues before byte materialization and exposes Cancel/Discard semantics; bounded editor and skin histories report eviction rather than growing without a memory contract.
- Native open/read/save authority now stays in Rust: reads require a previously selected canonical path, saves own the OS destination dialog, and frontend byte payloads are size-checked before IPC.
- Tauri's Rust and frontend dialog-plugin declarations are pinned to the same 2.7.1 release, so the native smoke build cannot fail before compilation on manifest-version drift even though dialog invocation remains Rust-owned.
- Parent playback publication is throttled to a 50 ms display cadence while imperative mixer advancement and scrub/intent updates remain immediate.
- Skill routing now has one owner per workflow: the redundant repo-local `monolith-modularization` and `pitfall-ledger` copies were removed in favor of the global skills, while the RustSMF-specific `summary-bank-json` overlay remains and is routed through `workflow__context_bank`.
- The context ceiling is now 256 KiB for focused generation; the default orientation remains 27.5 KiB, and the archived old-editor route now has an explicit 96 KiB cap.

## Verification evidence

- Fresh current-head `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed after the pose-creation, skin-authoring, overlay-refresh, and documentation changes; context validation, lint, typechecks, build/chunk checks, 275 frontend tests across 46 files, Rust fmt/clippy/check, and 10 Rust tests were green.
- Historical `npm.cmd run test:e2e -- --reporter=line` with a process-local approved system Chrome executable: 55/55 passed across all eight browser suites after the IK audit fix.
- `npm.cmd run test:visual-strict -- --reporter=line` with the same browser override: 2/2 passed.
- Current `desktop-smoke` Tauri build and Rust portions passed: the unbundled release executable built and all 10 Rust tests passed. Its 9-case native browser phase reached the case set but did not complete managed teardown; the runner wrappers and descendants were stopped after the same managed-process hang and no preview listener remained. An approved system-Chrome native rerun reached all 9 bodies and reported only `browserContext.close: spawn EPERM` during teardown.
- `npm.cmd audit --omit=optional`: found 0 vulnerabilities (the managed sandbox could not reach the advisory endpoint; the same read-only command passed through the approved external runtime).
- Prior full `npm.cmd run test:e2e -- --reporter=line` with the process-local system Chrome override: all 56 test bodies reached their assertions with no product assertion failures before this slice; every case then reported only `browserContext.close: spawn EPERM`, and the preview listener was cleaned. This is environment-blocked evidence, not a browser-green claim.
- Current focused pose-creation browser coverage reached its assertions with no product assertion failure, then reported only managed `browserContext.close: spawn EPERM`; exact test-process cleanup left no listener on ports 5173/1420. This is harness-blocked evidence, not a browser-green claim.
- Current `npm.cmd run test:visual-strict -- --reporter=line` with the same override: both test bodies reached their assertions with no product assertion failures; both were teardown-blocked by the same `spawn EPERM`, and the preview listener was cleaned.
- Current focused implementation slice: 58/58 passed for conversion candidate, converter, coordinate/DQ, semantic validator, and model-input guard; app and test typechecks passed.
- Current focused replacement/decoded-memory slice: 7/7 passed; editor-history, skin-history, and playback-cadence slices: 27/27, 27/27, and 2/2 passed respectively.
- `npm.cmd run test:unit`: 269/269 passed across 45 discovered unit-test files, including root-relative/mixer-sampled conversion parity, semantic validation, model-input and decoded-memory guards, dirty replacement, native byte adapters, bounded history, weight-preview restoration, skin snapshot-index, and playback cadence.
- Affected browser slice reached all six targeted test bodies, including the restored non-SMF SMF conversion/diagnostic assertions, but each run ended at managed `browserContext.close: spawn EPERM`; no assertion failure was emitted and ports 5173/1420 were clear after exact test-process cleanup. This is harness-blocked evidence, not a new product-green claim.
- Focused implementation slices: skin weights 21/21, FBX loader 6/6, and animation-frame cleanup 2/2.
- Focused SMF codec client test: 10/10 passed, including cancellation during worker setup before `postMessage`.
- Focused lifecycle browser rerun: all 8 test bodies reached the intended flows, but each case failed only during managed Chrome teardown with `browserContext.close: spawn EPERM`; the runner and preview listener were cleaned up, so the prior complete 55/55 browser run remains authoritative.
- Blender 5.0.0 validator passed the committed independent fixture and the app-exported roundtrip. Both reports contained one mesh, two bones, weighted groups, animation curves, and an embedded material texture.
- Focused checks: FBX/skin units 26/26 passed; independent FBX browser flow passed; `git diff --check` passed.

## Environment notes

The bundled Playwright Chromium executable is rejected by the managed Windows process boundary with `spawn EPERM` before app execution. Direct launch of the installed system Chrome succeeds, so the current evidence uses the process-local `RUSTSMF_PLAYWRIGHT_EXECUTABLE` override. This does not alter app security settings, sandbox policy, PATH, or committed configuration. The current managed sandbox checkup is `blocked` only for the diagnostic `python_unavailable` finding; PowerShell 7, Windows PowerShell, Git, Node, npm, context validation, and the app verification lane remain available. Python is optional for the Blender fixture lane and is not an app-runtime dependency.

Non-blocking test/tool warnings include Node's Playwright `DEP0205`, the managed-path Cargo canonicalization warning, the intentional mocked dialog-open warning in native fallback coverage, and one direct native-suite Node/Windows `UV_HANDLE_CLOSING` assertion printed after 9/9 tests had passed with exit code 0. The current desktop-smoke build/Rust portions passed; its native browser teardown was stopped after the managed hang and final cleanup left no listener on the project ports 5173 or 1420. None indicated a product assertion failure.

A later focused `skin.spec.ts` rerun with the approved system Chrome reached all four test bodies but hit the known managed Windows `browserContext.close: spawn EPERM` boundary during teardown and left a stale preview server that was removed by the launcher cleanup. The run is treated as harness-blocked, not as new app evidence; the previously completed full 55/55 browser run remains the authoritative browser result for this commit line.

The current focused lifecycle rerun shows the same harness-only boundary across all eight lifecycle cases. It reached each test body, then failed at `browserContext.close: spawn EPERM`; the exact runner and preview PIDs were stopped and `netstat` confirmed no listener remained on port 5173. No new product failure was observed.

The prior full Playwright rerun with the same process-local system Chrome override reached all 56 test bodies across all eight suites, but every case failed during managed `browserContext.close` teardown with `spawn EPERM`. The preview listener was stopped afterward. This does not replace the earlier 55/55 pass as product evidence, but it confirms the teardown boundary is still environment-dependent and must remain visible in handoff reports. The current slice adds one browser case; its focused run reached assertions and hit the same teardown boundary.

## Remaining limits

- Non-SMF-to-SMF conversion is enabled for compatible single-root skinned GLB/FBX sources; static roots, scale animation, unsupported structure, and malformed inputs remain diagnostic-blocked.
- FBX compatibility is proven for the covered Three.js paths and Blender 5.0.0 target; other exporters/importers can differ.
- True OS-dialog automation remains separate from deterministic Tauri IPC mocks.
- Direct Tauri/Vite launches have fewer Windows process-tree cleanup guarantees than `run.ps1`/`run.bat`.

These are intentional current-state limits. The full-suite browser certification remains the prior 56-case evidence because the managed teardown boundary prevents a clean current rerun; the new pose-creation case reached its assertions and was classified as harness-blocked. The current verification gate is fresh, and runner-owned listeners were cleaned. Reopen a narrowly scoped TODO only when a new behavior change creates a measurable gap with a done condition and verification command.
