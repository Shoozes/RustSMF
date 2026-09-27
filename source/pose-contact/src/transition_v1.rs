//! Deterministic sampled transitions over caller-conditioned fixed-rig cycles.
//! Vendoring requires this module and the unchanged sibling `v1` module.

use super::v1::{
    solve_pose_v1, FootSupport, JointTrs, LegDiagnostic, PoseContactInput, PoseContactOutput,
    SolveError,
};

pub const TRANSITION_BAKE_API_VERSION: u16 = 1;
pub const TRANSITION_BAKE_TOOL: &str = "rustsmf-transition-bake-v1";

#[derive(Clone, Debug, PartialEq)]
pub struct ConditionedCycle {
    /// Caller-owned source identity (for example, content hash plus clip ID).
    pub source_identity: String,
    /// Unique cyclic samples; do not repeat the first sample at the end.
    pub frames: Vec<Vec<JointTrs>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CycleSelection {
    /// Fractional frame in [0, cycle.frames.len()). Phase p uses p * frame count.
    pub start_frame: f64,
    /// Signed frames advanced per output sample. Zero holds the selected pose.
    pub frame_step: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TransitionTarget {
    /// Model-space translation added to the single root before support correction.
    pub root_displacement: [f64; 3],
    /// Already resolved by the caller; no contact scheduling is inferred.
    pub supports: Vec<FootSupport>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TransitionBakeInput {
    pub api_version: u16,
    pub from: ConditionedCycle,
    pub to: ConditionedCycle,
    pub from_selection: CycleSelection,
    pub to_selection: CycleSelection,
    /// Output intervals. Result has duration_samples + 1 frames including both ends.
    pub duration_samples: usize,
    pub sample_rate_hz: f64,
    /// Current pose and supports in this template are ignored; all other solver fields apply.
    pub rig: PoseContactInput,
    /// Identity of the calibrated rig/profile supplied in `rig`.
    pub profile_identity: String,
    pub targets: Vec<TransitionTarget>,
    /// Maximum weighted sole residual in model units, after the bounded solve.
    pub maximum_sole_residual: f64,
    /// Maximum angular correction from blended pose, for any local joint, in degrees.
    pub maximum_rotation_correction_degrees: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TransitionProvenance {
    pub tool: &'static str,
    pub api_version: u16,
    pub solver_api_version: u16,
    /// Complete input receipt, including source/profile identities and correction limits.
    pub input: Box<TransitionBakeInput>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TransitionBakeOutput {
    pub frames: Vec<Vec<JointTrs>>,
    pub diagnostics: Vec<PoseContactOutput>,
    /// Per-frame leg indices conditioned after interpolation, without changing support state.
    pub knee_conditioned_legs: Vec<Vec<usize>>,
    pub sample_rate_hz: f64,
    pub provenance: TransitionProvenance,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TransitionBakeError {
    InvalidInput(&'static str),
    SourcePose {
        cycle: &'static str,
        frame: usize,
        error: SolveError,
    },
    Sample {
        frame: usize,
        error: SolveError,
    },
    CorrectionLimit {
        frame: usize,
        reason: &'static str,
    },
}

impl core::fmt::Display for TransitionBakeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "transition bake failed: {self:?}")
    }
}
impl std::error::Error for TransitionBakeError {}

fn dot(a: [f64; 4], b: [f64; 4]) -> f64 {
    a.iter().zip(b).map(|(a, b)| a * b).sum()
}

fn geometric_bend(leg: &LegDiagnostic) -> f64 {
    let upper: [f64; 3] =
        core::array::from_fn(|i| leg.corrected_knee_position[i] - leg.corrected_hip_position[i]);
    let lower: [f64; 3] =
        core::array::from_fn(|i| leg.corrected_ankle_position[i] - leg.corrected_knee_position[i]);
    let product = |a: [f64; 3], b: [f64; 3]| a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
    let cosine = product(upper, lower) / libm::sqrt(product(upper, upper) * product(lower, lower));
    libm::acos(cosine.clamp(-1.0, 1.0)) * 180.0 / core::f64::consts::PI
}

fn outside_bend(bend: f64, minimum: f64, maximum: f64) -> bool {
    !bend.is_finite() || bend + 1.0e-5 < minimum || bend - 1.0e-5 > maximum
}

fn current_sole(rig: &PoseContactInput, leg_index: usize, leg: &LegDiagnostic) -> [f64; 3] {
    let mut scale = 1.0;
    let mut joint = Some(leg.ankle);
    while let Some(index) = joint {
        scale *= rig.current_pose[index].scale[0];
        joint = rig.parents[index];
    }
    let offset = rig.legs[leg_index]
        .sole_offset_ankle_local
        .map(|v| v * scale);
    let [x, y, z, w] = leg.ankle_world_orientation;
    let cross = |a: [f64; 3], b: [f64; 3]| {
        [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ]
    };
    let uv = cross([x, y, z], offset);
    let uuv = cross([x, y, z], uv);
    core::array::from_fn(|i| {
        leg.corrected_ankle_position[i] + offset[i] + 2.0 * (w * uv[i] + uuv[i])
    })
}

fn slerp(a: [f64; 4], mut b: [f64; 4], t: f64) -> [f64; 4] {
    if t == 0.0 {
        return a;
    }
    if t == 1.0 {
        return b;
    }
    let mut cosine = dot(a, b);
    if cosine < 0.0 {
        b = b.map(|v| -v);
        cosine = -cosine;
    }
    let (wa, wb) = if cosine > 0.9995 {
        (1.0 - t, t)
    } else {
        let theta = libm::acos(cosine.clamp(-1.0, 1.0));
        let divisor = libm::sin(theta);
        (
            libm::sin((1.0 - t) * theta) / divisor,
            libm::sin(t * theta) / divisor,
        )
    };
    let q = core::array::from_fn(|i| a[i] * wa + b[i] * wb);
    let length = libm::sqrt(dot(q, q));
    q.map(|v| v / length)
}

fn blend(a: &[JointTrs], b: &[JointTrs], t: f64) -> Vec<JointTrs> {
    a.iter()
        .zip(b)
        .map(|(a, b)| JointTrs {
            translation: core::array::from_fn(|i| {
                a.translation[i] + (b.translation[i] - a.translation[i]) * t
            }),
            rotation: slerp(a.rotation, b.rotation, t),
            scale: a.scale,
        })
        .collect()
}

fn sample(cycle: &ConditionedCycle, selection: &CycleSelection, frame: usize) -> Vec<JointTrs> {
    let position = (selection.start_frame + selection.frame_step * frame as f64)
        .rem_euclid(cycle.frames.len() as f64);
    let left = libm::floor(position) as usize;
    blend(
        &cycle.frames[left],
        &cycle.frames[(left + 1) % cycle.frames.len()],
        position - left as f64,
    )
}

/// No I/O or retained state. Fails closed rather than returning a partially accepted bank.
pub fn bake_transition_v1(
    input: &TransitionBakeInput,
) -> Result<TransitionBakeOutput, TransitionBakeError> {
    use TransitionBakeError as E;
    let n = input.rig.parents.len();
    if input.api_version != TRANSITION_BAKE_API_VERSION {
        return Err(E::InvalidInput("unsupported transition API version"));
    }
    if n == 0
        || n > 256
        || input.duration_samples == 0
        || input.duration_samples > 120
        || input.targets.len() != input.duration_samples + 1
        || !input.sample_rate_hz.is_finite()
        || input.sample_rate_hz <= 0.0
        || !input.maximum_sole_residual.is_finite()
        || input.maximum_sole_residual < 0.0
        || !input.maximum_rotation_correction_degrees.is_finite()
        || !(0.0..=180.0).contains(&input.maximum_rotation_correction_degrees)
        || input.profile_identity.trim().is_empty()
    {
        return Err(E::InvalidInput(
            "invalid dimensions, timing, profile identity or correction limits",
        ));
    }
    let roots: Vec<_> = input
        .rig
        .parents
        .iter()
        .enumerate()
        .filter(|(_, p)| p.is_none())
        .map(|(i, _)| i)
        .collect();
    if roots.len() != 1 {
        return Err(E::InvalidInput("transition rig requires exactly one root"));
    }
    let root = roots[0];
    let source_count = input
        .from
        .frames
        .len()
        .checked_add(input.to.frames.len())
        .ok_or(E::InvalidInput("source count overflow"))?;
    if source_count > 2048 || source_count * n > 131072 {
        return Err(E::InvalidInput("source frame/node budget exceeded"));
    }
    let mut rig = input.rig.clone();
    rig.supports.clear();
    for (name, cycle, selection) in [
        ("from", &input.from, &input.from_selection),
        ("to", &input.to, &input.to_selection),
    ] {
        if cycle.source_identity.trim().is_empty()
            || cycle.frames.is_empty()
            || !selection.start_frame.is_finite()
            || selection.start_frame < 0.0
            || selection.start_frame >= cycle.frames.len() as f64
            || !selection.frame_step.is_finite()
            || !(selection.frame_step * input.duration_samples as f64).is_finite()
        {
            return Err(E::InvalidInput("invalid cycle identity or selection"));
        }
        for (frame, pose) in cycle.frames.iter().enumerate() {
            rig.current_pose = pose.clone();
            let source = solve_pose_v1(&rig).map_err(|error| E::SourcePose {
                cycle: name,
                frame,
                error,
            })?;
            if source.legs.iter().zip(&rig.legs).any(|(leg, calibration)| {
                outside_bend(
                    geometric_bend(leg),
                    calibration.minimum_bend_degrees,
                    calibration.maximum_bend_degrees,
                )
            }) {
                return Err(E::SourcePose {
                    cycle: name,
                    frame,
                    error: SolveError::InvalidInput("source knee outside calibrated bend limits"),
                });
            }
            for (i, joint) in pose.iter().enumerate() {
                let reference = &input.from.frames[0][i];
                if joint.scale != reference.scale
                    || (i != root && i != rig.pelvis && joint.translation != reference.translation)
                {
                    return Err(E::InvalidInput(
                        "conditioned cycles must share fixed local offsets and scales",
                    ));
                }
            }
        }
    }
    let mut frames = Vec::with_capacity(input.targets.len());
    let mut diagnostics = Vec::with_capacity(input.targets.len());
    let mut knee_conditioned_legs = Vec::with_capacity(input.targets.len());
    for (frame, target) in input.targets.iter().enumerate() {
        if !target.root_displacement.iter().all(|v| v.is_finite()) {
            return Err(E::InvalidInput("non-finite root displacement"));
        }
        let t = frame as f64 / input.duration_samples as f64;
        let weight = t * t * (3.0 - 2.0 * t);
        rig.current_pose = blend(
            &sample(&input.from, &input.from_selection, frame),
            &sample(&input.to, &input.to_selection, frame),
            weight,
        );
        for i in 0..3 {
            rig.current_pose[root].translation[i] += target.root_displacement[i];
        }
        rig.supports = target.supports.clone();
        let mut output = solve_pose_v1(&rig).map_err(|error| E::Sample { frame, error })?;
        let conditioned: Vec<usize> = output
            .legs
            .iter()
            .zip(&rig.legs)
            .enumerate()
            .filter(|(_, (leg, calibration))| {
                !leg.supported
                    && outside_bend(
                        geometric_bend(leg),
                        calibration.minimum_bend_degrees,
                        calibration.maximum_bend_degrees,
                    )
            })
            .map(|(index, _)| index)
            .collect();
        if !conditioned.is_empty() {
            // Reuse the solver to project only invalid airborne knees to calibrated bounds.
            // Self-targets preserve incoming ankle orientation; zero pelvis allowance preserves support poses.
            let mut conditioning = rig.clone();
            conditioning.current_pose = output.corrected_pose.clone();
            conditioning.maximum_pelvis_correction = 0.0;
            conditioning.supports = conditioned
                .iter()
                .map(|&index| FootSupport {
                    leg: index,
                    weight: 1.0,
                    desired_sole_position: current_sole(&conditioning, index, &output.legs[index]),
                    desired_ankle_orientation: output.legs[index].ankle_world_orientation,
                })
                .collect();
            let projected =
                solve_pose_v1(&conditioning).map_err(|error| E::Sample { frame, error })?;
            output.corrected_pose = projected.corrected_pose;
            for &index in &conditioned {
                let mut leg = projected.legs[index].clone();
                // Conditioning is not a contact: keep caller-owned airborne diagnostic semantics.
                leg.supported = false;
                leg.sole_residual = 0.0;
                output.legs[index] = leg;
            }
        }
        for (leg, calibration) in output.legs.iter().zip(&rig.legs) {
            if outside_bend(
                geometric_bend(leg),
                calibration.minimum_bend_degrees,
                calibration.maximum_bend_degrees,
            ) {
                return Err(E::CorrectionLimit {
                    frame,
                    reason: "knee bend outside calibrated limits",
                });
            }
        }
        if output
            .legs
            .iter()
            .any(|leg| leg.supported && leg.sole_residual > input.maximum_sole_residual)
        {
            return Err(E::CorrectionLimit {
                frame,
                reason: "sole residual exceeds limit",
            });
        }
        for (before, after) in rig.current_pose.iter().zip(&output.corrected_pose) {
            let angle = 2.0
                * libm::acos(dot(before.rotation, after.rotation).abs().clamp(0.0, 1.0))
                * 180.0
                / core::f64::consts::PI;
            if angle > input.maximum_rotation_correction_degrees + 1.0e-6 {
                return Err(E::CorrectionLimit {
                    frame,
                    reason: "local rotation correction exceeds limit",
                });
            }
        }
        frames.push(output.corrected_pose.clone());
        diagnostics.push(output);
        knee_conditioned_legs.push(conditioned);
    }
    Ok(TransitionBakeOutput {
        frames,
        diagnostics,
        knee_conditioned_legs,
        sample_rate_hz: input.sample_rate_hz,
        provenance: TransitionProvenance {
            tool: TRANSITION_BAKE_TOOL,
            api_version: TRANSITION_BAKE_API_VERSION,
            solver_api_version: input.rig.api_version,
            input: Box::new(input.clone()),
        },
    })
}
