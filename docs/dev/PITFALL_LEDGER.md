# Pitfall Ledger

Last reviewed: 2026-06-16 (updated SMF head-dummy pitfall after reported `.smf` load hang: effective-parent walks now detect self-parent/cycles, inverse binds are calculated after world-matrix update, and head dummy animation tracks are skipped).

### Q: What pitfall are we preventing?

**What:** Context docs can move while README, run scripts, agent instructions, and `summary_bank.json` keep pointing at deleted or nonexistent planning paths.

**Why it happened:** The backlog moved from `docs/TODO.md` to `docs/dev/TODO.md`, and old local agent/tool instructions still referenced `plan.md`, but there was no automated summary-bank path guard to catch stale explicit paths.

**Where:** `README.md`, `run.ps1`, `docs/dev/APP_STATE.md`, `source/frontend/tests/README.md`, `.agents/*`, `.tools/project.json`, `summary_bank.json`, `scripts/verify-context-bank.py`.

**How to catch it:** Run `rg -n "docs/TODO\.md|plan\.md"` for current-path drift and `python scripts/verify-context-bank.py` for context-bank JSON/path validation.

**Solutions tried:**
1. `55/100` Move the TODO file without a verifier, result: current docs and context groups could drift.
2. `93/100` Add docs indexes/policy, redirect active references to `docs/dev/TODO.md`, update local agent/tool guidance to durable docs, and wire `scripts/verify-context-bank.py` into `verify`, result: stale current context paths fail locally.

**Current solution:** `docs/dev/TODO.md` is the active backlog; `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json` are the durable state/context surfaces; `run.ps1 -Task verify` runs the context-bank verifier before frontend/Rust gates.

**Effectiveness:** `93/100`, durable. It converts a docs-drift class into an executable check and keeps historical references separated from active links.

**Relevance check:** Current. This repo intentionally keeps multiple docs and local skills, so path drift is likely during future consolidation.

**Next prevention step:** Keep active docs under `docs/dev/`; if a doc moves, update `summary_bank.json` in the same change and run the verifier.

### Q: What pitfall are we preventing?

**What:** SMF models can parse successfully with no console errors while the visible mesh is torn apart.

**Why it happened:** The Three loader treated SMF rig DQs as local bone transforms even though the old GameMaker loader stores bind-pose `WorldDQ`, and animation frames are per-node world poses that must be converted to local parent space. Render geometry also used raw byte weights whose sums can be below 1, while the old dual-quaternion shader normalized blended DQs.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`, old-src reference screenshots in `docs/references/old-src/screenshots/`.

**How to catch it:** Load `source/frontend/tests/mixamo_smf_baldguy.smf` visually and run `npm --workspace frontend run test:unit`; the bind-pose CPU skinning regression asserts vertices do not drift apart.

**Solutions tried:**
1. `45/100` Rely on parser success and screenshot byte-size checks, result: torn meshes still counted as rendered.
2. `94/100` Build Three bones from SMF world bind matrices, compute inverse bind matrices from real world transforms, convert animation frame world poses to local parent space, normalize render-side weights, and add the CPU bind-pose regression, result: the sample renders as a coherent low-poly character and tests catch recurrence.

**Current solution:** `buildThreeScene` derives local transforms from stored world DQs, uses world inverse binds, converts animation tracks through parent world matrices, and normalizes skin weights for Three rendering while leaving imported SMF data intact for export.

**Effectiveness:** `94/100`, durable. It is verified by unit tests, visual screenshots, and the old source semantics.

**Relevance check:** Current. This is a core model-load path and can regress when SMF rig/animation conversion changes.

**Next prevention step:** Add a stricter visual heuristic for loaded SMF bounding boxes or skeleton/mesh coherence if screenshot snapshots become part of the default gate.

### Q: What pitfall are we preventing?

**What:** Optional strict visual snapshots can preserve a stale broken render after the actual loader has been fixed, and generated Playwright reports can dirty the repo after every run if tracked.

**Why it happened:** Default e2e uses tolerant screenshot byte-size checks for WebGL stability, so stale committed strict baselines were not exercised by normal `verify`. Separately, `playwright-report/index.html` and `test-results/.last-run.json` were tracked despite ignore rules.

**Where:** `source/frontend/tests/smoke.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `source/frontend/package.json`, `source/package.json`, `run.ps1`, `source/frontend/playwright-report/`, `source/frontend/test-results/`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:visual-strict` after SMF renderer, camera, skeleton, or visual snapshot changes; inspect the resulting PNGs; run `git status --short` after e2e and confirm reports/results do not appear as tracked modifications.

**Solutions tried:**
1. `45/100` Rely on tolerant screenshot byte-size checks, result: old torn SMF snapshots stayed committed while default tests passed.
2. `93/100` Add explicit strict visual check/update tasks, refresh coherent SMF load/export baselines, and untrack generated Playwright report files, result: visual baselines are intentional and e2e diagnostics no longer churn source.

**Current solution:** Use `test:visual-strict` for opt-in SMF baseline enforcement and `test:visual-update` only for intentional baseline refreshes. `playwright-report/` and `test-results/` remain ignored and untracked.

**Effectiveness:** `93/100`, durable. It gives visual baseline maintenance a named command without making default e2e brittle.

**Relevance check:** Current. SMF visual fidelity and future quad/bone-overlay work will keep changing renderer output.

**Next prevention step:** Add tighter semantic visual heuristics once quad/ortho view or large bone handles are implemented, so default e2e can catch obvious coherence failures without exact pixel matching.

### Q: What pitfall are we preventing?

**What:** Work can remain stranded on temp/review branches or auto-stashes, then docs can make the wrong source of truth look authoritative.

**Why it happened:** Execute-plan refs contained old-src docs/screenshots/proof artifacts and source review fixes, but the newer old-src GameMaker `.gml`/`.yy`/`SMF.yyp` state lived in `stash@{0}` from an auto-stash before pull. A branch-only audit made docs claim GML/YY hash verification against the execute-plan tip even though that branch did not contain the recovered GML work.

**Where:** remote `origin/execute-plan/*` refs, `stash@{0}`, `AGENTS.md`, `docs/references/old-src/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/*`.

**How to catch it:** Run `git branch --all --verbose --no-abbrev`, inspect `git log main..branch`, diff branch-only files, and also run `git stash list` plus `git stash show --name-status` before deleting branches or stash entries. Confirm needed work is present on local `main`.

**Solutions tried:**
1. `55/100` Leave branch work as branch-only context, result: main missed old-src screenshots/docs and export-path review fixes.
2. `70/100` Reconcile branch-only artifacts and fixes onto local `main` while assuming old-src GML/YY lived in the execute-plan tip, result: docs preserved screenshots but misidentified the backing source for the GameMaker source edits.
3. `96/100` Keep execute-plan docs/screenshots/proof artifacts and `options/reddit` metadata, restore tracked old-src `.gml`/`.yy`/`SMF.yyp` paths from `stash@{0}`, apply whitespace-only cleanup where needed before commit, document push semantics in `AGENTS.md`, keep generated reports/test-results out of source, and confirm the old-src GameMaker project manually after recovery, result: temp branches and the auto-stash each have a clear role and the recovered GML was user-tested.

**Current solution:** Work locally on `main`; temp branches are scratch/review only; explicit `push to git` means push/sync `main` only unless the user names another branch. Do not drop `stash@{0}` until the recovered old-src `.gml`/`.yy`/`SMF.yyp` state is committed or separately archived, and account for expected execute-plan-only metadata or whitespace-only cleanup if comparing against the stash.

**Effectiveness:** `96/100`, durable once committed. The workflow rule is documented, branch cleanup can be validated with git diffs, stash cleanup now has an explicit guard, and the restored old-src GameMaker state was manually verified by loading/testing it.

**Relevance check:** Current. The repo had execute-plan refs and an auto-stash with different useful old-src work.

**Next prevention step:** After verification, delete local temp branches only once their unique work is represented on `main`; do not delete remote branches or stash entries without an explicit cleanup request and a current diff check.

### Q: What pitfall are we preventing?

**What:** JSX text nodes do not interpolate `${}` template syntax — wrapping in `{}` is required.

**Why it happened:** The clip duration in the Inspector was written as `(${(c.duration || 0).toFixed(2)}s)` inside a JSX text node. In JSX, `${}` outside of a JS expression block `{}` is rendered as literal characters, not as a template expression.

**Where:** `source/frontend/src/components/Inspector.tsx` clip list item label.

**How to catch it:** Typecheck does not flag this (it is valid JSX text), lint does not flag it, and unit tests did not cover the rendered clip label string. Manual visual inspection or a targeted Playwright assertion on the clip item text would catch it.

**Solutions tried:**
1. `92/100` Changed JSX text `(${...}s)` to a JSX expression `({(c.duration || 0).toFixed(2)}s)`, result: clip label now shows the real duration value like `walk (1.23s)`.

**Current solution:** All dynamic values in JSX are inside `{}` expression blocks.

**Effectiveness:** `92/100`, durable. The fix is minimal and the root cause is a JavaScript/JSX syntax distinction that is easy to repeat.

**Relevance check:** Current. Any JSX-heavy component can repeat this mistake.

**Next prevention step:** When writing JSX with dynamic text mixed with static text, always wrap computed parts in `{}`. Consider a Playwright assertion for at least one clip item label format to catch future regressions.

### Q: What pitfall are we preventing?

**What:** PowerShell test wrappers can report success even when npm/Playwright fails.

**Why it happened:** PowerShell functions return everything written to the success stream. `Invoke-FrontendNpm` emitted npm output plus a boolean, so `if (-not (Invoke-FrontendNpm ...))` evaluated the non-empty output array as truthy even when `$LASTEXITCODE` was nonzero.

**Where:** `run.ps1` `Invoke-FrontendNpm` and `test:e2e`; caught when full Playwright initially failed but `pwsh -File run.ps1 -Task test:e2e` returned exit code 0.

**How to catch it:** Run a known-failing npm script through the wrapper and inspect the process exit code, not just console text. Keep helper output on the host stream and store `$LASTEXITCODE` before returning a boolean.

**Solutions tried:**
1. `42/100` Return `$LASTEXITCODE -eq 0` after invoking npm directly, result: npm output leaked into the function return and masked failures.
2. `92/100` Pipe npm output to `Write-Host`, capture `$LASTEXITCODE`, and make `test:e2e` exit on false, result: wrapper status now matches direct Playwright status.

**Current solution:** `Invoke-FrontendNpm` writes command output to host and returns only a boolean; `test:e2e` exits nonzero when the helper returns false.

**Effectiveness:** `92/100`, durable. The wrapper now propagates pass/fail correctly for npm tasks that use it.

**Relevance check:** Current. Future run-script helpers can repeat this PowerShell success-stream mistake.

**Next prevention step:** When adding wrapper helpers around native commands, test at least one failing path and inspect the shell exit code.

### Q: What pitfall are we preventing?

**What:** Progress docs can claim a gate, fixture, or coverage path exists after planned work, while the repo does not actually contain the file or script.

**Why it happened:** Long pass-history sections were appended over time, and later reviews trusted those claims instead of checking referenced files, scripts, and test execution.

**Where:** `docs/TODO.md`, `docs/dev/APP_STATE.md`, `summary_bank.json`, `source/frontend/package.json`, missing `source/frontend/tsconfig.test.json`, missing `source/frontend/tests/native.spec.ts`, and previously absent default skinned non-SMF fixture coverage.

**How to catch it:** For every documented gate or fixture, run `rg` for the referenced file/script, run the command directly, and confirm skipped tests are intentional backlog items rather than completed coverage.

**Solutions tried:**
1. `45/100` Keep appending pass recaps, result: important coverage claims became hard to verify and some were stale.
2. `90/100` Add missing `typecheck:test`, `tsconfig.test.json`, direct Node types, and `native.spec.ts`; then rewrite TODO/APP_STATE into current state plus active backlog, result: docs matched runnable gates and remaining fixture work became explicit.
3. `95/100` Add generated self-authored skinned GLB fixture coverage and remove the sample-dependent FBX skip, result: default e2e now covers non-SMF skinned load, guarded SMF export, and GLB export without external asset assumptions.

**Current solution:** `run.ps1 -Task verify` runs app and test typechecks; `tests/native.spec.ts` covers mocked Tauri open/read/save/cancel; `tests/helpers/skinned-glb-fixture.ts` provides default non-SMF skinned fixture coverage.

**Effectiveness:** `95/100`, durable. The fix adds executable gates, removes duplicated progress logs, and closes the default skinned fixture skip with generated self-authored data.

**Relevance check:** Current. Integrity passes and feature docs will continue to reference gates and fixtures.

**Next prevention step:** Before marking coverage complete, require file existence checks or generated-fixture source checks plus a fresh command result in TODO or APP_STATE.

### Q: What pitfall are we preventing?

**What:** TypeScript/TSX app code can drift while `npm run lint` and Vite build still pass.

**Why it happened:** The ESLint flat config intentionally ignores `*.ts` and `*.tsx`, and Vite transpiles TypeScript without full typechecking. That allowed ambiguous barrel exports, stale typed-array contracts, missing type imports, and obsolete Three.js material props to remain hidden.

**Where:** `source/frontend/eslint.config.js`, `source/frontend/package.json`, `run.ps1`, `source/frontend/src/loaders/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/backend-client/tauri.ts`.

**How to catch it:** Run `npm run typecheck` in `source/frontend`, or `pwsh -File run.ps1 -Task verify` after this pass. Treat typecheck as required for import/export or loader contract changes.

**Solutions tried:**
1. `55/100` Rely on Vite build and current lint, result: runtime build passed but static type drift stayed hidden.
2. `88/100` Add app `tsc --noEmit` to package and verify, result: caught and fixed source contract drift without adding new dependencies.
3. `94/100` Add separate test-source typecheck with Node/Playwright types, result: caught unsafe test buffers and implicit helper types, then made `verify` cover app and test contracts.

**Current solution:** `source/frontend/package.json` has `typecheck` and `typecheck:test`; `run.ps1 -Task verify` and `source/package.json` verify run both before build/tests.

**Effectiveness:** `94/100`, durable. It catches app and test source regressions with low cost and keeps Node/Playwright types out of the browser app config.

**Relevance check:** Current. The app is TypeScript-heavy and future loader/viewport changes can regress contracts without this check.

**Next prevention step:** Keep app and test tsconfigs separate; do not silence failing test files with excludes.

### Q: What pitfall are we preventing?

**What:** Desktop SMF parser simulations can diverge from the Rust/Tauri command behavior.

**Why it happened:** The Playwright helper read animation count as `u32` while Rust `get_smf_desktop_info`, Rust tests, and the TS SMF loader read the SMF animation count as `u8`.

**Where:** `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`, `source/frontend/src/loaders/smf.ts`.

**How to catch it:** Keep Rust native tests for `parse_smf_header_info` and run Playwright desktop-info simulation against real `.smf` bytes. When parser width/offset semantics change, update Rust, TS loader, and JS simulation together.

**Solutions tried:**
1. `60/100` Comment-only documentation of desktop simulation, result: stale behavior remained possible.
2. `91/100` Align JS simulation with Rust `u8` behavior and add a pitfall entry, result: simulation now matches the runtime contract and the failure mode is documented.

**Current solution:** `simulateGetSmfDesktopInfo` reads `bytes[p.offAnim]` as `u8`; Rust has a fixture proving `u8` width.

**Effectiveness:** `91/100`, durable. The fix is verified by the app test suite and aligns all three parser surfaces.

**Relevance check:** Current. Desktop validation status is user-visible for `.smf` loads and easy to regress when extending parser peeks.

**Next prevention step:** Factor shared parser-width notes into a small SMF format doc if Rust parser work expands beyond peeks.

### Q: What pitfall are we preventing?

**What:** Native save dialog cancellation can be reported as a successful export.

**Why it happened:** `saveFile` returned `void`, so callers could not distinguish a completed write/download from a Tauri save dialog cancel.

**Where:** `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:e2e`; the native IPC mock covers open, save, write, cancel, and status behavior.

**Solutions tried:**
1. `52/100` Treat no returned file path as a silent no-op, result: export handler still showed success.
2. `93/100` Make `saveFile` return `boolean` and assert cancel status through the native IPC mock, result: canceled exports show `Export canceled.` and no write is recorded.

**Current solution:** `saveFile` returns `false` for native save cancel and `true` for native write/browser download; export handlers branch on that result.

**Effectiveness:** `93/100`, durable. The behavior is user-visible, covered by e2e, and keeps the API contract clear.

**Relevance check:** Current. Native save/export is core desktop behavior and easy to regress during export-path changes.

**Next prevention step:** Keep native dialog tests in `source/frontend/tests/native.spec.ts` whenever save/open behavior changes.

### Q: What pitfall are we preventing?

**What:** Invalid SMF edge cases can produce opaque parser failures, NaN dual-quaternion transforms, or invalid animation timing during export.

**Why it happened:** `BinaryReader` relied on raw `DataView` range errors, `dqNormalize` divided by a zero/invalid rotation length, and animation export normalized keyframe time by duration without guarding zero-duration clips.

**Where:** `source/frontend/src/loaders/smfBinary.ts`, `source/frontend/src/loaders/coord.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`.

**How to catch it:** Run `npm --workspace frontend run test:unit` or `pwsh -File run.ps1 -Task verify`; unit tests cover truncated SMF input, zero/invalid DQ normalization, and zero-duration animation export.

**Solutions tried:**
1. `58/100` Let low-level `DataView` and float math fail naturally, result: failures were hard to interpret and could serialize NaN/Infinity.
2. `90/100` Add bounded reads, identity fallback for invalid DQs, safe normalized animation time, and targeted unit tests, result: parser/export failures are finite and actionable.

**Current solution:** Binary reads throw `Unexpected end of SMF binary...`; invalid DQs normalize to identity; zero-duration animations write normalized time `0`.

**Effectiveness:** `90/100`, durable for malformed input and partial conversion work. It does not prove future non-SMF-to-SMF animation fidelity by itself.

**Relevance check:** Current. Exact GLB/FBX-to-SMF work will stress DQ construction and animation timing.

**Next prevention step:** Keep malformed-input and invalid-DQ unit tests close to any new SMF rig/animation serialization helper.

### Q: What pitfall are we preventing?

**What:** Non-SMF save-as-SMF can silently lose fidelity if static meshes, mismatched skeletons, duplicate bone names, object-level tracks, morph tracks, material data, or scale animation are accepted as if they were fully representable in the current SMF DQ path.

**Why it happened:** The earlier removed GLB-to-SMF helper attempted rough DQ construction without fixture-backed animation proof, and SMF stores rig/animation as DQs without a scale channel.

**Where:** `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/Toolbar.tsx`.

**How to catch it:** Run `npm --workspace frontend run test:unit` or `pwsh -File run.ps1 -Task verify`; converter tests assert skeletal animation roundtrip and rejection of scale animation/static roots.

**Solutions tried:**
1. `35/100` Keep the old approximate helper, result: misleading incomplete conversion path with empty animation frames.
2. `74/100` Remove the helper and keep GLB as the only non-SMF export, result: safe but missing save-as-SMF for valid skinned cases.
3. `92/100` Add a guarded Three skinned-source converter with fixture-backed DQ roundtrip and explicit rejection of unsupported cases, result: verified SMF export for compatible GLB/FBX runtime roots without pretending all source fidelity is covered.

**Current solution:** `Export SMF` uses `buildImportedSmfFromThree` only for skinned roots with one shared named skeleton and supported bone position/quaternion tracks; unsupported cases show a clear status and should use GLB export.

**Effectiveness:** `92/100`, durable. It covers the intended animation path and prevents silent scale/static conversion loss, while leaving texture/material fidelity to GLB.

**Relevance check:** Current. This is now a user-visible export path and should guide any future expansion of SMF conversion.

**Next prevention step:** Add real-file skinned GLB/FBX fixtures if converter support expands to materials, morphs, multiple skeletons, or scale-aware formats.

### Q: What pitfall are we preventing?
**What:** Module moves/refactors (e.g. extracting BinaryReader/Writer + bytes util to smfBinary.ts) can leave duplicate code behind in the original files + consumers, plus the new file stays untracked, while docs claim "deduped".

**Why it happened:** The integrity pass added smfBinary.ts and updated some notes, but smf.ts retained its local copies of the classes + bytes fn; useLoadModel and tauri kept their buffer copies; barrel was not updated to expose the util; no follow-up grep or consumer audit + `git add` for the moved file.

**Where:** loaders/smf.ts (full dupe classes), hooks/useLoadModel.ts + backend-client/tauri.ts (bytes copy), loaders/index.ts, the untracked smfBinary.ts, docs/TODO/APP_STATE/summary_bank over-claims.

**How to catch it:** After any cross-file move/extract: 1) grep -r for the fn/class name in src (should appear only in new home + imports), 2) run full `npm run typecheck && npm run lint`, 3) `git status` (new file must be intentional), 4) update barrel if the util is meant for sharing, 5) re-verify. Independent full review greps + file reads caught it.

**Solutions tried:**
1. 40/100 Assume the pass "took care of wiring", result: latent dupes + doc/code drift.
2. 95/100 Full discovery grep + read of all buffer sites + consumers + barrel + status, plus immediate replace + tests, result: single source of truth, improved bounds active everywhere, doc claims corrected same pass.

**Current solution:** smfBinary.ts is the owner (with header note); imports + barrel + deletions done; smfBinary now tracked in tree; paired entry added to TODO + new issue__ group in summary_bank.

**Effectiveness:** 95/100, durable for this class of refactor. Prevents silent fidelity or error-handling drift (old check vs ensure impls).

**Relevance check:** Current (and future P2 splits of smf/ThreeViewport will re-apply same discipline).

**Next prevention step:** Consider a small CONTRIBUTING or AGENTS note, or pre-commit grep guard for known helper names. Use monolith-modularization skill explicitly on >400 line files before extract.

### Q: What pitfall are we preventing?

**What:** SMF flat node lists + explicit `isBone=0` head dummies can either produce crossed editor bones or hang the loader when a skipped head node self-parents.
**Why it happened:** The original hierarchy path created `THREE.Bone` for every node and attached by direct parent index. The first head-skip fix added effective-parent walking, but root head dummies in real SMF files can parent to themselves; without a visited set, the walk never terminated. Once that was fixed, inverse bind matrices still needed fresh world matrices before `Skeleton.calculateInverses()`, and animation tracks for skipped head nodes emitted missing-target warnings because those dummies are not scene objects.
**Where:** `source/frontend/src/loaders/smf.ts` (old bone loop + threeBones + attach + skel ctor + remap + name gen), `source/frontend/src/loaders/smfRig.ts` (export only), poseEdits regex, ThreeViewport (helper on root + findBoneByName on skel), Inspector (getRoot + recursive children filter), coord.test golden fixture (heads present but only export/roundtrip tested), mixamo sample (14 heads, 24 deform, skins 0-22 seq).
**How to catch it:** Load `source/frontend/tests/mixamo_smf_baldguy.smf` through the UI and assert the loading overlay clears; run the root-head unit regression plus the real bind-pose skinning test; watch Playwright console output for `THREE.PropertyBinding: No target node found` head-track warnings.
**Solutions tried:**
1. Direct attach + mixed skel (original), result: skin ok by compensation, editor broken for any head-using rig.
2. Effective ancestor walk without cycle detection (2026-06-15), result: crossed bones fixed but root-head self-parent files could spin forever.
3. `96/100` Add `findEffectiveBoneParentIndex` with visited-set cycle guard, reuse it for hierarchy and animation local-parent resolution, update root world matrices before inverse binds, and skip non-scene head animation tracks; result: real SMF load completes, bind-pose test passes, and smoke test has no head-track warnings.
**Current solution:** Dedicated builder in `smfRig`; called from `buildThreeScene`; only `isBone=1` nodes enter the skeleton and scene hierarchy; effective parents skip heads with cycle protection; names are prefixed for readability + regex safety; userData carries original indices; animation clips target only scene bones.
**Effectiveness:** `96/100`, durable. It is verified by the real `.smf` fixture, root-head regression, bind-pose skinning invariant, Playwright SMF load, native IPC mock, and full `verify`.
**Relevance check:** Current. Any future SMF rig changes (more head synth, glb->smf heads) or editor viz work will touch this.
**Next prevention step:** Keep root-head/self-parent and real-sample load tests near any SMF hierarchy change; before changing bone parent logic, rerun targeted units plus `npm --workspace frontend run test:e2e -- tests/smoke.spec.ts -g "can load a real SMF sample"`.

### Q: What pitfall are we preventing?

**What:** Project launchers can look healthy while not actually starting the app for the default user path.

**Why it happened:** `run.ps1` defaulted to help text, `run.bat` assumed `pwsh` was available, and the Tauri path could depend on a globally installed CLI instead of the repo-local npm dependency.

**Where:** `run.ps1`, `run.bat`, `README.md`, `source/frontend/package.json`.

**How to catch it:** Run the exact user-facing commands with no extra task arguments: `.\run.bat` and `pwsh -File run.ps1`. Confirm Vite starts and the Tauri desktop app process launches, not only that help text prints.

**Solutions tried:**
1. `55/100` Keep launch instructions as explicit tasks only, result: documented commands worked but the user-facing default failed the "run this project" expectation.
2. `94/100` Make no-arg `run.ps1` start desktop dev, make `run.bat` fall back to Windows PowerShell, and invoke the local npm Tauri CLI, result: default launchers run the app without global CLI assumptions.

**Current solution:** `run.ps1` defaults to Tauri dev, `run.bat` uses `pwsh` when present and `powershell` otherwise, and Tauri commands route through local npm scripts.

**Effectiveness:** `94/100`, durable for local Windows launch. It still depends on repo dependencies being installed.

**Relevance check:** Current. Launcher behavior is the first user-visible health check.

**Next prevention step:** After changing run scripts or package scripts, run both default launchers, not only `-Task verify`.

### Q: What pitfall are we preventing?

**What:** Vite dev-server HMR websocket failures can masquerade as Playwright app regressions.

**Why it happened:** After the Vite 8 upgrade, the dev server could emit `ws error: RangeError: Max payload size exceeded` during parallel WebGL/file-flow tests. Affected pages reloaded to initial state, so assertions failed even though the built app behavior was valid.

**Where:** `source/frontend/playwright.config.ts`, `source/frontend/tests/README.md`, `run.ps1 -Task test:e2e`.

**How to catch it:** Run the full e2e suite after dependency or server changes. Look for websocket max-payload errors, status text resetting to the initial viewport-ready state, and failures clustered after file-load flows.

**Solutions tried:**
1. `45/100` Cap Playwright workers while still using `vite dev`, result: failures persisted.
2. `50/100` Disable Vite HMR while still using `vite dev`, result: failures persisted.
3. `93/100` Build first and serve tests with `vite preview`, result: full e2e passed and later generated skinned GLB coverage removed the old FBX/skinned fixture skip.

**Current solution:** Playwright webServer runs `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`, does not reuse an existing server, and caps local workers at 4.

**Effectiveness:** `93/100`, durable for current e2e coverage. It adds a build step to e2e runtime but removes dev-server HMR noise from product-flow tests.

**Relevance check:** Current. Any future Vite/Playwright server change should retest the full suite.

**Next prevention step:** Keep e2e on production preview unless a replacement passes the full suite and does not reintroduce websocket/page-reset symptoms.

### Q: What pitfall are we preventing?

**What:** Node/DOM polyfills for canvas 2d (used by SMF texture decode in import + extracted canvas-sprite label makers) can be partial or mutually clobbering after modularity extracts, causing silent test failures or typecheck breaks only on full gate runs.

**Why it happened:** makeBoneLabel (and future 2d viz) + importSMF both execute document.createElement('canvas').getContext('2d') + assign/use fill*/scale/textBaseline/createImageData; tests mutated global document in install + per-it overrides without full coverage of props/methods or restore, and no types on mock fns.

**Where:** `source/frontend/src/loaders/coord.test.ts` (polyfills + label its), `source/frontend/src/utils/boneLabels.ts` (and any future 2d canvas code), coord.test imports of the makers + SMF sample load it.

**How to catch it:** Run `npm --workspace frontend run typecheck:test` + `npm --workspace frontend run test:unit` (or targeted name pattern for labels/hierarchy) + full `pwsh -File run.ps1 -Task verify` after any canvas-using util extract or change; inspect for "createImageData is not a function" or TS7006 implicit in mocks.

**Solutions tried:**
1. `60/100` Minimal imageData-only global + ad-hoc override per label it (no restore, incomplete styles/scale/textBaseline), result: later tests (SMF texture) or type gates broke after bone labels extract.
2. `95/100` Single rich shared install mock (imageData + fillRect/fillText/scale + textBaseline + writable styles + explicit param types); capture its patch temporarily + restore in finally; base always capable, verified slice + type, result: gates green and resilient to order.

**Current solution:** installImageTestPolyfill now always emits capable 2d ctx stub; label capture its use non-destructive override + restore; any new 2d canvas helper must add to this shared mock and run the unit/type slice.

**Effectiveness:** `95/100`, durable for test-only canvas paths. Prevents latent breakage when 2d features (labels, future overlays) are extracted or polished.

**Relevance check:** Current. Modularity extracts + canvas for labels/glyphs + SMF tex will recur for viz work or quad.

**Next prevention step:** When adding canvas 2d code (or new utils/ tests touching document.createElement canvas), extend the shared polyfill first, add explicit types to mock fns, and include a "labels-or-2d" + "real-smf-sample" test slice in PR verification. Document the polyfill contract in the test file header.

### Q: What pitfall are we preventing?

**What:** Verification scripts can pass while an expected production chunk split is missing.

**Why it happened:** `check-entry-chunks.mjs` printed a warning and exited 0 when `three-vendor` was absent, and also skipped with a success exit when `dist` could not be read.

**Where:** `source/frontend/scripts/check-entry-chunks.mjs`, `run.ps1 -Task verify`, `source/package.json` verify script.

**How to catch it:** Temporarily remove or rename the built `dist/index.html` or the Vite manual chunk config, then run `node scripts/check-entry-chunks.mjs` and verify the process exits nonzero.

**Solutions tried:**
1. `58/100` Warn but continue, result: humans could miss the warning and automated gates stayed green.
2. `92/100` Emit errors and `process.exit(1)` on missing split or missing dist, result: `verify` now fails closed.

**Current solution:** The chunk check exits 1 when the production build artifact cannot be inspected or the expected `three-vendor` split is absent.

**Effectiveness:** `92/100`, durable for this check. It intentionally treats a missing build as a verification failure.

**Relevance check:** Current. Three.js bundle splitting is a performance and startup integrity concern.

**Next prevention step:** Keep guard scripts fail-closed unless a skipped state is explicitly part of the command contract.

### Q: What pitfall are we preventing?

**What:** Stale file-open or browser file/drop read results can overwrite newer load state.

**Why it happened:** `handleOpen` awaited the dialog result without its own sequence guard. Browser file-input/drop reads checked freshness only on success; an older read rejection could still set error/status after a newer read began.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`.

**How to catch it:** Mock two overlapping `openFile()` or browser read promises in a focused hook/component test or native IPC flow, resolve/reject the older one last, and assert it does not mutate status or load the old file.

**Solutions tried:**
1. `70/100` Rely on `loadSeqRef` inside `loadModel`, result: stale loads were guarded but stale dialog status/error paths were not.
2. `88/100` Add `openSeqRef` around `openFile()` success and error handling, result: stale dialog results return before mutating state.
3. `90/100` Add read-sequence checks to browser file-input/drop catch paths, result: stale read failures return before mutating error/status.

**Current solution:** `handleOpen` increments `openSeqRef`; browser file-input/drop reads increment `fileReadSeqRef`; success and catch paths check the captured sequence before setting status, error, or loading.

**Effectiveness:** `90/100`, durable for the current async boundaries. A future focused async race test would raise confidence further.

**Relevance check:** Current. Open dialogs and fallback file inputs are user-facing async boundaries.

**Next prevention step:** Add a focused overlapping-open/read test if open/load orchestration changes again.

### Q: What pitfall are we preventing?

**What:** Rogue Node.js / Vite dev servers (and intermediate tauri-cli parent processes) left listening on 5173 (or holding resources) after the cmd/pwsh launcher window is closed via its title-bar X button, or after the Tauri desktop app window is closed, or on hard Ctrl+C / parent kill. Subsequent launcher runs then hit "address in use" or leave stray node processes.

**Why it happened:** `tauri dev` (via beforeDevCommand in tauri.conf.json) spawns a long-lived child (`npm run dev` → Vite) that outlives the Tauri Rust process and the outer CLI in many Windows console-close scenarios; no process-group ownership, recursive tree kill, port/cmdline reaper on entry, or explicit child lifetime tie in the launcher (run.ps1 direct & npm or run.bat delegation). Tauri CLI child mgmt alone was insufficient for X-close of the visible pwsh or direct manual `tauri dev`.

**Where:** `source/src-tauri/tauri.conf.json` (beforeDevCommand), `source/frontend/scripts/start-vite-dev.mjs` (the managed wrapper), `run.ps1` (Stop-ProcessTree, Stop-DevServers sweeps, New-KillOnCloseJob, Start-Process + job assign + try/finally + trap + PowerShell.Exiting + Stop-StaleDevStack), `run.bat` (delegates), `source/frontend/package.json` + `source/package.json` (tauri:dev/dev scripts), runtime-data/*.log (prior sessions), `docs/dev/PITFALL_LEDGER.md` / `APP_STATE.md` / `TODO.md` / `summary_bank.json` (pre-fix references to launcher gaps).

**How to catch it:** Manual reproduction: `pwsh -File run.ps1` (or `run.bat`); load a model; X-close the cmd window or Tauri app; `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue` or `tasklist | findstr /i node`; confirm zero relevant node; re-launch and verify clean port + no "address in use". Automated: `pwsh -File run.ps1 -Task desktop-smoke` (or verify) + explicit post-run port sweep; extend native.spec or a harness test comment with simulated close + recheck. Watch runtime-data logs for prior "dev" lifecycle without clean exit.

**Solutions tried:**
1. `40/100` Rely on Tauri CLI's internal beforeDev child handling + OS console semantics, result: orphans survived cmd X-close and some tauri window closes; next launch often required manual taskkill.
2. `65/100` Add simple finally { Stop-Process ... } around & npm in run.ps1, result: helped Ctrl+C but not title-bar X (pwsh abrupt term) and not the full grandchild tree reliably.
3. `93/100` Multi-layer defense (Windows JobObject with KILL_ON_JOB_CLOSE assigned to owned Start-Process pwsh for the dev subtree + recursive Stop-ProcessTree via Win32_Process + three-sweep Stop-DevServers (exact 5173 node owners + cmdline 'vite|start-vite-dev|tauri') + Stop-Stale on every dev entry + trap + PowerShell.Exiting register + mjs wrapper for the tauri-close path (SIGTERM/'exit'/taskkill /T + parentPid poll + delay)), result: X-close, tauri-close, Ctrl+C, and re-launch all clean; redundant but low-cost and effective on primary Windows launcher path.

**Current solution:** The 3rd (layered) solution above. run.ps1 owns the long-running dev tasks via Start-Process + Job + finally/tree/stale; the mjs (now the beforeDevCommand) guarantees its direct Vite child is reaped on tauri CLI term (signals + poll + tree kill) and now has a unix fallback (`pkill`/`kill`) path when available. Entry sweep + port check makes re-launch robust. (See subsystem__dev_process_lifecycle and issue__rogue_node_servers in summary_bank.json for paths + notes.)

**Effectiveness:** `93/100`, durable. Verified by construction (checks: cargo/context/typecheck/verify all green post-change), manual X-close + re-launch scenarios (no rogue node, port free), and the prior orphan class being the exact motivator. Low runtime cost (scans only on dev entry or explicit close paths; poll is 1.8s win32-only in mjs).

**Relevance check:** Current. The canonical Windows launcher path plus direct-launch mjs fallback are the documented expectations; future cross-platform or direct-launch users are intentionally handled as reduced-coverage paths.

**Next prevention step:** Keep explicit reduced-coverage language for direct launches in run.ps1/help and `APP_STATE`/`docs/user`/README, and re-run manual close/re-launch checks when launcher scripts or wrapper logic changes.
