# Humanoid Pose Review

This diagnostic measures calibrated local angular envelopes. It does not clamp
animation, simulate ragdolls, supply medical ranges, certify skin deformation,
prove planted contacts or replace continuous visual review.

## Contract

`rustsmf.pose-ranges.v1` declares an ID, `report` or `reject` policy and 1–64 unique
joint entries. Each entry owns its exact bone name, unit reference quaternion,
perpendicular unit bend/twist axes, increasing flexion/lateral/twist degree ranges
within [-180, 180], and a positive swing cone no greater than 180 degrees.
Unknown fields, invalid calibration, missing bones and invalid rotations fail closed.

Optional `retarget.poseRanges` shares the parser and final-output audit across
saved profiles, game-ready jobs, retarget core and frontend. `report` preserves the
result and surfaces offending clips, bones, components and frames. `reject` fails
before committing generated animation or exporting a candidate. Retarget audits
use their output grid; standalone review samples at 60 Hz plus terminal.

## Standalone command

From `source/frontend`, supply absolute paths and fresh output filenames:

```powershell
npm run pose-review -- --model <embedded-model.glb> --profile <profile.json> --report <fresh-report.json>
npm run pose-review -- --model <embedded-model.glb> --calibrate-mixamo <fresh-profile.json> --reference-clip <neutral-clip-name> --report <fresh-report.json>
```

Calibration uses time zero of an explicitly reviewed neutral clip. It supports
plain and `mixamorig`/`mixamorig:` names and intermediate chain bones under the
explicit Y-up/Z-forward convention. These broad animation heuristics are not
universal anatomical constants. Inspect calibration before using rejection policy.

The CLI accepts embedded GLB only, refuses external buffer/image URIs, bounds
models to 128 MiB and saved profiles to 1 MiB, and accepts 1–256 clips. Its shared
schedule limits each clip to 6,000 regular frames; total sampling is capped at
200,000. Existing output files are not overwritten. After an output failure,
inspect any already-created calibration file before retrying with fresh paths.
Ambiguous or unnamed raw/loaded bone and clip identities and incompatible skin
joint sets are rejected before scanning. Output existence is preflighted before
calibration and exclusive creation also guards against later collisions.

Exit codes: `0` within-profile, `2` review-required, `1` failure. Reports bind model
and normalized profile hashes, sample times, first/last/worst offending frames
and counts. Within-profile means only the declared angular envelopes passed.

## Ownership and proof

- `poseRanges.ts`: schema validation and swing/twist measurement.
- `humanoidPoseRanges.ts`: optional Mixamo calibration heuristics.
- `pose-review-cli.ts`: bounded input, sampling, output and disposal.
- `poseRanges.test.ts`: calibration, mirrored/antipodal rotations, signed bends.
- `poseReviewCli.test.ts`: real CLI exit codes, deterministic reports, ambiguity,
  external resources, output preservation and terminal-inclusive sampling.
- `retarget-profile.spec.ts`: frontend report/reject transaction coverage.

Run the repo verification gate and focused pose/profile tests after changes.
Game-specific source choices and candidate acceptance belong in HISTORY/TODO,
not this reusable contract.

Contact correction must respect articulation as well as ground height. Natural
profiles can explicitly select `orientationMode: animated-heading`; this keeps
sole tilt constrained while retaining yaw from the transferred foot. A planted
contact captures yaw on entry, while a plane contact follows animated yaw. The
range checker remains read-only: it neither adds this option nor widens limits.

Retarget profiles may explicitly apply `localReferenceCorrections` keyed by bone,
each with unit-quaternion `from` and `to` arrays. The constant local offset is
applied after recovery and before angular audit, preserving relative animated
rotation deltas, not freezing the joint. Solved ankles and their ancestors are
protected. Calibration requires source/reference evidence; passing the resulting
ranges does not prove skin or visual acceptance.

## Sampled receiving-root travel

For nonlinear offline contact baking, saved jobs and portable profiles may use
`naturalMotion.rootTravelSamples`, keyed by **source clip name** before `clipNames`
renaming. Example: `{"RunBrake":[[0,0,0],[0,0,0.03],[0,0,0.05]]}`.
Each XYZ tuple is cumulative receiving-root translation in target model space at
one 60 Hz output sample. The first tuple must be exactly zero; movement into that
first pose occurs before this origin and must be recorded separately by the
receiving workflow. A plant starting at frame k compensates `D(frame)-D(k)`.

Require explicit 60 Hz STEP sampling, 2–20,000 samples per clip, at most 20,000
samples total and 256 named clips, finite components within +/-10,000 model units,
nonempty contact intervals, and exact output sample coverage including terminal.
The same clip cannot configure both `rootTravelSamples` and `rootTravelPerFrame`.
Sampled clips cannot use wrapped contacts. Plane contacts still follow horizontal
motion and do not become no-slide plants. Unknown clips, conflicting policies,
invalid origins and coverage mismatches fail before output publication.

When used, `naturalMotion` in the clip report contains `rootTravelSamples`; its
contact entries omit the inapplicable constant `rootTravelPerFrame`. Omitted
sampled fields preserve legacy normalization, report shape and constant-travel
animation output. CLI and Animate profile application share the parser and core.
These curves do not move the receiving actor, define yaw schedules, connect
arbitrary entry/exit poses or guarantee that a calibrated sole point covers every
skinned shoe vertex. Those remain separate measured acceptance conditions.

## Offline endpoint envelopes and explicit contact anchors

Core tracks must share a complete 60 Hz grid, not merely equal timestamp arrays.
Validation runs before pose allocation and permits float32/next-down rounding;
irregular grids fail rather than emitting resampled poses at mismatched times.

Saved jobs and profiles accept `clipEndpointEnvelopes`, keyed by source clip.
Each endpoint also accepts optional `rootYawDegrees` in [-180, 180]. It rotates
the sampled whole pose about model-space +Y at the origin before `rootOffset`,
with parent transforms accounted for and child offsets unchanged. Omission
preserves existing bakes. This can preserve a prior-facing entry in a newly
faced actor; it does not establish a natural supported turn within the window.
Each entry requires `entry` and `exit` objects with `targetClip`, integer
`targetFrame`, `spanFrames` (at least two), and finite model-space `rootOffset`
XYZ. Both spans must leave at least one untouched core sample. Target poses must
exist; 60 Hz STEP sampling, fixed child offsets and positive uniform scales are
required. Missing targets, overlapping spans and incompatible post-corrections
fail explicitly. Blending occurs before final leg/contact constraints, emits
complete local TRS, and rejects final endpoint conflicts rather than snapping
poses after solving. This is offline authoring, not runtime collision handling.

Optional `intermediatePoses` authors a staged pre-contact path through 1–128
strictly ordered interior keys. Each has output `frame`, `targetClip`,
`targetFrame`, `rootOffset` and optional `rootYawDegrees` (no `spanFrames`).
Keys must lie outside the entry/exit blend windows. Smoothstep interpolation
connects the entry, keys and exit, before the existing endpoint blends and leg
constraints. Thus the core follows authored poses rather than source motion;
contact solving may alter interior leg poses. These keys own root height, so
separate grounding root-height offsets must be zero. Renamed target clips map
identically for endpoint and intermediate references. Omission retains the
original source-core behavior.

A planted, non-wrapped contact may specify integer `anchorFrame` inside its
interval. The fixed anchor captures the pre-contact retargeted pose at that frame;
ground height and the selected orientation policy still apply. Compensation uses
`D(frame)-D(anchorFrame)`, including negative displacement before a future anchor.
Omission retains start-frame anchoring. Reports retain the explicit anchor's sole
point and foot quaternion. Neither endpoint matching nor fixed bone lengths prove
mid-clip support, swing clearance or skin acceptance; check those independently.

## Swing-path controls

`naturalMotion.swingTrajectories` is keyed by source clip and requires matching
sampled root travel and 60 Hz STEP output. Foot identifiers must be literal
`left`/`right` strings; arrays and coercible objects fail. Each interval contains `foot`,
`startFrame`, `endFrame`, `startAnchorFrame`, `endAnchorFrame`, `startGrounded`,
`endGrounded`, and `lift`. Frames are integer output indices; the interval must
span at least two frame steps, and all anchors must exist. Grounded anchors use
the configured ground and leveled captured heading. Capture happens on the
pre-contact retargeted pose, not the previously solved foot.

Anchors include cumulative receiving-root displacement; the finite smooth path
is converted back to actor space before final leg/contact IK. Optional
`travelPower` (1–8, default 1) advances travel earlier within the same interval.
Optional signed `lateralOffset` adds an outward/inward model-X arc. Lift and lateral
arc have zero endpoint value and slope; lift is 0–10 model units and lateral
offset is bounded to +/-10. Defaults preserve omitted behavior. At most 512
intervals across 256 named clips are accepted; same-foot intervals cannot overlap.

Optional `descendantRotations: true` interpolates ankle-descendant local rotations
between captured anchor frames and holds the endpoint rotations outside the
swing interval. This avoids carrying an incompatible toe pose into a planted
shoe. Multiple non-overlapping swings may control the same foot; intervals are
ordered for evaluation and hold the preceding landing rotation between steps.
Repeated swings for one foot must agree on descendant-rotation ownership.
Output retains fixed
child offsets and ordinary local TRS; the report records maximum swing reach
residual and frame. These controls do not establish self-collision acceptance.

The shared pelvis limit is the minimum participating raw profile limit scaled
by the maximum active contact weight. A partially incoming foot therefore cannot
halve a fully planted foot's budget. Explicit swing targets also participate in
bounded reach solving. Unreachable targets remain reported, never stretched.

## Optional forearm/wrist allocation

Saved jobs and portable profiles accept `clipForearmTwist` keyed by source clip,
for example `{"damageN2":[{"forearm":"mixamorigLeftForeArm","hand":"mixamorigLeftHand","share":0.5}]}`.
This opt-in STEP-only post-pass transfers a fraction of reference-relative wrist
axial rotation to its direct forearm parent and inverse-compensates the hand.
Hand-world orientation, wrist/finger positions and bone lengths stay unchanged;
forearm-weighted skin may change. It is not a collision or inter-fighter overlap
solver, and no candidate is visually accepted by passing its numerical tests.

At most two disjoint named pairs are allowed; each share is finite and strictly
between zero and one. The forearm must have only the hand as a child, with a
nonzero fixed wrist offset and positive uniform ancestor scales. Both rotation
tracks must exist. Invalid reference/track quaternions, singular swing/twist
decomposition and redistribution that opens a closed rotation seam fail before
any track replacement. Antipodal keys and continuous winding are handled.

Require `alignMappedBoneDirections: false`, `interpolation: "step"`, no natural
motion, local-reference correction, clip recovery or neck/head constraint, and
no preserved rotation on either pair member. Omitted clips remain unchanged.
The shared report's `forearmTwist` entries record the axis, reference quaternion,
share and maximum transferred degrees. Angular audit still runs afterward;
reference calibration and skin/game review remain separate acceptance evidence.

## Authored toe/heel contact geometry

Natural-contact intervals optionally accept `contactPoint` in ankle-local units,
or `contactBone` plus `contactPoint` in a named ankle descendant's local units.
`orientationMode: "animated"` preserves full foot pitch/roll/yaw; planted contacts
capture the anchor orientation, while plane contacts follow each animated pose.
Existing reference and animated-heading profiles retain their prior behavior.

For support that pivots across a sole, `contactPatch` accepts 2–16 fixed authored
`{point: [x,y,z], bone?: "targetToeBone"}` points. Omitted bone means ankle-local.
It requires plane/animated contact, 60 Hz sampling, and no point/bone/anchor/wrap
override on that interval. The lowest transformed patch point drives the existing
contact/two-bone solver; points are not fitted to a new mesh minimum each frame.
Descendant bindings are validated before mutation and pose sampling is bounded.
Saved jobs, portable profile import/export and CLI use the same contract.

A zero contact residual does not prove a skinned foot is clear of the floor.
Verify deformed toe/heel/edge vertices through the entire clip: blended shin
weights can move an actual sole beyond a rigid ankle-local patch. Keep calibration,
mesh residuals and source support intent separate from numerical contact success.

## Optional neck/head synthesis

Saved jobs and portable profiles accept `clipJointConstraints` keyed by source
clip, for example `{"tilt":{"neck":"mixamorigNeck","head":"mixamorigHead","transitionDegrees":5}}`.
Each entry names one direct, unbranched, mapped animated bone pair. All swing,
flexion, lateral and twist limits come from the existing `poseRanges` calibration
and must contain neutral. The finite transition width is greater than zero and
at most 20 degrees. No detector limits are changed; omitted entries do nothing.

This bounded slice requires `alignMappedBoneDirections: false`, no clip recovery,
and no preserved/curl/local-reference adjustment on the pair or its ancestors.
The pair cannot own solved torso or leg/contact bones. These guards reject
unsupported composition instead of silently overriding other policies.

The solver softly enters the configured margins and redistributes articulation
over the pair, using at most 64 deterministic projection steps. It preserves
intended head-world orientation when that solve reaches a feasible pair; otherwise
`report.rig.retargetClips[].jointConstraints` records maximum residual degrees
and frame, maximum local correction, and corrected sample count. A nonzero residual
can indicate incompatible envelopes or bounded-solver nonconvergence; it is not
proof of mathematical impossibility. Corrections are computed before hierarchy
emission and leg/contact solving. Head descendants inherit world correction while
retaining local animation. No runtime IK, automatic acceptance or limb synthesis
is added. Existing angular audit runs on the emitted result.
