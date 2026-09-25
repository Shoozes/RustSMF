//! Stable, self-contained source distribution for versioned support-pose correction.
//! Copy this file verbatim when a path dependency cannot cross the consumer's snapshot boundary.

use alloc::vec::Vec;
use core::fmt;

extern crate alloc;

pub const POSE_CONTACT_API_VERSION: u16 = 1;
const EPSILON: f64 = 1.0e-10;
const UNIT_TOLERANCE: f64 = 1.0e-6;
const AXIS_TOLERANCE: f64 = 1.0e-5;
const MAX_JOINTS: usize = 256;
const MAX_LEGS: usize = 2;
const PELVIS_PASSES: usize = 32;

#[derive(Clone, Debug, PartialEq)]
pub struct JointTrs {
    pub translation: [f64; 3],
    /// Unit quaternion in XYZW order.
    pub rotation: [f64; 4],
    /// Positive uniform local scale. Non-uniform scale is rejected for this v1 solver.
    pub scale: [f64; 3],
}

#[derive(Clone, Debug, PartialEq)]
pub struct LegCalibration {
    pub name: String,
    pub hip: usize,
    pub knee: usize,
    pub ankle: usize,
    /// Calibrated hip-local axis from hip toward knee.
    pub upper_axis_local: [f64; 3],
    /// Calibrated direction toward the knee bend pole in hip-local space.
    /// The hip frame plane normal uses pole.cross(upper_axis) to match the
    /// solver's (hip_to_knee).cross(knee_to_ankle) normal sign.
    pub hip_bend_pole_local: [f64; 3],
    /// Calibrated knee-local axis from knee toward ankle.
    pub lower_axis_local: [f64; 3],
    /// Calibrated bend-plane normal in knee-local space; preserves rest roll/twist.
    pub knee_plane_normal_local: [f64; 3],
    /// Calibrated point relative to ankle origin, before world uniform scale.
    pub sole_offset_ankle_local: [f64; 3],
    pub minimum_bend_degrees: f64,
    pub maximum_bend_degrees: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FootSupport {
    /// Index into `PoseContactInput::legs`.
    pub leg: usize,
    pub weight: f64,
    pub desired_sole_position: [f64; 3],
    /// Desired ankle/foot world orientation in XYZW order.
    pub desired_ankle_orientation: [f64; 4],
}

#[derive(Clone, Debug, PartialEq)]
pub struct PoseContactInput {
    pub api_version: u16,
    /// Parent-first indices; roots use `None` and every other parent index is less than its child.
    pub parents: Vec<Option<usize>>,
    /// Evaluated local pose for this update, including interrupted blend output.
    pub current_pose: Vec<JointTrs>,
    pub pelvis: usize,
    pub legs: Vec<LegCalibration>,
    /// Caller-resolved desired contacts for this update. Empty means airborne/no correction.
    pub supports: Vec<FootSupport>,
    /// Model-space ground plane convention used by diagnostics.
    pub ground_point: [f64; 3],
    pub up: [f64; 3],
    pub maximum_pelvis_correction: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LegDiagnostic {
    pub leg: String,
    pub hip: usize,
    pub knee: usize,
    pub ankle: usize,
    pub supported: bool,
    pub corrected_hip_position: [f64; 3],
    pub corrected_knee_position: [f64; 3],
    pub corrected_ankle_position: [f64; 3],
    pub reachable: bool,
    pub clamped: bool,
    pub requested_reach: f64,
    pub solved_reach: f64,
    pub bend_degrees: f64,
    pub residual: f64,
    pub sole_residual: f64,
    /// Signed height of the corrected sole point above the configured ground plane.
    pub signed_ground_height: f64,
    /// Corrected calibrated world orientations, XYZW. These preserve each joint's
    /// calibrated bend-plane/rest-roll frame while mapping the solved segment axes.
    pub hip_world_orientation: [f64; 4],
    pub knee_world_orientation: [f64; 4],
    pub ankle_world_orientation: [f64; 4],
}

#[derive(Clone, Debug, PartialEq)]
pub struct PoseContactOutput {
    pub api_version: u16,
    pub corrected_pose: Vec<JointTrs>,
    pub pelvis_translation: [f64; 3],
    pub legs: Vec<LegDiagnostic>,
    /// True for every successful return. Invalid or non-finite output is an error.
    pub finite: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SolveError {
    UnsupportedVersion,
    InvalidInput(&'static str),
    NumericalFailure,
}

impl fmt::Display for SolveError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedVersion => write!(formatter, "unsupported pose-contact API version"),
            Self::InvalidInput(message) => {
                write!(formatter, "invalid pose-contact input: {message}")
            }
            Self::NumericalFailure => {
                write!(formatter, "pose-contact solve produced non-finite output")
            }
        }
    }
}

impl std::error::Error for SolveError {}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct V3(f64, f64, f64);

impl V3 {
    fn from(value: [f64; 3]) -> Self {
        Self(value[0], value[1], value[2])
    }
    fn array(self) -> [f64; 3] {
        [self.0, self.1, self.2]
    }
    fn dot(self, other: Self) -> f64 {
        (self.0 * other.0 + self.1 * other.1) + self.2 * other.2
    }
    fn cross(self, other: Self) -> Self {
        Self(
            self.1 * other.2 - self.2 * other.1,
            self.2 * other.0 - self.0 * other.2,
            self.0 * other.1 - self.1 * other.0,
        )
    }
    fn length_squared(self) -> f64 {
        self.dot(self)
    }
    fn length(self) -> f64 {
        libm::sqrt(self.length_squared())
    }
    fn normalized(self) -> Result<Self, SolveError> {
        let length = self.length();
        if !length.is_finite() || length <= EPSILON {
            return Err(SolveError::InvalidInput("zero or non-finite direction"));
        }
        Ok(self / length)
    }
    fn project_off(self, axis: Self) -> Self {
        self - axis * self.dot(axis)
    }
    fn finite(self) -> bool {
        [self.0, self.1, self.2]
            .iter()
            .all(|value| value.is_finite())
    }
}

impl core::ops::Add for V3 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self(self.0 + rhs.0, self.1 + rhs.1, self.2 + rhs.2)
    }
}
impl core::ops::Sub for V3 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self(self.0 - rhs.0, self.1 - rhs.1, self.2 - rhs.2)
    }
}
impl core::ops::Mul<f64> for V3 {
    type Output = Self;
    fn mul(self, rhs: f64) -> Self {
        Self(self.0 * rhs, self.1 * rhs, self.2 * rhs)
    }
}
impl core::ops::Div<f64> for V3 {
    type Output = Self;
    fn div(self, rhs: f64) -> Self {
        Self(self.0 / rhs, self.1 / rhs, self.2 / rhs)
    }
}
impl core::ops::AddAssign for V3 {
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}
impl core::ops::SubAssign for V3 {
    fn sub_assign(&mut self, rhs: Self) {
        *self = *self - rhs;
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Q(f64, f64, f64, f64);

impl Q {
    fn from(value: [f64; 4]) -> Self {
        Self(value[0], value[1], value[2], value[3])
    }
    fn array(self) -> [f64; 4] {
        [self.0, self.1, self.2, self.3]
    }
    fn dot(self, other: Self) -> f64 {
        ((self.0 * other.0 + self.1 * other.1) + self.2 * other.2) + self.3 * other.3
    }
    fn normalized(self) -> Result<Self, SolveError> {
        let length = libm::sqrt(self.dot(self));
        if !length.is_finite() || length <= EPSILON {
            return Err(SolveError::InvalidInput("zero or non-finite quaternion"));
        }
        Ok(Self(
            self.0 / length,
            self.1 / length,
            self.2 / length,
            self.3 / length,
        ))
    }
    fn inverse(self) -> Self {
        Self(-self.0, -self.1, -self.2, self.3)
    }
    fn rotate(self, v: V3) -> V3 {
        let q = V3(self.0, self.1, self.2);
        let twice = q.cross(v) * 2.0;
        v + twice * self.3 + q.cross(twice)
    }
    fn nlerp(self, mut target: Self, weight: f64) -> Result<Self, SolveError> {
        if self.dot(target) < 0.0 {
            target = Self(-target.0, -target.1, -target.2, -target.3);
        }
        Self(
            self.0 + (target.0 - self.0) * weight,
            self.1 + (target.1 - self.1) * weight,
            self.2 + (target.2 - self.2) * weight,
            self.3 + (target.3 - self.3) * weight,
        )
        .normalized()
    }
}

impl core::ops::Mul for Q {
    type Output = Self;
    fn mul(self, b: Self) -> Self {
        let Self(x, y, z, w) = self;
        let Self(bx, by, bz, bw) = b;
        Self(
            x * bw + w * bx + y * bz - z * by,
            y * bw + w * by + z * bx - x * bz,
            z * bw + w * bz + x * by - y * bx,
            w * bw - x * bx - y * by - z * bz,
        )
    }
}

#[derive(Clone, Copy)]
struct WorldJoint {
    position: V3,
    orientation: Q,
    scale: f64,
}

#[derive(Clone, Copy)]
struct ContactSolve {
    ankle: V3,
    orientation: Q,
    weight: f64,
    sole: V3,
}

#[derive(Clone, Copy)]
struct LegSolve {
    knee: V3,
    ankle: V3,
    bend_degrees: f64,
    requested_reach: f64,
    solved_reach: f64,
    residual: f64,
    clamped: bool,
    plane: V3,
}

struct LegSolveInput {
    hip: V3,
    knee_reference: V3,
    target: V3,
    pole_direction: V3,
    previous_plane: V3,
    first_length: f64,
    second_length: f64,
    minimum_bend: f64,
    maximum_bend: f64,
}

fn reach_for_bend(first: f64, second: f64, bend_radians: f64) -> f64 {
    libm::sqrt(
        (first * first + second * second + 2.0 * first * second * libm::cos(bend_radians)).max(0.0),
    )
}

fn to_radians(degrees: f64) -> f64 {
    degrees * (core::f64::consts::PI / 180.0)
}

fn solve_two_bone(input: LegSolveInput) -> Result<LegSolve, SolveError> {
    let LegSolveInput {
        hip,
        knee_reference,
        target,
        pole_direction,
        previous_plane,
        first_length: first,
        second_length: second,
        minimum_bend,
        maximum_bend,
    } = input;
    let delta = target - hip;
    let requested_reach = delta.length();
    if !requested_reach.is_finite() || requested_reach <= EPSILON {
        return Err(SolveError::InvalidInput(
            "hip and target ankle must be distinct",
        ));
    }
    let direction = delta / requested_reach;
    let minimum_reach = reach_for_bend(first, second, maximum_bend);
    let maximum_reach = reach_for_bend(first, second, minimum_bend);
    let solved_reach = requested_reach.clamp(minimum_reach, maximum_reach);
    let ankle = hip + direction * solved_reach;
    let along =
        (first * first - second * second + solved_reach * solved_reach) / (2.0 * solved_reach);
    let perpendicular = libm::sqrt((first * first - along * along).max(0.0));
    let mut pole = pole_direction.project_off(direction);
    if pole.length_squared() <= EPSILON && previous_plane.length_squared() > EPSILON {
        // The solved plane is pole × direction, so recover the pole with
        // direction × the previous plane to preserve its signed bend side.
        pole = direction.cross(previous_plane);
    }
    if pole.length_squared() <= EPSILON {
        pole = (knee_reference - hip).project_off(direction);
    }
    pole = pole.normalized()?;
    let knee = hip + direction * along + pole * perpendicular;
    let mut plane = (knee - hip).cross(ankle - knee);
    if plane.length_squared() <= EPSILON {
        plane = if previous_plane.length_squared() > EPSILON {
            previous_plane
        } else {
            direction.cross(pole)
        };
    }
    plane = plane.normalized()?;
    let cosine = ((solved_reach * solved_reach - first * first - second * second)
        / (2.0 * first * second))
        .clamp(-1.0, 1.0);
    let bend_degrees = libm::acos(cosine) * (180.0 / core::f64::consts::PI);
    Ok(LegSolve {
        knee,
        ankle,
        bend_degrees,
        requested_reach,
        solved_reach,
        residual: (target - ankle).length(),
        clamped: (solved_reach - requested_reach).abs() > 1.0e-10,
        plane,
    })
}

fn frame(primary: V3, normal: V3) -> Result<Q, SolveError> {
    let x = primary.normalized()?;
    let y = normal.project_off(x).normalized()?;
    let z = x.cross(y).normalized()?;
    let (m11, m12, m13, m21, m22, m23, m31, m32, m33) =
        (x.0, y.0, z.0, x.1, y.1, z.1, x.2, y.2, z.2);
    let trace = m11 + m22 + m33;
    let q = if trace > 0.0 {
        let s = 0.5 / libm::sqrt(trace + 1.0);
        Q((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s)
    } else if m11 > m22 && m11 > m33 {
        let s = 2.0 * libm::sqrt(1.0 + m11 - m22 - m33);
        Q(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s)
    } else if m22 > m33 {
        let s = 2.0 * libm::sqrt(1.0 + m22 - m11 - m33);
        Q((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s)
    } else {
        let s = 2.0 * libm::sqrt(1.0 + m33 - m11 - m22);
        Q((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s)
    };
    q.normalized()
}

fn align_frame(
    current_world: Q,
    local_axis: V3,
    local_normal: V3,
    solved_axis: V3,
    solved_normal: V3,
) -> Result<Q, SolveError> {
    let current_frame = frame(
        current_world.rotate(local_axis),
        current_world.rotate(local_normal),
    )?;
    let solved_frame = frame(solved_axis, solved_normal)?;
    (solved_frame * current_frame.inverse() * current_world).normalized()
}

fn descendants(parents: &[Option<usize>], ancestor: usize, descendant: usize) -> bool {
    let mut current = Some(descendant);
    while let Some(index) = current {
        if index == ancestor {
            return true;
        }
        current = parents[index];
    }
    false
}

fn hierarchy(input: &PoseContactInput) -> Result<Vec<WorldJoint>, SolveError> {
    let mut world: Vec<WorldJoint> = Vec::with_capacity(input.parents.len());
    for (index, parent) in input.parents.iter().enumerate() {
        let local = &input.current_pose[index];
        let local_q = Q::from(local.rotation).normalized()?;
        let local_scale = local.scale[0];
        let (position, orientation, scale) = if let Some(parent_index) = parent {
            let parent_world = world[*parent_index];
            let local_position = V3::from(local.translation) * parent_world.scale;
            (
                parent_world.position + parent_world.orientation.rotate(local_position),
                (parent_world.orientation * local_q).normalized()?,
                parent_world.scale * local_scale,
            )
        } else {
            (V3::from(local.translation), local_q, local_scale)
        };
        if !position.finite() || !scale.is_finite() || scale <= 0.0 {
            return Err(SolveError::NumericalFailure);
        }
        world.push(WorldJoint {
            position,
            orientation,
            scale,
        });
    }
    Ok(world)
}

fn validate(input: &PoseContactInput) -> Result<(), SolveError> {
    if input.api_version != POSE_CONTACT_API_VERSION {
        return Err(SolveError::UnsupportedVersion);
    }
    let count = input.parents.len();
    if count == 0 || count > MAX_JOINTS || input.current_pose.len() != count {
        return Err(SolveError::InvalidInput(
            "pose hierarchy must contain 1..=256 matching parent-first joints",
        ));
    }
    if !input.maximum_pelvis_correction.is_finite() || input.maximum_pelvis_correction < 0.0 {
        return Err(SolveError::InvalidInput(
            "pelvis correction bound must be finite and non-negative",
        ));
    }
    if !V3::from(input.ground_point).finite() {
        return Err(SolveError::InvalidInput(
            "ground plane point must be finite",
        ));
    }
    let _ = V3::from(input.up).normalized()?;
    for (index, parent) in input.parents.iter().enumerate() {
        if parent.is_some_and(|value| value >= index) {
            return Err(SolveError::InvalidInput(
                "joint hierarchy must be parent-first",
            ));
        }
        let joint = &input.current_pose[index];
        if joint
            .translation
            .iter()
            .chain(joint.rotation.iter())
            .chain(joint.scale.iter())
            .any(|v| !v.is_finite() || v.abs() > 1.0e9)
            || joint.scale.iter().any(|s| *s <= 0.0)
        {
            return Err(SolveError::InvalidInput(
                "local TRS must be finite with positive scale",
            ));
        }
        let scale = joint.scale[0].abs().max(1.0);
        if (joint.scale[0] - joint.scale[1]).abs() > UNIT_TOLERANCE * scale
            || (joint.scale[0] - joint.scale[2]).abs() > UNIT_TOLERANCE * scale
        {
            return Err(SolveError::InvalidInput(
                "v1 supports uniform local scale only",
            ));
        }
        let q = Q::from(joint.rotation);
        if (q.dot(q) - 1.0).abs() > UNIT_TOLERANCE {
            return Err(SolveError::InvalidInput(
                "local rotations must be unit quaternions",
            ));
        }
    }
    if input.pelvis >= count {
        return Err(SolveError::InvalidInput("pelvis index is outside the pose"));
    }
    if input.legs.is_empty() || input.legs.len() > MAX_LEGS {
        return Err(SolveError::InvalidInput(
            "v1 accepts one or two calibrated leg chains",
        ));
    }
    let mut used_legs = Vec::new();
    for leg in &input.legs {
        if leg.name.trim().is_empty()
            || leg.name.len() > 128
            || leg.hip >= count
            || leg.knee >= count
            || leg.ankle >= count
            || leg.hip == leg.knee
            || leg.knee == leg.ankle
            || leg.hip == leg.ankle
            || input.parents[leg.knee] != Some(leg.hip)
            || input.parents[leg.ankle] != Some(leg.knee)
            || !descendants(&input.parents, input.pelvis, leg.hip)
            || leg.hip == input.pelvis
        {
            return Err(SolveError::InvalidInput(
                "each named leg must map a parent-first pelvis/hip/knee/ankle chain",
            ));
        }
        for index in [leg.hip, leg.knee, leg.ankle] {
            if used_legs.contains(&index) {
                return Err(SolveError::InvalidInput(
                    "leg chains may not share hip/knee/ankle joints",
                ));
            }
            used_legs.push(index);
        }
        let upper_axis = V3::from(leg.upper_axis_local).normalized()?;
        let bend_pole = V3::from(leg.hip_bend_pole_local).normalized()?;
        let lower_axis = V3::from(leg.lower_axis_local).normalized()?;
        let lower_normal = V3::from(leg.knee_plane_normal_local).normalized()?;
        if upper_axis.cross(bend_pole).length() <= AXIS_TOLERANCE
            || lower_axis.cross(lower_normal).length() <= AXIS_TOLERANCE
        {
            return Err(SolveError::InvalidInput(
                "calibrated segment and bend-plane axes must be non-parallel",
            ));
        }
        if !V3::from(leg.sole_offset_ankle_local).finite()
            || leg
                .sole_offset_ankle_local
                .iter()
                .any(|v| v.abs() > 10000.0)
            || !leg.minimum_bend_degrees.is_finite()
            || !leg.maximum_bend_degrees.is_finite()
            || leg.minimum_bend_degrees < 0.0
            || leg.minimum_bend_degrees > leg.maximum_bend_degrees
            || leg.maximum_bend_degrees >= 180.0
        {
            return Err(SolveError::InvalidInput(
                "sole calibration or bend limits are invalid",
            ));
        }
    }
    for (left_index, left) in input.legs.iter().enumerate() {
        for right in input.legs.iter().skip(left_index + 1) {
            let left_chain = [left.hip, left.knee, left.ankle];
            let right_chain = [right.hip, right.knee, right.ankle];
            if left_chain.iter().any(|left_joint| {
                right_chain.iter().any(|right_joint| {
                    descendants(&input.parents, *left_joint, *right_joint)
                        || descendants(&input.parents, *right_joint, *left_joint)
                })
            }) {
                return Err(SolveError::InvalidInput(
                    "two leg chains must occupy independent hierarchy branches",
                ));
            }
        }
    }
    if input.supports.len() > input.legs.len() {
        return Err(SolveError::InvalidInput(
            "at most one support target is allowed per calibrated leg",
        ));
    }
    let mut seen = Vec::new();
    for support in &input.supports {
        if support.leg >= input.legs.len() || seen.contains(&support.leg) {
            return Err(SolveError::InvalidInput(
                "support leg index is invalid or duplicated",
            ));
        }
        seen.push(support.leg);
        if !support.weight.is_finite()
            || !(0.0..=1.0).contains(&support.weight)
            || !V3::from(support.desired_sole_position).finite()
        {
            return Err(SolveError::InvalidInput(
                "support weight/position is invalid",
            ));
        }
        let q = Q::from(support.desired_ankle_orientation);
        if !q.dot(q).is_finite() || (q.dot(q) - 1.0).abs() > UNIT_TOLERANCE {
            return Err(SolveError::InvalidInput(
                "support orientation must be a finite unit quaternion",
            ));
        }
    }
    Ok(())
}

/// Correct one evaluated parent-first local TRS pose using zero, one or two
/// caller-resolved support targets. No timeline, anchors, allocations or I/O persist.
pub fn solve_pose_v1(input: &PoseContactInput) -> Result<PoseContactOutput, SolveError> {
    validate(input)?;
    let initial = hierarchy(input)?;
    for leg in &input.legs {
        let upper = (initial[leg.knee].position - initial[leg.hip].position).normalized()?;
        let upper_axis_local = V3::from(leg.upper_axis_local).normalized()?;
        let upper_axis = initial[leg.hip].orientation.rotate(upper_axis_local);
        let lower = (initial[leg.ankle].position - initial[leg.knee].position).normalized()?;
        let lower_axis_local = V3::from(leg.lower_axis_local).normalized()?;
        let lower_axis = initial[leg.knee].orientation.rotate(lower_axis_local);
        if upper.dot(upper_axis) < 1.0 - 2.0e-5 || lower.dot(lower_axis) < 1.0 - 2.0e-5 {
            return Err(SolveError::InvalidInput(
                "calibrated segment axes do not match the evaluated hierarchy",
            ));
        }
        let current_plane = upper.cross(lower);
        if current_plane.length_squared() > 1.0e-8 {
            let plane = current_plane.normalized()?;
            let hip_pole = initial[leg.hip]
                .orientation
                .rotate(V3::from(leg.hip_bend_pole_local).normalized()?);
            let hip_plane = hip_pole.cross(upper_axis).normalized()?;
            let knee_plane = initial[leg.knee]
                .orientation
                .rotate(V3::from(leg.knee_plane_normal_local).normalized()?)
                .normalized()?;
            if hip_plane.dot(plane) <= 0.0 || knee_plane.dot(plane) <= 0.0 {
                return Err(SolveError::InvalidInput(
                    "bend-pole and knee-plane calibration signs must match the evaluated bend",
                ));
            }
        }
    }
    let up = V3::from(input.up).normalized()?;
    let ground_point = V3::from(input.ground_point);
    let mut targets: Vec<Option<ContactSolve>> = alloc::vec![None; input.legs.len()];
    for support in &input.supports {
        let leg = &input.legs[support.leg];
        let ankle = initial[leg.ankle];
        let weight = support.weight;
        if weight == 0.0 {
            continue;
        }
        let current_sole = ankle.position
            + ankle
                .orientation
                .rotate(V3::from(leg.sole_offset_ankle_local) * ankle.scale);
        let desired_sole =
            current_sole + (V3::from(support.desired_sole_position) - current_sole) * weight;
        let desired_ankle_orientation = ankle
            .orientation
            .nlerp(Q::from(support.desired_ankle_orientation), weight)?;
        let desired_ankle = desired_sole
            - desired_ankle_orientation.rotate(V3::from(leg.sole_offset_ankle_local) * ankle.scale);
        targets[support.leg] = Some(ContactSolve {
            ankle: desired_ankle,
            orientation: desired_ankle_orientation,
            weight,
            sole: desired_sole,
        });
    }

    let bounds: Vec<f64> = targets
        .iter()
        .map(|target| target.map_or(0.0, |target| target.weight))
        .collect();
    let maximum_correction = if bounds.is_empty() {
        0.0
    } else {
        input.maximum_pelvis_correction * bounds.iter().copied().fold(0.0, f64::max)
    };
    let mut pelvis_correction = V3::default();
    if maximum_correction > 0.0 {
        for _ in 0..PELVIS_PASSES {
            let mut worst = 0.0_f64;
            for (leg_index, leg) in input.legs.iter().enumerate() {
                let Some(contact) = targets[leg_index] else {
                    continue;
                };
                let hip = initial[leg.hip].position + pelvis_correction;
                let knee = initial[leg.knee].position + pelvis_correction;
                let ankle = initial[leg.ankle].position + pelvis_correction;
                let first = (knee - hip).length();
                let second = (ankle - knee).length();
                let pole = initial[leg.hip]
                    .orientation
                    .rotate(V3::from(leg.hip_bend_pole_local));
                let plane = (knee - hip).cross(ankle - knee);
                let solved = solve_two_bone(LegSolveInput {
                    hip,
                    knee_reference: knee,
                    target: contact.ankle,
                    pole_direction: pole,
                    previous_plane: plane,
                    first_length: first,
                    second_length: second,
                    minimum_bend: to_radians(leg.minimum_bend_degrees),
                    maximum_bend: to_radians(leg.maximum_bend_degrees),
                })?;
                worst = worst.max(solved.residual);
                pelvis_correction += contact.ankle - solved.ankle;
                let length = pelvis_correction.length();
                if length > maximum_correction {
                    pelvis_correction = pelvis_correction * (maximum_correction / length);
                }
            }
            if worst < 1.0e-9 {
                break;
            }
        }
    }

    let pelvis_parent = input.parents[input.pelvis];
    let mut pose = input.current_pose.clone();
    if let Some(parent_index) = pelvis_parent {
        let parent = initial[parent_index];
        let local_correction =
            parent.orientation.inverse().rotate(pelvis_correction) / parent.scale;
        pose[input.pelvis].translation =
            (V3::from(pose[input.pelvis].translation) + local_correction).array();
    } else {
        pose[input.pelvis].translation =
            (V3::from(pose[input.pelvis].translation) + pelvis_correction).array();
    }
    let mut output_world = hierarchy_for(&input.parents, &pose)?;
    let mut diagnostics = Vec::with_capacity(input.legs.len());
    apply_leg_solves(
        input,
        &initial,
        &mut pose,
        &mut output_world,
        pelvis_correction,
        up,
        ground_point,
        &targets,
        &mut diagnostics,
    )?;
    finish(input, pose, pelvis_correction, diagnostics)
}

fn hierarchy_for(
    parents: &[Option<usize>],
    pose: &[JointTrs],
) -> Result<Vec<WorldJoint>, SolveError> {
    let mut world: Vec<WorldJoint> = Vec::with_capacity(parents.len());
    for (index, parent) in parents.iter().enumerate() {
        let local = &pose[index];
        let local_q = Q::from(local.rotation).normalized()?;
        let local_scale = local.scale[0];
        let (position, orientation, scale) = if let Some(parent_index) = parent {
            let parent_world = world[*parent_index];
            (
                parent_world.position
                    + parent_world
                        .orientation
                        .rotate(V3::from(local.translation) * parent_world.scale),
                (parent_world.orientation * local_q).normalized()?,
                parent_world.scale * local_scale,
            )
        } else {
            (V3::from(local.translation), local_q, local_scale)
        };
        if !position.finite() || !scale.is_finite() {
            return Err(SolveError::NumericalFailure);
        }
        world.push(WorldJoint {
            position,
            orientation,
            scale,
        });
    }
    Ok(world)
}

#[allow(clippy::too_many_arguments)]
fn apply_leg_solves(
    input: &PoseContactInput,
    initial: &[WorldJoint],
    pose: &mut [JointTrs],
    world: &mut Vec<WorldJoint>,
    pelvis_correction: V3,
    up: V3,
    ground_point: V3,
    targets: &[Option<ContactSolve>],
    diagnostics: &mut Vec<LegDiagnostic>,
) -> Result<(), SolveError> {
    for (leg_index, leg) in input.legs.iter().enumerate() {
        let original_hip = initial[leg.hip];
        let original_knee = initial[leg.knee];
        let original_ankle = initial[leg.ankle];
        let hip_position = original_hip.position + pelvis_correction;
        let knee_position = original_knee.position + pelvis_correction;
        let ankle_position = original_ankle.position + pelvis_correction;
        let first = (knee_position - hip_position).length();
        let second = (ankle_position - knee_position).length();
        if !first.is_finite() || !second.is_finite() || first <= EPSILON || second <= EPSILON {
            return Err(SolveError::InvalidInput(
                "calibrated leg segment lengths must be positive",
            ));
        }
        let mut supported = false;
        let mut reachable = true;
        let mut clamped = false;
        let mut requested_reach = (ankle_position - hip_position).length();
        let mut solved_reach = requested_reach;
        let mut bend_degrees = 0.0;
        let mut residual = 0.0;
        let mut hip_orientation = original_hip.orientation;
        let mut knee_orientation = original_knee.orientation;
        let mut ankle_orientation = original_ankle.orientation;
        if let Some(contact) = targets[leg_index] {
            supported = true;
            let pole = original_hip
                .orientation
                .rotate(V3::from(leg.hip_bend_pole_local));
            let previous_plane =
                (knee_position - hip_position).cross(ankle_position - knee_position);
            let solved = solve_two_bone(LegSolveInput {
                hip: hip_position,
                knee_reference: knee_position,
                target: contact.ankle,
                pole_direction: pole,
                previous_plane,
                first_length: first,
                second_length: second,
                minimum_bend: to_radians(leg.minimum_bend_degrees),
                maximum_bend: to_radians(leg.maximum_bend_degrees),
            })?;
            let upper_direction = (solved.knee - hip_position).normalized()?;
            let lower_direction = (solved.ankle - solved.knee).normalized()?;
            hip_orientation = align_frame(
                original_hip.orientation,
                V3::from(leg.upper_axis_local),
                V3::from(leg.hip_bend_pole_local).cross(V3::from(leg.upper_axis_local)),
                upper_direction,
                solved.plane,
            )?;
            knee_orientation = align_frame(
                original_knee.orientation,
                V3::from(leg.lower_axis_local),
                V3::from(leg.knee_plane_normal_local),
                lower_direction,
                solved.plane,
            )?;
            ankle_orientation = contact.orientation;
            requested_reach = solved.requested_reach;
            solved_reach = solved.solved_reach;
            bend_degrees = solved.bend_degrees;
            residual = solved.residual;
            clamped = solved.clamped;
            reachable = residual <= 1.0e-8;
        }

        if !supported {
            let corrected_hip = world[leg.hip];
            let corrected_knee = world[leg.knee];
            let corrected_ankle = world[leg.ankle];
            let sole = corrected_ankle.position
                + corrected_ankle
                    .orientation
                    .rotate(V3::from(leg.sole_offset_ankle_local) * corrected_ankle.scale);
            diagnostics.push(LegDiagnostic {
                leg: leg.name.clone(),
                hip: leg.hip,
                knee: leg.knee,
                ankle: leg.ankle,
                supported,
                corrected_hip_position: corrected_hip.position.array(),
                corrected_knee_position: corrected_knee.position.array(),
                corrected_ankle_position: corrected_ankle.position.array(),
                reachable,
                clamped,
                requested_reach,
                solved_reach,
                bend_degrees,
                residual,
                sole_residual: 0.0,
                signed_ground_height: (sole - ground_point).dot(up),
                hip_world_orientation: corrected_hip.orientation.array(),
                knee_world_orientation: corrected_knee.orientation.array(),
                ankle_world_orientation: corrected_ankle.orientation.array(),
            });
            continue;
        }

        let parent_q = |index: usize, current: &[WorldJoint]| -> Q {
            input.parents[index].map_or(Q(0.0, 0.0, 0.0, 1.0), |parent| current[parent].orientation)
        };
        let hip_local = (parent_q(leg.hip, world).inverse() * hip_orientation).normalized()?;
        pose[leg.hip].rotation = hip_local.array();
        *world = hierarchy_for(&input.parents, pose)?;
        let knee_local = (parent_q(leg.knee, world).inverse() * knee_orientation).normalized()?;
        pose[leg.knee].rotation = knee_local.array();
        *world = hierarchy_for(&input.parents, pose)?;
        let ankle_local =
            (parent_q(leg.ankle, world).inverse() * ankle_orientation).normalized()?;
        pose[leg.ankle].rotation = ankle_local.array();
        *world = hierarchy_for(&input.parents, pose)?;

        let corrected_hip = world[leg.hip];
        let corrected_knee = world[leg.knee];
        let corrected_ankle = world[leg.ankle];
        let sole = corrected_ankle.position
            + corrected_ankle
                .orientation
                .rotate(V3::from(leg.sole_offset_ankle_local) * corrected_ankle.scale);
        let desired_sole = targets[leg_index].expect("supported target").sole;
        let sole_residual = (desired_sole - sole).length();
        let signed_ground_height = (sole - ground_point).dot(up);
        let values = [
            requested_reach,
            solved_reach,
            bend_degrees,
            residual,
            sole_residual,
            signed_ground_height,
        ];
        if values.iter().any(|value| !value.is_finite()) || !sole.finite() {
            return Err(SolveError::NumericalFailure);
        }
        diagnostics.push(LegDiagnostic {
            leg: leg.name.clone(),
            hip: leg.hip,
            knee: leg.knee,
            ankle: leg.ankle,
            supported,
            corrected_hip_position: corrected_hip.position.array(),
            corrected_knee_position: corrected_knee.position.array(),
            corrected_ankle_position: corrected_ankle.position.array(),
            reachable,
            clamped,
            requested_reach,
            solved_reach,
            bend_degrees,
            residual,
            sole_residual,
            signed_ground_height,
            hip_world_orientation: corrected_hip.orientation.array(),
            knee_world_orientation: corrected_knee.orientation.array(),
            ankle_world_orientation: corrected_ankle.orientation.array(),
        });
    }
    Ok(())
}

fn finish(
    input: &PoseContactInput,
    corrected_pose: Vec<JointTrs>,
    pelvis_translation: V3,
    legs: Vec<LegDiagnostic>,
) -> Result<PoseContactOutput, SolveError> {
    let diagnostics_are_finite = legs.iter().all(|leg| {
        leg.corrected_hip_position
            .iter()
            .chain(leg.corrected_knee_position.iter())
            .chain(leg.corrected_ankle_position.iter())
            .chain(leg.hip_world_orientation.iter())
            .chain(leg.knee_world_orientation.iter())
            .chain(leg.ankle_world_orientation.iter())
            .all(|value| value.is_finite())
            && [
                leg.requested_reach,
                leg.solved_reach,
                leg.bend_degrees,
                leg.residual,
                leg.sole_residual,
                leg.signed_ground_height,
            ]
            .iter()
            .all(|value| value.is_finite())
    });
    if pelvis_translation
        .array()
        .iter()
        .any(|value| !value.is_finite())
        || !diagnostics_are_finite
        || corrected_pose.iter().any(|joint| {
            joint
                .translation
                .iter()
                .chain(joint.rotation.iter())
                .chain(joint.scale.iter())
                .any(|v| !v.is_finite())
        })
    {
        return Err(SolveError::NumericalFailure);
    }
    let length = pelvis_translation.length();
    if length > input.maximum_pelvis_correction + 1.0e-8 {
        return Err(SolveError::NumericalFailure);
    }
    Ok(PoseContactOutput {
        api_version: POSE_CONTACT_API_VERSION,
        corrected_pose,
        pelvis_translation: pelvis_translation.array(),
        legs,
        finite: true,
    })
}
