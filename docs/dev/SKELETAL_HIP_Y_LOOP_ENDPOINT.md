# Optional walkSlow hip-Y loop endpoint

The explicit `rustsmf.skeletal-export-job.v4` job admits one producer correction
after the qualified `walkSlow-root-y-to-body.v1` transfer. It accepts the
already conditioned, self-contained GLB, its source-bound conditioning report,
and the original GLB as three distinct inputs. The job selects an explicit
clip list, the existing `preserve-unselected-emitted-keys.v1` boundary policy,
and this endpoint recipe:

```json
{
  "policy": "walkSlow-hip-y-loop-endpoint.v1",
  "clipId": "walkSlow",
  "joint": "mixamorigHips",
  "maxCorrectionMeters": 0.24
}
```

The recipe changes only the existing `mixamorigHips.position.y` float32 value
at walkSlow tick 90, setting it to the stored tick-0 value. On the selected
source this is a `0.23839497566223145 m` correction. The maximum accepted
correction is `0.24 m`; the parser refuses zero, excess and nonfinite caps.
No key, root, pelvis recipe, other joint component, mesh, bind, skin, support,
transition clip or prior source file is authored. This is a producer-only
opt-in; v1-v3 jobs and omitted recipes retain their existing contract.

The GLB baker requires one canonical 91-key LINEAR 60 Hz walkSlow carrier,
zero root Y, a direct locomotion-root/hip chain, current accessor bounds and
unshared, nonoverlapping float32 accessors. It refuses duplicate clips,
shared animation or mesh/skin accessors, malformed or stale report lineage,
noncanonical timelines and already-applied corrections. It changes one BIN
component and the carrier accessor bounds. Its report records before,
requested and stored values, source/output byte offsets and JSON/BIN offset
change. Publication is immutable and transactional.

The producer reloads the authored GLB independently. It reverses only the
declared endpoint for the existing source-fidelity checks, then evaluates all
361 walkSlow quarter poses. Poses through tick 89 are exact; the 89-90
interpolation is checked against the stored correction. Root and joint linear
parts, skin XZ, segment lengths, floor and the root-relative loop seam have
separate guards. The export boundary restores the qualified unselected graph
and copies only the selected hip-Y endpoint into its emitted clip. It does
not copy incidental floating-point changes in other components.

The public producer proof and immutable 46-packet/590-reference graph are
recorded in [HISTORY.md](HISTORY.md#p7c-hip-y-loop-endpoint-20261028).
GaimEngine owns receiving, replay, the complete 637-pose physical pilot and
visual acceptance. This correction alone is not full P7C qualification.

<!-- AI-edited: 2026-10-28 | agent=Codex/root | task=p7c-hip-y-loop-endpoint | change=document explicit bounded endpoint job and consumer boundary -->
