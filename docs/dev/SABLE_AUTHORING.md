# Sable sample authoring

These are optional contributor instructions for rebuilding the distributed
sample, not application setup or a RustSMF user workflow. Opening, editing,
playing, saving and exporting `sable.glb` in RustSMF requires no external 3D editor.

Sable's original image-guided design became a Tripo Pro mesh and coat texture,
then received Blender topology repairs, a fitted original rig and authored keys.
The earlier procedural design was rejected and replaced. Rights and attribution
remain in [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md); the
[sample guide](../../examples/black-cat/README.md) owns usage and format limits.

## Editable source

The [Blender master](../../examples/black-cat/sable.blend) contains geometry, UVs,
packed texture, weights and four retained actions. It opens at the neutral
standing pose; actions can be selected in the Action Editor. Its authoring frame
is +Z up and -Y forward, at 0.3 meters per authoring unit. The exported GLB uses
meters, +Y up and +Z forward. Authoring lights, floor and cameras are not exported.

## Rebuild and inspect

Use Blender **5.2 LTS** from the repository root; this candidate was made with
5.2.1. The editable `.blend` owns the finished geometry and packed texture. Save
geometry edits there, then rebuild the rig, weights and original keys with the
recipe. Start with a **separate output folder** to preserve your edited master:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python-exit-code 1 --python examples/black-cat/build_black_cat.py -- --source-blend examples/black-cat/sable.blend --output-dir output/sable-rebuild
```

The recipe writes `.blend`, `.glb` and `asset.json` in the output folder. It
replaces weights/actions there; only the input scene's geometry, UVs and packed
texture are retained. Omit `--output-dir` only when deliberately replacing the
sample after backing up manual rig or animation edits.

Add `--render --review-dir output/sable-review` for fixed-camera front, left,
right and rear images at rest, Walk/Run lift, mid-Sit and held Sit, five
three-quarter views, and native evaluated-mesh floor/paw samples at every key
and midpoint. Review output stays local.
`asset.json` binds the generator and output bytes by SHA-256; Blender output is
not promised byte-identical across versions. `--source-blend` accepts a copy of
the editable scene and `--output-dir` can preserve the original. The recipe
does not require the private Tripo draft or borrowed reference. `.blend` retains
editable geometry, UVs, packed texture, weights and actions.

The raw GLB unit checks independently inspect hierarchy, UVs, influences, floor
clearance, known root motion, gait lift, full rotation/scale/skinned loop seams
and the held Sit ending. Deliberately damaged terminal and interior keys must fail.
An alternate-output Blender rebuild passes the same independent continuity
checks; this does not promise identical Blender file bytes. The
browser and product journey check ordinary Open/playback, project continuation
and independently sampled queued GLB roundtrip. See the
[test inventory](../../source/frontend/tests/README.md).

AI-edited: 2026-10-16T16:21:33.101Z | agent=Codex/root | model=unknown | effort=unknown | task=standalone-product-guidance | change=kept user workflows self-contained and routed optional sample authoring to developer notes
