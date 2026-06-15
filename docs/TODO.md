# RustSMF TODO

Last reviewed: 2026-06-15 (integrity pass continued: strict SMF visual baselines refreshed, generated Playwright reports untracked, old-src editor layout mapped into modernization backlog, modularity ranking refreshed, docs/summary bank kept current).

## Current Focus

Keep the app show-ready and scalable: launchers run the app by default, verification fails loudly, e2e uses production preview, strict visual baselines are maintained intentionally, and docs describe current state instead of pass history.

## Recent Completed Integrity Changes

- What: Fixed `run.bat` and `run.ps1` startup behavior.
  Why: No-argument launcher use should start the app, not only show help, and Windows machines may have PowerShell but not `pwsh`.
  Where: `run.bat`, `run.ps1`, `README.md`.
  How: Made `run.ps1` default to Tauri desktop dev, made `run.bat` fall back from `pwsh` to Windows PowerShell, and routed Tauri commands through the local npm CLI instead of requiring a global `cargo tauri`.
  Done when: `.\run.bat` and `pwsh -File run.ps1` launch the Vite/Tauri app.

- What: Resolved the Vite/esbuild dependency audit exposure.
  Why: `npm audit --omit=optional` reported advisories through Vite's esbuild path; leaving the dev server dependency vulnerable makes local development and future CI harder to trust.
  Where: `source/frontend/package.json`, `source/package-lock.json`.
  How: Upgraded to `vite@^8.0.16` and `@vitejs/plugin-react@^6.0.2`, then reran typecheck/build/unit/e2e gates.
  Done when: `npm audit --omit=optional` reports `found 0 vulnerabilities`.

- What: Stabilized browser e2e after the Vite 8 upgrade.
  Why: Vite dev-server HMR websocket failures could reset pages during Playwright runs and produce false app regressions.
  Where: `source/frontend/playwright.config.ts`, `source/frontend/tests/README.md`.
  How: Playwright now builds once and serves via `vite preview` on `127.0.0.1:5173`, with local workers capped at 4 and no existing-server reuse.
  Done when: `pwsh -File run.ps1 -Task test:e2e` passes from production preview.

- What: Made the entry chunk guard fail closed.
  Why: The guard previously warned but exited 0 when the expected `three-vendor` split disappeared or `dist` was missing.
  Where: `source/frontend/scripts/check-entry-chunks.mjs`.
  How: Converted missing split/read failures to `console.error` plus `process.exit(1)`.
  Done when: `run.ps1 -Task verify` cannot pass with a missing build artifact or missing vendor split.

- What: Guarded stale native/browser open results.
  Why: Overlapping file-open operations could let an older dialog result overwrite a newer operation's status or load path.
  Where: `source/frontend/src/hooks/useLoadModel.ts`.
  How: Added an `openSeqRef` sequence check around `openFile()` success and error paths, and applied the same stale-result check to browser file-input/drop read error paths.
  Done when: stale open/read results return without mutating state; existing typecheck and e2e gates pass.

- What: Tightened Inspector bone tree types.
  Why: `any` in a component boundary hid mistakes around `THREE.Bone` traversal.
  Where: `source/frontend/src/components/Inspector.tsx`.
  How: Added a typed `isBone` guard, typed root-bone discovery, and removed bone-tree `any` casts.
  Done when: app typecheck passes with typed skeleton traversal.

- What: Added generated fixture-backed non-SMF skinned coverage.
  Why: The full FBX/skinned e2e path depended on an absent local FBX fixture and skipped by default.
  Where: `source/frontend/tests/helpers/skinned-glb-fixture.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/README.md`.
  How: Added a self-authored generated skinned GLB with two bones and animation, then replaced the skipped sample-dependent test with load, bone selection, guarded SMF export, GLB export, screenshot, and console-clean assertions.
  Done when: full e2e runs without the old FBX/skinned fixture skip.

- What: Restored old-src reference work and recovered old-src GameMaker source state onto local `main`.
  Why: The execute-plan branches contained comparison screenshots, GameMaker LTS notes, old-src issue notes, and GLBtoSMF visual proof, but the newer GameMaker `.gml`/`.yy`/`SMF.yyp` source state was in the local auto-stash and was easy to miss during branch-only reconciliation.
  Where: `docs/references/old-src/screenshots/`, `docs/references/old-src/issues.md`, `docs/references/old-src/GML-2026.md`, `docs/references/old-src/GML-short-skills.md`, `docs/references/old-src/GLBtoSMF/`, `docs/references/old-src/mixamo_smf_baldguy_output.smf`, `docs/references/old-src/**/*.gml`, `docs/references/old-src/**/*.yy`.
  How: Kept the execute-plan docs/screenshots/proof artifacts, restored tracked `.gml`/`.yy`/`SMF.yyp` paths from `stash@{0}` (`auto-stash before pull 2026-06-13T23:06:23.0755471-04:00`), kept execute-plan-only `options/reddit` metadata, and applied whitespace-only cleanup where needed before commit.
  Done when: old-src screenshots/reference docs are available, all 241 `.gml` and 260 `.yy` files are present, recovered old-src loads in GameMaker after user testing, and the recovered source state is committed or otherwise archived.

- What: Ported branch fixes for dedicated SMF export and FBX fixture coverage.
  Why: The dedicated `Export as SMF` button must preserve high-fidelity SMF-source export instead of routing an already-loaded SMF through the non-SMF converter, and the restored self-authored FBX fixture should be exercised.
  Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/tests/helpers/smoke-helpers.ts`, `source/frontend/tests/smoke.spec.ts`, `source/frontend/tests/test.fbx`.
  How: Added an SMF-source fidelity branch to `handleExportSmf`, made the toolbar callback required, restored `test.fbx`, and added full static FBX load/export smoke coverage while keeping generated GLB as the skinned non-SMF fixture.
  Done when: typecheck, unit tests, verify, and e2e pass with the restored fixture path.

- What: Fixed the SMF sample visual tearing found during old-src screenshot comparison.
  Why: `mixamo_smf_baldguy.smf` loaded without console errors but rendered as torn mesh wedges instead of a coherent low-poly character.
  Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`, `source/frontend/tests/smoke.spec.ts-snapshots/`.
  How: Treated SMF rig DQs as world bind transforms, derived local bone matrices, computed true inverse bind matrices, converted animation frame world poses to local parent space, and normalized render-side skin weights while preserving imported data for export.
  Done when: CPU bind-pose skinning regression passes, visual screenshots show a coherent model, and full verify/e2e pass.

- What: Refreshed strict SMF visual baselines and made strict visual maintenance explicit.
  Why: The optional strict snapshots still showed the old torn SMF render even after the loader fix; default tolerant byte-size screenshots do not catch stale committed baselines.
  Where: `source/frontend/tests/smoke.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `source/frontend/package.json`, `source/package.json`, `run.ps1`, `source/frontend/tests/README.md`.
  How: Added `test:visual-strict` and `test:visual-update`, regenerated the SMF load/export snapshots from the current coherent render, and documented when strict snapshots should be checked or updated.
  Done when: `pwsh -File run.ps1 -Task test:visual-strict` passes and the committed SMF snapshots show a coherent low-poly character.

- What: Removed generated Playwright report artifacts from Git tracking.
  Why: `playwright-report/index.html` and `test-results/.last-run.json` are machine-generated diagnostics already ignored by `.gitignore`; tracking them makes every e2e run dirty the worktree.
  Where: `source/frontend/playwright-report/`, `source/frontend/test-results/`, `.gitignore`, `source/frontend/tests/README.md`.
  How: Removed the tracked generated files from the index while leaving the ignore rules in place and documenting that reports/results should not be committed.
  Done when: e2e runs can generate local reports/results without creating tracked modifications.

- What: Guarded zero-duration SMF animation export.
  Why: Exporting an animation with duration `0` could write non-finite normalized frame times, contradicting the documented malformed-input guard behavior.
  Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`.
  How: Serialize normalized frame time as `0` when duration or frame time is invalid, and added a roundtrip unit regression.
  Done when: zero-duration SMF animation roundtrip produces finite time `0`.

- What: Closed true OS-dialog automation as deferred, not missing implementation.
  Why: Current native behavior is already covered by deterministic Playwright IPC mocks plus Rust command tests; driving real Windows dialogs would add setup and flake risk without a current uncovered app contract.
  Where: `source/frontend/tests/native.spec.ts`, `source/src-tauri/src/main.rs`, `run.ps1`, `docs/dev/APP_STATE.md`.
  How: Kept required coverage on stable IPC/Rust gates and documented the trigger for optional tauri-driver work: a dialog-only regression, CI requirement, or release checklist need.
  Done when: native open/read/save/cancel and Rust peeks remain covered by `desktop-smoke`, and real-dialog automation is no longer listed as active missing work.

- What: Closed constructed-rig disconnected head-node support as a current intentional limit.
  Why: The old exporter could synthesize disconnected head nodes, but current non-SMF data does not carry an explicit intended-disconnected-parent signal; guessing from parent indices would be unsafe.
  Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `docs/references/old-src/GLBtoSMF/exporter.js`.
  How: Preserved direct constructed skeleton node output and relied on existing unit coverage for explicit SMF head-node preservation versus constructed skeleton behavior.
  Done when: current direct-node behavior is documented and future disconnected support requires explicit metadata before implementation.

- What: Re-ranked modularity candidates and deferred forced splits.
  Why: Only `smf.ts` is slightly above 500 lines and the next candidates have coupled responsibilities; moving lines without a clearer boundary would add churn.
  Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`.
  How: Recorded the watch list in `summary_bank.json` and kept future splits tied to test-backed helper boundaries.
  Done when: the current pass leaves behavior stable and future extraction targets are explicit.

## Active Backlog

No P0/P1 integrity backlog remains from this pass.

Watch items:

1. Modern editor workspace design.
   What: Recreate the current software as a modern, flexible editor while preserving the old editor's strongest ergonomics: optional quad/ortho view, large clickable bone glyphs, numeric/name labels, endpoint handles, contextual mode tools, and clear skinning state.
   Why: The old GameMaker UI made rigging/skinning easier through split ortho panes and oversized bones, while the current React/Three app has a cleaner stack but weaker precision-edit affordances.
   Where: `source/frontend/src/components/ThreeViewport.tsx`, future viewport/workspace components, `source/frontend/src/components/Inspector.tsx`, `docs/references/old-src/screenshots/`.
   How: Design a workspace shell with `Model`, `Rig`, `Skin`, `Animate`, and `Export` modes; keep single perspective as the default view; add optional quad view for rig/skin precision; implement screen-space bone handles/labels before expanding authoring tools.

2. SMF compatibility boundary.
   What: Keep SMF import/export as backwards compatibility while making GLB/GLTF the preferred modern authoring/export format for features SMF cannot represent.
   Why: SMF lacks bone names, scale channels, materials, morphs, and some editor intent; hiding that would create fidelity loss in the modern tool.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/hooks/useLoadModel.ts`, docs and export UX copy.
   How: Keep explicit rejection/status messages for unsupported SMF conversions, expose format limitations in UI/docs, and add compatibility tests only when expanding SMF behavior.

3. Strict visual snapshot maintenance.
   What: Run strict SMF snapshot checks when renderer, camera framing, skeleton display, skinning visualization, or SMF loader math changes.
   Why: Tolerant byte-size screenshots prove rendering is nonblank but do not prove committed visual baselines still represent the intended product state.
   Where: `source/frontend/tests/smoke.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `run.ps1`.
   How: Use `pwsh -File run.ps1 -Task test:visual-strict` for checks and `pwsh -File run.ps1 -Task test:visual-update` only when intentionally refreshing baselines.

4. Optional OS-dialog automation.
   What: Add tauri-driver or equivalent only if a dialog-only bug appears, CI requires real native dialog coverage, or release validation needs an automated OS-dialog path.
   Why: Deterministic IPC mocks and Rust command tests currently cover the native behavior without OS-dialog flake.
   Where: `run.ps1`, `source/frontend/tests/native.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Prototype outside required `verify`, require three clean local runs, then document prerequisites before promoting.

5. Constructed-rig disconnected metadata.
   What: Add disconnected head-node synthesis only if future non-SMF import data carries explicit disconnected-parent metadata.
   Why: Current parent indices alone cannot safely distinguish direct hierarchy from intended disconnected SMF head nodes.
   Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/threeToSmf.ts`.
   How: Extend converter metadata and unit coverage before changing node-list output.

6. Modularity watch.
   What: Extract helpers only at clear, test-backed boundaries.
   Why: Current largest files are manageable; blind splits would reduce clarity.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Re-run line-count ranking before any split, preserve public imports/status strings/test IDs, update barrels and `summary_bank.json`, and grep for duplicate helpers.

7. Async stale-result regression tests.
   What: Add a focused test for overlapping browser file-input/drop read failures if load orchestration changes again.
   Why: Sequence guards now cover success and error paths, but the stale read-error branch is not isolated by a dedicated hook test.
   Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts` or a future hook-level test harness.
   How: Mock two reads, resolve the newer one first, reject the older one last, and assert the older rejection does not set error/status.

8. Context docs.
   What: Keep current-state docs, pitfall ledger, and `summary_bank.json` lean.
   Why: Repeated progress logs and broad generated file lists slow future reviews and can create false confidence.
   Where: `docs/TODO.md`, `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, `summary_bank.json`, README files.
   How: Update only changed current-state claims, keep completed-work details concise, and validate JSON with `python -m json.tool summary_bank.json`.

## Known Intentional Limits

- `source/backend` is an intentionally empty boundary; current desktop-native work belongs in `source/src-tauri` until there is a concrete backend-service need.
- SMF export supports position/rotation pose edits. Scale edits are blocked because the current SMF DQ path has no scale channel.
- Non-SMF SMF export is guarded for compatible skinned GLB/FBX runtime roots with one shared named skeleton and position/quaternion bone tracks. Static roots, materials, morphs, object-level tracks, and scale animation should use GLB.
- FBX import support remains wired through Three's FBXLoader and UI accept/drop paths. Default full non-SMF skinned e2e coverage uses a generated skinned GLB to avoid depending on redistributable FBX assets.
- FBX export writes a GLB container through Three.js GLTFExporter; true FBX writing is not added without a concrete dependency decision.
- OBJ is load/preview parity for static assets; export should use GLB unless an OBJ writer requirement appears.

## Verification

- `pwsh -File run.ps1 -Task verify`: lint, app typecheck, test typecheck, Vite build, chunk guard, unit tests, and cargo check.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright browser smoke, visual confirmation, generated skinned GLB coverage, and native IPC tests served from production preview.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in strict SMF screenshot baselines for the key load/export visual states.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native peek tests, and focused Playwright native IPC mock suite.

Last verified local results:
- `npm audit --omit=optional`: passed with `found 0 vulnerabilities`.
- `pwsh -File run.ps1 -Task verify`: passed with lint, app typecheck, test typecheck, Vite 8 build, chunk guard, 22 unit tests, and cargo check.
- `pwsh -File run.ps1 -Task test:visual-strict`: passed after refreshing coherent SMF load/export snapshots.
- `npm --workspace frontend run typecheck:test`: passed.
- `npm --workspace frontend run test:unit`: passed with 22 unit tests.
- `pwsh -File run.ps1 -Task test:e2e`: passed with 16 tests and 0 skipped.
- `cmd /c run.bat verify`: passed through the batch wrapper with the same verify gate.
- `pwsh -File run.ps1 -Task desktop-smoke`: passed with unbundled Tauri build, 4 Rust native tests, and 2 Playwright native IPC tests.
