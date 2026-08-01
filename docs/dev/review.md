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

## Verification evidence

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed after final code and documentation changes; context validation, lint/type/build/chunk gates, dynamic units, and Rust fmt/Clippy/tests/check are green.
- `npm.cmd run test:e2e -- --reporter=line` with a process-local approved system Chrome executable: 55/55 passed across all eight browser suites.
- `npm.cmd run test:visual-strict -- --reporter=line` with the same browser override: 2/2 passed.
- Canonical `desktop-smoke`: optimized no-bundle release build, Rust tests, and native IPC browser coverage passed.
- Blender 5.0.0 validator passed the committed independent fixture and the app-exported roundtrip. Both reports contained one mesh, two bones, weighted groups, animation curves, and an embedded material texture.
- Focused checks: FBX/skin units 26/26 passed; independent FBX browser flow passed; `git diff --check` passed.

## Environment notes

The bundled Playwright Chromium executable is rejected by the managed Windows process boundary with `spawn EPERM` before app execution. Direct launch of the installed system Chrome succeeds, so the current evidence uses the process-local `RUSTSMF_PLAYWRIGHT_EXECUTABLE` override. This does not alter app security settings, sandbox policy, PATH, or committed configuration. The sandbox checkup is `ready_with_warnings`; its only warning is the ambient WindowsApps Python shadow, which is outside the app verification lane.

Non-blocking test/tool warnings include Node's Playwright `DEP0205`, the managed-path Cargo canonicalization warning, and the intentional mocked dialog-open warning in native fallback coverage. None caused a failed or skipped test.

## Remaining limits

- FBX compatibility is proven for the covered Three.js paths and Blender 5.0.0 target; other exporters/importers can differ.
- True OS-dialog automation remains separate from deterministic Tauri IPC mocks.
- Direct Tauri/Vite launches have fewer Windows process-tree cleanup guarantees than `run.ps1`/`run.bat`.

These are intentional current-state limits, not open integrity TODOs. New work should be added to `TODO.md` only with a measurable done condition and verification command.
