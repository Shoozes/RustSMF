# RustSMF Review Snapshot

Last reviewed: 2026-08-20

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

The review covered canonical docs and context routes, import/export and production-marker scans, current test discovery, async cleanup evidence, generated/runtime artifact tracking, Git-control safety, and the active backlog.

- No unresolved TypeScript import/export, production TODO/FIXME/stub marker, skipped frontend unit, unchecked production `any`, Rust production panic placeholder, or tracked runtime/build artifact was found. App/test typechecks and the production build validate the current import graph.
- Native reads now enforce the 256 MiB boundary on the same opened authorized file, reject non-regular paths, and detect growth beyond the reported metadata; the Rust SMF envelope check rejects pre-header, overlapping, undersized, and truncated sections before desktop metadata is returned.
- The unused private `source/frontend/src/utils/index.ts` re-export barrel was removed after repository-wide import analysis found no consumers; `summary_bank.json` no longer routes the deleted path.
- The recent static-root, shared geometry-preparation, source-aware export, rename, and same-parent reorder work is covered by focused tests and the full browser suite. The repair for invalid tangent generation is exercised through static OBJ preparation, export, validation re-import, undo/redo, and replacement protection.
- The only release-process defect found was in the old local Git controls: they could rewrite origin, auto-create repositories, abort unrelated operations, force-push, reset/clean/stash, and choose merge conflict sides. The controls now share a small fail-closed main-only policy with a static regression test.
- Context routing now separates generic context-bank machinery from Git publication/synchronization ownership. The generic route stays within its budget rather than expanding its default context.
- The research inbox contains no active architect or source-review notes, so there was no raw drop-in to promote; the existing durable docs and backlog remain the authoritative knowledge surfaces.

## Current verification

- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 27 groups, 39.7 KiB default orientation, zero warnings, and 7/7 context-bank tests.
- `node --test scripts/git-main-safety.test.mjs`: 2/2 passed, including a real current-worktree preflight before credential access; both PowerShell sync entry points also parsed without syntax errors.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with lint coverage, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 323/323 frontend units across 52 files, Rust fmt/clippy/check, and 13/13 Rust tests. The managed-profile path-canonicalization warning is nonfatal.
- `npm.cmd run test:e2e -- --reporter=line --workers=1`: passed 66/66 with approved local browser-process access. The earlier unprivileged Chromium `spawn EPERM` occurred before test bodies and is a sandbox permission limitation, not an application failure; runner-owned ports were clear after the run.

## Current blockers and bounded limits

There is no code, test, documentation, or release-process blocker remaining for the reviewed main update.

- Managed browser launch: an unprivileged managed sandbox can reject Chromium with `spawn EPERM`. Use only approved local browser-process access for a real browser run; do not weaken Playwright teardown or application security to work around it. The current full suite is browser-green.
- Sidecar resources: a lone `.gltf` cannot resolve external buffers/images, and OBJ does not resolve adjacent `.mtl` or textures. This is an explicit single-file import contract, not a parse failure; the P2 sidecar bundle task defines traversal, size, authorization, cancellation, and cleanup conditions.
- Model authoring: duplicate/delete, append, transforms, material/geometry actions, and deeper diagnostics remain intentionally unimplemented until each gets a reversible transaction and compatibility guards. The completed static-root, rename, and reorder browser certification was removed from this backlog.
- Persistence and compatibility: project save/recovery, keyed IK, universal third-party FBX claims, and true OS-dialog automation remain scoped future work or evidence limits. Current deterministic IPC/Rust/browser fixtures and the Blender fixture state exactly what is verified.

## Next direction

Begin with the P2 Model workspace duplicate/delete transaction: define its reversible structural snapshot, source/animation compatibility guards, and GLB/FBX/SMF persistence diagnostics before exposing UI actions. Then take the sidecar-aware GLTF/OBJ resource bundle as the next import-integrity slice.
