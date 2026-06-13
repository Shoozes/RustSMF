# Pitfall Ledger

Last reviewed: 2026-06-13

### Q: What pitfall are we preventing?

**What:** TypeScript/TSX app code can drift while `npm run lint` and Vite build still pass.

**Why it happened:** The ESLint flat config intentionally ignores `*.ts` and `*.tsx`, and Vite transpiles TypeScript without full typechecking. That allowed ambiguous barrel exports, stale typed-array contracts, missing type imports, and obsolete Three.js material props to remain hidden.

**Where:** `source/frontend/eslint.config.js`, `source/frontend/package.json`, `run.ps1`, `source/frontend/src/loaders/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/backend-client/tauri.ts`.

**How to catch it:** Run `npm run typecheck` in `source/frontend`, or `pwsh -File run.ps1 -Task verify` after this pass. Treat typecheck as required for import/export or loader contract changes.

**Solutions tried:**
1. `55/100` Rely on Vite build and current lint, result: runtime build passed but static type drift stayed hidden.
2. `88/100` Add app `tsc --noEmit` to package and verify, result: caught and fixed source contract drift without adding new dependencies.

**Current solution:** `source/frontend/package.json` has `typecheck`; `run.ps1 -Task verify` and `source/package.json` verify run it before build/tests.

**Effectiveness:** `88/100`, good. It catches app source regressions with low cost, but test files still need a separate typecheck plan.

**Relevance check:** Current. The app is TypeScript-heavy and future loader/viewport changes can regress contracts without this check.

**Next prevention step:** Add a test-source typecheck config with Node/Playwright types after deciding whether to add `@types/node`.

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
