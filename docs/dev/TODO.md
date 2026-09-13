# RustSMF TODO

Last reviewed: 2026-09-13

## P1 — Compare alternate fighter rigs after rejecting the conditioned Wolf motion

Current implementation: import/export, exact fitted-source comparison, immutable
publication, target-length natural retargeting, contact/leg diagnostics, and the
receiving-game timing/runtime lanes pass. The latest conditioned Wolf candidate
removed the nearly horizontal left-leg pose and showed no obvious sampled
self-intersection, but the operator rejected the full video because the left leg
still reads stiff and the overall motion is not show-ready. This is a visual
motion-quality blocker, not a broken import/export or texture path.

- What: Obtain legally usable Melee and/or Brawl reference exports and compare their skeleton topology, rest pose, proportions, locomotion curves, and deformation against the current source and Wolf target before choosing the next motion source/model track.
- Why: More target-local clamping can make the current retarget numerically safe while also making it stiffer. The full video proved that passing contacts, angle limits, fixed-rate playback, and sampled Quad frames is insufficient for acceptable continuous character motion.
- Where: `source/frontend/src/utils/animationRetarget.ts`, `naturalRetarget.ts`, `source/frontend/src/rig-comparison/*`, the immutable rejected generation recorded in `HISTORY.md`, and a private comparison workspace outside committed source routes.
- When: P1, before any further hand-tuned Wolf gait changes or a claim that the fighter is show-ready.
- How: Export each authorized reference to a format RustSMF can load, validate revision/tool compatibility, then compare identical locomotion frames in Quad with translucent mesh, mapped-bone colors, and hip/knee/ankle planes. Measure pelvis-local stride, knee bend, foot contact, root travel, and continuous loop cadence. Treat reconstructed gameplay as behavioral reference only, not an original-asset equivalence oracle. Choose the smallest source/model change that improves the full loop without losing game contracts.
- Done when: Melee and Brawl are each explicitly accepted, rejected, or unavailable with source/revision evidence; at least one complete locomotion loop is compared against the current rejected candidate; the selected direction has an owned/legal asset and exact import/export path; continuous video shows natural left-leg motion without self-clipping; and the receiving game reruns structure, contacts, attachments, KO/reset/checkpoint, actual-browser, native/WASM, and 30/60/120/144 Hz presenter checks.
- Verification: Retain generation/model hashes, a same-frame Quad receipt sequence, the full-loop video decision, and receiving-game command results. A green numeric report without operator acceptance is not completion.
