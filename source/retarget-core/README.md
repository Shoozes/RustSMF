# RustSMF retarget core

Independent MIT Rust library, version 0.1.0, API v1. Performs pure skeleton mapping and preflight diagnostics without file access, mutation of a live scene or rig creation. TRS sampling and core-only baking remain comparison APIs; production uses complete advanced baking.

`analyze_v1` accepts bounded source/target snapshots, explicit overrides, convention selections and clip metadata, with a cooperative cancellation callback. It returns a resolved map, ambiguity/errors and normalized proportions. `analyze_json_v1` exposes the same API for WASM. Serde field names are camelCase.

[Animal chains](../../docs/dev/ANIMAL_CHAINS.md) add reviewed fore/hind, tail and
wing correspondence through named roles and deform ancestry. Explicit maps win;
ambiguous chains remain unresolved. Quadrupeds do not infer a hip/head up axis.

Mixamo, UE4 mannequin, Unity humanoid and Rigify deform naming include side/chain context and fingers. Helpers are distinguished from deform bones, explicit maps win and opaque rigs require reviewed mappings. Equal bone counts do not imply compatible rigs.

The app integrates native Tauri analysis and browser WASM workers. Build with the repository's `retarget:wasm` command; setup installs matching local wasm-bindgen tooling. See [the integration contract](../../docs/dev/RETARGET_ASSISTANCE.md) and run `run.ps1 -Task retarget:runtime-proof` for native/actual-Chromium parity.

`sampler::sample_v1` accepts the versioned portable bake envelope in sample mode;
`sample_json_v1` is the native/actual-WASM JSON boundary. Capabilities and errors
are explicit; bake mode and all bake options are refused. The [sampler contract](../../docs/dev/RETARGET_SAMPLER.md)
owns bounds, reference payloads, interpolation semantics and proof. Preserve `THREE_LICENSE.txt`
for the interpolation port in standalone distributions.

`baker::bake_v1` and native/WASM `bake_json_v1` expose the separate
[core baking contract](../../docs/dev/RETARGET_CORE_BAKE.md). Core capability
results contain actual target tracks and typed reports. Advanced/unknown options
are refused atomically. Production uses the complete advanced entry.

`advanced::bake_advanced_v1` and native/WASM `bake_advanced_json_v1` expose
[complete advanced baking](../../docs/dev/RETARGET_ADVANCED_BAKE.md), with
owned calibration, reports and cancelable natural/contact/endpoint solving.
Desktop calls native Rust; web runs WASM inside a worker. Public setup/build
enable `advanced-bake` and pin Binaryen 132.0.0 optimization after wasm-bindgen
0.2.126, preserving the 1 MiB guard. The TypeScript reference remains for parity.

The crate's `LICENSE` covers project-owned code. Carry the exact dependency notices from the repository's `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES.txt` with distributions containing their code or generated WASM glue. Dependency and generator versions are pinned together.

---
AI-created: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs
AI-edited: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=recorded retarget and asset workflow ownership
AI-edited: 2026-10-15T20:58:42-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=code | change=implemented advanced parity and isolated experimental WASM payload

AI-edited: 2026-10-16T00:52:52-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=production-integration | change=aligned production execution and proof ownership
