# Bounded pelvis/leg composition

Explicit NLERP job v3 may add `conditioning.pelvisLayerBake`. It requires
`export.twoKeyExportBoundary: "preserve-unselected-emitted-keys.v1"`.
Omission retains existing serialization and all prior authoring behavior.
GaimEngine v1, root motion, solvers, supports and qualification limits stay fixed.

## Recipe

The strict object contains:

- `clipId`: one selected gait named by a transition recipe.
- `startTick`: integer 1–3598; this and the next stored tick must be interior.
- `pelvisJoint`: the declared source root, directly below the locomotion root.
- `maxTranslationFraction`: finite positive fraction of rest-skin height, at most 0.03.
- `maxRotationDegrees`: finite positive stored correction bound, at most 25.
- `positions`: two finite three-component **absolute pelvis-local positions**.
- `rotations`: six unique `{ joint, values }` entries, with two finite unit
  quaternions each. The first and last groups of three must be independent direct
  hip/knee/ankle chains descending from the pelvis.

The selected position channel must be a complete finite LINEAR float32 60 Hz
grid; selected rotations must be complete canonical NLERP chord grids. Missing,
constant/omitted or noncanonical channels refuse instead of being inferred.
Root, pelvis orientation/scale, toes and other local channels are not selected.
Roles, exact fields, sparse records, topology, terminal adjacency and duration
validate before publication. Caller arrays and original clips remain immutable.

## Execution and provenance

The layer runs after locomotion extraction, terminal/two-key/span authoring.
Only the two pelvis positions, twelve leg rotations and adjacent quaternion
chord tangents change. Existing three-record and single 3–18-key span caps stay
unchanged. Overlap with those prior layers is explicit composition.

Requested and actual stored position deltas are transformed by the sampled
pelvis-parent linear matrix into scene-root meters before applying the height
fraction bound. Local units must not be treated as meters. Stored quaternion
corrections are measured against the incoming qualified layer, not the original
pre-bake clip. All locomotion-root channels remain unchanged. Cancellation and
late cap failures leave clip arrays unpublished and release owned mixers.

The optional `report.pelvisLayerBake` has policy
`bounded-two-key-pelvis-layer.v1`, height/caps, clip/pelvis/tick bindings, and
before/requested/stored positions and six rotation corrections. Restoration
checks final stored values, reconstructs the layer and validates its provenance.
Snapshots must be dense and finite; requested/stored meter claims must be
nonnegative and within the declared bound, including zero-correction reports.
The exporter independently binds height to the actual rest mesh.

Source fidelity reverses this layer first, then checks older rotation selections
against their incoming values. It restores only those declared components and
checks every original joint matrix, including descendants. Raw final differences
remain descriptive; no broad gait or source-root exemption is introduced.

Export context optionally includes `pelvisReport`, including layer-only jobs.
Reverse-order restoration supplies the baseline for unselected emitted keys.
At selected ticks, copy only declared pelvis translation and leg rotations;
other translation/rotation/scale components use the baseline. Existing selected
two-key full-pose semantics and span rotation semantics remain intact. References
independently sample the re-imported authored GLB. Timestamp rounding and physical
tolerances do not change.

The selected White Wolf layer is 57/58 with fixed 56/59 boundaries, fraction 0.03
and 25-degree leg caps. Ordinary CLI serialization reproduces the private stored
tracks. The final source passes 46/590 receiving/replay and the 637-pose pilot
measurements, with only the existing planted-drift failure retained. Source-bound
722 frontend/14 Rust checks and dense proof are in
[HISTORY](HISTORY.md#p7c-pelvis-layer-review-cleanup).
The target repair does not close remaining planted drift or visual acceptance.

<!-- AI-edited: 2026-10-25 | agent=Codex/root | task=p7c-pelvis-layer-integration | change=specified explicit bounded layer and reverse provenance/export behavior -->

<!-- AI-edited: 2026-10-25 | agent=Codex/root | task=p7c-pelvis-layer-review-cleanup | change=closed provenance refusals and renewed source proof -->
