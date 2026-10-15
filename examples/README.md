# RustSMF samples

## Sable black cat

[Sable](black-cat/README.md) is an original stylized black cat with Idle, Walk,
Run and Sit clips, an editable Blender scene, a reproducible generator and a
self-contained GLB. Its compact texture is embedded and packed in the Blender source. The source
sample supplements the Signal Robot included in the 0.2.1 Windows preview.

## Signal Robot

`rustsmf-demo.glb` is a small, self-contained RustSMF sample generated from project-owned geometry and animation code. Copyright 2026 Shoozes; MIT licensed under the root LICENSE.

- Five bones: Base, Shoulder, Elbow, Wrist and Head.
- Two two-second clips: Wave and Turn.
- 240 indexed vertices and three named materials: Ceramic, Graphite and Brass.
- No textures, third-party models or external resource files.

Open the GLB with RustSMF, choose Animate and use Tools to choose a clip. The same file is installed under the application's `examples` directory.

To regenerate it from the repository root:

```powershell
npm.cmd --prefix source/frontend run demo:generate
```

The generator uses the pinned Three.js exporter. Unit checks verify its authored hierarchy, normalized influences and actual Wave movement; browser checks independently decode the distributed GLB and verify visible model pixels with helpers disabled.

AI-edited: 2026-10-15T17:05:37.137Z | agent=Codex/root | model=unknown | effort=unknown | task=original-assets | change=added original Sable pack and acceptance routes
