# RustSMF Review Snapshot

Last reviewed: 2026-10-08

Current behavior and architecture belong in [APP_STATE.md](APP_STATE.md),
acceptance outcomes and completion criteria in [TODO.md](TODO.md), and dated
proof in [HISTORY.md](HISTORY.md).

## Current findings

- The frontend coverage and Modern simplification pass completed locally on
  `main` based on `0eef1a961734e031a21c4f1b59ad8e9dde6fbcc9`. The supported-feature
  matrix now routes all capabilities to concrete positive and protection/
  continuity assertions. Ten journey files run eleven stories sequentially.
- Modern now uses one compact command strip, a workspace chooser and Tools
  closed by default. Duplicate Skin actions and permanent instructions were
  removed. Common history stays in the toolbar; More is a flat command list.
  Keyboard navigation, pointer reachability, compact errors and touch targets
  passed; Original's strict image remains unchanged.
- Reproduced fixes preserve metadata through rig creation/rename/delete and
  history, encode FBX material colors correctly without source mutation, and
  keep fallback export reasons visible. The final source gate passed 510 unit
  tests, 124 browser checks, eleven stories and three strict visuals. Exact
  identity and retained evidence are in HISTORY. No remaining reproduced defect
  was left open; Windows dialogs and packaging were outside this frontend pass.

- The 2026-10-07 review began on clean `main` at
  `30e531bb8d5e672e9da3128c08ea52431e631f37`, the prior closeout commit.
  Coverage included current contracts and manifests, repository integrity and
  context routes, the changed Rust/proof runners and their tests, native input
  and write ownership, load/replacement/save ordering, and texture readiness.
  There were no intervening source changes for the delta review.
- Cleanup fixed two reproduced defects: transition proof consumed old default
  artifacts when Cargo built into a custom directory, and native bundle reads
  could exceed their aggregate limit when files grew after metadata inspection.
  Cargo-reported paths now drive comparison and hashes; each native read uses
  the remaining observed bundle budget. Focused regression and command evidence
  is recorded in [HISTORY.md](HISTORY.md).
- The Node engine declarations and lockfile metadata now match the pinned
  tools' requirement, `^22.13.0 || >=24`. The verification route includes the
  shared Rust gate and transition artifact selection owners.
- The 2026-10-04 candidate was based on
  `4aeb34d1831154a85405c0161c329ff15141672d` and included
  Rust-verification and transition-proof working-tree edits. Its full local
  gate passed: `verify`, 105 browser tests,
  five sequential journeys, three strict visuals, desktop smoke, and Windows
  NSIS packaging. Six Modern viewport screenshots and the 1.25 DPR capture
  were reviewed; exact commands and installer hash are in HISTORY.
- The standalone generic pose-contact crate now returns corrected local TRS and
  calibrated world orientations from current parent-first poses. All ten native
  tests pass; four fixtures produced 548 identical numeric outputs across
  native and wasm32. The previous-plane fallback retains its signed bend side
  when target and pole align. The API boundary and source hash are recorded in
  [POSE_CONTACT.md](POSE_CONTACT.md) and [HISTORY.md](HISTORY.md).
- Selective publication was verified on an isolated v0.2 candidate in September.
  The guarded staged-only helper binds paths and exact base/tree IDs, preserves
  owner edits, and retries failed pushes without duplicate commits. The
  2026-10-04 Rust-verification candidate follows this scoped publication path.

- The completed Calm Modern shell cut remains the baseline. The four v0.2
  outcomes—Modern visual refresh, UI hierarchy, user journeys and regression
  guards, and Windows release/LTS evidence—completed on 2026-09-25. Fighter-specific visual,
  all-frame, and receiving acceptance remains caller-owned; RustSMF work
  reopens only for a reproducible tool defect with a bounded fixture.
- The post-version-bump `verify`, normal browser suite, five sequential
  journeys, strict visuals, desktop smoke, and NSIS packaging gates passed.
  Exact counts, artifact hash, and remote-ref retirement evidence are in
  `docs/dev/HISTORY.md`. The shipped version is synchronized at 0.2.0.
- The context bank validates 46 groups and a focused default orientation under
  its focused budget. Defaults remain limited to orientation; the DAE/FBX
  readiness and viewport-helper routes are focused, not loaded globally.
- The integrity scan found no production TODO/stub, broken relative import or
  re-export, or unresolved Rust module. The `placeholder` match is a real
  Outliner input hint. The pose solver's `expect()` is guarded by its supported
  target invariant; other Rust matches are test assertions.
- Animated-target Outliner rename in `source/frontend/src/utils/modelAuthoring.ts`
  remains fail-closed because name-based clip bindings could break; support
  would require one atomic update across base clips, edited clips, playback, and
  undo/redo. The status explains the risk, and tests cover direct and
  hierarchy-qualified names without mutation.
- The DAE sidecar/autosave and small-unit rig-overlay issues are fixed. Existing
  format, async lifecycle, and helper tests cover their contracts; detailed
  implementation and command evidence stays in HISTORY.
- Modern palette values now have a dedicated Lumen Alloy theme stylesheet;
  Original remains explicitly scoped and its strict screenshot hash is
  unchanged. Only the intended Modern loaded-SMF snapshot was updated.
- Project integrity now validates stable Pitfall Ledger IDs and Guard paths,
  Modern palette ownership, scoped Original rules, and synchronized package
  versions. Semantic Three.js status and rig colors remain role-specific render
  colors rather than UI palette tokens.
- Large load/viewport modules remain integration owners with focused leaf
  controllers and helpers. The current inventory did not establish a safer
  additional split boundary, so no size-only refactor was made.
- The 2026-10-04 desktop smoke used native IPC mocks; it does not establish a
  new manual Windows dialog or packaged-installer installation check. Existing
  attended dialog evidence remains in HISTORY. The new package artifact was
  built and hashed, without an installation or launch test.
- [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
  contract. Private models and diagnostic output remain ignored.
