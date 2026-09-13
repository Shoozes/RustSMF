# RustSMF TODO

Last reviewed: 2026-09-13

## P1 — Prove same-topology retarget motion fidelity before fighter acceptance

Current implementation: `fittedRig.ts` fits explicit mapped bind-world frames to
the template hierarchy and prepares loss-checked replacement skin indices without
changing input geometry or weights. Focused tests and both typechecks pass.
The actual private Mario input remaps all 960 vertices across 18 meshes to
the 28-bone Wolf topology, with 18 mapped frames and maximum matrix error
4.44e-16. This is static bind-fit evidence only for the actual private models.
Animation baking and GLB stream preservation now have focused utility tests;
actual exported-model comparison and a public saved-job CLI path are still
required by this item. Closing-session evidence is in HISTORY.md.

- What: Build a local three-state comparison for the original Mario mesh/rig with untouched clips, Mario re-expressed on a Mixamo topology fitted and rebound to Mario proportions, and Wolf on that same topology. Compare unconditioned idle, walk, jab, special, jump, and damage sequences at identical source frames before any clip-specific recovery or direction conditioning.
- Why: Actual gameplay review superseded the earlier sampled-pose acceptance. The preserved Wolf candidate has correct side mapping and timing but measured normalized segment mismatches, so target bone lengths, rest frames, skin weights, or runtime transforms can still amplify otherwise correct rotations and produce visibly wrong motion.
- Where: `source/frontend/src/utils/rigMapping.ts`, `source/frontend/src/utils/rigCompatibility.ts`, `source/frontend/src/utils/animationRetarget.ts`, `source/frontend/src/utils/gameReadyValidation.ts`, `source/frontend/scripts/game-ready-cli.ts`, their focused unit tests, and the receiving game's existing model wrapper.
- When: P1, before further hand-tuned clip conditioning or any show-ready/final fighter acceptance claim.
- How: Preserve the private Mario source and animation timing byte-for-byte; fit the shared topology to Mario without applying root changes that could hide a receiving-engine pitch defect; transfer/rebind weights explicitly; emit normalized bone-direction, joint-endpoint, segment-length, and skin-weight diagnostics; then compare the three states in Quad orthographic and receiving-game views using one frame schedule and camera convention.
- Done when: The fitted Mario state matches the original Mario poses within explicit joint-endpoint and silhouette tolerances for every named sequence; Wolf discrepancies are classified to axes, proportions, weights, source damage, or runtime transforms; no sampled pose visibly self-clips; and the resulting artifact receives explicit gameplay acceptance rather than inferred acceptance from isolated screenshots.
- Verification: Focused rig-fit/rebind units prove hierarchy, inverse binds, weights, source clip hashes, timestamps, and partial-frame bounds; the game-ready CLI completes load-back/deformation/embedded-resource checks; deterministic same-frame Quad contact sheets cover every named sequence; and receiving-game playback uses only its declared uniform scale and ground translation while logging any separate model-pitch correction.
