# RustSMF TODO

Last reviewed: 2026-09-15

Completed work lives in HISTORY.md. Brawl rest-reference motion is selected;
Melee is a fallback. Full Wolf visual acceptance remains open.

## P1 — Close baseline action-range and skin review

- What: Finish full-loop skin acceptance across all 37 admitted roles, including the 17 roles with 34 retained angular flags. HISTORY indexes recorded comparisons and bounded target-frame inspection; neither establishes normal-speed or occluded-skin acceptance.
- Why: Calibrated angles and source fidelity cannot establish healthy deformation or absence of self-clipping.
- Where: `source/frontend/src/utils/poseRanges.ts`, `source/frontend/src/utils/forearmTwist.ts`, `source/frontend/src/rig-comparison/comparison.js`.
- When: P1, before accepting a replacement asset.
- How: Reuse hash-bound unchanged tracks and inspect side/quarter loops against source frames and anatomical axes. Resolve attack4–7 wrist/helmet occlusion with close side views before claiming penetration. Review corrected grounded cast separately. Preserve tracks, mesh, materials and weights; do not widen ranges to suppress flags.
- Done when: Every component is corrected or explicitly accepted against source, calibration and skin evidence; both legs and torso pass full-loop visual review without observed self-clipping.
- Verification: Hash-bound range report, per-component dispositions, corrected-seek Quad receipts and raw asset/track preservation checks. Earlier captures are not automatic acceptance.

## P1 — Verify receiving-game transitions and paired contact

- What: Complete integration acceptance independently of producer pose review.
- Why: Steady locomotion does not cover changing speed, transition blending, paired-fighter overlap or reset behavior.
- Where: `source/frontend/scripts/game-ready-producer.ts`, `source/frontend/src/utils/gameReadyJob.ts`, and the game-owned private integration workspace.
- When: P1, after asset/stop selection and before show-ready claims.
- How: Keep completed hash-bound start/stop proofs in HISTORY; verify remaining role changes and both facings with the game owner. Two confirmed cast-entry discontinuities need exact incoming startIdleToWalk0 and ordinary walk4 poses, explicit 16-sample saved-profile handoffs ending at corrected special16, and unchanged release timing. The receiving owner's canonical mirrored packet is ready; baking was deferred by session close. Use its controlled cases, not collision-dependent observed travel. Preserve current roles/banks and raw asset surfaces. Keep paired-contact fixes receiving-owned.
- Done when: Structure, attachments, KO/reset/checkpoint, native/WASM, actual-browser and 30/60/120/144 Hz presenter checks pass for selected hashes; transition/contact limits are resolved or explicitly accepted.
- Verification: Hash-bound package and receiving-game command records plus continuous paired-fighter playback. External game evidence is required, not replaced by mocked app tests.

## P2 — Evaluate the supplied Mixamo pair as an independent source reference

- What: Validate the supplied animation-only and with-skin Collada pair through the new DAE path before selecting it for retargeting.
- Why: The pair separates source animation from deformation; native Collada support now removes the format blocker, but bone names alone still do not prove compatible calibration.
- Where: `source/frontend/src/loaders/dae.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/export-formats.spec.ts`, the user guide's Mixamo section, and original user-owned archives outside this repository.
- When: P2, if source comparison proceeds; this optional alternative is not a Brawl acceptance dependency.
- How: Preserve originals. Extract each archive into a fresh folder, select its DAE (and only referenced sidecars), verify Y_UP/joint/channel/skin coverage and bind transforms, compare source idle playback, then exercise DAE export/re-import before retargeting. ZIP remains a container rather than an import format.
- Done when: Both supplied DAE files load without browser errors, the animation-only file is correctly identified as geometry-free, the with-skin file renders and deforms through a complete idle loop, and the selected source is explicitly accepted or rejected with hash-bound evidence.
- Verification: Original archive hashes, structural comparison, complete idle loop, visual self-clipping review, and DAE roundtrip checks. Animation-only input cannot establish mesh deformation quality.
