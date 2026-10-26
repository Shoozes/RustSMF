# Offline planted idle bake

Explicit NLERP job v3 may add `conditioning.plantedIdle`. This authoring
operation uses RustSMF's unchanged pose-contact API v1 and bakes only the selected
idle's pelvis translation and hip/knee/ankle/toe rotations. Root tracks and
upper-body local channels remain unchanged. The original input, mesh, weights,
bind, vertex lineage, duration, endpoints and other clips are preserved.

## Recipe and execution

The object has exactly these fields:

- `clipId`: selected source clip used as an idle by a declared transition.
- `pelvisJoint`: source pelvis below the unweighted locomotion root.
- `calibration`: selected source `clipId` and finite `phaseTicks` naming a
  known bent pose. It is sampled before any selected idle correction.
- `legs`: exactly two independent direct hip/knee/ankle/toe chains. Each has
  `hip`, `knee`, `ankle`, `toe` names and at least three unique `vertices`
  in the concatenated original skinned-vertex order. Patches may not overlap.
- `floorY`: explicit scene-root authoring plane in meters.
- `maxPelvisCorrectionMeters`: positive finite correction bound, at most 100000.
- `maxRotationDegrees`: positive finite local correction bound, at most 180.

Names, source selection, exact fields, finite values, indices and bounds are
validated by both the job parser and conditioner. Non-NLERP use fails. Source
vertices must exist; chains must be direct and complete, with fixed limb offsets
and uniform positive scales. Variable scales, a locomotion root used as pelvis,
straight calibration, invalid topology, failed/excessive solves and failed dense
constraints refuse the candidate. No current pointer is allowed for v3.

The declared bent source frame supplies upper/lower axes, a hip-local bend pole
and the signed knee plane. No solver equations are copied. At each interior
integer tick the existing Rust `solve_pose_v1` targets each ankle's entry
position/orientation in scene-root coordinates; sole offsets are explicitly zero
because these are ankle targets. Toe rotations retain their source entry pose.
The two endpoints retain their complete incoming poses. Other local channels
are retained, including animated upper-body channels and all root travel.

The native example `pose_contact_batch` provides bounded JSON transport for
this producer operation. It uses pinned serde_json only as a dev dependency;
the generic library, v1 source and libm pin are unchanged. The CLI adapter builds
with locked offline Cargo, uses the compiler-reported executable, binds source
and executable hashes, freezes one owned copy and releases it after success,
failure or cancellation. Cargo and the locked dependency cache are prerequisites;
no GaimEngine checkout is needed to export. The pure conditioner takes an
explicit contact runner; opting in without one refuses before mutation.

Transport is bounded to 8 MiB input/output, 256 joints, two legs, 3601 frames and
131072 joint poses. The existing conditioner bounds still apply. The solve has
positive bend bounds of 0.05 to 179.95 degrees at authored keys. No dense bend
minimum beyond the course's no-inversion criterion is claimed. Quarter-tick
kinematics are checked independently during qualification.

Corrected rotations become canonical normalized chord CUBICSPLINE tracks;
pelvis translation is ordinary LINEAR. Computed and stored float32 corrections
must fit declared bounds. Before export, all skin and declared support vertices
are measured at quarter ticks: drift is at most 1% of rest-skin height, and
sole gap/whole-skin penetration at most 0.5%. Support uses each vertex's original
entry anchor over [0,duration), with the final endpoint measured separately.
Refusal/cancellation restores the loaded bind pose and leaves original clips
untouched. The ordinary CLI serializes and reloads the GLB for independent
references. Receiving adds no contact offset or correction.

`report.plantedIdleBake` records policy `native-v1-two-leg-entry-anchor.v1`,
actual source calibration axes/planes, native source/executable identities,
all stored pelvis offsets, per-joint maximum stored rotation corrections,
solver residual and dense before/after metrics. Exact corrected quaternion
curves remain in the hash-bound GLB. Original-to-derived differences remain
visible. Only this explicitly authored idle may differ at original integer
ticks; its endpoints retain the unchanged 1e-4 source-matrix limit. Every other
source role retains the existing all-tick preservation guard.

## Selected White Wolf acceptance

The accepted batch selects idle only, with unchanged left/right sole patches
and planted [0,50) windows. Calibration is unchanged walkSlow at tick 22.5.
The explicit bounds are 0.1 m pelvis correction and 60 degrees rotation, Y=0.
Actual maximum stored pelvis correction is about 0.001952 m; the largest local
rotation correction is about 26.245 degrees. Both endpoint pose/root transforms
and the 50-tick duration are preserved. The 23 unaffected raw idle channels,
including root and upper-body local channels, match exactly; all 45 unselected
canonical clips match exactly. A downstream local-TRS decomposition can differ
at floating-point roundoff; this is separate from source-channel preservation.

At 1x/+Z in canonical f64, all 201 native/WASM idle observations pass:

| Criterion | Maximum meters | Limit meters |
| --- | --- | --- |
| Per-vertex planted horizontal drift | 0.0038391876231595413 | 0.042025772141831626 |
| Absolute sole gap | 0.0028231030835864784 | 0.021012886070915813 |
| Sole and whole-skin penetration | 0.0013677948343130963 | 0.021012886070915813 |

The loop and six idle/p25 endpoint source comparisons pass unchanged limits.
Both idle knees have zero inversions; the minimum signed bend is 0.0008480027.
All 27 physical segments remain stable (maximum relative change 2.0228e-7).
The p25 start/stop repair, all patches/windows/modes and unsupported spans are
preserved. All 46 packets/590 references, exact native/WASM comparison, instance
isolation, six-tick restored replay and cleanup pass. The five-case pilot measures
637 samples/55 independent references and retains seven slow-walk failures
unchanged. Its expected physical exit 1 remains retained; scoped repair acceptance
passes. Full P7C collision, other roles/phases, scale/facing, f32 and visual
acceptance remain open. HISTORY owns exact commands, identities and proof.

The receiving build uses the preserved source-matched engine. A transparent
renewal reuses its prior unchanged-source 134-command gate and appends two
observed locked offline builds into an owned target. Original records and
outputs are retained; the concurrent shader candidate is not qualified here.
GaimEngine v1, its three Rust overlays, shared dependencies, frozen 0.1.0 and all
prior qualification evidence stay protected.

## Standalone producer acceptance

`skeletalPlantedIdle.test.ts` also runs a generated skinned idle/gait fixture
through the ordinary skeletal-export CLI and RustSMF's local native contact
helper. It checks measured drift, gap and penetration; binds original/model/
recipe/report bytes to the manifest; and preserves prior output through a
rotation-bound refusal and active cooperative cancellation. Cancellation uses
the CLI's exported job entry with AbortSignal; it does not claim Windows process
signal handling. Helper copies and staging are released.

This generated-fixture producer proof is part of normal RustSMF acceptance.
The source-bound consumer measurements above remain retained history and are
not a prerequisite for editor startup, verification or packaging.

<!-- AI-edited: 2026-10-26 | agent=Codex/root | task=standalone | change=added independent CLI and native contact proof boundary -->
