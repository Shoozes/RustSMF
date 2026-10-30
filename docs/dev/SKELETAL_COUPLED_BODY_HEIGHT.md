# Optional walkSlow coupled body height

`rustsmf.skeletal-export-job.v5` adds one producer-only, opt-in recipe after the
qualified v4 hip-Y endpoint graph. It accepts the exact v4 conditioned GLB,
its report, and the original source GLB as distinct inputs. Its recipe has no
adjustable motion parameters:

```json
{ "coupledBodyHeight": { "policy": "walkSlow-coupled-body-height.v1" } }
```

The frozen profile is
`source/frontend/src/utils/walkSlowCoupledBodyHeight.v1.json` (SHA-256
`dacbc3589777961f794fe8d27d80bb9ea72c4090779757c57f0a60d31fca1cd4`).
The admitted input GLB is SHA-256 `32837faf217be2f58aeba35a6d5d70352f7dc2d077e400cc4349a82a8bc3eeae`;
the v4 report and original source identities are also checked. Other source,
layout, recipe fields or stale lineage refuse before publication.

The recipe changes only six existing `mixamorigHips.position.y` values at
walkSlow ticks 51–56, down by at most 0.20 m; the three left leg rotations
at ticks 46–56 under 65 degrees; and the three right leg rotations at ticks
51–56 under 25 degrees. Existing CUBICSPLINE tangent values at adjacent keys
45/50 and 57 are updated to keep the selected interpolation local. The right
51–56 keys explicitly overlap the accepted 48–65 span. Other key values,
interpolation outside the affected interval, root travel/yaw, hip X/Z and
rotation, tick-90 endpoint, meshes, bind/weights, supports, thresholds, and
other clips remain exact. The hip position carrier stays LINEAR.

The baker validates the profile against the exact source, checks the stored
float32 caps and selected accessors, and emits a new self-contained GLB. Its
BIN bytes match the qualified private specimen even though the public GLB
preserves incidental root-node metadata from its own input. Independent GLB
reload checks 45 other clips, 1,227 unselected tracks, 495 unselected
quaternion keys, three p50 source clips/78 tracks, root tracks, hip X/Z and
the tick-90 endpoint. The export boundary restores the pre-coupled curve
for unrelated sampling and inserts only declared corrected components at
integer ticks. It holds the accepted right key 50 exactly despite the new
neighbor tangent. Fractional source references are sampled from the authored
GLB; the affected phase-45.25 reference changes in 13 packets.

The report records `preCoupledConditioningReportSha256`,
`preCoupledSourceModelIdentitySha256`, `coupledProfileSha256`,
`coupledOutputBinSha256`, `coupledOutputModelSha256`,
`coupledBodyHeightBake` (masks, caps, maxima and reversible segments), and
`coupledBodyHeightFidelity`. Immutable packet manifests retain the inherited
`conditioning-recipe` input alongside the new profile and recipe. V1–v4 jobs
and omitted options keep their prior contracts. The final producer graph and
exact proof are in [HISTORY](HISTORY.md#p7c-coupled-body-height-20261029).

The private source-pose trial passed its selected [44,58) window and the
current V6 floor-root comparison. It is not actual GaimEngine committed
execution, 46/590 receiving, the 637-pose pilot, or rendered visual approval.
Those remain consumer-owned and source-bound to this new graph.

<!-- AI-edited: 2026-10-29 | agent=Codex/root | task=p7c-coupled-public | change=document exact opt-in profile, masks, lineage and producer/consumer proof boundary -->
