# Two-key rotation authoring

Job v3 may explicitly set `conditioning.twoKeyRotationBake` in
`continuous-60hz-locomotion-root-nlerp` mode. This producer operation authors
caller-supplied local rotations for one selected gait. The ordinary CLI
serializes and independently reloads the result before generating references.
Omission preserves the existing GLB bytes and idle, p25 and terminal behavior.
GaimEngine v1, Rust solvers and receiving tolerances remain unchanged.

## Recipe and selection

The strict object has four fields:

| Field | Contract |
| --- | --- |
| `clipId` | One selected source gait declared by a transition recipe. |
| `startTick` | Integer 1–3598; it and the next tick must both precede the clip endpoint. |
| `maxRotationDegrees` | Finite positive bound, at most 180 degrees, on each actual stored correction. |
| `rotations` | Exactly three entries in direct parent order, each with `joint` and `values`. |

Each joint is unique, exists in the skeleton and has one canonical full-grid
chord quaternion channel. Source and locomotion roots cannot be selected.
`values` contains two finite unit quaternions, one for each selected tick, with
unit-length error at most `1e-6`. Names use the existing safe identifier rules.
Unknown fields, wrong roles/modes, missing or duplicate targets, disconnected
chains, endpoint pairs, constant two-key channels and noncanonical chords refuse.

`skeletalTwoKeyRotation.ts` clones the selected tracks, stores float32 values and
rebuilds canonical chord tangents. It checks each actual stored correction
against the declared bound. All other stored rotations and nonadjacent tangents
must stay exact, including hemisphere signs. A request requiring propagation
into other keys refuses. Only three adjacent intervals can change. Root tracks,
duration, mesh/skin/bind and all unselected channels/clips are preserved.
Input tracks are never mutated; cancellation is checked before work, per joint
and before return. Failure publishes no new conditioned input or generation.

`report.twoKeyRotationBake` records policy
`two-adjacent-interior-rotations.v1`, clip, ticks, declared bound and every
joint's original, requested and actual stored quaternion/correction angle.
The option, report and implementation participate in producer/generation identity.
This is explicit authoring; it infers no contacts, root offset or support window.

## Original-source fidelity

`skeletalConditioningFidelity.ts` verifies the requested orientations and bound
at the two selected integer ticks. For the preservation comparison only, it
restores those three local rotations from the original source and checks every
original joint matrix, including descendants, against the unchanged `1e-4`
limit. Unselected translations, scales, rotations and other integer ticks keep
their guards. A gait cannot use the planted-idle exception. Existing terminal
authoring remains separately guarded. Raw authored position/matrix differences
remain visible; `maximumPreservedTickJointMatrix` reports the checked maximum.

## Selected White Wolf result

The selected recipe authors RightUpLeg/RightLeg/RightFoot at ticks 43/44 with a
13-degree stored bound. The measured six quaternions remain caller-owned local
evidence. The largest actual correction is 12.267215277 degrees. Serialized GLB
local gap/penetration is 0.020891718305 m; actual native/WASM maximum is
0.020891640925 m, below 0.021012886071 m across all 13 quarter poses in [42,45].
Root and 348 outside observations stay exact, with 45 other clips, 29 raw walk
channels, all 24 slow-walk transition seams, terminal closure and calibration
preserved. No new drift threshold failure or knee inversion occurs. Existing
drift at v200@43.5 increases 0.001527899987 m. Drift first/max at 2/23.75 and
whole-skin first/max at 24.25/51 are retained. The unchanged left-sole witness
at 87.5 remains 0.036732960250 m; four whole-walk physical criteria remain open.

The renewed 46 packets/590 independent references pass native and actual WASM,
isolation, six-tick restored replay and resource release. The actual 637-pose
pilot completes while correctly failing those four global criteria. HISTORY
owns source identities, exact commands, failures, full gate and retained proof.
This bounded repair does not close full P7C or establish visual acceptance.

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-two-key-bake | change=specified strict opt-in authoring and source-bound local receiving proof -->
