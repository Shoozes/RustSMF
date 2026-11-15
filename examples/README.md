# RustSMF samples

Start here for RustSMF examples and editable sample sources.

| Sample | Open in RustSMF | Editable source and instructions |
| --- | --- | --- |
| Sable | [sable.glb](black-cat/sable.glb) | [Blender master, retarget profile and rebuild guide](black-cat/README.md) |
| Signal Robot | [rustsmf-demo.glb](rustsmf-demo.glb) | [Preview demo generator](../source/frontend/scripts/generate-preview-demo.ts) |

Test fixtures are indexed in [fixture provenance](../source/frontend/tests/fixtures/PROVENANCE.md).
Keep personal `.rsproj` files in your own project folder. Generated build and
evidence locations and cleanup candidates are tracked in the
[developer TODO](../docs/dev/TODO.md#housekeeping-exceptions--named-scratch-and-owned-build-cache-remain-blocked).

## Sable black cat

[Sable](black-cat/README.md) has Idle, Walk and Run. One GLB includes
the model, texture and clips.

## Signal Robot

`rustsmf-demo.glb` is a small, self-contained RustSMF sample generated from project-owned geometry and animation code. Copyright 2026 Shoozes; MIT licensed under the root LICENSE.

- Five bones: Base, Shoulder, Elbow, Wrist and Head.
- Two two-second clips: Wave and Turn.
- 2,400 indexed vertices across ten skinned parts, plus three named materials: Ceramic, Graphite and Brass.
- No textures, third-party models or external resource files.

Open the GLB. Choose **Animate → Tools**, select **Wave**, then **Play**.
The Windows preview includes this sample under `examples`.

<details>
<summary>Regenerate the sample</summary>

From the repository root:

```powershell
npm.cmd --prefix source/frontend run demo:generate
```

The generator uses the pinned Three.js exporter.

</details>

<!--
AI-edited: 2026-10-16T16:31:34.044Z | agent=Codex/root | task=concise-user-copy | change=shortened instructions and kept metadata out of rendered guidance
-->

<!-- AI-edited: 2026-11-15 | agent=Codex/root | task=sample-storage-cleanup | change=index sample sources and storage ownership -->
