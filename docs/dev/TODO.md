# RustSMF TODO

Last reviewed: 2026-09-13

Completed solver, comparison, source-selection and verification work lives in
HISTORY.md. Brawl rest-reference motion is selected; Melee remains a fallback,
not an acceptance prerequisite. Latest Wolf candidates lack full visual acceptance.

## P1 — Accept the selected fighter's motion in the receiving game

- What: Extend the verified slow-walk handoff/loop contact method to middle/fast locomotion, resolve remaining action/body-range flags, and obtain continuous-motion acceptance. Slow-v2 closes the measured support gap; wrist calibration passes jab ranges but still needs visual review.
- Why: Source identity, valid export and steady-speed checks do not cover changing speed, stopping, role transitions, skin intersection or natural appearance.
- Where: `source/frontend/src/utils/animationRetarget.ts`, `source/frontend/src/utils/naturalRetarget.ts`, `source/frontend/src/utils/poseRanges.ts`, `source/frontend/src/rig-comparison/comparison.js`, and the game-owned private integration workspace.
- When: P1, before replacing the accepted baseline or claiming show-ready fighter motion.
- How: Preserve immutable candidates and selected rest-reference calibration. Review tilt, damage and recovery without clamping airborne phases. Produce a final coherent job containing accepted clips and their contact/grounding/root-travel metadata; an attack-only job does not describe carried walking tracks. Compare full loops front/side at normal speed, then scaled soles under facing/root travel, deceleration, stops and role changes with the game owner. Plane following is not planted/no-slide contact.
- Done when: Both legs and torso are accepted in full loops with no observed self-clipping; every range flag is corrected or explicitly reviewed against calibration; contact/transition coverage is complete or limitations explicitly accepted; structure, attachments, KO/reset/checkpoint, native/WASM, actual-browser and 30/60/120/144 Hz presenter checks pass for the selected hashes.
- Verification: Hash-bound reports, stage trajectories, front/side continuous video decision, Quad receipts and receiving-game command records. External visual acceptance remains required; numerical success alone does not close this item.

## P2 — Evaluate the supplied Mixamo pair as an independent source reference

- What: Validate a supported-format derivative of the supplied animation-only and with-skin Collada pair before selecting it for retargeting.
- Why: The pair separates source animation from deformation, but RustSMF has no DAE/ZIP import path. Bone names alone do not prove compatible calibration.
- Where: `source/frontend/src/utils/modelFormat.ts`, `source/frontend/src/loaders/glb.ts`, `source/frontend/src/loaders/fbx.ts`, the user guide's Mixamo section, and original user-owned archives outside this repository.
- When: P2, if source comparison proceeds; this optional alternative is not a Brawl acceptance dependency.
- How: Preserve originals. Obtain a supported FBX or GLB/GLTF derivative, validate joint/channel/skin coverage and bind transforms against the DAE, and compare source idle playback before retargeting. Native Collada import would be a separate format feature.
- Done when: The supported derivative's source playback, skin and timing are verified, its retarget is visually compared, and the source is explicitly accepted or rejected with evidence.
- Verification: Original/derivative identity, structural comparison, complete idle loop and roundtrip checks. Animation-only input cannot establish mesh deformation quality.
