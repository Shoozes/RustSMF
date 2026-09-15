# RustSMF Review Snapshot

Last reviewed: 2026-09-15

Current contracts
belong in [APP_STATE.md](APP_STATE.md), executable
acceptance conditions in [TODO.md](TODO.md), and dated proof in
[HISTORY.md](HISTORY.md).

## Current findings

- The import guard now rejects explicit JavaScript filenames backed only by a
  directory index; extensionless indexes and TypeScript substitution remain
  supported. Earlier swing-foot and endpoint-timeline regressions stay covered.
- Relative frontend imports/re-exports and Rust module checks pass. The source
  marker scan found no production TODO/FIXME/unimplemented stubs; the remaining
  `placeholder` match is a real input hint. This is not exhaustive runtime proof.
- Existing GLB roundtrip and comparison-seek fixes remain covered by the local
  gates. DAE is now a supported browser import/export path with pre-save
  re-import validation; ZIP remains a container, not a model input.
- Motion acceptance remains scoped. All 37 target quarter frame sheets were
  inspected; normal-speed/source-side and occluded-skin acceptance remain open.
  Two receiving-confirmed cast seams require exact incoming-pose handoffs, not
  changes to unchanged role clips. TODO owns the remaining conditions.
- Focused context routes already cover the new solver leaves and GLB identity
  issue. Defaults remain narrow; no physical folder move or budget increase was
  justified. Dated measurements and commands belong in HISTORY.

Completed implementation narratives are retained in HISTORY rather than repeated
here. [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
contract; private models and diagnostic output remain ignored.
