# RustSMF

RustSMF is a Tauri + React + Three.js desktop/web editor for loading, inspecting, posing, animating, skinning, and exporting SMF, GLB/GLTF, FBX, DAE/Collada, and OBJ models.

## Three-way ownership

| Responsibility | Owner |
| --- | --- |
| Fighter definitions, moves, contact expectations, candidate selection and game visual acceptance | fight-game-study |
| Import/export, rig inspection, skin editing, retargeting, generic pose constraints, animation sampling and reproducible asset processing | **this repository** |
| Scheduling, hosts, packages, scene/prefab execution and target delivery | GaimEngine |

Jobs are caller-owned. Wolf mappings, selected clips, cast endpoints and whether a jab looks correct belong to fight-game-study. Keep an upstream request only for a reproducible mechanism defect with a bounded noncombat fixture. Humanoid contact solving is not fighter-maker ownership.

The editor provides worker-backed SMF codecs, validated conversion/export, reversible model/rig/animation/Skin authoring, bounded multi-file resource loading, project save/recovery, single/quad viewports, and persisted Modern/Original SMF themes. Unsupported format features produce diagnostics before export.

## Start here

- [User guide](docs/user/README.md): workflows and format choices.
- [App state](docs/dev/APP_STATE.md): current behavior, architecture, limits, and verification commands.
- [TODO](docs/dev/TODO.md): executable forward work and completion conditions.
- [Latest review](docs/dev/review.md): integrity findings and current verification evidence.
- [History](docs/dev/HISTORY.md): completed work and dated command records.
- [Context bank](summary_bank.json): focused feature, subsystem, issue, and workflow routes.

## Local commands

From the repository root in PowerShell 7:

```powershell
.\run.bat
pwsh -NoProfile -File .\run.ps1 -Task run
pwsh -NoProfile -File .\run.ps1 -Task context
pwsh -NoProfile -File .\run.ps1 -Task verify
pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye
```

The menu provides setup, run, build, clean, and verify tasks. Windows dev launchers own their child processes; cleanup recognizes only this checkout's exact dev script paths. A foreign server occupying port 5173 must be handled by its owner. Direct Vite/Tauri commands have fewer lifecycle guarantees.

Optional recorded journeys, strict visuals, and desktop smoke commands are documented in [App state](docs/dev/APP_STATE.md#verification). [The test contract](source/frontend/tests/README.md) describes fixtures, suite ownership, and advisory GenEye integration. Generated captures, videos, reports, and logs remain ignored runtime artifacts.

## Development

TypeScript/React owns the editor; Rust owns native dialogs and bounded file I/O. `useLoadModel.ts` coordinates load/export and authoring state; `ThreeViewport.tsx` owns renderer and interaction lifecycle. Their focused leaf modules own testable policy, timing, validation, and resource cleanup. See the [architecture ownership map](docs/dev/APP_STATE.md#architecture-ownership) before extracting or adding another owner.

Our philosophy is safety, courtesy, show, and efficiency, in that order. Work locally on `main`, preserve owner changes, review here, and push only when explicitly requested through `.tools/gitpush.ps1`. See `AGENTS.md` for the full local contract.
