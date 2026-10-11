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

RustSMF project-owned code is available under the MIT License in the repository
root, copyright (c) 2026 Shoozes. The license applies to this crate and other
project-owned code; it does not relicense third-party dependencies or assets.

Retain this source attribution with distributed copies of the solver:
`Shoozes/RustSMF`, `source/pose-contact/src/v1.rs`, API v1, SHA-256
`9398bf533e50eb6a5fcaadc50a6e6b2594ab4ecfb1def4a2e96e67f275b8540c`.

The authorized transition companion is `Shoozes/RustSMF`,
`source/pose-contact/src/transition_v1.rs`, API v1, SHA-256
`fc8555bec627aa11327a8635705d9b26938b581eeabf0a56f7b1df23dff0bdc1`.

`libm 0.2.16` is a separate dependency licensed `MIT`; RustSMF
redistributions must carry its complete upstream license and copyright notices.
The root `THIRD_PARTY_NOTICES.md` records this dependency and other locked app
dependencies. The older project-specific authorization dated 2026-09-27
permitted delivery of these exact pinned solver artifacts to
`Shoozes/fight-game-study`; the repository-wide MIT license now governs
project-owned source and does not replace that historical delivery record or
any dependency terms.
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
