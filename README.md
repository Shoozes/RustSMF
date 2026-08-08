# RustSMF

RustSMF is a Tauri + React + Three.js desktop/web editor for loading, inspecting, posing, animating, skinning, and exporting SMF, GLB/GLTF, FBX, and OBJ models.

The current app provides high-fidelity SMF import/export, worker-backed SMF codecs with visible progress, guarded conversion of compatible skinned GLB/FBX assets to SMF, validated GLB/FBX output, native Rust-owned file dialogs and binary I/O, reversible authoring history, single/quad viewport layouts, and persisted Modern/Original SMF themes. Unsupported format features fail with diagnostics instead of being silently discarded.

## State and work

- Current app contract: `docs/dev/APP_STATE.md`
- Active executable backlog: `docs/dev/TODO.md`
- Latest integrity evidence: `docs/dev/review.md`
- Durable regression lessons: `docs/dev/PITFALL_LEDGER.md`
- Focused feature/subsystem/issue routes: `summary_bank.json`

## Quick commands

Run these from the repository root:

```powershell
.\run.bat
.\run.bat 2
pwsh -NoProfile -File .\run.ps1 -Task run
pwsh -NoProfile -File .\run.ps1 -Task context
pwsh -NoProfile -File .\run.ps1 -Task verify
pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye
pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict
pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke
```

`test:e2e` may use GenEye as an advisory wrapper when it is already discoverable; RustSMF's Playwright result remains authoritative. `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` runs Playwright directly. Ignored advisory evidence is written under `runtime-data/geneye-playwright-runs/`.

On Windows, prefer `run.bat` or `run.ps1` for normal launches because the launcher owns stale-process cleanup and child-process shutdown. Direct Vite/Tauri commands remain useful for intentional ad-hoc work but have fewer lifecycle guarantees.

## Architecture

- `source/frontend/src/App.tsx`: application shell, workspace composition, theme/layout policy, and shared history chronology.
- `source/frontend/src/hooks/useLoadModel.ts`: latest-intent load/export integration and stable app-facing editor contract.
- `source/frontend/src/components/ThreeViewport.tsx`: renderer, mixer, camera, input, selection, and disposal ownership.
- `source/frontend/src/loaders/`: SMF/GLB/FBX/OBJ parsing, coordinate/DQ boundaries, conversion, diagnostics, and validated exports.
- `source/frontend/src/workers/`: typed SMF codec protocol, runtime validation, transfer ownership, cancellation, timeout, and progress.
- `source/frontend/src/backend-client/`: validated native IPC adapters and browser file/download fallbacks.
- `source/src-tauri/src/`: Rust-owned native dialogs, authorized bounded file I/O, and optional SMF envelope peeks.
- `source/frontend/tests/`: focused unit coverage and eight domain-owned Playwright suites.

`useLoadModel.ts` and `ThreeViewport.tsx` remain deliberate integration owners. Pure policy, timing, validation, history, display, and authoring behavior lives in focused modules with tests; new extraction should establish an independent contract instead of only moving lines.

## Current limits

- SMF's current dual-quaternion path preserves position/rotation, not scale. Scale edits block SMF export.
- Non-SMF-to-SMF conversion supports a compatible single named skeleton with skinned geometry and position/quaternion bone tracks. Static roots, multiple skeletons, scale animation, materials, morphs, and object tracks require GLB/FBX.
- `.gltf` import currently handles self-contained JSON assets. External `.bin`, image, or other sidecar URIs are not resolved from a lone selected file.
- OBJ import is load/preview focused and does not resolve a neighboring `.mtl` sidecar; use GLB for saved rich-material output.
- FBX compatibility is proven for the committed Three.js/generated fixtures and an independently authored Blender 5.0.0 fixture, not every third-party FBX producer or consumer.
- The freeform TransformControls gizmo remains single-perspective. Quad/orthographic authoring uses pane-aware explicit Rig tools.
- Native dialog behavior is covered by Rust tests and deterministic IPC browser mocks; real OS-dialog automation remains separate.

Project philosophy is defined in `AGENTS.md`: safety, courtesy, show, and efficiency, in that order; prefer small dynamic modules over hard-coding; prioritize correctness and readability. Work locally on `main`, review in this workspace, and push only when explicitly requested.
