# RustSMF Review Snapshot

Last reviewed: 2026-09-13

Current contracts
belong in [APP_STATE.md](APP_STATE.md), executable
acceptance conditions in [TODO.md](TODO.md), and dated proof in
[HISTORY.md](HISTORY.md).

## Current findings

- Integer-frame source mapping fixes cycle/landmark STEP boundaries. Optional
  asymmetric ramps, cyclic planted pins and local reference calibration share
  strict job/profile validation and regression tests.
- Slow-v2 closes the measured whole-loop support gap; game front/side playback
  confirms a narrow handoff improvement. Jab reference calibration passes unchanged
  ranges while retaining wrist motion. Middle/fast, other action flags, coherent
  final recipe metadata and moving-host visual acceptance remain open.
- Both supplied Mixamo archives contain Collada. Only the with-skin archive has
  geometry and a skin controller. DAE/ZIP are unsupported inputs, not a demonstrated
  import regression; the user guide and format tests make this boundary explicit.

Completed implementation narratives are retained in HISTORY rather than repeated
here. [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
contract; private models and diagnostic output remain ignored.
