# RustSMF Review Snapshot

Last reviewed: 2026-09-25

Current behavior and architecture belong in [APP_STATE.md](APP_STATE.md),
acceptance outcomes and completion criteria in [TODO.md](TODO.md), and dated
proof in [HISTORY.md](HISTORY.md).

## Current findings

- Selective publication is verified on an isolated candidate excluding unfinished
  retargeting work. The guarded staged-only helper binds paths and exact base/tree
  IDs, preserves owner edits, and retries failed pushes without duplicate commits.
  The candidate release gate and artifact hash are recorded in HISTORY.

- The completed Calm Modern shell cut remains the baseline. The four v0.2
  outcomes—Modern visual refresh, UI hierarchy, user journeys and regression
  guards, and Windows release/LTS evidence—completed on 2026-09-25. Fighter-specific visual,
  all-frame, and receiving acceptance remains caller-owned; RustSMF work
  reopens only for a reproducible tool defect with a bounded fixture.
- The post-version-bump `verify`, normal browser suite, five sequential
  journeys, strict visuals, desktop smoke, and NSIS packaging gates passed.
  Exact counts, artifact hash, and remote-ref retirement evidence are in
  `docs/dev/HISTORY.md`. The shipped version is synchronized at 0.2.0.
- The context bank validates 43 groups and a focused default orientation under
  its focused budget. Defaults remain limited to orientation; the DAE/FBX
  readiness and viewport-helper routes are focused, not loaded globally.
- The integrity scan found no production TODO/stub, broken relative import or
  re-export, or unresolved Rust module. The `placeholder` match is a real
  Outliner input hint; Rust `expect()` matches are test assertions.
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
- The desktop smoke used native IPC mocks; it is not a new manual Windows
  dialog or packaged-installer installation check. Existing attended dialog
  evidence remains documented in HISTORY. The package artifact was built and
  hashed, but installation/launch was not repeated for this pass.
- [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
  contract. Private models and diagnostic output remain ignored.
