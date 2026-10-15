# RustSMF retarget core

Independent MIT Rust library, version 0.1.0, API v1. Performs pure skeleton mapping and preflight diagnostics without file access, mutation of a live scene or rig creation. Separate experimental modules implement TRS sampling and core clip baking, with no production bake cutover.

`analyze_v1` accepts bounded source/target snapshots, explicit overrides, convention selections and clip metadata, with a cooperative cancellation callback. It returns a resolved map, ambiguity/errors and normalized proportions. `analyze_json_v1` exposes the same API for WASM. Serde field names are camelCase.

Mixamo, UE4 mannequin, Unity humanoid and Rigify deform naming include side/chain context and fingers. Helpers are distinguished from deform bones, explicit maps win and opaque rigs require reviewed mappings. Equal bone counts do not imply compatible rigs.

The app integrates native Tauri analysis and browser WASM workers. Build with the repository's `retarget:wasm` command; setup installs matching local wasm-bindgen tooling. See [the integration contract](../../docs/dev/RETARGET_ASSISTANCE.md) and run `run.ps1 -Task retarget:runtime-proof` for native/actual-Chromium parity.

`sampler::sample_v1` accepts the versioned portable bake envelope in sample mode;
`sample_json_v1` is the native/actual-WASM JSON boundary. Capabilities and errors
are explicit; bake mode and all bake options are refused. The [sampler contract](../../docs/dev/RETARGET_SAMPLER.md)
owns bounds, reference payloads, interpolation semantics and proof. Production
continues using the existing TypeScript worker. Preserve `THREE_LICENSE.txt`
for the interpolation port in standalone distributions.

`baker::bake_v1` and native/WASM `bake_json_v1` expose the separate
[core baking contract](../../docs/dev/RETARGET_CORE_BAKE.md). Core capability
results contain actual target tracks and typed reports. Advanced/unknown options
are refused atomically. Production remains in the TypeScript worker until all
advanced parity and integration criteria pass.

The crate's `LICENSE` covers project-owned code. Carry the exact dependency notices from the repository's `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES.txt` with distributions containing their code or generated WASM glue. Dependency and generator versions are pinned together.

---
AI-created: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs
AI-edited: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=recorded retarget and asset workflow ownership
AI-edited: 2026-10-15 | agent=Codex/root | model=unknown | effort=unknown | task=retarget-core-bake | change=described experimental baking
