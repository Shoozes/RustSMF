# RustSMF

RustSMF is a Tauri + React + Three.js editor for inspecting and authoring model geometry, rigs, animation, and skin weights. It reads and exports SMF, GLB/GLTF, FBX, DAE/Collada, and OBJ with format-aware diagnostics.

![RustSMF Modern overview](docs/images/rustsmf-modern-overview.png)

## Supported formats and fidelity

SMF is the native format. GLB/GLTF, FBX, DAE/Collada, and OBJ provide source-aware inspection, editing, and export paths. Compatible skinned GLB/FBX models can convert to SMF; unsupported structures fail closed with diagnostics before export.

Round trips preserve supported geometry, skeletons, and clips. Fidelity depends on the format: DAE external textures are resolved from selected sidecars but are not embedded on export; SMF does not store scale animation; ambiguous duplicate GLB node names may be made unique for Three.js bindings. ZIP containers and unsupported format features are not accepted as complete model inputs. See the [user guide](docs/user/README.md) for per-format behavior and the [current limits](docs/dev/APP_STATE.md#current-limits) for details.

## Launch

From the repository root on Windows, use PowerShell 7:

```powershell
pwsh -NoProfile -File .\run.ps1 -Task setup
pwsh -NoProfile -File .\run.ps1 -Task run
```

For the browser development shell, run `pwsh -NoProfile -File .\run.ps1 -Task dev`. To build the Windows NSIS installer, run `pwsh -NoProfile -File .\run.ps1 -Task package:windows`; the command reports the installer path and SHA-256.

The frontend uses TypeScript/React and the desktop boundary uses Rust/Tauri. Use Node.js 22.13 or later within the 22.x line, or Node.js 24 and newer, as required by the pinned build tools. Verification and test commands are listed in [App state](docs/dev/APP_STATE.md#verification).

## Product ownership

| Responsibility | Owner |
| --- | --- |
| Fighter definitions, moves, contact expectations, candidate selection, and game visual acceptance | fight-game-study |
| Import/export, rig inspection, skin editing, retargeting, generic pose constraints, animation sampling, and reproducible asset processing | this repository |
| Scheduling, hosts, packages, scene/prefab execution, and target delivery | GaimEngine |

Jobs are caller-owned. Fighter-specific mappings, clip choices, endpoints, and gameplay appearance are accepted by the receiving project. RustSMF reopens work only for reproducible tool defects with bounded noncombat fixtures.

## Project references

- [User guide](docs/user/README.md): workflows and format choices.
- [App state](docs/dev/APP_STATE.md): current behavior, architecture, limits, and verification commands.
- [TODO](docs/dev/TODO.md): the four completed v0.2 productization outcomes and their acceptance evidence.
- [Latest review](docs/dev/review.md): current findings and verification evidence.
- [History](docs/dev/HISTORY.md): completed work and dated command records.
- [Context bank](summary_bank.json): focused feature, subsystem, issue, and workflow routes.

Work locally on `main`, preserve owner changes, and push only when explicitly requested through `.tools/gitpush.ps1`. See [AGENTS.md](AGENTS.md) for the full local contract.
