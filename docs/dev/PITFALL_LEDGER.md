# Pitfall Ledger

Last reviewed: 2026-06-14 (full review caught + fixed latent "incomplete binary helper dedupe after move" pitfall; added Q/A entry + prevention; prior mitigations still effective; see summary_bank issue__incomplete_binary_dedupe). 2026-06-14 full repo review: all listed pitfalls' mitigations (typecheck gate, sim alignment, save bool, bounded errors, fidelity gates, refactor discipline) remain effective and current; fresh audit + greps + verify found no new pitfalls or regressions. Relevance checks passed for all entries.

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
