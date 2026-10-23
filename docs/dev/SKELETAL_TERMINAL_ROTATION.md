# Terminal rotation closure

Job v3 may explicitly add `conditioning.terminalRotationClosure` in
`continuous-60hz-locomotion-root-nlerp` mode:

```json
{
  "clipId": "walkSlow",
  "startTick": 89,
  "joints": ["mixamorigLeftUpLeg", "mixamorigLeftLeg", "mixamorigLeftFoot"],
  "maxRotationDegrees": 45
}
```

This is producer authoring. The receiver, v1 schema, Rust solvers and existing
receiving tolerances are unchanged. Omitting the option preserves existing GLB
output, including the accepted idle/p25 recipe. Private source assets and
qualification generations remain local.

## Selection and stored values

The strict recipe accepts one declared, selected gait and 1–63 unique safe joint
names. Source and locomotion roots cannot be selected. `startTick` is an integer
from 1–3599 and must equal the selected clip's duration in ticks minus one.
The maximum local rotation correction is finite, positive and at most 180 degrees.
Unknown fields, duplicate/missing targets, other modes and other intervals refuse.
Each target must have exactly one canonical chord quaternion track on the full
60 Hz tick grid; constant two-key or noncanonical channels are refused.

Only the final quaternion value is replaced with that channel's entry value,
with hemisphere continuity. Canonical chord tangents are regenerated; the only
changed tangent slots may be the penultimate outgoing and terminal incoming
slots. Earlier values/tangents and evaluation through `startTick` remain exact.
Computed bounds are checked against the actual stored float32 correction.
Duration, root travel, other channels and clips remain unchanged. Original tracks
are never mutated; cancellation and refusal leave them intact. No contacts,
floor offsets, smoothing or root-translation changes are inferred.

`report.terminalRotationClosureBake` records policy
`final-tick-entry-rotation.v1`, interval, bound and each joint's original,
entry and stored terminal quaternion plus actual correction angle. Recipe,
report and implementation participate in producer/generation identities.
The ordinary CLI serializes/reloads the derivative before independent references.

## Source fidelity

`skeletalConditioningFidelity.ts` owns the original-to-derived comparison,
re-exported by `skeletalConditioning.ts` for existing callers. Actual source
differences remain visible in position, matrix, tick and endpoint metrics.
Only the selected terminal rotations receive an authoring exception. They must
equal their source entry orientations and fit the declared bound. For the
preservation check only, undo those local rotations and compare every original
joint matrix, including descendants, at the terminal tick. Any unselected
translation, rotation or scale still has the unchanged `1e-4` matrix limit.
All earlier integer ticks and every other role retain their previous guards.
The separate idle exception still preserves its source endpoints; a terminal
selection cannot be passed as the authored idle. Report
`maximumPreservedTickJointMatrix` states the checked maximum separately from
the raw authored differences.

## Selected White Wolf proof

The selected batch repairs only three residual `walkSlow@90 -> walkSlow@0`
seams. Original terminal local angles from entry are 21.174786, 42.790123 and
11.364110 degrees; tick 89 is already within 0.658502 degrees. The final
`[89,90)` span is unsupported. Root travel and all support declarations remain
unchanged, and the 45 unselected clips include accepted idle and p25 transitions.

| Residual seam | Before | After | Limit |
| --- | --- | --- | --- |
| Skin position, meters | 0.301496329 | 0.000000216866698 | 0.021012886070915813 |
| Joint position, meters | 0.298733394 | 0.000000207961410 | 0.021012886070915813 |
| Joint angle, degrees | 21.702578178 | 0.000002957559 | 5 |

All five actual tail poses at ticks 89, 89.25, 89.5, 89.75 and 90 meet the floor
limit at 1x/+Z, Y=0; the minimum skin Y is +0.000268439437 m. The original and
repaired full 361-pose walks have zero knee inversions. All 27 segments remain
stable, with maximum relative length change 3.513350522e-7. The four planted-drift
and floor criteria retain their exact first/maximum witnesses and measurements.

All 45 unselected canonical clips (105 packet occurrences), 29 unaffected raw
walk channels, pre-tail quaternion values/tangents and root channels compare
exactly. Mesh/skin/bind, joint/vertex lineage, patches/windows/modes and unsupported
spans are unchanged. Idle/p25 metrics, all transition endpoints and seams remain
accepted. No-option actual GLB bytes match the prior derivative; five CLI refusal
controls release native copies and leave no partial generations.

All 46 packets/590 independent references pass exact native/WASM receiving,
isolation, six-tick restored replay and cleanup. The complete 637-pose pilot
retains exactly four drift/floor failures and exits 1; separate repair acceptance
passes. Full P7C collision, other roles/phases, scale/facing, f32 and visual
acceptance remain open. This proof uses the preserved receiver source and exact
owned native/WASM outputs, reusing its original gate plus recorded renewal;
no fresh full engine-check is claimed.

Retained run:
`D:/Compact_Evidence/RustSMF/runs/p7c-terminal-rotation-closure-20261023/final/`.
`acceptance.json`, `actual-floor-pilot-renewed.json` and
`actual-bundle-receiving.json` own the actual comparisons; HISTORY records the
producer gate and final preservation/cleanup checks. GaimEngine v1, all three
Rust overlays, shared dependencies and prior qualification evidence are protected.

<!-- AI-edited: 2026-10-23 | agent=Codex/root | task=p7c-terminal-rotation-closure | change=specified bounded stored-key authoring and actual receiving proof -->
