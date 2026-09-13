# RustSMF Review Snapshot

Last reviewed: 2026-09-13

Integrity repairs pass the full verification and browser gates. Current contracts
belong in [APP_STATE.md](APP_STATE.md), executable
acceptance conditions in [TODO.md](TODO.md), and dated proof in
[HISTORY.md](HISTORY.md#2026-09-13---integrity-and-source-format-review).

## Current findings

- Narrowed over-budget context routes without raising generation ceilings. The
  final full gate passes. Fixed malformed UTF-8 in app-state documentation and
  added a durable-doc encoding regression.
- Pose-review now rejects ambiguous bone/clip identities before loader renaming
  can hide them; real CLI tests cover failure, output preservation and repeatability.
- Brawl rest-reference motion was selected, but subsequent fighter candidates
  remain visually rejected. Range flags, changing-speed contacts, ankle orientation
  and continuous-motion acceptance remain open. Numeric passes do not prove no-clipping.
- Both supplied Mixamo archives contain Collada. Only the with-skin archive has
  geometry and a skin controller. DAE/ZIP are unsupported inputs, not a demonstrated
  import regression; the user guide and format tests make this boundary explicit.
- No production TODO/FIXME/unimplemented marker was found in the inspected frontend
  or Rust source. Rust expect calls are test assertions. Relative import and Rust
  module checks passed. This does not imply every runtime edge case is proven.

Completed implementation narratives are retained in HISTORY rather than repeated
here. [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
contract; private models and diagnostic output remain ignored.
