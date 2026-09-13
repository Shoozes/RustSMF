# RustSMF Review Snapshot

Last reviewed: 2026-09-13

The closing integrity pass completed the strict same-topology timing/coverage boundary, reusable saved retarget profiles, target-length natural-motion conditioning, expanded three-state visual diagnostics, and immutable v2 game-ready publication. One P1 alternate-source/model comparison remains after the full video rejected the latest Wolf motion. Current behavior and limits belong in `APP_STATE.md`; completed work and exact command results belong in `HISTORY.md`.

## Findings resolved

- Upgraded the game-ready contract to v2 immutable generations. Canonical role-tagged input and producer identity derive the generation ID; model/job/mapping/report hashes are committed in a last-written manifest, one directory rename exposes the generation, and the current pointer changes afterward.
- Replaced parallel whole-file CLI materialization with same-handle chunked reads. Per-file limits, regular-file checks, and the remaining aggregate budget are enforced before later inputs are read.
- Made fitted comparison fail closed on missing/renamed/shortened clips or incomplete sampling. Exact regular-grid and terminal schedules separate source float32 evaluation from fitted next-down-key evaluation and report the worst rejected sample rather than accepting a partial result.
- Reworked the three-state viewer as a strict receipt-producing diagnostic: explicit playback speed, multi-frame accumulator, Quad orthographic light table, equal-height/exact-game transform modes, and cleanup on cancellation or partial load failure. The quiet olive/cream surface keeps the twelve synchronized views primary and diagnostics secondary.
- Added mapped/unmapped skeleton colors, reversible mesh opacity, and selected-joint axes/bend-plane overlays behind the viewer's named Diagnostics disclosure. The manifest mapping is checked against unique scene bones before drawing.
- Added strict path-free saved profiles in Animate. Complete v2 jobs normalize to the same portable profile schema, React and CLI share clip-option resolution, explicit numeric maps no longer require leaving the app, and profile application remains one undoable transaction.
- Added target-length torso distribution, two-bone leg solving, calibrated sole contacts, declared root travel, and clip-scoped leg-direction/minimum-bend limits. The contact weight fades locomotion limits out at planted feet; reports expose reach, correction, and requested/constrained angle evidence.
- Material preparation now disposes textures/materials acquired before a later load failure. Additive append, retarget, and repair operations join latest-intent ownership so stale completions cannot clear or overwrite a newer operation's status.
- Removed a static `App.tsx` import of the Tauri bridge that defeated lazy loading. The production manifest again emits it as a dynamic entry, and the entry-chunk guard now fails if that boundary regresses.
- Updated the focused game-ready and fitted-rig context routes without adding generated/private artifacts or duplicating progress history.

## App and follow-up state

The reviewed changed surface has no unresolved TODO/FIXME/stub marker or broken relative import/export seam. Focused units cover generation competition/failure injection, endpoint hold semantics, exact clip/duration coverage, and worst-sample reporting. Real-GLB browser cases cover the strict viewer, deterministic delayed-frame advancement, visible clip errors, exact transforms, receipts, and resource cleanup. Current full-gate results are recorded in HISTORY.md.

The corrected Wolf model was not broken at import or export: source/fitted Mario equivalence, final GLB re-import, hashes, STEP timing, deformation, and receiving-game structure all pass. The observed left-leg defect came from applying valid source world directions to materially different target proportions. Clip-scoped target-pelvis limits removed the nearly horizontal swing while keeping planted-foot contacts authoritative. Quad frame review found no visible self-clipping, and the receiving game passed Windows, web, native/WASM, actual-Chrome, all-role attachment, KO/reset/checkpoint, and 30/60/120/144 Hz presenter checks. The later full-loop video nevertheless failed operator acceptance because the left leg still reads stiff and the motion is not show-ready. `TODO.md` now owns the Melee/Brawl skeleton-and-motion comparison; more clamping of this candidate is not assumed to be the answer. Historical Windows-dialog acceptance remains complete and is not reopened.
