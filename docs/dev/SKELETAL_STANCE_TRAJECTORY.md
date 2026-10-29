# Versioned left-stance trajectory

NLERP skeletal-export job v3 may opt into
`conditioning.stanceTrajectoryBake` with policy
`walkSlow-left-sole-23-key-trajectory.v1`. Omission retains the prior recipe,
conditioned GLB, packet and reference bytes. This is a producer contract for the
selected White Wolf P7C left stance; it does not change GaimEngine v1, support
declarations, root travel, planted limits or the three existing Rust overlays.

The strict recipe names `walkSlow`, anchor tick 0, start tick 2, a positive
`maxRotationDegrees` no greater than 65, and exactly 23 unit quaternion values
for each ordered joint: `mixamorigLeftUpLeg`, `mixamorigLeftLeg`, then
`mixamorigLeftFoot`. The clip must have the existing 90-tick canonical chord
grid and direct left hip/knee/foot chain. It requires the explicit
`preserve-unselected-emitted-keys.v1` export boundary, NLERP conditioning,
the six-tick walkSlow p25 transition and the existing start/stop p25 floor
bakes at floor Y 0 with a lift cap no greater than 0.1 m. Overlap with an
existing left-leg two-key/span selection or a pelvis layer at ticks 1–25
refuses before publication. Unknown fields, malformed quaternions, absent
channels and stored corrections above the declared cap also refuse.

Authoring changes only those 69 local rotation values and their adjacent
canonical chord tangents. Complete gait poses at ticks 1 and 25 stay fixed.
The producer then rebuilds start, stop and reversal walkSlow-p25 from the
corrected gait phase 22.5; start/stop are rebaked under the same floor recipe.
The conditioning report records each before/requested/stored rotation and
correction bound. Source-fidelity and export-boundary checks reverse only
declared authoring, preserve every unselected emitted component, and keep
source references on the independently reloaded authored GLB. Other clips,
root, pelvis, right leg, mesh, bind and support semantics remain unchanged.

The ordinary 46-packet stance export, the retained idle integration failure and
the corrected private composition are recorded in
[HISTORY](HISTORY.md#p7c-stance-producer-20261028). The private idle root/body
transfer is not part of this public recipe. The complete 637-pose pilot and
remaining P7C collision, role/phase, scale/facing, f32 and visual acceptance
are consumer-owned and remain open in [TODO](TODO.md).

<!-- AI-edited: 2026-10-28 | agent=Codex/root | task=p7c-stance-producer | change=document strict opt-in 23-key contract and receiving boundary -->
