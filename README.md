# RustSMF

RustSMF is a Tauri + React + Three.js desktop/web editor for loading, inspecting, posing, animating, skinning, and exporting SMF, GLB/GLTF, FBX, and OBJ models.

The current app provides high-fidelity SMF import/export, worker-backed SMF codecs with visible progress, guarded conversion of compatible skinned or root-prepared non-SMF assets to SMF, validated GLB/FBX output, reversible non-SMF model authoring, bounded GLTF/OBJ sidecar loading, versioned project save/recovery, rig metadata and explicit keyed IK bake, read-only geometry/shader diagnostics, native Rust-owned file dialogs and binary I/O, single/quad viewport layouts, and persisted Modern/Original SMF themes. Unsupported format features fail with diagnostics instead of being silently discarded.

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
pwsh -NoProfile -File .\run.ps1 -Task test:journey
pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict
pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke
```

`test:e2e` may use GenEye as an advisory wrapper when it is already discoverable; RustSMF's Playwright result remains authoritative. `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` runs Playwright directly. Ignored advisory evidence is written under `runtime-data/geneye-playwright-runs/`.

`test:journey` runs the opt-in 1440x900, 125%-DPI headless hand-wave workflow. It loads the committed SMF character, creates and keys a new animation, verifies actionable controls and document containment, and writes review-only screenshots plus `hand-wave-journey.webm` under `output/playwright/hand-wave-journey/`.

On Windows, prefer `run.bat` or `run.ps1` for normal launches because the launcher owns stale-process cleanup and child-process shutdown. Direct Vite/Tauri commands remain useful for intentional ad-hoc work but have fewer lifecycle guarantees.

## Architecture

- `source/frontend/src/App.tsx`: application shell, workspace composition, theme/layout policy, and shared history chronology.
- `source/frontend/src/hooks/useLoadModel.ts`: latest-intent load/export integration and stable app-facing editor contract.
- `source/frontend/src/components/ThreeViewport.tsx`: renderer, mixer, camera, input, selection, and disposal ownership.
- `source/frontend/src/loaders/`: SMF/GLB/FBX/OBJ parsing, coordinate/DQ boundaries, conversion, diagnostics, and validated exports.
- `source/frontend/src/workers/`: typed SMF codec protocol, runtime validation, transfer ownership, cancellation, timeout, and progress.
- `source/frontend/src/backend-client/`: validated native IPC adapters and browser file/download fallbacks.
- `source/src-tauri/src/`: Rust-owned native dialogs, authorized bounded file I/O, and optional SMF envelope peeks.
- `source/frontend/tests/`: focused unit coverage, eight default Playwright suites, and opt-in recorded user journeys.

`useLoadModel.ts` and `ThreeViewport.tsx` remain deliberate integration owners. Pure policy, timing, validation, history, display, and authoring behavior lives in focused modules with tests; new extraction should establish an independent contract instead of only moving lines.

## Current limits

- SMF's current dual-quaternion path preserves position/rotation, not scale. Scale edits block SMF export.
- Non-SMF-to-SMF conversion supports a compatible single named skeleton with skinned geometry and position/quaternion bone tracks. Static FBX/OBJ roots must first use the reversible root-skeleton preparation; unprepared static roots, multiple skeletons, scale animation, materials, morphs, and object tracks require GLB/FBX.
- `.gltf` import resolves selected relative `.bin` and image sidecars through a bounded multi-file contract; remote, traversal, missing, ambiguous, and over-budget resources fail closed. A lone `.gltf` remains limited to self-contained assets.
- OBJ can resolve one selected `.mtl` and its authorized relative textures; geometry-only OBJ remains supported and unsafe or incomplete material bundles fail closed.
- FBX compatibility is proven for the committed Three.js/generated fixtures and an independently authored Blender 5.0.0 fixture, not every third-party FBX producer or consumer.
- The freeform TransformControls gizmo remains single-perspective. Quad/orthographic authoring uses pane-aware explicit Rig tools.
- Native dialog behavior is covered by Rust tests and deterministic IPC browser mocks; real OS-dialog automation remains separate.

Project philosophy is defined in `AGENTS.md`: safety, courtesy, show, and efficiency, in that order; prefer small dynamic modules over hard-coding; prioritize correctness and readability. Work locally on `main`, review in this workspace, and push only when explicitly requested. Use `.tools/gitpush.ps1` for reviewed main publication; it verifies the configured remote and final local/remote commit alignment without force-pushing.
