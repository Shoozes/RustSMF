# Advanced Rust baking and production integration

`advanced::bake_advanced_v1` borrows an owned portable request and a cancellation
callback. Native/WASM `bake_advanced_json_v1` uses the same API-v1 envelope as
[core baking](RETARGET_CORE_BAKE.md). Success has `stage: advanced-bake`,
`capabilities: [core-bake-v1, advanced-bake-v1]`, ordered target tracks and the
complete report. `PortableAdvancedBakeResponseV1` describes this distinct result.
Desktop production baking calls `retarget_bake_v1`; web baking runs this same
core in the existing module worker. The TypeScript solver remains a test/CLI
reference, with no runtime fallback. Controls, formats and versions stay fixed.

Native builds include the advanced API. WASM enables it with Cargo feature
`advanced-bake`; `node scripts/build-retarget-wasm.mjs --advanced` writes that
proof module under ignored `output/retarget-core/advanced-generated/`.
Normal setup/dev/build generate the same complete capability. Pinned Binaryen
132.0.0 runs `-Oz --converge` after wasm-bindgen 0.2.126. The unchanged 1 MiB
guard requires one lazy worker and WASM asset, including advanced/progress exports.
The pinned JSON parser retains float64 round trips. Endpoint yaw uses the same
matrix operations as the reference, including transformed parents and path bindings.
The standalone crate uses a size-oriented release profile with LTO; no dependency
or global tool installation is added.

## Ordering and ownership

The advanced entry supports all nine inventoried advanced options and eight
report fields. It retains unmapped target-chain curls; recovery, local
calibration, isolated wrist twist and calibrated range audits; target-length
torso/leg solving, planted/plane/articulated contacts, signed root travel,
bounded shared pelvis correction and swing/descendant envelopes. Head-chain
constraints retain neutral calibration and ownership restrictions. Reference
clips and helper ancestry stay owned and source/target resources remain private.

Recovery precedes local corrections, then twist, track emission and range
auditing. Natural pelvis/leg rotations govern the emitted hierarchy; toe
articulation follows solved foot correction. Endpoint processing retains the
core bake, target-pose blend, constrained identity rebake and final independent
world-space residual checks. It emits complete STEP TRS while the report keeps
the constrained solver's counts, matching the reference implementation.

Endpoint envelopes require 60 Hz STEP and reject recovery, head constraints,
twist, scale transfer and local-reference post-corrections. Other restrictions
remain explicit, including twist ownership, head/leg overlaps, sampled travel
coverage and contact/swing frame bounds. The core-only API still refuses all
advanced options. Unknown fields, nested nulls and mixed invalid batches fail
without partial clips; no synchronous fallback is introduced.

## Bounds and cancellation

`retargetRustRuntime.ts` captures API-v1 JSON and validates version/capabilities,
atomic clip counts, bindings, finite ordered keys, dimensions, Float32 buffers
and complete reports before preview. Bone-named correction maps remain owned
data, without prototype assignment. The native reply and progress carry job ID
and authoring revision. One window-owned token covers analysis/baking; replacement,
Cancel, timeout and destroyed windows cancel it. A late token cannot clear a newer
job. Native baking runs on `spawn_blocking` with cooperative checkpoints and a
120-second deadline. The client closes its progress channel on every exit.

Browser cancellation terminates its worker, including WASM execution. Both
paths emit integral completed-clip progress, reject stale results and keep
canonical inputs, private preview, Apply/history and project/export ownership.

The core JSON, TRS, schedule and aggregate output limits remain enforced.
Advanced option traversal has depth 64 and a shared 16 MiB estimated value
budget before option cloning; native borrowed requests receive the same guards.
Pose ranges/local corrections allow 64 joints, wrist redistribution two pairs,
and swing trajectories 512 intervals. Clip maps allow 256 named entries.
Endpoint pose storage is capped at 200000 node-samples, including helpers;
articulated contact capture keeps its 200000 bone-sample limit and separately
bounds aggregate cached contact-point samples to 200000 across all contacts and
patch points in one clip, before capture allocation. Repeated patches count in
full; this portable resource refusal does not change the TypeScript solver.
Endpoint offsets
and sampled travel remain bounded to 10000 model units.

Native checkpoints cover preparation, frame solving, projections and post-passes.
Cancellation and any later job error return no completed prefix. Browser proof
terminates a real WASM worker and requires a fresh worker to bake successfully.
`ADVANCED_INPUT_INVALID` identifies advanced calibration/conflict refusals;
shared `SAMPLER_*` and `BAKE_*` errors keep their owners. Native analysis, native
baking, real browser WASM, mocked IPC and installed Windows evidence remain
distinct lanes.

## Evidence

`run.ps1 -Task retarget:runtime-proof` compares TypeScript, native Rust and actual
Chromium WASM with exact structure/order and 1e-6 relative/absolute tolerance.
Advanced, core, sampler and mapping counts are separate. Generated fixtures cover
all advanced fields, references, articulated/patch/anchored contacts, nonlinear
travel, swing motion, endpoint yaw/intermediate poses and legal combinations.
Independent guards check known curl rotations, recovery/endpoint positions,
planted soles and fixed segment lengths. Native tests check borrowed input
immutability, cancellation/reuse, deep/oversized options and atomic failures.

HISTORY and `output/retarget-runtime-proof/advanced-motion-receipt.json` own
candidate-specific commands and acceptance. Private GLBs, raw Tripo drafts and
borrowed references are excluded from fixtures and public samples.

---
AI-created: 2026-10-15T20:33:56-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=code
AI-edited: 2026-10-15T21:46:26-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=review | change=bounded contact storage and ordered production integration
AI-edited: 2026-10-16T00:52:52-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=production-integration | change=specified native and lazy WASM production boundaries
