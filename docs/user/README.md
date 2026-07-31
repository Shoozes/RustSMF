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
- Choose the default Modern theme or the compact Original SMF theme. The Original theme starts in quad view even before a model loads and follows the preserved editor format with a 136 px left tool shelf, 128 px Submodels shelf, fixed numbered tabs, an 80 px top strip, square low-chrome controls, dense red/black quad grids, real base-color texture thumbnails in the Submodels list, and an upper Animation timeline whose ruler, sample divisions, and green/red keyframes match the old placement without changing model/edit state.
- Large SMF imports and exports run in a background worker with visible progress. Starting a newer load cancels ownership of older work; if worker startup is unavailable, the app labels the synchronous fallback instead of silently changing behavior.
- Orbit, pan, zoom, reset view, scrub animation, select bones, use TransformControls, and preview selected-bone weights. In quad view, right-drag panning uses one shared focus point, so panning an orthographic pane moves the 3D view and panning the 3D view moves every orthographic pane. Reset refits that shared focus and camera distance to the loaded model.
- Switch between single and quad viewport layouts after a model loads; before load, the disabled controls show the active theme's default. Quad view shows Top, 3D, Front, and Side panes with visible dividers.
- Switch the single viewport between 3D and Ortho camera modes.
- Use the Display menu for model-safe wireframe, grid, axes, texture, shader, node-index, rig-opacity, model-opacity, and rig-thickness viewport inspection controls without changing source export data.
- Export loaded SMF sources through the high-fidelity SMF path with supported live position/rotation pose edits.
- Export compatible skinned GLB/FBX runtime roots to SMF when they have one shared named skeleton and supported position/quaternion bone tracks. Indexed meshes are expanded to SMF's flat triangle layout automatically.
- Export any loaded runtime model to binary FBX 7500 with the explicit FBX action. RustSMF reparses and validates the generated mesh, transform, skin, bone, and animation structure before opening the save destination.
- Export static or higher-fidelity assets through GLB when FBX compatibility is not required.

## Format Limits

- GLB/GLTF is the preferred modern format for materials, textures, static meshes, morphs, object tracks, and scale animation.
- SMF is preserved for compatibility. The current SMF export path does not encode scale edits, materials, morphs, or multiple skeletons.
- FBX import is supported through Three.js. The explicit FBX action writes the current runtime root and clips through the vendored `FBXExporter-threejs` writer and rejects output that fails its pre-save re-import checks. Re-import complex assets in their target application to confirm application-specific compatibility.
- OBJ support is load/preview focused; use GLB export for saved output.
- Skin-weight paint authoring and animation keyframe authoring are available for supported paths, with format-specific export limits still enforced.

For developer state, backlog, and verification results, see `docs/dev/APP_STATE.md` and `docs/dev/TODO.md`.
