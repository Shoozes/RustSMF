# Experimental Rust core baking

`baker::bake_v1` borrows a portable request and accepts a cooperative cancellation
callback. `bake_json_v1` is the bounded native/WASM JSON entry point. Success is
`stage: core-bake`, `capabilities: [core-bake-v1]`, `status: baked`, with ordered
target clips and typed `CoreBakeReportV1` reports. This is an experimental API;
the application's TypeScript production worker remains active. No new controls,
Tauri commands, public profile/project/job formats or versions are introduced.

## Contract and supported behavior

Use `portableBakeRequest(input, [0], 'bake')` to capture owned buffers and mapping
details: explicit map, ordered decisions/canonical roles, validation diagnostics
and frame corrections. Decisions must agree with the map, target names must be
unique, and invalid mapping diagnostics block baking. Rest/world transforms are
recomputed from owned local TRS. Nonuniform helper ancestry uses Three's matrix
decomposition convention, including its nonunit decomposed world quaternions;
local rest quaternions retain the sampler's normalization guard.

All 19 core options and 26 core report fields in `retargetInventory.ts` have
reference/native/actual-browser-WASM cases. They cover corrected world rotations,
helper motion, target intermediate references, relative/absolute direction
alignment and allowlists, preserved rotations, automatic/calibrated root scaling,
ancestor travel extraction, source rest/first-frame/reference clips, target
references, union/fixed-rate schedules, STEP/linear output, next-down float32
times, visual cycles/landmark holds and opt-in axis/strength scale transfer.
Inputs also support smooth vectors and glTF cubic TRS sampling. Scale transfer
uses neutral-relative ratios in 0.25–4; unselected scale channels are discarded.

Output channels carry target node indices, names, copied float32 times/values,
normal blend mode and explicit interpolation. Track order and report defaults
match the retained TypeScript solver. Only core report fields are emitted;
advanced report defaults do not imply advanced support. Original binding names
and channel eligibility are retained for discarded/helper-track diagnostics.

## Refusal, bounds and ownership

Advanced and unknown options, including mixed batches, are refused explicitly.
All jobs pass capability checks before solving. Any later validation, numeric,
budget or cancellation error returns empty clips, with no completed prefix.
Shared malformed-TRS errors retain `SAMPLER_*` codes; core errors use
`BAKE_INPUT_INVALID`, `BAKE_UNSUPPORTED_FEATURE`, `BAKE_INPUT_LIMIT`,
`BAKE_OUTPUT_LIMIT`, `BAKE_NUMERIC_ERROR` and `BAKE_CANCELLED`.

The sample-v1 operation and refusal behavior remain compatible. Its bounds also
apply here: 16 MiB JSON, 4096 nodes/2048 bones per skeleton, 256 jobs, 32768 tracks
per clip, and 16 million input scalars. Baking additionally bounds each schedule
at 20000 samples and the aggregate output at 16 million scalars before allocation.
Labels are bounded, target allowlists at 2048 entries, and scale specs at 16.
`sampleTimes` remains required in this envelope but does not set the bake grid.
No live scene, input buffer or canonical clip is mutated.

Native checkpoints cover validation and frame/bone solving. Browser cancellation
terminates its worker; a replacement worker must bake successfully. Neither
boundary silently falls back to the synchronous TypeScript solver.

## Evidence

`run.ps1 -Task retarget:runtime-proof` compares actual tracks, bindings/order,
timings and report structures exactly; numeric values use 1e-6 relative/absolute
tolerance. First-party generated fixtures include independent root travel,
rotation and scale anchors, source/target references, float32 boundaries, cubic
quaternions, nonuniform helpers and invalid/unsupported mixed batches. Separate
preflight and sampler counts remain visible. Rust tests cover borrowed input
immutability, cancellation during validation/baking, atomic errors and bounds.
Adapter units mutate both authoring and captured mapping metadata; an isolated
aliasing mutant must fail. Known translation/quaternion anchors remain explicit.
HISTORY and the compact ignored runtime receipt own source-bound gate results.

Advanced motion parity and production integration remain separate TODO outcomes.
The private dummy, Tripo drafts and borrowed references are not test fixtures.

The separate [advanced entry](RETARGET_ADVANCED_BAKE.md) adds the complete
experimental report; this core-only API retains its capability/refusal contract.

---
AI-created: 2026-10-15 | agent=Codex/root | model=unknown | effort=unknown | task=retarget-core-bake

AI-edited: 2026-10-15T20:58:42-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=code | change=implemented advanced parity and isolated experimental WASM payload
