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

All 637 quarter-tick poses were evaluated independently from the retained GLB.
Direct authored skinning and separate-root composition agree within `1e-12 m`;
the skin/support maxima differ from the engine receipt by at most `8.36e-8 m`.
All 20 first/maximum failure records reproduce. The 55 position/joint/root
source-reference comparisons pass the unchanged v1 limits; direct authored
inverse binds differ from common-bind reconstruction by at most `2.65e-7 m`.
Across all 142 original idle/slow-walk integer samples, original-to-derived skin
differences are at most `1.13e-6 m`. These comparisons establish producer/content
causes for these failures without changing the receiving contract.

The original slow-walk endpoints differ in three left-leg rotation channels and
hip translation. Its root net travel is `[0.061237, 0.238395, 0.064630] m`;
residual seam measurements already remove that separate root transform. A root
offset alone cannot close the measured orientation seam.

An independent local translation/scale lerp and quaternion slerp of the admitted
idle/slow-walk endpoint TRS yields `0.082395378 m` midpoint penetration. It agrees
with the serialized start/stop geometry within `1.54e-7 m`. Endpoint penetration
is only `0.000473353 m` and `0.000669054 m`. Thus the p25 pair needs a constrained
producer bake; endpoint fidelity alone does not make the intervening pose safe.

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

The selected finite family is measured and rejected. The 91-key
mixamorigRightFoot.quaternion channel influences 463 vertices, including the
70-vertex right sole; no right-toe quaternion channel exists in walkSlow.
Independent source/mixer measurements reproduce the original fractional floor
witnesses, and all 637 baseline poses agree with retained receiver maxima within
7.538e-8 m. The explicit family post-rotates the foot at stored ticks 43/44,
with a 45-degree actual stored correction cap and 121 worst-criterion trials.
Its best tested gap/penetration is 0.0501551543 m at v23@43.5, above the unchanged
0.021012886070915813 m limit. Stored corrections are 1.118031543/1.500001619
degrees. No feasible candidate was found; this is not an exhaustive impossibility
proof for every distal correction.

Every patch vertex and whole skin were measured over [42,45]. The rejected
361-pose experiment keeps 348 samples outside that interval exact, root motion,
all 45 other clips, 12 slow-walk transitions and walkSlow@22.5 calibration intact.
Knees remain valid and segment lengths stable; the four physical failures remain.
Conditional feasible-candidate serialization is inapplicable. No production
option, prototype GLB or generation was published. HISTORY and
`D:/Compact_Evidence/RustSMF/runs/p7c-right-sole-arc-feasibility-20261023/`
own the source-bound scripts, parameters, diagnostics and actual measurements.

<a id="next-bounded-pass--slow-walk-right-leg-arc"></a>
### Next bounded pass — right-leg arc feasibility

Phase: local measurement and repair selection, owned by RustSMF. The next
candidate scope adds mixamorigRightUpLeg and mixamorigRightLeg rotation control
to mixamorigRightFoot at the same stored ticks 43/44. Their hierarchy can change
ankle trajectory; foot rotation alone cannot move its own joint position.
Measured ankle Y falls from 0.389209186 m at 43 to 0.338970626 m at 43.5, returning
to 0.389209502 m at 44. This motivates the next scope; necessity/sufficiency is
not established. No broader contact-window or root edit is selected.

Keep the declared right support [29,47), both-support entry at 44, 1x/+Z, Y=0
and canonical 60 Hz chord representation. Existing planted-idle and
transition-floor options do not authorize gait interiors. Declare one finite
candidate family and correction caps before probing; retain actual stored
bounds. Preserve root/hips translation, other limbs and source assets. Do not
pass walkSlow as authored idle, relabel support or infer a receiving offset.

Done When:

1. Bind the unchanged candidate/curve and reproduce the current witness. Measure
   source right-leg/ankle transforms and one bounded contact-preserving family.
2. Measure all patch vertices and whole skin at 13 quarter-tick poses over
   [42,45]. A feasible candidate must meet both sole limits above, preserve the
   floor-safe endpoint contacts and avoid new skin-floor, drift, segment-length
   or knee-inversion failures, including both-support entry. Report corrections.
3. For a feasible candidate, serialize/reload independently and compare the full
   361-pose walk with the 637-pose pilot baseline. Retain drift first/max at
   ticks 2/23.75 and whole-skin first/max at 24.25/51. Root/duration, unselected
   channels and stored values at ticks 0–42 and 45–90 stay exact; poses outside
   [42,45], terminal closure, 45 other clips, all 12 slow-walk transition
   endpoints/seams and idle calibration at 22.5 retain their accepted behavior.
4. Return a measured producer repair contract and actual stored bounds, or the
   tested family's obstruction and smallest next scope. Failed search alone
   cannot establish global impossibility. Experiments remain unqualified.

Production integration, strict opt-in/source guards and renewed 46/590 receiving
proof require a subsequently selected repair. Drift/whole-skin repairs and full
P7C collision/other roles/phases/scale/facing/f32/visual acceptance remain open.
Preserve GaimEngine v1, three Rust overlays, dependencies and retained evidence.

The retained White Wolf candidate has 29 joints, 3,726 vertices and 46 clips
(ten original roles plus 36 transitions). Packet selection preserves the existing
64-joint, 8,192-vertex, 32-clip, 16,384-key, 4 MiB asset and 16 MiB reference
limits. A tested three-clip start/idle/slow-walk packet is about 2.70 MB of
pretty-printed asset JSON and 12.75 MB of references.

Original-to-derived conversion differences are descriptive: the report measures
joint matrices at every integer tick and five endpoint/fractional phases, and
world-space skinned positions at those five phases, matching Three.js's rendered
mesh transform. Original integer joint poses remain within `1e-4` except the explicitly authored
idle and selected terminal rotations; their contract-specific guards retain all other
source transforms. Authored differences remain reported. Larger
fractional changes reflect the explicitly selected continuous derivative. They
are distinct from receiving errors against that derivative.

The original-mode ten-role diagnostic compared 50 samples. Native and WASM were exactly
equal, but 18 derivative-reference comparisons failed. The largest first-failing
position metric was `damageFall@7.375`: `0.0040840223 m` versus `0.00005 m`.
GaimEngine v1 uses normalized linear quaternion interpolation; the independent
GLB reference uses spherical interpolation. The retained recipe, tick grid and
tolerances cannot qualify this content under that evaluator. No reference
values, tolerance, engine schema or interpolation implementation was changed.

The original-mode final source-matched build reproduces those 18 failures. Eleven candidate
packets provide 65 native/WASM-equal samples with 19 independent failures;
`start-walkSlow-p25@3.25` adds a matrix error of `0.00011174838196370551` against
`0.0001`. RustSMF's full `run.ps1 -Task verify` passes (664 frontend tests and
14 Rust checks), as do GaimEngine's 133-command gate and all 46 synthetic bundle
packets. The synthetic proof also covers failed-reference cleanup and unchanged
generic partial-support reporting; it does not establish White Wolf contact.

Retained private inputs, jobs, candidate generations and diagnostic results are
under `D:/Compact_Evidence/RustSMF/runs/p7b-conditioning-20261022/`. Final local
commands/results and exact candidate identities belong to that run's summary.
The revised-mode run is
`D:/Compact_Evidence/RustSMF/runs/p7b-chord-conditioning-20261022/`.
Its immutable actual packets, source probes and anatomical support evidence
remain separate from the original-mode failure. Numerical proof alone does not
establish support completeness; TODO and HISTORY own final receiving results.
No model redistribution or P7C acceptance is implied.

AI-edited: 2026-10-22 | agent=Codex/root | task=p7b-conditioning | change=implemented v3 and recorded the retained interpolation blocker
AI-edited: 2026-10-22 | agent=Codex/root | task=p7b-chord-conditioning | change=specified opt-in chord NLERP, continuous root yaw, canonical admission and serialized endpoint proof

AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-five-case-attribution | change=attributed ten physical failures and selected the bounded p25 floor-constrained transition repair

AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-p25-floor-bake | change=specified opt-in floor baking and verified the actual bounded pair without closing full P7C

AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-slow-walk-review | change=selected terminal closure and retained physical baselines

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-review-cleanup | change=bound stored float32 lift and selected idle contact pass-down -->

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-idle-planted-bake | change=closed selected pass-down and routed native idle authoring contract -->

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-terminal-rotation-closure | change=closed terminal authoring and routed its fidelity/proof contract -->

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-sole-arc-feasibility | change=closed measured distal family and selected bounded right-leg feasibility -->
