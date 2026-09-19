# RustSMF Review Snapshot

Last reviewed: 2026-09-19

Current contracts
belong in [APP_STATE.md](APP_STATE.md), executable
acceptance conditions in [TODO.md](TODO.md), and dated proof in
[HISTORY.md](HISTORY.md).

## Current findings

- The context bank now validates 41 groups. The default orientation expands to
  52.6 KiB under its 56 KiB focused cap and the 256 KiB generation ceiling;
  DAE, store, and build-contract paths are routed through their owning groups.
- Relative frontend imports/re-exports, Rust module checks, lint, both
  typechecks, production-`any`, and the source marker scan pass. No production
  TODO/FIXME/unimplemented stub was found; the remaining `placeholder` match is
  a real input hint. This is not exhaustive runtime proof.
- The browser contract is green at 104/104 tests after correcting a stale DAE
  status assertion to match the generic `Loaded: <name>` load path. Existing
  GLB/FBX/DAE/OBJ round-trip, sidecar, replacement, and async-ownership checks
  remain covered.
- DAE is a supported browser import/export path with pre-save re-import
  validation and synthesized missing Collada normals; ZIP remains a container,
  not a model input. The user-supplied with-skin Mixamo DAE still lacks a
  trustworthy shaded silhouette because the rig helper dominates the view.
- The supplied DAE visual review and reusable humanoid action-range/skin review
  remain active evidence items. Caller-ownership remains an active policy guard
  until neutral-fixture and consumer-independence evidence is documented; game
  appearance and transition checks stay outside RustSMF completion criteria.

Completed implementation narratives are retained in HISTORY rather than repeated
here. [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
contract; private models and diagnostic output remain ignored.
