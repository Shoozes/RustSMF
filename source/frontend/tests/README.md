# Frontend Tests

Current coverage:
- `src/loaders/*.test.ts`: Node unit tests for SMF coordinate/DQ math, binary bounds, roundtrips, and guarded Three-to-SMF conversion.
- `tests/smoke.spec.ts`: Browser Playwright smoke coverage for app boot, real SMF load, viewport/animation/bone flows, export UI, invalid-load UX, FBX UI dispatch, and OBJ static load parity.
- `tests/visual.spec.ts`: Browser Playwright visual confirmations for desktop/narrow shell layout, horizontal overflow, nonblank viewport rendering, and loaded SMF visual state.
- `tests/native.spec.ts`: Deterministic Tauri IPC mock coverage for native open/read/status, save/write, and cancel behavior.

Set `RUSTSMF_STRICT_VISUALS=1` when intentionally enforcing or updating Playwright screenshot snapshots. Default e2e uses tolerant rendered-byte checks to avoid machine-specific WebGL drift.

## How Visual Tests Are Made

What:
- Use Playwright specs in `source/frontend/tests/` for user-visible browser behavior.
- Use `expectRenderedScreenshot()` for tolerant visual confirmation by default, not committed pixel snapshots.
- Use `RUSTSMF_STRICT_VISUALS=1` only when deliberately maintaining screenshot baselines.

Why:
- Visual tests should prove the app is not blank, the viewport renders meaningful pixels, core controls remain visible, and responsive layout does not introduce horizontal overflow.
- They should catch user-visible regressions that lint, typecheck, build, and loader unit tests cannot catch.

Where:
- Shared fixtures and diagnostics live in `tests/helpers/smoke-helpers.ts`.
- Broad workflow coverage lives in `tests/smoke.spec.ts`.
- Focused visual layout coverage lives in `tests/visual.spec.ts`.
- Tauri desktop IPC behavior lives in `tests/native.spec.ts`.

How:
- Start from a real user flow: initial app shell, loaded SMF state, invalid file, export, native open/save, or static OBJ load.
- Assert DOM state first, then capture a rendered screenshot on the smallest surface that proves the visual behavior.
- Check console/page errors through `setupBrowserDiagnostics()` and `getBrowserErrors()`.
- Keep tests deterministic: prefer local fixtures, explicit viewport sizes, and tolerant rendered-byte screenshots unless strict snapshots are intentionally updated.
- Run `npm --workspace frontend run typecheck:test` after editing tests and `pwsh -File run.ps1 -Task test:e2e` before marking coverage current.

## Relevance Rules

Keep a test only while it protects a current user path or a known pitfall.

Update or remove a test when:
- The feature, format, or UI surface it covers is intentionally removed.
- The assertion checks old copy/status text instead of the current user contract.
- The test duplicates another spec without adding a distinct risk check.
- The fixture is no longer representative of supported behavior.
- A strict snapshot fails from acceptable WebGL variance; convert to tolerant visual confirmation unless exact pixels are the intended contract.

When adding a test, document the covered risk in this README or `docs/TODO.md` if it is tied to an active backlog item.

Run from the repo root:

```powershell
pwsh -File run.ps1 -Task verify
pwsh -File run.ps1 -Task test:e2e
```

Use `npm --workspace frontend run typecheck:test` after editing tests or Playwright helpers.
