# RustSMF Review Snapshot

Last reviewed: 2026-07-25

## Scope

Repository-wide implementation pass covering the requested theme/Original experience, basic FBX support, SMF export and worker integrity, async ownership, context/document routing, incomplete logic, broken imports/exports, test ownership, bounded modularization, launcher reliability, dependency health, and consolidated progress documentation.

## Completion Matrix

### Theme system and Original SMF simplicity

- What: Modern and Original SMF are complete typed theme definitions, not scattered component conditionals.
- Why: returning users can adopt the new app through familiar compact hierarchy and interaction cues while both themes continue to share one editor state and feature set.
- Where: `src/theme.ts`, `src/hooks/useAppTheme.ts`, `src/App.tsx`, `src/components/Toolbar.tsx`, `src/index.css`, and `src/styles/themes/original.css`.
- How: the registry owns labels, panel copy, viewport appearance, and preferred loaded layout; persisted values are validated and storage failures are non-blocking. Original keeps numbered red tabs, square low-chrome controls, a charcoal viewport, left tools, right Submodels, quad-first loaded layout, and Animation-only upper timeline without branching editor logic on a theme ID.
- Done when: switching is persisted, stale storage is rejected, editor state survives switching, both desktop and narrow layouts remain usable, and visual ownership is executable.
- Result: done. Theme units, the 53-test browser suite, and both strict visual baselines pass.

### FBX export support

- What: the current runtime root and clips export as binary FBX 7500 through the vendored MIT `FBXExporter-threejs`; FBX sources also use it through the primary source-aware action.
- Why: users need a basic recovery/interchange path without a disguised GLB fallback or silently malformed save.
- Where: `src/loaders/fbx.ts`, its focused tests, export orchestration in `useLoadModel.ts`, and the generated skinned browser fixture.
- How: exporter output must be a binary FBX with the expected version, then reparse through the app loader and pass finite transform/track plus representative mesh, skin, bone, and clip checks before the save bridge is called. Preview material state is restored for the entire async export operation.
- Done when: static binary roundtrip, invalid-header/version rejection, dropped-clip rejection, representative skinned/animated preservation, download, and app re-import all pass.
- Result: done. Six focused FBX tests, format browser coverage, full browser coverage, build, and type gates pass.

### SMF worker, conversion, and export ownership

- What: SMF import/export runs through a typed worker; all save/check paths use one candidate authority; indexed runtime meshes convert to the flat triangle layout the writer actually serializes.
- Why: untrusted worker messages, detached canonical buffers, stale async completions, or index metadata ignored by the serializer could corrupt output or block the UI.
- Where: `src/workers/*`, `src/hooks/useSmfCodecTask.ts`, `src/hooks/smfExportCandidate.ts`, `src/loaders/smfData.ts`, `src/loaders/threeToSmf.ts`, and focused tests.
- How: validate the operation and nested payload, deep-clone export buffers before transfer, permit synchronous fallback only at startup, terminate on abort/timeout/runtime failure, keep progress monotonic, and recheck the shared load/export intent before commit. A validated triangle vertex map expands every indexed position and optional attribute in lockstep; incomplete triangles, out-of-range indices, and incomplete skin tuples fail before serialization.
- Done when: transfer ownership, cancellation, timeout, fallback, runtime rejection, progress, source immutability, candidate policy, indexed conversion, diagnostic roundtrip, 300,000-vertex responsiveness, and download/re-import paths all pass.
- Result: done. The stricter worker guard exposed and led to the indexed-geometry fix rather than being weakened; 224 units and 53 browser cases now pass.

### Modular boundaries and browser ownership

- What: extract proven pure/controller boundaries while keeping lifecycle owners intact, and replace the 3,201-line catch-all smoke spec with domain-owned suites.
- Why: smaller context surfaces reduce coordination risk, but splitting renderer or hook state solely by line count would create more synchronization seams.
- Where: `useLoadModel.ts` now composes codec-task, export-candidate, and editor-snapshot modules; `ThreeViewport.tsx` composes event contracts, interaction runtime, and TransformControls lifecycle modules. Browser coverage is split across shell/model, lifecycle, Rig, Animate, Skin, formats, native, and visual specs with shared helpers.
- How: preserve public hook/component contracts, add pure boundary tests, keep renderer/requestAnimationFrame ownership in the viewport, keep integration state in the hook, make animation actions root-affine during replacement, preserve all 37 former smoke titles, move strict snapshots beside their owning specs, and make lint coverage fail when a probed file is missing.
- Done when: app/test typechecks and build prove imports/exports, focused tests cover extracted boundaries, Playwright lists and runs 53 cases, strict baselines resolve at their new paths, and no old smoke path remains in current docs or scripts.
- Result: done. `ThreeViewport.tsx` remains an explicit renderer/integration owner and `useLoadModel.ts` remains the editor integration owner; further splitting is evidence-triggered, not an active size-only task. The export/load race now also fails on cross-root `PropertyBinding` warnings.

### Context, docs, launcher, and repository integrity

- What: replace duplicated host-dependent context scripts, narrow `summary_bank.json`, consolidate current/progress docs, harden npm launch resolution, and close stale-path/test gaps.
- Why: context drift, false-positive lint probes, inaccessible global npm shims, and redundant progress recaps make future work less reliable.
- Where: `scripts/context-bank-*.mjs`, `scripts/generate-context.mjs`, `run.ps1`, `.tools/*`, `summary_bank.json`, launcher/Playwright configuration, `docs/dev/*`, and `source/frontend/tests/README.md`.
- How: one Node library owns read/validate/expand/generate behavior; exact files and explicit globs are required; budgets, duplicates, unmatched paths, obsolete fields, stdout, binary metadata, and no-truncation behavior are tested. Sixteen narrow groups replace broad routing. The launcher and Playwright prefer npm beside the active Node executable. Current state, active work, latest review, and recurring pitfalls each retain one owner; the redundant GenEye recap was removed.
- Done when: context validation has zero warnings, generator regressions pass, canonical runner tasks work without the profile npm shim, research inbox has no unprocessed item, current scans find no stale deleted paths or production TODO/FIXME/stub marker, dependency audit is clean, and no listener remains on port 5173.
- Result: done. Context reports 16 groups, a 60.1 KiB default set, zero warnings, and 7/7 tool tests; dependency audit reports zero vulnerabilities; port 5173 is clear. The release audit also aligned launcher guidance with the current numbered-menu default and exposed the live `context` task in `run.ps1 -Task help`.

## Backlog Decision

No evidence-backed executable item remains from this pass. The large integration owners and documented format limits are explicit watch conditions, not incomplete shipped behavior. A new item belongs in `TODO.md` only when it can state what, why, where, when, how, subtasks, a measurable done condition, and verification.

## Verification

- `pwsh -File run.ps1 -Task verify`: passed; context 16 groups/zero warnings plus 7/7 tool tests, lint coverage, lint, app/test typechecks, production-`any` guard, production build, vendor/lazy-worker chunk guards, 224/224 frontend units, and Rust cargo check.
- Browser-only Playwright: 53/53 passed, including worker responsiveness, async ownership, persisted Original SMF desktop/narrow behavior, indexed GLB-to-SMF conversion, validated FBX download/re-import, workspace continuity, authoring tools, and visual flows.
- `pwsh -File run.ps1 -Task test:visual-strict`: 2/2 passed at the new owning snapshot paths.
- `pwsh -File run.ps1 -Task desktop-smoke`: release Tauri build passed, Rust native tests 9/9, and Tauri IPC Playwright tests 9/9.
- `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings`: passed; the audit corrected three test-only Clippy findings.
- `npm ls --all --omit=optional`: passed with the expected platform/feature optional packages omitted on Windows.
- `npm audit --omit=optional`: zero vulnerabilities.
- Final hygiene: `git diff --check` has no whitespace error; current source has no incomplete-logic marker; deleted validator/smoke paths are absent from current docs/scripts; port 5173 is clear.
