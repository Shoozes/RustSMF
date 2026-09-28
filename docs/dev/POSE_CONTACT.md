# Portable pose contact v1

`source/pose-contact` is a small Rust library for calibrated one/two-leg support
correction. It is independent of Tauri, Three.js, fighter data, and contact
scheduling. `POSE_CONTACT_API_VERSION` is `1`; the crate version is `0.1.0`.
Breaking input, output, field, unit, or calibration semantics require a new API
version. The canonical source module for API v1 is
`source/pose-contact/src/v1.rs`.

## Call

```rust
use rustsmf_pose_contact::{solve_pose_v1, FootSupport, PoseContactInput};

let input = PoseContactInput {
    api_version: 1,
    parents,                 // parent-first: Option<usize> per joint
    current_pose,            // this tick's complete LocalTrs pose, as f64 arrays
    pelvis: pelvis_index,
    legs: calibrations,      // one or two indexed direct hip/knee/ankle chains
    supports,                // empty while airborne; caller supplies current weights
    ground_point,
    up,
    maximum_pelvis_correction,
};
let result = solve_pose_v1(&input)?;
// Write result.corrected_pose back to the caller's authoritative pose.
```

`LegCalibration` names joints for diagnostics and supplies their indices, local
upper/lower axes, hip-local bend pole, knee-local plane normal, ankle-local sole
offset, and bend-angle bounds in degrees. `FootSupport` specifies a leg index,
weight from 0 to 1, desired sole position, and desired ankle orientation. The
solver blends the current sole/orientation toward those targets before finding
the ankle target, then computes a shared bounded pelvis translation and
length-preserving two-bone solves. It returns every corrected local TRS plus
each leg's corrected hip/knee/ankle model-space position and world orientation,
reach, bend, clamp/reachability, sole residual, and signed ground height.

The full-pose call takes the evaluated pose on every update and stores no
continuation state. An interrupted transition can therefore supply its current
resolved local TRS directly. Empty or zero-weight contacts leave leg rotations
unchanged. An unreachable target returns a bounded pose and residual diagnostics;
invalid topology, calibration, version, or numeric input returns `SolveError`.

## Calibration and application

Resolve bone names against the current rig and give indices in parent-first
order. V1 requires each hip, knee, and ankle to be a direct parent-child chain
below one shared pelvis. When two chains are supplied, their indexed limb
subtrees must be independent. The calibrated primary axes must transform to
the current hip-to-knee and knee-to-ankle segment directions. The hip bend pole is
a stable hip-local vector toward the intended knee bend. Its plane normal is
`pole × upper_axis`, which matches v1's solved
`(hip-to-knee) × (knee-to-ankle)` orientation. `knee_plane_normal_local` points
along that same signed normal in knee-local space. Calibrate these vectors from
a known bent pose with the intended bend direction; an exactly straight pose
does not establish a unique bend plane. The hip and knee world-orientation
outputs map these calibrated axis/plane frames to the solved frames and retain
the incoming rest roll/twist. The ankle orientation output is the weighted
incoming-to-requested orientation.

Measure `sole_offset_ankle_local` from the ankle origin to the supporting point.
Supply targets in the model coordinate space of the input pose before any
external fighter/root transform. The `up` vector is normalized by the solver;
the ground point and target heights are diagnostics and do not invent a contact
target. Local scales must be positive and uniform. This preserves the generic
scaled-humanoid scope while avoiding undeclared shear/decomposition semantics.

The consumer can replace its resolved pose with `corrected_pose` directly. If it
needs the orientation diagnostics, these are already aligned by RustSMF; the
adapter only performs its ordinary hierarchy composition and f64-to-f32 `LocalTrs`
conversion. Keep support intervals, action eligibility, anchors, root travel,
and resulting gameplay/skin/visual acceptance in the consumer.

## Vendoring and hash

The study snapshot does not include external path crates. Copy the canonical
module byte-for-byte to `src/vendor/rustsmf_pose_contact/v1.rs`, declare that
module in the runtime crate, and keep the existing exact `libm = 0.2.16`
dependency. The source file is self-contained apart from that dependency and
uses the same libm implementation for native and wasm32. Record the copied file's
SHA-256 beside the study import guard; compute it from the checked-out source:

```powershell
Get-FileHash source/pose-contact/src/v1.rs -Algorithm SHA256
```

## License and attribution

This checkout has no root `LICENSE`, `COPYING`, or `NOTICE` file, and the crate
manifest does not declare a license. Do not infer a reuse or redistribution
grant from the source hash or attribution. On 2026-09-27, the repository
operator/rights holder explicitly authorized project-specific redistribution of
the exact API v1 solver and transition v1 companion listed below, including
their source and compiled native/WebAssembly runtimes, into
`Shoozes/fight-game-study`. This authorization covers committing and pushing
those pinned artifacts to that receiving repository. It does not add a general
license to this crate or authorize unrelated recipients or uses. Retain this
source attribution with distributed copies: `Shoozes/RustSMF`,
`source/pose-contact/src/v1.rs`, API v1, SHA-256
`9398bf533e50eb6a5fcaadc50a6e6b2594ab4ecfb1def4a2e96e67f275b8540c`.

The authorized transition companion is `Shoozes/RustSMF`,
`source/pose-contact/src/transition_v1.rs`, API v1, SHA-256
`fc8555bec627aa11327a8635705d9b26938b581eeabf0a56f7b1df23dff0bdc1`.
Compiled and vendored artifacts include `libm 0.2.16`; carry its selected
third-party license and required notice with the receiving distribution. The
locally available dependency license offers MIT terms (and also Apache-2.0); this
project-specific permission does not select or change the dependency license.

Do not copy, port, or reimplement the solver equations. The exact generic source
module and hash receipt are included with the RustSMF delivery. The local proof
commands are:

```powershell
cd source/pose-contact
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo check
cargo check --target wasm32-unknown-unknown
```

V1 covers calibrated humanoid two-bone chains, not arbitrary articulated
anatomy or non-uniformly scaled/sheared skeletons.
