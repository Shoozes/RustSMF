# Batch processing reference

Optional command-line workflows. Normal editing uses the app.
Prepare a complete versioned job in `job.json` before running these commands.

For the separate `gaim.skeletal-asset.v1` packet exporter, see
[SKELETAL_EXPORT.md](SKELETAL_EXPORT.md).

## Game-ready CLI

For reproducible batch repair and explicit numeric-rig retargeting, use a versioned JSON job with absolute input/output paths:

```powershell
$jobPath = (Resolve-Path .\job.json).Path
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

Retarget options cover reference clips, target rotation preservation, relative/absolute direction transfer, pose recovery, natural motion, contacts and STEP sampling. Pose recovery uses `peakFrame`, `holdThroughFrame` and `returnByFrame`. Contact and leg-angle diagnostics appear in the report. See the [job schema](../../source/frontend/src/utils/gameReadyJob.ts) for fields and combinations. Review skin deformation, contact and timing after export; numerical checks alone cannot establish visual or gameplay acceptance.

For GLB movesets with authored bone growth, `rig.retarget.clipScaleTransfer` is an opt-in map from source clip names to selected bone transfers. Each entry names a mapped `sourceBone`, a target skeleton `targetBone`, three source `axes` in target x/y/z order, and three `strength` values from 0 to 1. The target's neutral local scale (from the target reference clip at time zero when it keys that bone, otherwise from skeleton rest) is multiplied by the selected source scale delta relative to the source reference pose; unlisted clips retain their original behavior. For example, `{"attack":[{"sourceBone":"SourceForearm","targetBone":"TargetHand","axes":["x","x","x"],"strength":[0.4,0.4,0.4]}]}` grows a fist without lengthening its forearm. Missing tracks, unknown bones and source ratios outside 0.25–4 fail; configured scale is not silently dropped. Scale transfer is separate from root-motion translation scaling and currently cannot share a clip with endpoint envelopes or pose recovery. Review actual skin deformation, contact and hitboxes after export; a numerically valid scale track is not visual approval. SMF export still cannot encode scale animation.

<!--
AI-edited: 2026-10-16T16:29:06.896Z | agent=Codex/root | task=concise-user-copy | change=shortened task instructions and moved CLI reference
-->
