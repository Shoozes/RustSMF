# Humanoid Pose Review

This diagnostic measures calibrated local angular envelopes. It does not clamp
animation, simulate ragdolls, supply medical ranges, certify skin deformation,
prove planted contacts or replace continuous visual review.

## Contract

`rustsmf.pose-ranges.v1` declares an ID, `report` or `reject` policy and 1–64 unique
joint entries. Each entry owns its exact bone name, unit reference quaternion,
perpendicular unit bend/twist axes, increasing flexion/lateral/twist degree ranges
within [-180, 180], and a positive swing cone no greater than 180 degrees.
Unknown fields, invalid calibration, missing bones and invalid rotations fail closed.

Optional `retarget.poseRanges` shares the parser and final-output audit across
saved profiles, game-ready jobs, retarget core and frontend. `report` preserves the
result and surfaces offending clips, bones, components and frames. `reject` fails
before committing generated animation or exporting a candidate. Retarget audits
use their output grid; standalone review samples at 60 Hz plus terminal.

## Standalone command

From `source/frontend`, supply absolute paths and fresh output filenames:

```powershell
npm run pose-review -- --model <embedded-model.glb> --profile <profile.json> --report <fresh-report.json>
npm run pose-review -- --model <embedded-model.glb> --calibrate-mixamo <fresh-profile.json> --reference-clip <neutral-clip-name> --report <fresh-report.json>
```

Calibration uses time zero of an explicitly reviewed neutral clip. It supports
plain and `mixamorig`/`mixamorig:` names and intermediate chain bones under the
explicit Y-up/Z-forward convention. These broad animation heuristics are not
universal anatomical constants. Inspect calibration before using rejection policy.

The CLI accepts embedded GLB only, refuses external buffer/image URIs, bounds
models to 128 MiB and saved profiles to 1 MiB, and accepts 1–256 clips. Its shared
schedule limits each clip to 6,000 regular frames; total sampling is capped at
200,000. Existing output files are not overwritten. After an output failure,
inspect any already-created calibration file before retrying with fresh paths.
Ambiguous or unnamed raw/loaded bone and clip identities and incompatible skin
joint sets are rejected before scanning. Output existence is preflighted before
calibration and exclusive creation also guards against later collisions.

Exit codes: `0` within-profile, `2` review-required, `1` failure. Reports bind model
and normalized profile hashes, sample times, first/last/worst offending frames
and counts. Within-profile means only the declared angular envelopes passed.

## Ownership and proof

- `poseRanges.ts`: schema validation and swing/twist measurement.
- `humanoidPoseRanges.ts`: optional Mixamo calibration heuristics.
- `pose-review-cli.ts`: bounded input, sampling, output and disposal.
- `poseRanges.test.ts`: calibration, mirrored/antipodal rotations, signed bends.
- `poseReviewCli.test.ts`: real CLI exit codes, deterministic reports, ambiguity,
  external resources, output preservation and terminal-inclusive sampling.
- `retarget-profile.spec.ts`: frontend report/reject transaction coverage.

Run the repo verification gate and focused pose/profile tests after changes.
Game-specific source choices and candidate acceptance belong in HISTORY/TODO,
not this reusable contract.
