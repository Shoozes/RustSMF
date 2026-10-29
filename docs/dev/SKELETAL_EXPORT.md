# Skeletal asset export

`npm.cmd --prefix source/frontend run skeletal-export -- --job <absolute-job.json>`
exports one self-contained, skinned GLB to the consumer-facing
`gaim.skeletal-asset.v1` contract. The job and all output locations are explicit;
the command does not modify the input model.

The explicit producer-only [two-key boundary context](SKELETAL_EXPORT_BOUNDARY.md)
preserves unselected emitted keys without changing independent GLB references.
The [bounded span option](SKELETAL_ROTATION_SPAN.md) also preserves every
unselected component at its selected ticks; source references remain independent.
The [pelvis/leg layer](SKELETAL_PELVIS_LAYER.md) adds bounded post-bake composition
with reverse provenance and component-preserving export.
Retained singular and disjoint one–three-record plural v3 qualification passes
46/590 native/WASM receiving and exact outside-runtime preservation at its
recorded source identity. Omitted options retain their bytes. Skin clearance
passes there; planted drift and full P7C remain open. HISTORY binds that source
and pilot evidence; later standalone maintenance does not renew consumer proof.

```json
{
  "$schema": "rustsmf.skeletal-export-job.v1",
  "input": { "skinnedModel": "C:\\models\\character.glb" },
  "export": {
    "rootJoint": "Root",
    "units": "meters",
    "upAxis": "+Y",
    "forwardAxis": "+Z",
    "handedness": "right",
    "ticksPerSecond": 60,
    "rootMotion": "separate-track"
  },
  "output": {
    "generationRoot": "C:\\exports\\skeletal",
    "currentPointer": "C:\\exports\\skeletal\\current.json"
  }
}
```

```powershell
$jobPath = (Resolve-Path .\skeletal-export.json).Path
npm.cmd --prefix source/frontend run skeletal-export -- --job $jobPath
```

The strict job is at most 1 MiB. Input paths must be absolute, and this exporter
slice accepts only one regular, self-contained `.glb`, bounded to the model
loader's 256 MiB input limit. FBX, loose glTF sidecars, multiple input files, and
other formats are not admitted. Coordinates are caller-declared: the exporter
does not guess or convert units or axes. The source must already be right-handed,
meters, +Y up, and +Z forward.

## Output packet

The command creates an immutable content-addressed generation containing:

- `asset.json`: `gaim.skeletal-asset.v1`, with parent-first bind joints,
  common-bind-space positions/normals, triangle indices, four skin indices and
  weights per vertex, clips, separate root tracks, and an empty sockets array.
- `mapping.json`: `gaim.skeletal-export-mapping.v1`, mapping every source joint
  and source vertex to its exported index. Vertices remain in source mesh
  traversal order; no vertex is merged or omitted.
- `references.json`: `gaim.skeletal-reference-samples.v1`, with every vertex's
  independently evaluated source position/normal, all source joint matrices,
    root position/yaw, and empty socket samples. Deformed geometry and joint
    matrices are in root-motion-relative space; root position/yaw stay separate.
    Each clip has endpoint samples and three fractional interior samples.
- `manifest.json`: `gaim.skeletal-export-generation.v1`, binding the RustSMF
  repository revision and working-tree state, producer/source identity hashes,
  input-set identity, settings identity, declared semantics, and each artifact's
  relative path, byte count, and SHA-256.

The optional `currentPointer` is restricted to a direct child of
`generationRoot`. Artifacts and manifest are written and synced in staging; the
manifest is last and a directory rename publishes the complete generation. The
current pointer is replaced only afterward. Existing generations are immutable
and reused only when their exact four-file set and bytes match. Cancellation
before publication removes staging and leaves the current pointer unchanged. If pointer replacement fails,
the complete immutable generation remains available and the prior pointer is
left in place; the CLI reports both paths/statuses.

## Explicit clip selection

The v1 job above retains every admitted source animation clip. Jobs that need a
subset use `rustsmf.skeletal-export-job.v2` and require `export.clipIds`:

```json
{
  "$schema": "rustsmf.skeletal-export-job.v2",
  "input": { "skinnedModel": "C:\\models\\character.glb" },
  "export": {
    "rootJoint": "Root",
    "units": "meters",
    "upAxis": "+Y",
    "forwardAxis": "+Z",
    "handedness": "right",
    "ticksPerSecond": 60,
    "rootMotion": "separate-track",
    "clipIds": ["idle", "walk"]
  },
  "output": {
    "generationRoot": "C:\\exports\\skeletal",
    "currentPointer": "C:\\exports\\skeletal\\current.json"
  }
}
```

Selection accepts 1–32 unique, 1–64 character ASCII clip IDs. Each ID must
match exactly one source GLB animation name, with case and spelling preserved.
Missing names, duplicate requested IDs, and names that match more than one
source animation fail before publication. Selected clips and their reference
samples follow request order. V2 records the explicit selection in export
settings, so its settings and generation identities are
bound to the requested IDs. The source GLB bytes and source SHA-256 continue to
cover the full original file. V1 jobs retain their prior all-clips behavior and
identity contract.

The explicit [v3 conditioning job](SKELETAL_CONDITIONING.md) serializes and
re-imports a continuous derivative with a separate locomotion root. Its original,
recipe and report identities remain distinct. Its additional explicit NLERP
mode admits only canonical generated chord-cubic non-root rotations. Successful
export is separate from receiving and authored support acceptance.

The explicit [v4 hip-Y endpoint job](SKELETAL_HIP_Y_LOOP_ENDPOINT.md) accepts
the already conditioned root/body GLB, its source-bound report and its original
GLB. It corrects only the stored walkSlow hip-Y tick-90 value under a 0.24 m
cap, then renews lineage and publishes through the ordinary immutable export
path. The prior v1-v3 job schemas and default bytes remain unchanged.

## Bind, animation, and limits

Bind TRS comes from the source GLB's loaded node state. For each joint, its
loaded scene-root transform multiplied by its authored inverse-bind matrix must
resolve to one shared, nonsingular bind-shape transform. The exporter bakes
that transform into common-bind-space vertex positions and normals; it fails if
the joint matrices do not agree. No animation frame is used as a rest pose. Each
loaded skinned vertex and triangle is preserved. Exactly four influence slots
are required; weights must already be finite, non-negative, and normalized.
The exporter does not prune or renormalize influences.

All source joints must form one named hierarchy with at most 64 joints. The
input must have one shared skeleton and no static meshes. Zero clips are valid
for v1. V2 selects at least one clip from the source. Limits are 8,192
vertices, 49,152 triangle indices, 32 exported clips, 16,384 total
keys, and 4 MiB for `asset.json`. Clips must use unique supported ASCII IDs,
LINEAR complete position/quaternion/scale tracks targeting bones, and key times
that land on integer 60 Hz ticks. STEP and arbitrary CUBICSPLINE interpolation are not
representable by the current output track contract and fail with the source
mode identified. Unkeyed endpoints are added from the source clip evaluation.
Unsupported channels, interpolation, out-of-range values, or any limit
overflow fail without dropping source geometry, joints, clips, keys, or
influences. References have a separate 16 MiB cap; overflow fails rather than
truncating the samples.

Root translation is the authored root's global scene-root-space position delta
from bind. Root yaw is the shortest-arc +Y twist in radians. The residual root
TRS remains in the root joint track. Pitch/roll that cannot be represented by
the separate yaw channel fails closed. Asset matrices in reference samples are
row-major, with translation at indices 3, 7, and 11.

Reference tolerances are 5e-5 meters for position, 1e-4 radians for normals,
1e-4 for joint matrices, and 1e-5 for root position and yaw. The Wave fixture's
measured cross-runtime fractional quaternion interpolation differences peak at
2.481e-5 position, 5.772e-5 radians for normals, and 5.772e-5 for matrices.
Reference poses remain sampled by the RustSMF source loader; these tolerances
cover comparison differences without replacing the source-side evaluation.

## Scope of proof

The exporter and contact-conditioning helper belong to RustSMF. Generated and
first-party fixtures exercise them without another engine checkout. The `gaim.*`
names identify output contracts, not runtime dependencies. Actual-engine receiving
is optional consumer qualification and does not gate editor startup, ordinary
verification or packaging. See [standalone acceptance](STANDALONE_ACCEPTANCE.md).

This developer CLI requires Git for revision/working-tree provenance and the
declared local Rust toolchain for native contact conditioning. It does not invent
a source revision for an unpacked archive. The installed editor bundles its
native computation and does not require Git or Rust development tools.

The project-owned Signal Robot GLB exercises a real RustSMF load/export path and
is a diagnostic fixture, not humanoid qualification. Its packet proves the
RustSMF exporter, mapping, source-reference generation, bounds, and transactional
publication for that fixture. It does not prove engine/runtime admission,
receiver compatibility beyond the published schema, gameplay behavior, or
asset acceptance. Oversized or unsupported sources must be reduced or corrected
at their source and exported again; RustSMF does not silently simplify them.

<!-- AI-edited: 2026-10-22 | agent=Codex/root | task=p7b-chord-conditioning | change=routed the narrow conditioned chord exception while preserving strict original jobs -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-export-boundary-preservation | change=route the disjoint emitted-key preservation proof and explicit integration limitation -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-plural-union-boundary | change=closed bounded union sampling with renewed runtime proof and retained physical failures -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-span-integration | change=routed bounded span authoring and independent reference preservation -->

<!-- AI-edited: 2026-10-25 | agent=Codex/root | task=p7c-pelvis-layer-integration | change=routed bounded layer export -->

<!-- AI-edited: 2026-10-26 | agent=Codex/root | task=standalone | change=separated producer acceptance and retained consumer qualification -->
