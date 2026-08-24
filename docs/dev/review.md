# RustSMF Review Snapshot

Last reviewed: 2026-08-24

This is the current repo/app integrity snapshot. `APP_STATE.md` owns current behavior, `TODO.md` owns forward work, `HISTORY.md` owns completed evidence, `PITFALL_LEDGER.md` owns recurring hazards, and `summary_bank.json` owns focused routing.

## Outcome

The review covered canonical docs and context routes, import/export and production-marker scans, current test discovery, async cleanup evidence, generated/runtime artifact tracking, Git-control safety, and the active backlog.

- The new project-integrity gate found no missing durable project docs, incomplete active TODO contract, unreviewed research note, unresolved relative frontend import, or unresolved Rust module declaration. No production TODO/FIXME/stub marker, skipped frontend unit, unchecked production `any`, Rust production panic placeholder, or tracked runtime/build artifact was found. App/test typechecks and the production build validate the current import graph.
- Native reads now enforce the 256 MiB boundary on the same opened authorized file, reject non-regular paths, and detect growth beyond the reported metadata; the Rust SMF envelope check rejects pre-header, overlapping, undersized, and truncated sections before desktop metadata is returned.
- The unused private `source/frontend/src/utils/index.ts` re-export barrel was removed after repository-wide import analysis found no consumers; `summary_bank.json` no longer routes the deleted path.
- The recent static-root, shared geometry-preparation, source-aware export, rename, and same-parent reorder work is covered by focused tests and the full browser suite. The repair for invalid tangent generation is exercised through static OBJ preparation, export, validation re-import, undo/redo, and replacement protection.
- The Model workspace now has guarded static-submodel duplicate/delete transactions. Parent/index operations restore exact structure, duplicate resources are independently owned for safe disposal, and bones, skinned subtrees, unsupported sources, and animation targets fail closed before mutation; unit and OBJ browser coverage exercise the UI, history, export, and rejection paths.
- The only release-process defect found was in the old local Git controls: they could rewrite origin, auto-create repositories, abort unrelated operations, force-push, reset/clean/stash, and choose merge conflict sides. The controls now share a small fail-closed main-only policy with a static regression test.
- Context routing now separates generic context-bank machinery from Git publication/synchronization ownership. The generic route stays within its budget rather than expanding its default context.
- The research inbox contains no active architect or source-review notes, so there was no raw drop-in to promote; the existing durable docs and backlog remain the authoritative knowledge surfaces.
- The orbit controller now clears mouse/touch drag ownership on `touchcancel`, window blur, and normal disposal; a focused unit regression covers both interruption paths.
- The model-resource bundle now resolves authorized relative GLTF buffers/images and one OBJ MTL bundle across browser and native-mock paths, with traversal, remote/data, duplicate/case ambiguity, size, missing-resource, stale-load, and object-URL cleanup guards. External GLTF browser/native fixtures and missing-sidecar preservation are covered.
- Project save/recovery now uses a bounded versioned `.rsproj` envelope, validated GLB snapshot, rotating atomic Rust generations, browser fallback, explicit recovery discovery, and corrupt-input fail-closed behavior. Codec, native rotation, and browser save/open/recovery coverage are present.
- Rig metadata now has standalone `.rig.json` save/load/clear and project embedding; CCD IK enforces locked/pinned joints, and explicit Solve & bake IK keys uses one animation history transaction while honoring clip locks.
- Model static authoring now supports guarded append, transforms, material assignment, winding reversal, and normals/tangents preparation through Outliner history. Geometry/UV/material/handedness/shader diagnostics and rest/trail/onion overlays are read-only and export-independent.
- The integration seam pass extracted resource, project, rig metadata, diagnostics, pose-overlay, and surface-authoring contracts with focused tests; static relative-import and Rust module scans remain clean.
- The animation workflow now has a recorded 125%-DPI headless journey. It exposed and fixed toolbar document overflow plus an Animate profile that hid its own bone/pose tools; symmetric rotation controls, indexed-bone guidance, actionable status feedback, ordered screenshots, and WebM evidence now cover the real SMF hand-wave path.
- The closing dependency audit found and resolved high-severity transitive advisories in `brace-expansion` and `nanoid`; the lockfile now selects patched compatible releases without changing direct dependency ranges.
- The external GLTF fixture now survives a clean checkout as three committed files. A narrow ignore exception retains the general model/weight exclusion, Git marks `mesh.bin` as binary, and focused unit coverage pins its nine ASCII bytes, SHA-256 digest, and directory-contained relative URI resolution without runtime fixture generation.

## Current verification

- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with project-integrity checks (184 frontend source/test files and 11 durable docs), 31 focused groups, 37.5 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `node --test scripts/git-main-safety.test.mjs`: 2/2 passed, including a real current-worktree preflight before credential access; both PowerShell sync entry points also parsed without syntax errors.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with project-integrity/context checks, lint coverage, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 343/343 frontend units across 59 files, Rust fmt/clippy/check, and 15/15 Rust tests. The managed-profile path-canonicalization warning is nonfatal.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 with approved local browser-process access. The earlier unprivileged Chromium `spawn EPERM` occurred before test bodies and is a sandbox permission limitation, not an application failure; runner-owned ports 5173 and 1420 were clear after the run.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 at 1440x900 with 125% device scale and produced eight ordered PNG checkpoints plus `output/playwright/hand-wave-journey/hand-wave-journey.webm`.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 without refreshing snapshots; the restored one-row toolbar containment keeps the committed 820x559 baselines stable while preventing desktop document overflow.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 15/15 Rust tests, and 11/11 native IPC browser cases.
- `npm audit --omit=optional` from `source`: passed with zero vulnerabilities after updating `brace-expansion` to 5.0.9 and `nanoid` to 3.3.18.

## Current blockers and bounded limits

There is no code, test, documentation, or release-process blocker remaining for the reviewed main update.

- Managed browser launch: an unprivileged managed sandbox can reject Chromium with `spawn EPERM`. Use only approved local browser-process access for a real browser run; do not weaken Playwright teardown or application security to work around it. The current full suite is browser-green.
- External compatibility: a lone `.gltf` remains self-contained and static append remains self-contained; universal third-party FBX behavior and true OS-dialog automation are evidence-gated limits, not untracked implementation gaps.
- Strict visual certification: default browser checks prove meaningful rendering without machine-specific baselines; strict screenshot refresh remains opt-in and must be run only with an explicit visual-review condition.

## Next direction

No active implementation task remains in this pass. Future work should be opened as a new What/Why/Where/When/How/Done when contract only when new evidence or a new external compatibility target justifies it; current format and harness limits are owned by `APP_STATE.md`.
