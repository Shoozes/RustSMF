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

- Open `.smf`, `.glb`, `.gltf`, `.fbx`, or `.obj` by native dialog, file input, or drag/drop. Browser read failures and malformed native byte responses are reported as errors rather than being treated as picker cancellation.
- Choose the default Modern theme or the compact Original SMF theme. Modern keeps the model canvas central: Open, Save, Undo, Redo, and Export stay in the primary bar; Open Project, Recover, explicit GLB/FBX/SMF actions, backend status, and theme selection are under More. Model opens with Scene on wide screens, while Scene and Properties are dismissible one-at-a-time drawers on compact screens. The full Timeline appears only in Animate. The Original theme starts in quad view even before a model loads and follows the preserved editor format with a 136 px left tool shelf, 128 px Submodels shelf, fixed numbered tabs, an 80 px top strip, square low-chrome controls, dense red/black quad grids, real base-color texture thumbnails in the Submodels list, and an upper Animation timeline whose ruler, sample divisions, and green/red keyframes match the old placement without changing model/edit state.
- Large SMF imports and exports run in a background worker with visible progress. Starting a newer load cancels ownership of older work; if worker startup is unavailable, the app labels the synchronous fallback instead of silently changing behavior.
- Orbit, pan, zoom, reset view, scrub animation, select bones, use TransformControls, and preview selected-bone weights. Hover a visible bone to see its source ID in the viewport; optional persistent labels stay off by default in Modern, strip common Mixamo prefixes, and scale to the loaded model instead of covering it. The recognized 24-bone SMF humanoid also shows Mixamo-style editing aliases while preserving its export IDs. Selected joints can be nudged around positive or negative X, Y, and Z axes. In quad view, right-drag panning uses one shared focus point, so panning an orthographic pane moves the 3D view and panning the 3D view moves every orthographic pane. Reset refits that shared focus, camera distance, clipping range, zoom limits, and orthographic extent to the authored model size without changing its transform, so very small and very large assets remain navigable.
- For a static FBX/OBJ with no skeleton, open Rig and choose Prepare root skeleton. The operation preflights every mesh, creates one reversible root-bound skeleton without changing transformed mesh placement, and lets child-bone editing, weight painting, and compatible SMF conversion continue. Use Undo before replacing the model if you want to remove the preparation.
- Rig and Skin open on the underlying rest/base pose instead of continuing animation playback. Returning to Animate restores the selected clip at the controlled time. In Animate, create a named clip from the load-time Rest pose or the current bone pose, choose its duration, and then author keys with the timeline tools. For a multi-joint gesture, select the chain root and use Branch so the whole limb is keyed together. Creation also works when the source has no animation clips and creates a reversible workspace transaction. Rig can save/load/clear `.rig.json` metadata, and Solve & bake IK keys creates one undoable animation transaction while respecting locked/pinned bones and clip locks.
- In Modern Skin, click Pick (Q), choose a bone on the rest-posed model, and drag to paint. Picking hands off to Paint automatically; P paints, E erases, S smooths the existing influences across the brush region, brackets change brush size, and Ctrl+Z/Ctrl+Y undo or redo. Smooth is distinct from Auto Skin and can soften a weight transition without selecting a bone. Rest / Bind is the safe default paint sample; Advanced can opt into Frozen Current or Live Animation, exact vertex targeting, algorithms, normalize/auto-skin, and influence diagnostics. The floating card keeps brush size and strength close to the model. Original SMF keeps its full legacy panel. Set mode separates the final Target weight from brush flow and falloff. Add/Subtract remain incremental; lower flow blends toward the target instead of changing the target value itself. Show Weights applies a selected-bone heat map, while Show Vertices adds old-editor-style mini nodes colored by that bone's weight. Their screen-space size stays readable across camera distance and DPI. A visible mini node can be selected for exact vertex painting; brushing the mesh surface remains available for broader edits.
- Switch between single and quad viewport layouts after a model loads; before load, the disabled controls show the active theme's default. Quad view shows Top, 3D, Front, and Side panes with visible dividers.
- In Model, select one non-SMF submodel to rename it, duplicate/delete it, move it up/down among eligible siblings, transform it, assign a loaded material, flip winding, or prepare normals/tangents. A self-contained static asset can be appended as one undoable asset transaction. If the primary model changes while that asset is loading, the append is cancelled instead of mutating the stale scene. Names are trimmed, binding-safe, unique across the root, and blocked when animation tracks depend on them; static surface actions reject skinned, animated, source-owned, or unsupported targets with a reason. Geometry/UV/material diagnostics and rest-pose ghost/trail/onion overlays are display-only and excluded from export. SMF source names and hierarchy order remain guarded rather than being changed without a persistence contract.
- Switch the single viewport between 3D and Ortho camera modes.
- Use the Display menu for model-safe wireframe, grid, axes, texture, shader, node-index, rig-opacity, model-opacity, and rig-thickness viewport inspection controls without changing source export data.
- Export loaded SMF sources through the high-fidelity SMF path with supported live position/rotation pose edits.
- Compatible skinned GLB/FBX sources and prepared static FBX/OBJ roots can export to SMF through validated mesh, rig, and animation space boundaries. Unprepared static roots, unsupported scale tracks, incomplete skin data, or malformed geometry remain blocked with an actionable diagnostic. Use GLB/FBX when the source needs richer materials, morphs, object tracks, multiple skeletons, or scale animation.
- Export any loaded runtime model to binary FBX 7500 with the explicit FBX action. RustSMF reparses and validates the generated mesh, transform, skin, bone, and animation structure before opening the save destination.
- Export static or higher-fidelity assets through GLB when FBX compatibility is not required.

## Format Limits

- GLB/GLTF is the preferred modern format for materials, textures, static meshes, morphs, object tracks, and scale animation. Binary `.glb` and self-contained `.gltf` are supported; selected relative `.bin` and image sidecars are also resolved through the bounded multi-file picker/drop contract, while remote, traversal, missing, ambiguous, or over-budget resources fail closed.
- SMF is preserved for compatibility. The current SMF export path does not encode scale edits, materials, morphs, or multiple skeletons.
- Imported SMF submodel names and hierarchy order remain source-owned; the current high-fidelity SMF exporter does not rewrite them from scene-object authoring state.
- FBX import is supported through Three.js. Relative texture paths resolve from the files selected with the FBX through the same bounded resource contract; only maps referenced by the source FBX are attached, so additional base-color/metallic/normal/roughness images are not guessed into slots. The explicit FBX action writes the current runtime root and clips through the vendored `FBXExporter-threejs` writer and rejects output that fails its pre-save re-import checks. A small independently authored Blender 5.0.0 skinned/textured/animated fixture is covered end to end, including reopening app output in Blender; other target applications may still differ.
- OBJ can resolve one selected `.mtl` and its authorized relative textures. Geometry-only OBJ remains supported; a prepared OBJ root can use the compatible SMF path, while GLB remains the saved rich-material output.
- Skin-weight paint authoring and animation keyframe authoring are available for supported paths, with format-specific export limits still enforced.

For developer state, backlog, and verification results, see `docs/dev/APP_STATE.md` and `docs/dev/TODO.md`.
