# Portable transition bake v1

`rustsmf_pose_contact::transition_v1::bake_transition_v1(&TransitionBakeInput)`
is the supported synchronous, in-memory Rust API. It runs natively and in
WebAssembly without Tauri, Three.js, file I/O, new dependencies, or retained state.
There is no JSON CLI or game-ready job field for this API. The existing game-ready
conversion and retargeting contracts remain separate.

The canonical module is `source/pose-contact/src/transition_v1.rs`; it imports
the unchanged sibling `v1` contact solver. A snapshot consumer can vendor both
modules byte-for-byte under the same parent module and retain `libm = 0.2.16`.
The library path dependency exports `transition_v1` directly. Preserve the source
attribution and the project-specific rights-holder authorization described in
[POSE_CONTACT.md](POSE_CONTACT.md). The authorization covers both pinned source
modules and compiled native/WebAssembly runtimes in `Shoozes/fight-game-study`;
it does not create a general license for unrelated recipients or uses. Carry the
required `libm 0.2.16` license and notice with that distribution.

## Input contract

- `api_version = 1`. Each `ConditionedCycle` has a caller-owned `source_identity`
  and complete parent-first `Vec<JointTrs>` frames. Cycles contain unique cyclic
  samples, without a duplicated closing sample. Rotations use unit XYZW
  quaternions; translations and targets share the solver's model coordinate units.
- `rig` supplies the existing API v1 parent indices, pelvis, one/two direct
  calibrated leg chains, ground/up convention, and maximum pelvis correction.
  Its `current_pose` and `supports` are ignored. `profile_identity` identifies
  the actual calibration. All frames must share fixed local scales and offsets,
  except root/pelvis translations. This preserves limb lengths; variable-scale
  and translated limb animation fails explicitly rather than shrinking limbs.
- `from_selection` and `to_selection` select fractional `start_frame` values in
  `[0, frame_count)`. A caller-selected phase `p` maps to `p * frame_count`.
  `frame_step` is the signed source frames advanced per output sample. Negative
  values reverse playback; zero holds a pose. Selections wrap through the cycle.
  The final destination frame is `start_frame + duration_samples * frame_step`,
  modulo its cycle length.
- `duration_samples` is 1–120 intervals, yielding 2–121 output frames including
  both endpoints. `sample_rate_hz` specifies timing; seconds equal intervals
  divided by sample rate. The two source cycles together are bounded to 2,048
  frames and 131,072 frame/joint values; rigs contain at most 256 joints.
- `targets` has exactly one entry per output frame. `root_displacement` is an
  additive model-space offset from the sampled root, not an integrated velocity.
  `supports` contains caller-resolved weights, sole positions and ankle
  orientations using the existing `FootSupport` contract. Resolve contact
  intervals, movement/speed, anchors, reversals and interrupted-pose selection
  before this call. A one-frame cycle can represent an interrupted resolved pose.
- `maximum_sole_residual` bounds the solver's weighted support residual in model
  units. `maximum_rotation_correction_degrees` bounds each joint's local angular
  correction from the interpolated pose. The rig's pelvis bound also applies.

Within each cycle, sampling uses linear root/pelvis translation and shortest-arc
quaternion interpolation. The two sampled poses blend with smoothstep
`t*t*(3-2*t)`, then `solve_pose_v1` performs support correction. No solver
equations are copied. Source knees must already satisfy calibrated bounds.
Interpolation can shorten the bend between two valid boundary poses. In that
case the same solver projects only the invalid airborne knees back to their
calibrated bounds using incoming sole/orientation self-targets and zero pelvis
allowance. Caller support flags remain unchanged, ankle world orientation is
preserved, and the total correction still obeys the angular limit. Each output
knee must remain within calibrated bend bounds. Invalid calibration signs, numeric values, topology,
or interpolated geometry fail with source/frame information. There is no automatic
profile repair or inferred support scheduling.

## Output and failures

`TransitionBakeOutput.frames` contains standard complete sampled local TRS poses.
`diagnostics` retains the corresponding full solver outputs: pelvis correction,
reach/clamp flags, knee bend, sole residual, ground height and corrected joint
positions/orientations. `knee_conditioned_legs` records per-frame leg indices
projected after interpolation. An airborne conditioned leg remains
`supported = false`; its reach/clamp/residual fields describe the projection,
without inventing a contact target or schedule. Endpoint support correction may alter an endpoint pose;
an airborne endpoint with zero displacement equals its sampled source pose.
Reach/clamp flags remain visible; a bounded clamp is accepted only when residual,
rotation and knee limits pass. Caller-owned unweighted contact accuracy and bank
totals remain consumer acceptance criteria.

`provenance` includes the tool ID `rustsmf-transition-bake-v1`, transition and
solver versions, and a complete cloned input receipt containing actual samples,
calibration, source/profile identities, selections, targets, timing and limits.
Identities are caller assertions, not authenticated hashes. Record exact tool
source hashes alongside the receipt when importing a snapshot:

```powershell
Get-FileHash source/pose-contact/src/transition_v1.rs -Algorithm SHA256
Get-FileHash source/pose-contact/src/v1.rs -Algorithm SHA256
```

Errors distinguish invalid input, invalid source pose (cycle/frame), failed sample
solve (output frame), and correction limits (frame/reason). No partial bank is
returned after any failure. No fighter names, runtime state or combat selectors
are included in the API.

## Focused local proof

```powershell
cargo fmt --manifest-path source/pose-contact/Cargo.toml --all -- --check
cargo clippy --manifest-path source/pose-contact/Cargo.toml --offline --all-targets -- -D warnings
cargo test --manifest-path source/pose-contact/Cargo.toml --offline
cargo check --manifest-path source/pose-contact/Cargo.toml --offline
cargo check --manifest-path source/pose-contact/Cargo.toml --offline --target wasm32-unknown-unknown
cargo build --manifest-path source/pose-contact/Cargo.toml --offline --target wasm32-unknown-unknown --example transition_probe
cargo build --manifest-path source/pose-contact/Cargo.toml --offline --example transition_receipt
node source/pose-contact/tests/browser-transition.mjs
```

The browser probe uses the repository's existing Playwright Chromium, closes its
owned browser, and asserts the same fixtures as native tests inside WebAssembly.
It compares native and browser fingerprints over all 480 local-TRS f64 values
in the supported and airborne knee-boundary fixtures, including their exact bits.
It proves deterministic baking, source receipt, support residual, lengths, and
knee direction/bounds for a neutral calibrated chain. It does not establish
consumer rig calibration, adapter behavior or visual acceptance for game assets.

## Local verification receipt

Verified 2026-09-25 on Windows, Rust `1.98.1`, Node `26.5.0`, and Playwright
Chromium `148.0.7778.96`. Source base: `c28cc525e8b90de19f67c0fbabf7395c87e54f67`
with the local transition additions. All eight proof commands above exited 0;
native tests passed 16 cases (six transition tests and ten existing solver
tests). The browser probe passed its shared assertions and native/browser
local-TRS bit parity, fingerprint `61931913f4cced0d`.
Context-bank validation passed with zero warnings; its ten regressions and
`git diff --check` also passed. The browser process was closed after proof.

- Transition module SHA-256: `FC8555BEC627AA11327A8635705D9B26938B581EEABF0A56F7B1DF23DFF0BDC1`.
- Unchanged solver SHA-256: `9398BF533E50EB6A5FCAADC50A6E6B2594AB4ECFB1DEF4A2E96E67F275B8540C`.

No receiving-project files, commits, pushes, publication, downloads, or service
automation were involved. Consumer adaptation and asset admission were not run.

The supplied bounded consumer request reproduced an airborne leg-0 bend of
`4.999964395562` degrees at output frame 2, while its independently sampled
source/destination bends were `4.999999479777` and `4.999999831120` degrees.
The calibration minimum was 5 degrees. The full source cycles and all seven
target frames replayed locally with the exact adapter f32 conversion after the
fix: frame 2 projects to `5.000000000000` degrees, leg 0 remains unsupported,
and the request returns seven accepted frames. The same numerical tolerance and
5–145-degree limits remain in force. This demonstrates the generic interpolation
boundary defect and its correction, without changing consumer support/phase policy.
The ignored local diagnostic retains its generator and replay log under
`output/transition-diagnosis`; it is outside the generic API and context routes.
