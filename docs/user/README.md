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
- Switch between single and quad viewport layouts after a model loads; quad view shows Top, 3D, Front, and Side panes with visible dividers.
- Switch the single viewport between 3D and Ortho camera modes.
- Use the Display menu for model-safe wireframe, grid, axes, texture, shader, node-index, rig-opacity, model-opacity, and rig-thickness viewport inspection controls without changing source export data.
- Export loaded SMF sources through the high-fidelity SMF path with supported live position/rotation pose edits.
- Export compatible skinned GLB/FBX runtime roots to SMF when they have one shared named skeleton and supported position/quaternion bone tracks.
- Export FBX-loaded sources back to binary FBX 7500.
- Export static or higher-fidelity GLB/GLTF/OBJ assets through GLB.

## Format Limits

- GLB/GLTF is the preferred modern format for materials, textures, static meshes, morphs, object tracks, and scale animation.
- SMF is preserved for compatibility. The current SMF export path does not encode scale edits, materials, morphs, or multiple skeletons.
- FBX import is supported through Three.js. FBX-source export writes binary FBX 7500 through the vendored `FBXExporter-threejs` writer.
- OBJ support is load/preview focused; use GLB export for saved output.
- Skin-weight paint authoring and animation keyframe authoring are available for supported paths, with format-specific export limits still enforced.

For developer state, backlog, and verification results, see `docs/dev/APP_STATE.md` and `docs/dev/TODO.md`.
