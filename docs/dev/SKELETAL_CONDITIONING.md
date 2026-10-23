# Continuous skeletal conditioning

Job v3 supports the original continuous LINEAR recipe and the explicit
`continuous-60hz-locomotion-root-nlerp` mode. Both preserve original sampled
poses and geometry. The revised mode resolves the joint-interpolation mismatch
without changing GaimEngine v1. TODO owns current P7B acceptance; private source
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

The retained White Wolf candidate has 29 joints, 3,726 vertices and 46 clips
(ten original roles plus 36 transitions). Packet selection preserves the existing
64-joint, 8,192-vertex, 32-clip, 16,384-key, 4 MiB asset and 16 MiB reference
limits. A tested three-clip start/idle/slow-walk packet is about 2.70 MB of
pretty-printed asset JSON and 12.75 MB of references.

Original-to-derived conversion differences are descriptive: the report measures
joint matrices at every integer tick and five endpoint/fractional phases, and
world-space skinned positions at those five phases, matching Three.js's rendered
mesh transform. Original integer joint poses remain within `1e-4`; larger
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
