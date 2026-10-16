# RustSMF samples

## Sable black cat

[Sable](black-cat/README.md): a cat with Idle, Walk, Run and Sit. One GLB includes
the model, texture and clips.

## Signal Robot

`rustsmf-demo.glb` is a small, self-contained RustSMF sample generated from project-owned geometry and animation code. Copyright 2026 Shoozes; MIT licensed under the root LICENSE.

- Five bones: Base, Shoulder, Elbow, Wrist and Head.
- Two two-second clips: Wave and Turn.
- 240 indexed vertices and three named materials: Ceramic, Graphite and Brass.
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
