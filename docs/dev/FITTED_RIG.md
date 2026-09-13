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
The command rejects external resources and ambiguous clips, fits/bakes at 60 Hz,
re-imports the output and compares every skinned vertex. Exit 0 requires maximum
sampled world-space error at most 0.00001. It writes `fitted.glb`, the normalized
`job.json`, and `report.json` with input/output SHA-256 hashes. Existing output
directories are refused. On a write failure a partial fresh directory may remain;
only a completed report establishes success. Input images are preserved as bytes;
this command does not judge rendered texture quality or visual acceptance.

From `source`, `npm.cmd run fit-rig-preview -- --directory <absolute completed
output>` opens a read-only loopback server and prints its URL and PID. Stop it
with Ctrl+C. It rechecks the job's three model hashes before serving a fixed
asset set. The viewer displays original source, source on fitted topology, and
template/target with shared clip/frame, front/side/quarter camera, optional bones
and half-speed playback. It normalizes each model to the same displayed idle
height while preserving geometry, materials and motion. It is a diagnostic view;
contact and gameplay acceptance remain with the receiving game.
