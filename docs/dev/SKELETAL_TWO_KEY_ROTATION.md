# Two-key rotation authoring

Job v3 may explicitly set `conditioning.twoKeyRotationBake` or
`conditioning.twoKeyRotationBakes` in
`continuous-60hz-locomotion-root-nlerp` mode. This producer operation authors
caller-supplied local rotations for selected gaits. The ordinary CLI
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

The plural field is a strict array of one or two of these objects, mutually
exclusive with the singular field. Complete structural admission precedes
authoring. Records sharing a clip and joint must have start ticks more than two
ticks apart, so their key and adjacent-interval footprints do not overlap.
Distinct joints or clips may use the same ticks. Both bakes are staged before
publishing; a late bound failure or cancellation publishes neither. The plural
report has one entry per record; the singular report and omitted behavior retain
their existing shape and bytes. Source fidelity checks requested values/bounds
and restores only the declared union before checking every original joint matrix,
including descendants. Existing idle/terminal exceptions and tolerances remain.

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

<a id="next-bounded-pass--left-leg-arc-feasibility"></a>
## Left-leg arc feasibility — complete locally

Completed local measurement and repair selection, owned by RustSMF. On published
main `ca75e20`, the only remaining supported sole gap/penetration violations
are left-sole poses 87.25, 87.5 and 87.75 in the unchanged planted window [84,89).
Native/WASM maximum is 0.036732888542 m at v3467@87.5; independent GLB maximum
is 0.036732960250 m against 0.021012886071 m. Original STEP v3467 is above the
floor at +0.000560073 m. Left ankle Y is approximately 0.389675 m at both stored
keys 87/88 but falls to 0.353815 m between them. The 361-pose review reproduces
all four criteria within 8.533e-8 m of retained receiving measurements.

Use the accepted conditioned GLB as the experiment baseline. Only
`mixamorigLeftUpLeg`, `mixamorigLeftLeg` and `mixamorigLeftFoot` local rotations
at ticks 87/88 may change, plus their adjacent canonical chord tangents. All
three existing tracks have 91 keys and direct parent order. Reuse the retained
right-leg `two-key-contact-envelope-knee-swivel.v1` family mirrored to the left:
fixed segment lengths, unchanged hip/root and local translations/scales,
original ankle X/Z and world foot orientation, ankle Y lift 0..0.019 m and knee
swivel +/-45 degrees at each key. Each actual stored local correction is capped
at 45 degrees. Declare the finite grid and refinement before probing; preserve
the tested bounds and failed slices. These search caps were declared before measurement.
Keep support windows, 1x/+Z, Y=0, mesh/skin/bind/lineage and receiving tolerances unchanged.

Done When:

1. Bind current producer/model/support bytes and reproduce the left witness and
   source endpoint transforms. Retain all four current failure first/max records.
   Use the current 43/44 repair as baseline; its six rotations stay exact.
2. Measure all active patch vertices and all 3,726 skin vertices at the 13
   quarter poses in [86,89], including both-support exit at 87. A feasible family
   meets both sole limits and the whole-skin floor limit locally, preserves safe
   endpoints and has no knee inversion or segment-length change above `1e-4`.
   Keep the true window-entry anchors (left 84, right 66). No currently passing
   patch vertex may become a drift failure; existing failures stay below the
   retained global maximum and every increase is reported.
3. For a feasible candidate, serialize/reload independently and compare all
   361 walk poses and the 637-pose five-case baseline. The 348 walk poses outside
   [86,89], root/duration, all unselected channels/keys, 45 other clips and the
   entire [89,90] terminal curve stay exact. The right arc, idle/p25,
   calibration at 22.5 and all 24 transition seams retain their acceptance.
   Drift first/max at 2/23.75 and whole-skin first/max at 24.25/51 stay unchanged.
   Re-evaluate the full support windows; report whether both global sole criteria close.
4. Return actual stored quaternions/corrections, drift tradeoffs and one measured
   producer repair contract, or the tested family's obstruction and smallest
   next scope. Failed search is not a global impossibility proof. Experiments
   remain unqualified; production integration and renewed 46/590 receiving
   require a subsequently selected repair.

The current job has one `twoKeyRotationBake` object. Replacing its right43/44
selection with left87/88 would lose the accepted right repair. Any later producer
contract must explicitly compose both selections while preserving the existing
single-selection job. `skeletalTwoKeyRotation.ts` owns track edits;
`skeletalConditioning.ts`, `skeletalExportJob.ts` and
`skeletalConditioningFidelity.ts` own later composition and source guards.
Feasibility uses fresh caller-owned probes based on the retained right-leg
family, leaving its immutable scripts and current production bytes intact.

HISTORY and `D:/Compact_Evidence/RustSMF/runs/p7c-residual-review-20261023/`
own the source-bound review and residual ranges. Long-window drift and right
swing-foot floor repair remain later work. Preserve GaimEngine v1, all three
Rust overlays, shared dependencies and retained evidence. Full P7C remains open.

### Measured result

The declared mirrored family completed 498 trials. Swivels at 87/88 are
0/0.75 degrees; ankle lifts are 0.0095/0.00725 m. The largest actual stored
correction is 6.347503433 degrees; the selected producer bound is 7 degrees.
The six float32 quaternions remain in local `selected-authoring.json`.
Independent serialized reload reaches 0.020938136016 m for both local sole
gap and whole-skin penetration, below 0.021012886071 m. All 13 local poses pass.

The experiment compares all 637 pilot poses, including 361 walk poses. Both
global sole criteria pass; drift and whole-skin criteria remain failed with
unchanged first/max witnesses. All 348 outside walk observations, 45 other
clips, 29 unselected walk channels and right43/44 tracks are exact. Calibration,
24 transition seams, root/duration, knees and segment lengths retain acceptance.
Stored89..90 coefficients and dense terminal poses are exact. Nominal `89/60`
precedes the float32 stored89 boundary; its separate 4.503e-8 m skin delta is
retained without changing the curve or any tolerance.

No new drift threshold failure occurs. All 502 increases are recorded: largest
is 0.000403014301 m at v3383@88.25, remaining below the drift limit; largest at
an already-failed observation is 0.000237562733 m at v3489@88.5. The earlier
right-repair drift tradeoff remains unchanged. Current `bakeTwoKeyRotations`
reproduces the measured three track arrays under the 7-degree bound without
mutating its input or the right-leg tracks. The current parser correctly refuses
the proposed plural field. This is a feasible unqualified experiment; the
production candidate still has four failed physical criteria.

Evidence is retained at
`D:/Compact_Evidence/RustSMF/runs/p7c-left-leg-arc-feasibility-20261023/`.
HISTORY owns commands, source identities, prototype hash, source controls,
harness corrections and preservation. No receiving qualification was renewed.
The raw byte-patched prototype retains nine old accessor min/max components.
Their conservative ranges contain the data but are not its exact extrema.
The ordinary exporter regenerates bounds from stored float32 triplets; CLI
regression checks exact extrema and rejects deliberately widened metadata.
Retain the private prototype and use fresh ordinary CLI serialization for qualification.

<a id="selected-producer-repair--composable-two-key-bakes"></a>
## Selected producer repair — composable two-key bakes

Implement explicit `conditioning.twoKeyRotationBakes` as a strict array of one
or two records with the existing recipe shape in NLERP job v3. Preserve the singular
`twoKeyRotationBake` and its report; the fields are mutually exclusive. Parse
and validate the complete selection before authoring. Reject unknown fields,
malformed or oversized selections and overlapping key or adjacent-interval edits
on the same clip/joint. Reuse the existing generic track baker; caller jobs own
joint names and quaternions. Apply records deterministically and report each
actual stored correction. Do not hard-code White Wolf or a leg side.

The selected caller recipe retains right43/44 with its 13-degree bound and adds
left87/88 with 7 degrees, using `selected-authoring.json`. The current single
selection cannot express both records. `skeletalExportJob.ts` owns admission;
`skeletalConditioning.ts` owns application; `skeletalConditioningFidelity.ts`
must verify the union of requested local rotations/bounds and restore only that
union for every original integer joint-matrix guard. Existing idle and terminal
guards, raw authored differences and all receiving tolerances remain intact.

Done When:

1. Strict NLERP opt-in, legacy singular and omitted-option compatibility,
   duplicate/overlap/bound refusals and cancellation pass. Refusal publishes no
   generation or leaked native copy. Existing single-job model bytes remain exact.
2. Ordinary CLI produces both measured key pairs with right tracks preserved;
   independently reload the serialized GLB. Both global sole criteria and all
   13 local poses pass. Compare the complete 637-pose baseline and retain the
   348 outside observations, 45 clips, root, mesh/skin/bind/lineage, supports,
   idle/p25, calibration, 24 seams and stored terminal curve. Keep the current
   no-new-drift-failure rule, report all increases and preserve drift/whole-skin
   first/max witnesses. Do not claim those remaining criteria closed.
   Assert each selected rotation accessor's min/max against all stored float32
   triplets. Positive and stale-bound negative test controls cover both records.
3. Bind new producer identities and renew all 46 packets/590 independent
   references through actual native Rust and WASM, isolation, restored replay
   and cleanup, plus the actual 637-pose pilot. Run the canonical local application
   gate. Keep four production failures until the new producer is actually proven;
   two experimental failures do not qualify it.
   The physical pilot retains its failed drift/whole-skin criteria; separate
   bounded repair acceptance must pass without relabelling those failures.
4. Update TODO/HISTORY and affected contracts/routes, release owned disposable
   resources, and preserve GaimEngine v1, all three Rust overlays, shared
   dependencies and retained evidence. Full P7C and visual acceptance remain open.

### Original local composition result — 2026-10-24

The original producer/GLB acceptance and 46/590 receiving proof passed at source
`3860565c...`. Later comparison with the qualified singular graph exposes a
separate emitted-runtime gap: only 335/348 outside left-arc poses stay exact,
despite raw GLB preservation. [The completed union boundary repair](SKELETAL_EXPORT_BOUNDARY.md#plural-union-results)
closes that separate gap with renewed qualification. The following results remain the
original source-bound measurements; they do not establish that exact runtime
criterion or qualify the proposed boundary extension.

Right43/44 remains exact under 13 degrees; left87/88 fits 7 degrees, with maximum
actual stored corrections 12.267215277/6.347503433 degrees. The reloaded GLB
matches the measured prototype binary, while ordinary serialization regenerates
exact extrema for all six selected CUBICSPLINE accessors. Four stale min/max
controls, covering both records, are refused by the evidence assertions.

Actual native/WASM receiving passes all 46 packets/590 independent references,
isolation, restored six-tick replay and cleanup. The actual 637-pose pilot closes
both global sole criteria at 0.020938074220 m against 0.021012886071 m. All 13
left poses and the retained right arc pass. Independent GLB maximum is
0.020938136016 m. All 348 outside observations, 45 other clips, root,
mesh/skin/bind/lineage, supports, idle/p25, calibration, 24 transition seams and
the stored89..90 terminal curve retain acceptance.

No new drift threshold failure occurs. All 502 increases remain recorded;
largest is 0.000403014301 m at v3383@88.25, still below the drift limit. The
largest increase at an already-failed observation is 0.000237562733 m at
v3489@88.5. Drift first/max at 2/23.75 and whole-skin first/max at 24.25/51
remain unchanged. The physical diagnostic completes with exit 1 for those two
failures; separate bounded acceptance exits 0. Full P7C and visual acceptance
remain open. HISTORY and
`D:/Compact_Evidence/RustSMF/runs/p7c-composable-two-key-bake-20261024/`
own exact source identities, commands, canonical gate and preservation evidence.

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-two-key-bake | change=specified strict opt-in authoring and source-bound local receiving proof -->

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-residual-review | change=selected bounded left-leg feasibility and retained producer composition constraint -->

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-left-leg-feasibility | change=proved mirrored family and selected strict two-record producer composition -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-review-cleanup | change=preserved raw prototype and required exact ordinary-export accessor extrema -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-composition-bake | change=closed qualified producer composition and retained two residual physical failures -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-plural-union-boundary | change=closed bounded union sampling with renewed runtime proof and retained physical failures -->

<a id="selected-three-recipe-contract-proposal"></a>
## Selected three-recipe contract — proposal only

The read-only 2026-10-25 representation decision selects a bounded extension of
the existing plural field to one, two or three records. Current source still
admits at most two; this section is the next implementation contract, not a claim
that the extension or its receiving qualification exists. Keep job v3, the
existing record/report shapes and explicit NLERP/export-boundary policy.

Use the existing two-key primitive for right24/25, right43/44 and left87/88.
Each pair passes current structural admission and all three pairwise footprint
checks; each is disjoint from the existing right48–65 span. The new selected
24/25 recipe declares a 25-degree bound and reuses the six measured values in
the private feasibility run. Legacy per-record bounds remain unchanged. Keep
one 3–18-key span, the terminal/idle/floor bakes and all other resource limits.
No special model names, hidden preprocessing, new correction field, runtime IK
or receiving-engine change is selected. Replacing a prior bake violates
preservation; merging right24..65 needs 42 keys and exceeds the span bound.

The verified admission owners are `parseTwoKeyRotationSelection` and
`twoKeyExportReports`: both currently cap the list at two. The selection parser
currently compares only indices 0/1. The implementation must check every pair,
including 0/2 and 1/2, with the existing same-clip/shared-joint adjacency rule;
four or more records and sparse/malformed entries must refuse. The existing
conditioning, fidelity, CLI and baseline-restoration loops already iterate
records, but must receive explicit third-record regressions. Preserve report
order and recipe hashing; do not mutate caller arrays or publish partial work.

The private motion proof is reusable as a reference for the selected rotations,
not as an ordinary serialization or asset-byte baseline. Its patched GLB retains
stale extrema on RightUpLeg and RightFoot rotation accessors; the latter
understates new tangent ranges. Preserve that raw evidence. The ordinary writer
must regenerate exact min/max from every stored float32 CUBICSPLINE triplet,
using the existing `assertRotationAccessorBounds` regression pattern. The
ordinary selected full-pose export also differs from the private rotation-only
compositor in five translation/scale components at tick 25 by at most
2.220446049250313e-16. Keep the existing full-pose policy and measure the actual
ordinary output; do not silently assert private-asset byte equality or waive any
exact root/outside/drift guard. If these cannot all hold, report the bounded
integration refusal and measured cause before selecting another contract.

| Required proof | Acceptance |
| --- | --- |
| Admission and failure lifecycle | Three valid records; all pair positions, duplicate/adjacent footprints, fourth record, singular/plural conflict, wrong mode/role/root, malformed provenance and stale later reports tested. Late third-bound failure and cancellation leave clips/generations unpublished and release owners. |
| Compatibility and ordering | Omitted, singular and existing one/two-record conditioned GLB, asset, mapping and reference bytes remain exact at fixed inputs. All six valid record permutations yield identical model/asset/mapping/reference bytes; settings/report record order remains caller-owned. Producer/generation identity metadata may change with source. |
| Ordinary producer path | Actual CLI performs authoring, serialization/reload and export. Stored bounds and exact accessor extrema pass. Use independent references from that reload; include missing third provenance and widened/understated extrema negative controls. |
| Private-to-ordinary local proof | Right24/25 within 25 degrees; all 13 local quarter poses within existing skin/active-sole limits, 348 exact outside samples and 23/26 boundaries, unchanged root and 23,240 exact drift observations. Report rounding differences rather than changing tolerances. |
| Preserved accepted behavior | Both 13-pose arcs, 77-pose span region, terminal/calibration phases, 27 stable segments/no knee inversion, 24 seams, six endpoints, 45 other clips, geometry/skin/bind, supports and thresholds retain acceptance. |
| Qualification and canonical gate | Renew all 46 packets/590 actual native/WASM references, isolation/restored replay and actual 637-pose pilot on the new producer; reuse the unchanged qualified captured engine only after source/output validation. Expect only the known planted-drift failure; skin must pass. Run affected tests and the full local canonical gate. Full P7C/visual acceptance stays separate. |

Ownership is RustSMF producer code and its tests/docs. GaimEngine v1, all three
Rust overlays, shared dependencies and retained qualification evidence remain
protected. No publication is part of this implementation pass-down.

<!-- AI-edited: 2026-10-25 | agent=Codex/root | task=p7c-representation-decision | change=selected bounded proposal and explicit ordinary serialization proof -->

<!-- AI-edited: 2026-10-25 | agent=Codex/root | task=p7c-proposal-review | change=clarified the sole limit exception and complete permutation compatibility -->
