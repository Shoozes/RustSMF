# RustSMF History

This file is the canonical home for completed repo/app work and its durable verification record. Current behavior belongs in `APP_STATE.md`; active work belongs in `TODO.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

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
