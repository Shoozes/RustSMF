# RustSMF User Notes

RustSMF is a local Tauri + browser-runnable model tool for loading, previewing, pose-editing, and exporting SMF, GLB/GLTF, FBX, and OBJ assets.

## Launch

From the repo root:

```powershell
.\run.bat
pwsh -File run.ps1
```

Both commands open the numbered launcher menu. Choose `2. Run if already installed`, or run `.\run.bat 2` / `pwsh -File run.ps1 -Task run` directly. Use `pwsh -File run.ps1 -Task dev` for the browser-only Vite app.

## Launcher contract

- Windows canonical path: `run.bat` / `run.ps1` provide close-safe process handling for normal workflows.
- Direct launches (`run.ps1 -Task dev`, `npm run dev`, `npm run tauri:dev`) are supported for ad-hoc use but do not provide the same Windows orphan-prevention guarantees.
- For new tasks, prefer launcher paths first; then switch to direct runs only if intentionally required.

## Supported Flow

- Open `.smf`, `.glb`, `.gltf`, `.fbx`, or `.obj` by native dialog, file input, or drag/drop.
- Orbit, pan, zoom, reset view, scrub animation, select bones, use TransformControls, and preview selected-bone weights.
- Export loaded SMF sources through the high-fidelity SMF path with supported live position/rotation pose edits.
- Export compatible skinned GLB/FBX runtime roots to SMF when they have one shared named skeleton and supported position/quaternion bone tracks.
- Export static or higher-fidelity modern assets through GLB.

## Format Limits

- GLB/GLTF is the preferred modern format for materials, textures, static meshes, morphs, object tracks, and scale animation.
- SMF is preserved for compatibility. The current SMF export path does not encode scale edits, materials, morphs, or multiple skeletons.
- FBX import is supported through Three.js. Export from FBX writes a GLB container unless a future true-FBX writer is adopted.
- OBJ support is load/preview focused; use GLB export for saved output.

For developer state, backlog, and verification results, see `docs/dev/APP_STATE.md` and `docs/dev/TODO.md`.
