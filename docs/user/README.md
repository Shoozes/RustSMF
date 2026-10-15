# RustSMF User Guide

## Start with the Windows preview

1. [Download the Windows x64 installer](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/RustSMF_0.2.1_x64-setup.exe), install it and launch **RustSMF** from Start.
2. [Download Signal Robot](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb). Use **Open** (the folder icon) or drop the file into the viewport.
3. Choose **Animate**, open **Tools**, select **Wave** or **Turn**, and press **Play** in the bottom timeline.
4. **Save Project** keeps an editable `.rsproj`; **Export** writes the sample as GLB. **More > Help** works offline.

The [preview notes](PREVIEW_0_2_1.md) cover requirements and checksums. Drag to orbit, right-drag to pan and scroll to zoom. Select required sidecars together with other models.

<details>
<summary>Launch from source</summary>

Follow [source setup](../../README.md#run-from-source) and the [launcher guide](../dev/README.md#source-launcher).

</details>

## Supported Flow

### Modern tools in current source

Open **Tools**, then choose a short task tab: Model **Objects / Surface / Details**, Rig **Pose / Hierarchy / Setup**, Skin **Brush / Weights / Display**, or Animate **Clips / Pose / Transfer**. Hover an icon for its action name; Tab reaches it by keyboard. Secondary settings expand from their headings. Arrow keys switch task tabs; Escape closes Tools and returns focus. Unfinished fields survive tab changes. Skin's brush sliders appear beside the model when Tools is closed.

Skin's unsaved-weight and export-block notices also stay visible when Tools switches to Scene.

Space activates a focused button; playback Space and viewport R/S/T shortcuts work outside text fields and controls that handle those keys.

The published 0.2.1 installer retains the earlier drawer layout; these menu changes are currently local source work.

### Authoring and formats

- Open `.smf`, `.glb`, `.gltf`, `.fbx`, `.dae`, or `.obj` by native dialog, file input, or drag/drop. Browser read failures and malformed native byte responses are reported as errors rather than being treated as picker cancellation.
- Save Project stores a validated GLB snapshot with bounded workspace state; reopening preserves the supported source format, including DAE, so source-aware editing and export policy remain consistent.
- Choose the default Modern theme or the compact Original SMF theme. Modern keeps the model canvas central: Open, Save, Undo, Redo, and Export stay in the primary bar; Open Project, Recover, explicit GLB/FBX/SMF actions, backend status, and theme selection are under More. Tools starts closed at every size and opens one Scene or Properties drawer when needed. More also contains offline Help; successful load counts are available there instead of remaining in the slim status line. The full Timeline appears only in Animate. The Original theme starts in quad view even before a model loads and follows the preserved editor format with a 136 px left tool shelf, 128 px Submodels shelf, fixed numbered tabs, an 80 px top strip, square low-chrome controls, dense red/black quad grids, real base-color texture thumbnails in the Submodels list, and an upper Animation timeline whose ruler, sample divisions, and green/red keyframes match the old placement without changing model/edit state.
- Large SMF imports and exports run in a background worker with visible progress. Starting a newer load cancels ownership of older work; if worker startup is unavailable, the app labels the synchronous fallback instead of silently changing behavior.
- Orbit, pan, zoom, reset view, scrub animation, select bones, use TransformControls, and preview selected-bone weights. Hover a visible bone to see its source ID in the viewport; optional persistent labels stay off by default in Modern, strip common Mixamo prefixes, and scale to the loaded model instead of covering it. The recognized 24-bone SMF humanoid also shows Mixamo-style editing aliases while preserving its export IDs. Selected joints can be nudged around positive or negative X, Y, and Z axes. In quad view, right-drag panning uses one shared focus point, so panning an orthographic pane moves the 3D view and panning the 3D view moves every orthographic pane. Reset refits that shared focus, camera distance, clipping range, zoom limits, and orthographic extent to the authored model size without changing its transform, so very small and very large assets remain navigable. DAE/Collada files can be opened and exported with geometry, skin controllers, materials, hierarchy, and matrix animation clips preserved by the round-trip validator.
- For a static FBX/OBJ with no skeleton, open Rig and choose Prepare root skeleton. The operation preflights every mesh, creates one reversible root-bound skeleton without changing transformed mesh placement, and lets child-bone editing, weight painting, and compatible SMF conversion continue. Use Undo before replacing the model if you want to remove the preparation.
- Rig and default Rest / Bind Skin use the underlying rest/base pose. Skin Advanced can explicitly select Frozen Current to show the selected clip at its current time without advancing, or Live Animation to follow playback. Returning to Animate restores the selected clip at the controlled time. In Animate, create a named clip from the load-time Rest pose or the current bone pose, choose its duration, and then author keys with the timeline tools. For a multi-joint gesture, select the chain root and use Branch so the whole limb is keyed together. Creation also works when the source has no animation clips and creates a reversible workspace transaction. Rig can save/load/clear `.rig.json` metadata, and Solve & bake IK keys creates one undoable animation transaction while respecting locked/pinned bones and clip locks.
- Animate also offers Retarget clips for named-bone FBX, DAE, GLB, and GLTF sources. The action maps recognized aliases onto the mounted target rig, appends the compatible clips in one undoable transaction, and reports ambiguous or unmapped bones instead of guessing. Saved retarget profile accepts either a complete v2 game-ready job or a portable `rustsmf.retarget-profile.v1` JSON document, shows validation errors while editing, exports the normalized path-free profile, and applies its explicit numeric map and clip settings after you select the source files. Applying remains one undoable animation transaction; profile paths are never opened in the browser workflow.
- In Modern Skin, click Pick (Q), choose a bone on the rest-posed model, and drag to paint. Picking hands off to Paint automatically; P paints, E erases, S smooths the existing influences across the brush region, brackets change brush size, and Ctrl+Z/Ctrl+Y undo or redo. Smooth is distinct from Auto Skin and can soften a weight transition without selecting a bone. Rest / Bind is the safe default paint sample; Advanced can opt into Frozen Current or Live Animation, exact vertex targeting, algorithms, normalize/auto-skin, and influence diagnostics. The floating card keeps brush size and strength close to the model. Original SMF keeps its full legacy panel. Set mode separates the final Target weight from brush flow and falloff. Add/Subtract remain incremental; lower flow blends toward the target instead of changing the target value itself. Show Weights applies a selected-bone heat map, while Show Vertices adds old-editor-style mini nodes colored by that bone's weight. Their screen-space size stays readable across camera distance and DPI. A visible mini node can be selected for exact vertex painting; brushing the mesh surface remains available for broader edits.
- Switch between single and quad viewport layouts after a model loads; before load, the disabled controls show the active theme's default. Quad view shows Top, 3D, Front, and Side panes with visible dividers.
- In Model, select one non-SMF submodel to rename it, duplicate/delete it, move it up/down among eligible siblings, transform it, assign a loaded material, flip winding, or prepare normals/tangents. A self-contained static asset can be appended as one undoable asset transaction. If the primary model changes while that asset is loading, the append is cancelled instead of mutating the stale scene. Names are trimmed, binding-safe, unique across the root, and blocked when animation tracks depend on them; static surface actions reject skinned, animated, source-owned, or unsupported targets with a reason. Geometry/UV/material diagnostics and rest-pose ghost/trail/onion overlays are display-only and excluded from export. SMF source names and hierarchy order remain guarded rather than being changed without a persistence contract.
- When a rigged FBX is missing its intended materials, choose Repair materials in Scene and select the matching OBJ, MTL, and local JPEG/PNG maps together. RustSMF requires a unique name-and-geometry or geometry-only match, builds PBR base-color/normal/metallic-roughness assignments, and verifies that geometry, skin, rig, clips, and animation data did not change. The repair is one undoable edit; ambiguous bundles fail without mutating the model.
- Switch the single viewport between 3D and Ortho camera modes.
- Use the Display menu for model-safe wireframe, grid, axes, texture, shader, node-index, rig-opacity, hide/show-rig, model-opacity, and rig-thickness viewport inspection controls without changing source export data. Hide rig is useful when helper lines obscure a shaded-skin review; it is reversible and display-only.
- Export loaded SMF sources through the high-fidelity SMF path with supported live position/rotation pose edits.
- Compatible skinned GLB/FBX sources and prepared static FBX/OBJ roots can export to SMF through validated mesh, rig, and animation space boundaries. Unprepared static roots, unsupported scale tracks, incomplete skin data, or malformed geometry remain blocked with an actionable diagnostic. Use GLB/FBX when the source needs richer materials, morphs, object tracks, multiple skeletons, or scale animation.
- Export any loaded runtime model to binary FBX 7500 with the explicit FBX action. RustSMF reparses and validates the generated mesh, transform, skin, bone, and animation structure before opening the save destination.
- Export static or higher-fidelity assets through GLB when FBX compatibility is not required. Repeated import/export no longer adds scene-wrapper nodes. Existing groups, authored transforms and root animation remain intact; previously accumulated wrappers are not removed by name. Animated export rejects matrix-only transforms whose position/rotation/scale representation is stale; apply that matrix to those components before exporting, or export without animations when appropriate.

## Mixamo source files

Collada (`.dae`) is supported as a single-file model input and export. ZIP archives
are not model inputs; extract them first and select the DAE plus any referenced
sidecars as one bundle. The loader validates the visual scene, skin data and
animation channels, then waits for selected texture images before mounting. If
a sidecar cannot load, it reports the missing map and keeps the geometry
available with its material color. DAE export writes a self-contained geometry,
skin, material-color and matrix-animation document; external texture files are
not embedded, so GLB remains the preferred texture-fidelity format. Keep
animation-only and with-skin sources separate: an animation-only file cannot
prove mesh deformation. Mixamo-style bone names do not by themselves guarantee
compatible rest axes or natural target motion.

The supplied 2026-09-20 pair was reviewed without modifying the original ZIPs:
the animation-only DAE remained geometry-free, and the with-skin DAE loaded as
33 bones, one 2.50-second clip, and 3,726 vertices. Its rig helpers can be
hidden from Display for shaded inspection. Start, midpoint, endpoint, and quad
views showed no observed leg/torso deformation failure or self-clipping. The
pair matched on Y-up/0.01m units, 28 animation channels, and 76 timing samples;
this is RustSMF source inspection evidence, not a game or retarget approval.

## Game-ready CLI

For reproducible batch repair and explicit numeric-rig retargeting, use a versioned JSON job with absolute input/output paths:

```powershell
$jobPath = (Resolve-Path .\jobs\fighter.game-ready.json).Path
npm.cmd --prefix source run game-ready -- --job $jobPath
```

The `rustsmf.game-ready-job.v2` job can repair a rigged FBX/GLB from an OBJ/MTL/image reference, rename clips, retarget explicitly mapped source clips, embed every texture as PNG, and publish a portable immutable generation below `output.generationRoot`. The generation contains `model.glb`, normalized `job.json`, resolved `mapping.json`, `report.json`, and a hash manifest; its ID binds the executable producer dependencies and sorted role-tagged inputs. An optional direct-child `output.currentPointer` is replaced only after the complete generation directory is visible. Existing generations are never overwritten.

Use `rustsmf.game-ready-job.v3` when the target already has the materials to keep. Set `materials.mode` to `preserve-existing`, provide `input.riggedModel` plus a `sidecars` array, and omit repair references. GLB must be self-contained and use an empty sidecars array. FBX texture files must be declared explicitly, live under the model directory, and match references used by the FBX. Missing resources, unsupported material texture slots, textures that do not become ready, or material/texture loss on GLB export fail closed. This mode validates and republishes existing material assignments; it does not infer or repair them. For example, the mode-specific fields are:

```json
{
  "$schema": "rustsmf.game-ready-job.v3",
  "input": { "riggedModel": "C:\\models\\target.fbx", "sidecars": ["C:\\models\\albedo.png"] },
  "materials": { "mode": "preserve-existing" }
}
```

The v3 job uses the same `coordinates`, `rig`, `output`, and `provenance` contracts as v2. Inputs are bounded and read from local files only. SIGINT/SIGTERM cancellation is cooperative at bounded-read, load, validation, and pre-publication boundaries; after atomic generation commit begins, it completes publication. A cancelled pre-commit run leaves the current pointer and prior generations unchanged.

For calibrated mappings, optional `rootMotionScale` supplies a positive finite
translation multiplier instead of automatic mapped-height scaling; it cannot
combine with `scaleRootMotion: false`. Optional `directionAlignmentBones` is a
non-empty, unique list of eligible target bones that limits direction alignment,
not ordinary rotation transfer. Direction-transfer selections must be within this
list. Omit both settings to retain existing automatic behavior. Saved jobs and
portable profiles use the same validation and application path.

Retarget jobs can select source/target reference clips, preserve target terminal or explicitly listed bone rotations when local axes differ, set one global relative/absolute direction-transfer policy with per-clip exceptions, and apply a per-clip pose-recovery envelope (`peakFrame`, `holdThroughFrame`, `returnByFrame`) when only a trusted action peak should survive from a damaged source clip. Optional natural-motion settings distribute torso motion by target segment length, solve each target leg at its authored lengths, hold calibrated sole points during named contact frames, apply declared root travel, and bound proportion-sensitive leg swing and minimum knee bend per selected clip. At a requested sample rate, source STEP tracks are evaluated at float32 frame times, output STEP keys can use float32 next-down timing, and partial terminal samples stay within clip duration. The report records contact reach/correction and requested/constrained leg-angle diagnostics, and also compares normalized mapped-rig segment lengths. A successful exit means the GLB was re-imported, embedded textures and requested STEP timing were checked, representative skin deformation samples remained finite, and the immutable manifest hashes match. It is not by itself visual or gameplay acceptance.

For GLB movesets with authored bone growth, `rig.retarget.clipScaleTransfer` is an opt-in map from source clip names to selected bone transfers. Each entry names a mapped `sourceBone`, a target skeleton `targetBone`, three source `axes` in target x/y/z order, and three `strength` values from 0 to 1. The target's neutral local scale (from the target reference clip at time zero when it keys that bone, otherwise from skeleton rest) is multiplied by the selected source scale delta relative to the source reference pose; unlisted clips retain their original behavior. For example, `{"attack":[{"sourceBone":"SourceForearm","targetBone":"TargetHand","axes":["x","x","x"],"strength":[0.4,0.4,0.4]}]}` grows a fist without lengthening its forearm. Missing tracks, unknown bones and source ratios outside 0.25–4 fail; configured scale is not silently dropped. Scale transfer is separate from root-motion translation scaling and currently cannot share a clip with endpoint envelopes or pose recovery. Review actual skin deformation, contact and hitboxes after export; a numerically valid scale track is not visual approval. SMF export still cannot encode scale animation.

## Format Limits

- GLB/GLTF is the preferred modern format for materials, textures, static meshes, morphs, object tracks, and scale animation. Binary `.glb` and self-contained `.gltf` are supported; selected relative `.bin` and image sidecars are also resolved through the bounded multi-file picker/drop contract, while remote, traversal, missing, ambiguous, or over-budget resources fail closed.
- SMF is preserved for compatibility. The current SMF export path does not encode scale edits, materials, morphs, or multiple skeletons.
- Imported SMF submodel names and hierarchy order remain source-owned; the current high-fidelity SMF exporter does not rewrite them from scene-object authoring state.
- FBX import is supported through Three.js. Relative texture paths resolve from the files selected with the FBX through the same bounded resource contract; only maps referenced by the source FBX are attached, so additional base-color/metallic/normal/roughness images are not guessed into slots. The explicit FBX action writes the current runtime root and clips through the vendored `FBXExporter-threejs` writer and rejects output that fails its pre-save re-import checks. A small independently authored Blender 5.0.0 skinned/textured/animated fixture is covered end to end, including reopening app output in Blender; other target applications may still differ.
- OBJ can resolve one selected `.mtl` and its authorized relative textures. Geometry-only OBJ remains supported; a prepared OBJ root can use the compatible SMF path, while GLB remains the saved rich-material output.
- Skin-weight paint authoring and animation keyframe authoring are available for supported paths, with format-specific export limits still enforced.

For developer state, backlog, and verification results, see `docs/dev/APP_STATE.md` and `docs/dev/TODO.md`.

## Preview an animation transfer

On current source builds, open a skinned target and choose Animate > Tools > Transfer. Choose source animation files (with any required sidecars), review the private preview, then Apply to keep it. Discard leaves saved clips unchanged; Apply is one Undo step. Mapping details holds naming presets, explicit corrections, diagnostics and portable profile import/export. Numeric rigs need reviewed explicit maps. Close Tools to see more of the preview; leaving Animate discards pending transfer work. The published 0.2.1 installer keeps its separately recorded feature set.