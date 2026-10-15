# Retarget assistance

## Ownership and compatibility

Animate > Transfer prepares a source, reviews mapping and previews privately before Apply. Choosing a source accepts one FBX, DAE, GLB or GLTF plus its selected sidecars. The existing source/model limits still apply. Mapping details owns convention overrides, explicit corrections, diagnostics, the session profile draft and export of a reviewed mapping through the existing profile's `manualMap` fields.

`source/retarget-core` is an independent MIT crate, API v1. It performs bounded mapping and preflight analysis without file access or scene mutation. Desktop calls it through `retarget_preflight_v1`; browser analysis runs its actual WASM build inside a module worker. Mixamo, UE4 mannequin, Unity humanoid and Rigify deform naming include side/chain context and fingers. Explicit maps take precedence. Numeric rigs require explicit maps, conflicting/ambiguous suggestions stay unresolved, and matching counts never establish compatibility.

Snapshots include helper ancestry and owned local rest transforms captured before playback. Rig-history edits refresh that rest ownership. Skin inverse-bind matrices are not substituted for authored rest transforms. Preflight reports missing/duplicate names, override conflicts, unmapped channels, reference-frame issues and normalized mapped-segment proportions. A reviewed map still cannot guarantee skin deformation or anatomical equivalence.

The complete existing TypeScript clip solver runs in a worker on both platforms. It retains advanced profiles, reference clips, helper motion, interpolation, timing, contacts, twist, scale and endpoint options. Its CLI/reference implementation remains available. The experimental [portable sampler](RETARGET_SAMPLER.md) adds native/WASM TRS parity; complete Rust baking remains later and has no production cutover. Project/profile/CLI job/export formats and app version remain unchanged.

Source and reference sampling uses each track's actual interpolator. Worker snapshots preserve glTF CUBICSPLINE tangent triplets and reconstruct Hermite interpolation, including quaternion normalization and opt-in scale transfer. Unknown custom interpolation fails visibly instead of silently becoming linear. Known-value generated-fixture checks supplement worker/reference parity, which alone cannot detect a shared sampling mistake.

This is the selected first donor pass, not a claim that every missing donor feature has been ported. Desktop Rust is bundled into the application; the web runner executes WASM locally and needs no native service. Rust is required to build the source, not to run the built web app. ZIP intake, export queues, the complete Rust solver and animal-chain assistance retain their ordered followup boundaries. Custom rig creation remains excluded.

## Job and preview lifecycle

One client owns one active transfer per editor. Preparation, analysis and baking are correlated with job identity and the captured authoring revision. Each phase has a 120-second limit. Cancel, replacement, leaving Animate and disposal reject stale results and terminate browser workers; native analysis checks a cooperative cancellation flag. Runtime failures are visible and have no synchronous fallback.

Skeletons, tracks and reference clips are copied into private worker objects. Canonical buffers are retained. Snapshot limits are 2048 bones, 4096 nodes and 256 selected clips, with 16 million values per serialized clip and a 16-million-value output estimate per bake. Rust validates its independent API bounds and finite transforms.

Preview uses cloned bones, materials and a separate mixer. The existing timeline controls private preview playback, duration, seeking and speed; its authoring lane is hidden until Apply. Rendering hides the canonical root only during the synchronous draw call, restoring it before any save/export event can observe it. Preview does not replace canonical clips, dirty state, playback selection/time/speed or history. Multiple generated clips can be selected for preview. Closing Tools can retain preview; leaving Animate discards it and keeps the profile draft.

Apply validates the captured input identity and replacement locks, then uses one existing animation-workspace history transaction. Undo/redo and project/export editing continue through their existing owners. Discard returns to the canonical view and source action. Profile or authoring changes invalidate pending results.

## Builds and proof

Source setup requires Rust's `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`). Public setup installs matching project-local `wasm-bindgen-cli` 0.2.126 under ignored `output/toolchains/retarget-wasm`. Runtime bindings are pinned to the same version. Dev, typecheck and production build generate ignored web-target glue/WASM; no global generator install is needed. Missing tooling explains how to run setup.

```powershell
pwsh -File run.ps1 -Task setup
pwsh -File run.ps1 -Task verify
pwsh -File run.ps1 -Task retarget:runtime-proof
```

The runtime proof rebuilds native and WASM artifacts and compares 17 first-party fixture cases in Chromium: mappings and diagnostic structures exactly, numeric fields within `1e-6` relative/absolute tolerance. Existing advanced solver fixtures also run through serialized worker baking, including contacts, twist, timing, scale and endpoint constraints. `retargetCubicSpline.test.ts` checks actual glTF decoding, known curve values, copied buffers, references and worker parity. `retarget-transfer.spec.ts` owns real browser worker/WASM lifecycle, canonical preview preservation and independently sampled cubic-source export/project continuity; `retarget-continuity.journey.spec.ts` owns the broader profile journey. Tauri IPC mocks and native Rust command tests are distinct from actual installed OS-dialog observations.

HISTORY owns the final candidate's commands/results. TODO owns ordered followups; asset references and drafts are registered separately in [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

---
AI-created: 2026-10-14T20:38:18-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs
AI-edited: 2026-10-14T22:05:56-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=documented cubic interpolation and independent known-value proof
