# Portable retarget contract and sampler

## Boundary

`source/retarget-core/src/sampler.rs` exposes `BakeRequestV1` and a separate
`SampleResponseV1`. `sample_v1` is the native borrowed-input API;
`sample_json_v1` is the native/WASM JSON entry point. Existing mapping API v1,
projects, profiles, CLI jobs and exports are unchanged. This sampler-only API
has no UI and emits no baked clips. Production uses the [complete baking entry](RETARGET_ADVANCED_BAKE.md);
`retargetBakeRuntime.ts` retains the TypeScript comparison implementation.

Success identifies `stage: sampler`, `capabilities: [sample-trs-v1]` and
`status: sampled`. `operation: bake` and every nonempty `options` object return
`SAMPLER_UNSUPPORTED_FEATURE`, including unknown future options. No partial
motion correction or fallback is performed. Additive clips, unsupported tracks
and smooth quaternion interpolation are refused explicitly.

## Owned request and result

`retargetPortable.ts` converts existing `BakeInput` snapshots into plain JSON:

- `apiVersion: 1`, `operation: sample`, source and target skeletons, explicit
  source-to-target mapping, clip jobs and requested `sampleTimes`.
- Skeleton nodes retain topologically ordered helper ancestry and owned local
  rest TRS. Bone indices retain skeleton order. Bone names must be unique. Unnamed or
  repeated helper names use private transport identities; bound channels must
  resolve unambiguously to explicit node indices. Supplied world metadata is validated, but
  matrices are recomputed from local rest data.
- Each clip has name, duration, normal blend mode (2500), and transform tracks:
  node index, position/quaternion/scale, interpolation, float32 times and values.
  Arrays are copied before serialization; canonical buffers are not transferred.
- Source/target reference clips and endpoint target clips have explicit owning
  skeletons. They are independently sampled, without applying reference-pose or
  endpoint corrections. A zero-duration source/target reference has one key at zero per channel;
  moving and endpoint clips retain positive duration. Bake options remain
  separate from the sampler-only API.

Times are seconds; positions preserve authoring units and axes. No unit or
reference-frame conversion is implied. Values and keys enter Rust as float32;
interpolant outputs round to float32 like Three.js. Rest transforms and matrix
composition use float64. Matrices are column-major, including helpers and
nonuniform scales; no decomposition hides shear. Results contain target rest and
per-job/role/clip sampled local TRS and world matrices in node order.

STEP uses the last key at or before the requested time, without rational-frame
snapping. Linear quaternions use shortest-path SLERP; equal and boundary keys
retain their values. Smooth vectors match Three.js natural/zero-curvature
endings, including irregular spacing. glTF cubic stores incoming tangent/value/
outgoing tangent triplets; tangents are per second, and interpolated quaternion
results normalize. Before/after the curve, endpoints hold. Input buffers and
rest data remain unchanged. The retained Three.js notice covers the port.

## Limits and failure ownership

| Boundary | Limit |
| --- | --- |
| UTF-8 JSON entry point | 16 MiB before decoding |
| Each skeleton | 4096 nodes, 512 unique valid bone indices |
| Clip jobs / endpoint clips per job | 256 / 256 |
| Tracks per clip | 32768 |
| Total track times and values, including references | 16 million scalars |
| Requested times | 1–20000, finite, absolute value at most 1e9 seconds |
| Returned local/matrix data | 16 million scalars, checked before sampling |

Clip duration is positive and at most 1e9 seconds. Float32 keys are finite,
nonnegative, strictly increasing after float32 conversion and within duration
(up to 1e-6 seconds rounding). Rest positions are bounded at 1e12 units, rest
scale at 1e6, track values/tangents at 1e12; rest and key quaternion norms must
be within 1e-4 of one. These validation bounds do not promise usable deformation.
Duplicate channels, invalid maps, cycles, nonfinite data and invalid shapes
return `SAMPLER_INPUT_INVALID`; JSON/output bounds have distinct limit codes.
Nonfinite composed output returns `SAMPLER_NUMERIC_ERROR`.

Errors contain bounded code/path/message, empty clips and no partial target
pose. Native callbacks are checked during validation and sampling and return
`SAMPLER_CANCELLED`. JSON decoding is synchronous and size-bounded. Browser
sampling is synchronous inside its worker; termination is the cancellation
boundary. Runtime proof terminates an actual WASM worker after its sampling
start signal and successfully samples in a replacement worker. This is separate
from production job-client cancellation and mocked native IPC evidence.

## Inventory and acceptance

`retargetInventory.ts` classifies all 28 `AnimationRetargetOptions` and all 34
`AnimationRetargetReport` fields, including effective defaults, profile adapter
keys, refusal rules and existing guard files. Both the CLI and frontend call
`profileClipOptions`; the registry describes existing TypeScript behavior,
not implemented Rust bake features. Typed exhaustive records and AST tests
reject unclassified additions and missing guards.

`run.ps1 -Task retarget:runtime-proof` retains the 17 native/Chromium mapping
cases and reports sampler cases separately. Fourteen positive cases compare
TypeScript/Three, native Rust and actual browser WASM at 1e-6 relative/absolute
tolerance; 20 refusals have exact status/code/shape comparisons. Independent
anchors include cubic position 0.59375 at 0.5 seconds, smooth position 1.25,
known helper world transforms, and decoded glTF position 1.25 / scale 1.3125 at
one second. The corpus covers endpoint holds, antipodal/small/constant rotations,
float32 STEP boundaries, scales, helpers, reference ownership and irregular
smooth curves. Native tests additionally prove cooperative cancellation at
validation and sampling checkpoints, input immutability, JSON limits and numeric
output failure. No new arbitrary-asset or animal-rig equivalence claim follows.

The separate [experimental core baker](RETARGET_CORE_BAKE.md) now emits core
tracks/reports through `bake_json_v1`; `sample_json_v1` still refuses bake mode.
Advanced motion and production integration remain ordered in TODO.
HISTORY owns final commands/source evidence. Sable, ZIP/export guards, Original
references and private raw asset boundaries remain preserved.

<!--
AI-created: 2026-10-15 | agent=Codex/root | task=retarget-sampler
AI-edited: 2026-10-16T00:52:52-04:00 | agent=Codex/root | task=production-integration | change=clarified sampler and production ownership
-->
