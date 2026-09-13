# Fitted-rig command guide

From `source`, run `npm.cmd run fit-rig -- --job <absolute job.json>`.
The JSON object uses schema `rustsmf-fit-rig-v1`, absolute `source` and `template`
GLB paths, an absolute fresh `outputDirectory`, explicit `mapping` from source
bone names to template bone names, and an explicit `clips` array. For example:

```json
{
  "schema": "rustsmf-fit-rig-v1",
  "source": "C:/models/source.glb",
  "template": "C:/models/template.glb",
  "outputDirectory": "C:/models/comparison-001",
  "mapping": { "sourceHips": "targetHips", "sourceHead": "targetHead" },
  "clips": ["idle", "attack"]
}
```

All weighted joints need explicit mappings and each template root must be mapped.
The command rejects external resources, ambiguous/missing clips, and any received
clip whose duration differs outside the bounded float32 tolerance. It fits/bakes
at 60 Hz, re-imports the output, then compares every skinned vertex at an explicit
regular grid plus the exact terminal. The report records requested, completed and
rejected sample counts plus the worst clip, time, mesh, vertex, source/received
positions and skin influences. Exit 0 requires complete coverage and maximum
sampled world-space error at most 0.00001. Source STEP tracks are evaluated at
their float32 frame time, while fitted next-down keys are sampled at the requested
rational time. It writes `fitted.glb`, normalized `job.json`, and `report.json`
with input/output SHA-256 hashes. Existing output directories are refused. On a
write failure a partial fresh directory may remain; only a completed report
establishes success. Input images are preserved as bytes; this command does not
judge rendered texture quality or visual acceptance.

An optional `comparison` object sets bounded `playbackRate`, `displayHeight`, and
exact `gameTransforms` for `source`, `fitted`, and `template`. Each transform keeps
normalization scale/ground translation separate from the receiving visual scale,
facing, root pitch, and optional pitch joint. Use `null` for no pitch override.

From `source`, `npm.cmd run fit-rig-preview -- --directory <absolute completed
output>` opens a read-only loopback server and prints its URL and PID. Stop it
with Ctrl+C. It rechecks the job's three model hashes before serving a fixed
asset set. The viewer requires every requested clip on all three models with
matching duration; it never falls back to an intersection or shortest duration.
It displays original source, source on fitted topology, and template/target with
shared clip/frame, Quad orthographic plus front/side/quarter cameras, optional
bones, and explicit playback rate. Its remainder-preserving clock can advance
multiple source frames after a delayed browser callback. Equal-height mode
normalizes display only; Exact game transforms applies the declared nested runtime
stages. The current receipt records clip/frame/time, hashes, camera, and raw/applied
transforms for each draw.

The collapsed Diagnostics disclosure adds inspection controls without crowding
the animation light table. Mesh opacity preserves each material's original
opacity, transparency, and depth-write state and resets cleanly. Mapped bones are
cyan; unmapped or target-only bones are amber. Selecting a target joint draws its
local axes and, when a parent and child exist, the parent-joint-child bend plane
and normal. The manifest mapping is validated against unique scene bones before
the overlays render. Receipts include the active opacity, selected joint,
diagnostic state, and mapping legend. These overlays are read-only; contact and
gameplay acceptance remain with the receiving game.
