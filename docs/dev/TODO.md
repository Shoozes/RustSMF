# RustSMF TODO

Last reviewed: 2026-09-19

Completed work lives in HISTORY.md. Consumer-specific wolf, KO, paired-fighter
and visual-acceptance conditions belong to fight-game-study. Keep them as
integration evidence links, not this product's completion requirements.

## P1 — Close baseline action-range and skin review (reusable humanoid)

- What: Finish full-loop skin acceptance for the current caller-supplied humanoid job, including retained angular flags, without treating 37 fighter roles as this tool's product.
- Why: Calibrated angles and source fidelity cannot establish healthy deformation or absence of self-clipping.
- Where: `source/frontend/src/utils/poseRanges.ts`, `source/frontend/src/utils/forearmTwist.ts`, `source/frontend/src/rig-comparison/comparison.js`.
- When: P1, when a caller-owned job requests a mechanism review.
- How: Reuse hash-bound unchanged tracks and inspect side/quarter loops against source frames and anatomical axes. Preserve tracks, mesh, materials and weights; do not widen ranges to suppress flags. Wrist/helmet occlusion on a named clip is a game visual finding unless a tool-level mapping/envelope defect is reproduced on a noncombat fixture.
- Done when: Every reviewed component is corrected or explicitly accepted against source, calibration and skin evidence without observed self-clipping.
- Verification: Hash-bound range report, per-component dispositions, and raw asset/track preservation checks.

## P2 — Complete supplied Mixamo pair visual acceptance

- What: Finish visual/source acceptance of the supplied animation-only and with-skin Collada pair after the DAE structural path was proven.
- Why: Import, geometry classification, skeleton/clip discovery, and DAE round-trip behavior are complete; bone names and a successful load still do not prove compatible calibration, timing, or self-clipping safety.
- Where: `source/frontend/src/loaders/dae.ts`, `source/frontend/tests/export-formats.spec.ts`, the user guide's Mixamo section, and the original user-owned archives outside this repository.
- When: P2, if source comparison proceeds; this optional alternative is not a Brawl acceptance dependency.
- How: Preserve the measured archive hashes. Inspect the with-skin DAE through a complete idle loop in perspective and quad orthographic views, compare rest axes and timing against the animation-only source, and record a source decision without modifying the originals. Keep ZIP as a container rather than an import format.
- Done when: Both supplied DAE files remain load-clean, the animation-only file remains geometry-free, the with-skin file passes a complete idle loop with no observed mesh self-clipping or broken leg/torso deformation, and the source is explicitly accepted or rejected with hash-bound evidence.
- Verification: Existing Chromium load/round-trip checks plus new visual receipts, clip duration/channel comparison, and a dated source decision in `HISTORY.md`.
