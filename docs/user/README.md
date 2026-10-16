# RustSMF User Guide

Edit models, rigs, animation and skin weights in RustSMF. Your files stay local.

## Start with the Windows preview

1. [Download the installer](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/RustSMF_0.2.1_x64-setup.exe), install it, then launch **RustSMF**.
2. Download [Signal Robot](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb). **Open** `rustsmf-demo.glb`.
3. Choose **Animate**, open **Tools**, select **Wave**, then **Play**.
4. **Save Project** keeps editable work. **Export** writes a model.

[Requirements and checksums](PREVIEW_0_2_1.md) · [Run from source](../../README.md#run-from-source)

## Supported Flow

### View and navigate

| Action | Control |
| --- | --- |
| Orbit | Drag |
| Pan | Right-drag |
| Zoom | Scroll |
| Camera or layout | Viewport controls |
| Grid, wireframe, textures or rig visibility | Display |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Close a menu or Tools | Escape |

Display controls affect the view, not exported data. Reset refits the camera.

### Modern tools in current source

Choose a workspace, then open **Tools**. Hover symbols for labels. Use Tab to
reach controls and arrow keys to switch task tabs.

| Workspace | Tasks |
| --- | --- |
| Model | Objects, Surface, Details |
| Rig | Pose, Hierarchy, Setup |
| Skin | Brush, Weights, Display |
| Animate | Clips, Pose, Transfer |

The 0.2.1 installer uses the earlier drawer layout. Source builds have task tabs.

### Authoring and formats

- **Model:** select an object to rename, transform, duplicate or delete it. SMF source names and hierarchy stay protected.
- **Materials:** use **Repair materials** with the matching OBJ, MTL and textures. Ambiguous matches leave your model unchanged.
- **Rig:** select a bone to pose it. Hierarchy edits and rig metadata are under Tools. For an unrigged static FBX/OBJ, use **Prepare root skeleton** first.
- **Animate:** create a clip, set its duration, then add keys. Use **Branch** to key a selected limb. **Solve & bake IK keys** creates an undoable edit.
- **Skin:** choose **Pick (Q)**, select a bone, then drag to paint. Use **P** to paint, **E** to erase, **S** to smooth, and brackets to resize the brush.
- **Skin settings:** **Rest / Bind** is the default. Advanced offers frozen/live poses, exact vertices, normalization and auto-skin. **Show Weights** previews influence.
- **History:** Undo and Redo follow edit order. Unsaved changes and blocked exports stay visible.

Space activates a focused button. Outside controls, it toggles playback.
Viewport R/S/T shortcuts stay inactive while typing.

## Save and export

- **Save Project:** keep the model, clips, rig metadata and selection/playback in `.rsproj`.
- **Open Project:** continue editing. Undo history and editor preferences are not restored.
- **Export:** use the source format. **More** offers explicit GLB, FBX, DAE and SMF.
- **Recover:** restore available autosaved work from **More**.

Source builds also offer **Export → Tools → Export queue**:

1. Choose a format and options.
2. Select **Add** to capture the current model.
3. Select **Export queued**.

Cancel stops pending work. Retry skips completed items. Browser results mean
the download was issued; check your Downloads folder. The 0.2.1 preview has no queue.

## Mixamo source files

Open DAE, FBX or GLB/GLTF with their related texture and buffer files. Select
those files together. DAE keeps external textures separate; use GLB for one file.

Source builds can open one model ZIP. Choose a model if prompted. Cancel or
Escape keeps current work. Extract ZIPs first in the 0.2.1 preview. Transfer and
Append take model files, not ZIPs.

<details>
<summary>ZIP limits</summary>

64 entries; 256 MiB input/expanded total; 256 MiB per model; 64 MiB per sidecar.
Encrypted, nested, ZIP64 and unsafe archives are refused. Extract them first,
then select the model and related files.

</details>

## Preview an animation transfer

On source builds:

1. Open a skinned target. Choose **Animate → Tools → Transfer**.
2. Choose source animation files and required sidecars.
3. Review the preview. Select **Apply** to keep it or **Discard** to cancel.

Apply is one Undo step. **Mapping details** holds presets, corrections and
profile import/export. Numeric rigs need explicit mappings. Profile drafts last
for this session; export a profile file to keep one.

Closing Tools keeps the preview. Leaving Animate discards it. Saving/exporting
during preview uses your unchanged clips. Review motion on each target rig.

## Format Limits

| Format | Limits |
| --- | --- |
| SMF | No scale edits/animation, materials, morphs or multiple skeletons. Source submodel names/order stay unchanged. |
| GLB/GLTF | GLB embeds textures. GLTF needs selected relative buffers/images. Duplicate names may change to preserve animation bindings. |
| FBX | Select referenced texture files together. Other exporters and receiving apps may differ. |
| DAE | External textures stay separate. Use GLB to embed them. |
| OBJ | Geometry and selected MTL/textures. No source rig or animation. |

Missing, ambiguous, remote or unsafe resources are rejected. Unsupported
structures show an error before export.

For cubic rotation clips, trim at existing rotation keys or retarget to baked
keys first. New unsupported intervals are rejected without changing the clip.
Animated exports require valid position/rotation/scale transforms.

[Full format details](../dev/APP_STATE.md#current-limits)

## Game-ready CLI

For scripted batch jobs, see the [CLI reference](../dev/GAME_READY_CLI.md).

<!--
AI-edited: 2026-10-15T01:48:27-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=recorded verified ZIP intake and lifecycle boundaries
AI-edited: 2026-10-16T16:21:33.101Z | agent=Codex/root | model=unknown | effort=unknown | task=standalone-product-guidance | change=kept user workflows self-contained and routed optional sample authoring to developer notes
AI-edited: 2026-10-16T16:29:06.896Z | agent=Codex/root | model=unknown | effort=unknown | task=concise-user-copy | change=shortened task instructions and moved CLI reference
-->
