# Continuous skeletal conditioning

Job v3 supports the original continuous LINEAR recipe and the explicit
`continuous-60hz-locomotion-root-nlerp` mode. Both preserve geometry and, without explicit authoring, original sampled
poses. The revised mode resolves the joint-interpolation mismatch
without changing GaimEngine v1. HISTORY owns completed P7B proof; private source
models and qualification evidence remain local. P7C is separate.

## Explicit v3 job

Use the ordinary `skeletal-export -- --job <absolute-json>` command with
`$schema: rustsmf.skeletal-export-job.v3`. Retain the v2 input/export fields,
set `export.rootJoint` to the new locomotion root, and select packet clips with
`export.clipIds`. Add:

```json
{
  "conditioning": {
    "mode": "continuous-60hz-locomotion-root",
    "sourceRootJoint": "mixamorigHips",
    "locomotionRootJoint": "LocomotionRoot",
    "clipIds": ["idle", "walkSlow", "walkMiddle", "walk", "landing", "damageFall", "downBounceD", "downBounceU", "downStandD", "downStandU"],
    "transitions": [
      {"gait":"walkSlow","idle":"idle","phases":[0,0.25,0.5,0.75],"durationTicks":6},
      {"gait":"walkMiddle","idle":"idle","phases":[0,0.25,0.5,0.75],"durationTicks":6},
      {"gait":"walk","idle":"idle","phases":[0,0.25,0.5,0.75],"durationTicks":6}
    ]
  },
  "output": {
    "generationRoot": "D:\\exports\\generations",
    "conditioningRoot": "D:\\exports\\conditioned"
  }
}
```

V3 candidates omit `currentPointer`. V1/v2 remain strict: STEP channels and
unrepresentable root tilt still fail. Clip selection belongs in hashed producer
settings; the GaimEngine generation semantics retain their exact v1 fields.

To opt into NLERP, change only `conditioning.mode` to
`continuous-60hz-locomotion-root-nlerp`. The original mode and v1/v2 jobs retain
their behavior. The report stays `rustsmf.skeletal-conditioning.v1`; the new
mode is bound into recipe, settings, input-set and generation identities.

The conditioner samples original STEP/LINEAR channels at the float32 value of
each 60 Hz tick, including endpoints, then emits continuous LINEAR tracks. It
adds no smoothing or contact correction. Constant channels are omitted only
when their float32 values equal the authored bind; other constant channels retain
both endpoints. Source clip sampling is bounded to 65,536 joint poses and 3,600
ticks per clip. Geometry and skin influences remain unchanged.

The revised mode stores non-locomotion quaternion channels as standard glTF
CUBICSPLINE triplets. Values are float32 and hemisphere-continuous. For each
adjacent pair, outgoing/incoming tangents are the float32 value of
`(q1 - q0) / (t1 - t0)`, using stored float32 timestamps in seconds. Hermite
follows the quaternion chord; glTF normalization yields NLERP. Unused endpoint
tangents are zero. Translation, scale and locomotion-root rotation stay LINEAR;
exported root yaw is unwrapped continuously for v1 scalar interpolation. No
smoothing, contact correction or source-tick replacement occurs.

Only the revised conditioning context admits cubic rotations. Export validates
non-root quaternion targets, finite unit values, hemisphere continuity, exact
tick/constant-channel layout and exact chord tangents. Other cubic curves,
malformed triplets, changed tangents and cubic locomotion roots fail. Tangent
triplets do not become runtime keys; every existing resource bound remains.

## Selected transition floor bake

An NLERP job may explicitly add `conditioning.transitionFloor`:

```json
{
  "clipIds": ["start-walkSlow-p25", "stop-walkSlow-p25"],
  "floorY": 0,
  "maxLiftMeters": 0.1
}
```

Selection admits 1–24 unique generated start/stop IDs from the declared gait
recipes. Base roles, reversals, missing phases, unknown fields, non-finite
floors, nonpositive lift bounds and use outside NLERP mode fail. Floor and lift
values are in declared scene-root meters and bounded to 100,000 in magnitude.
This opt-in authoring operation produces a new recipe, derivative, report and
generation identity. Omitting it preserves existing output behavior.

The `six-tick-root-y-interior-plateau.v1` policy measures every skinned vertex at
25 quarter-tick phases, preserving the six-tick duration and root endpoint keys.
It adds one bounded vertical lift to the five interior locomotion-root keys,
ramping from/to zero at the endpoints. Root X/Z, heading, joint rotations,
mesh/skin/bind and all unselected clips remain unchanged. The lift clears the
declared floor at interior observations with a body-height-relative `1e-5`
numerical margin. Endpoints must already meet the 0.5%-height penetration limit;
unsafe endpoints or required lift beyond the declared bound refuse. Both the
computed lift and actual stored float32 key offsets must fit that bound. Stored
keys are sampled again before serialization. Cancellation and refusal
restore the loaded bind pose; input bytes and original clips remain untouched.

`report.floorBakes` records the policy, declared floor/lift bound, numerical
margin, actual Y lift at all seven keys, and 25 minimum skin heights before and
after. The ordinary CLI then serializes and reloads the GLB for independent
references. This is baked root motion; receiving adds no floor offset. Support
patches/windows and unsupported declarations are preserved, and no planted
contact is inferred for the transitions.

Actual White Wolf proof on 2026-10-23 passes both p25 clips: maximum whole-skin
penetration is `0.0006689944911612844 m` (start) and
`0.0006690006037463614 m` (stop), against `0.021012886070915813 m`. Interior lift
is approximately `0.08243773 m`. All 25 native/WASM samples per clip, four
pre-bake endpoint fidelity comparisons and four transition seam pairs pass.
Both knees have zero inversions; all 27 physical segments remain stable with
maximum relative length change `1.193e-7`. The new 46-packet/590-reference bundle
passes comparison, isolation, six-tick restored replay and cleanup. Mesh, bind,
skin, mappings, supports and the 44 unselected canonical clips match P7B exactly.
The full five-case pilot measures 637 samples and retains the other eight
physical failures unchanged. It correctly exits nonzero; the separate bounded
repair acceptance passes. This does not close full P7C. HISTORY owns exact runs,
commands and candidate identities.

An unweighted root carries translation and +Y yaw. Its inverse bind preserves
the common authored bind shape; hip pitch/roll remains in the child residual.
The GLB serializer can emit identical skins per mesh; only byte-identical skin
bindings are merged before re-import. The serialized derivative is re-imported
before independent references are evaluated. Every original joint and vertex
has recorded lineage; model height/rest-skin height and units are explicit.

Six-tick clips are named `start-<gait>-p0|25|50|75`, `stop-...`, and
`reversal-...`. Starts connect idle phase zero to the gait phase; stops return to
idle phase zero. Reversals retain that gait phase and turn the locomotion root
180 degrees. Authored endpoints and root translation are preserved through the
blend. This does not establish contact quality or P7C seam acceptance.

In NLERP mode, fractional gait entry targets are evaluated from the revised
stored curve, including float32 timestamps; root motion stays angular LINEAR.
Six-tick transitions use those endpoints before their own joint rotations are
serialized as chord curves. The final GLB is reloaded for independent endpoint
checks and receiving references.

Each immutable conditioned input contains `model.glb`, `recipe.json`, and
`report.json`. The report is written last before directory rename. Existing
bytes must match on reuse; failed staging is removed. Generation inputs bind
`source-skinned-model` to the derivative and separately bind
`original-skinned-model`, `conditioning-recipe`, and `conditioning-report`.
The report also binds producer identities. Original bytes remain in their
registered location; private qualification permission grants no redistribution.

## Qualification boundary

The revised mode qualifies all 46 actual White Wolf P7B packets locally: 590
independent samples agree with native/WASM v1 at the unchanged tolerances, and
the complete authored support bundle passes admission, isolation, six-tick
restore replay and cleanup. Support includes soles and short finger-pad/forearm
contacts, not torso or stable fallen support. P7C remains open. HISTORY binds
the final source, full local gates, receipts and retained anatomical evidence.

### P7C five-case attribution — 2026-10-23

The receiving floor pilot at GaimEngine `ad07276` has complete measurements and
ten failed physical criteria. This attribution covers only `idle`, `walkSlow`,
and the p25 slow-walk start/stop/reversal at 1x/+Z on Y=0. Body height is
`4.2025772141831625 m`: drift limit `0.042025772141831626 m`, positional/floor
limit `0.021012886070915813 m`, and angular seam limit 5 degrees.

| Failed criterion | Bound witness / maximum | Attribution |
| --- | --- | --- |
| idle sole drift | left sole, vertex 3479, tick 24; 0.243509 m | Original motion already drifts 0.243509 m. The first violation at tick 5/vertex 3398 also exists before conditioning. |
| walkSlow sole drift | left sole, vertex 3467, tick 23.75; 0.673401 m | Original motion already violates at tick 2/vertex 3398 (0.043713 m). Original STEP motion has 0.645754 m drift at the maximum witness; continuous conditioning changes the fractional value. |
| walkSlow sole gap | right sole, vertex 0, tick 43.5; 0.051924 m | Continuous interpolation between contact-safe source ticks 43 and 44 creates a downward skin arc. Original STEP vertex Y is +0.000126 m; the derivative is -0.051924 m. |
| walkSlow sole penetration | Same vertex, phase and 0.051924 m | The same downward arc supplies this second criterion; the original witness has zero penetration. |
| walkSlow whole-skin penetration | vertex 2, tick 51; 0.206905 m | Original motion already penetrates 0.206905 m at this integer tick. Continuization additionally introduces the first violation at tick 24.25, where original STEP motion stays above the limit. |
| walkSlow loop skin seam | vertex 980, ticks 90 to 0; 0.301496 m | The original residual loop seam is 0.301496 m. The source cycle is nonperiodic. |
| walkSlow loop joint-position seam | export joint 7, ticks 90 to 0; 0.298733 m | The original residual seam is 0.298733 m at `mixamorigLeftLeg` (source joint 19). |
| walkSlow loop joint-angle seam | Same joint; 21.702578 degrees | Original source endpoint orientations already differ by 21.702578 degrees. |
| start-walkSlow-p25 whole-skin penetration | vertex 3479, tick 3; 0.082395 m | The producer's unconstrained six-tick local-TRS blend creates the penetration before serialization. |
| stop-walkSlow-p25 whole-skin penetration | vertex 3479, tick 3; 0.082395 m | The reverse blend has the same midpoint defect. Both transition endpoint poses are floor-safe. |

The sole-window authoring used integer observations, a -0.05..+0.08 m envelope,
and centroid step <=0.04 m per tick, then declared the sole windows planted.
Those checks do not establish each vertex's cumulative lock to its entry anchor
or the tighter dense P7C floor limit. Patch lineage and half-open windows are
intact; relabelling the windows would not repair the motion.

The retained attribution independently evaluates 637 GLB poses, reproduces all
20 first/maximum records and passes 55 source references under unchanged v1
limits. Integer skin differences remain within `1.13e-6 m`. The original loop
has three left-leg orientation differences, so root offset alone cannot close
its seam. Independent endpoint blending reproduces p25 midpoint penetration
`0.082395378 m` despite floor-safe endpoints. HISTORY and the immutable
attribution receipt retain exact controls, comparison errors and endpoint/root
measurements; the constrained p25 producer repair below closes that pair.

The selected p25 repair is complete; [its contract and actual results](#selected-transition-floor-bake)
and HISTORY retain the acceptance record. Attribution inputs, all witnesses and
controls remain in
`D:/Compact_Evidence/RustSMF/runs/p7c-five-case-attribution-20261023/measurements-fractional-controls.json`.
Later idle qualification leaves seven slow-walk failures, with full P7C open.

<a id="next-bounded-pass--idle-planted-contact"></a>
### Idle planted contact — complete locally

The selected Work batch is implemented as an explicit bounded native bake.
[The idle contract](SKELETAL_PLANTED_IDLE.md) owns recipe, source/endpoint guards,
original acceptance and actual proof. It closes idle drift while preserving the
other 45 clips and p25 repair; seven slow-walk criteria/full P7C remain open.

<a id="next-bounded-pass--slow-walk-terminal-rotation-closure"></a>
### Slow-walk terminal rotation closure — complete locally

The selected batch is implemented as explicit NLERP authoring. The
[terminal closure contract](SKELETAL_TERMINAL_ROTATION.md) owns selection, bounds,
source-fidelity guards and actual proof. Three loop seams pass while all four
slow-walk drift/floor criteria remain unchanged. Root, 45 other clips and
accepted idle/p25 content are preserved. Full P7C remains open.

<a id="next-bounded-pass--slow-walk-right-sole-arc-feasibility"></a>
### Right-sole arc feasibility — complete locally

The finite foot-only family is rejected: its best gap/penetration reaches
0.0501551543 m at v23@43.5 versus the unchanged 0.021012886070915813 m limit.
The 121 trials post-rotate the foot at 43/44 with a 45-degree stored bound;
no toe quaternion channel exists. This is not a global impossibility proof.
HISTORY and
`D:/Compact_Evidence/RustSMF/runs/p7c-right-sole-arc-feasibility-20261023/`
own source measurements, actual corrections, the 637-pose baseline and rejected
361-pose fidelity/kinematics proof. All four failures remain; no option was added.

<a id="next-bounded-pass--slow-walk-right-leg-arc"></a>
### Right-leg arc feasibility — complete locally

The measured three-joint family at 43/44 is feasible. Reloaded GLB reaches
0.020891718305268984 m against 0.021012886070915813 m; largest stored correction
is 12.267215277 degrees. The two-key contract below and HISTORY own actual keys,
fidelity and preservation proof. Existing v200@43.5 drift increases 1.528 mm;
no new drift failure or knee inversion occurs. The unqualified prototype retains
four whole-walk failures.

<a id="next-bounded-pass--slow-walk-two-key-rotation-bake"></a>
### Two-key right-leg rotation bake — complete locally

The selected repair is explicit producer-only NLERP authoring. The
[two-key contract](SKELETAL_TWO_KEY_ROTATION.md) owns strict selection, actual
stored bounds, narrow original-source guards and serialized receiving proof.
The six right-leg rotations at 43/44 fit the declared 13-degree bound and meet
both local sole limits. Root, supports, accepted idle/p25/terminal behavior and
45 other clips remain intact. Renewed actual 46/590 receiving and the 637-pose
pilot verify the bounded repair; four whole-walk criteria remain failed.
HISTORY records exact source/commands and the 1.528 mm increase at existing failed
drift. The subsequent [producer composition](SKELETAL_TWO_KEY_ROTATION.md#selected-producer-repair--composable-two-key-bakes)
is complete locally: strict plural selection retains right43/44 and adds
left87/88 under 13/7-degree bounds. Renewed actual 46/590 receiving and the
637-pose pilot close both global sole criteria at 0.020938074220 m versus
0.021012886071 m. Drift and whole-skin first/max witnesses remain unchanged;
the diagnostic retains those two failures and separate bounded acceptance
passes for its original source scope. The subsequent explicit [union export
boundary](SKELETAL_EXPORT_BOUNDARY.md#plural-union-results) preserves all 348
outside poses exactly against qualified singular output. Its renewed runtime
proof retains all 447 positive drift increases and no new threshold failure;
the earlier 502-record GLB result remains retained. Full P7C/visual acceptance stay open.

The retained White Wolf candidate has 29 joints, 3,726 vertices and 46 clips
(ten original roles plus 36 transitions). Packet selection preserves the existing
64-joint, 8,192-vertex, 32-clip, 16,384-key, 4 MiB asset and 16 MiB reference
limits. A tested three-clip start/idle/slow-walk packet is about 2.70 MB of
pretty-printed asset JSON and 12.75 MB of references.

Original-to-derived conversion differences are descriptive: the report measures
joint matrices at every integer tick and five endpoint/fractional phases, and
world-space skinned positions at those five phases, matching Three.js's rendered
mesh transform. Original integer joint poses remain within `1e-4` except the explicitly authored
idle, terminal and two-key rotations; their contract-specific guards retain all other
source transforms. Authored differences remain reported. Larger
fractional changes reflect the explicitly selected continuous derivative. They
are distinct from receiving errors against that derivative.

HISTORY retains the original LINEAR diagnostic: native/WASM parity passed but
SLERP-reference mismatches prevented qualification. Its exact witnesses, gates,
private inputs and jobs remain under
`D:/Compact_Evidence/RustSMF/runs/p7b-conditioning-20261022/`. Revised NLERP
qualification is retained separately at
`D:/Compact_Evidence/RustSMF/runs/p7b-chord-conditioning-20261022/`.
No reference values, receiving tolerances or GaimEngine v1 behavior were changed.
Numerical receiving proof does not establish visual acceptance or model
redistribution rights; TODO and HISTORY own current P7C results.

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-plural-union-boundary | change=closed bounded union sampling with renewed runtime proof and retained physical failures -->
