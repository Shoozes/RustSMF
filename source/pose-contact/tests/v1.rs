use rustsmf_pose_contact::{
    solve_pose_v1, FootSupport, JointTrs, LegCalibration, PoseContactInput,
    POSE_CONTACT_API_VERSION,
};

fn joint(translation: [f64; 3], rotation: [f64; 4], scale: f64) -> JointTrs {
    JointTrs {
        translation,
        rotation,
        scale: [scale; 3],
    }
}

fn leg(name: &str, hip: usize, knee: usize, ankle: usize, pole: [f64; 3]) -> LegCalibration {
    LegCalibration {
        name: name.to_string(),
        hip,
        knee,
        ankle,
        upper_axis_local: [0.0, 1.0, 0.0],
        hip_bend_pole_local: pole,
        lower_axis_local: [0.0, 1.0, 0.0],
        knee_plane_normal_local: [1.0, 0.0, 0.0],
        sole_offset_ankle_local: [0.0, 0.0, 0.0],
        minimum_bend_degrees: 2.0,
        maximum_bend_degrees: 165.0,
    }
}

fn support(leg: usize, position: [f64; 3], weight: f64) -> FootSupport {
    FootSupport {
        leg,
        weight,
        desired_sole_position: position,
        desired_ankle_orientation: [1.0, 0.0, 0.0, 0.0],
    }
}

fn biped(scale: f64) -> PoseContactInput {
    let half_turn_x = [1.0, 0.0, 0.0, 0.0];
    PoseContactInput {
        api_version: POSE_CONTACT_API_VERSION,
        parents: vec![None, Some(0), Some(1), Some(2), Some(0), Some(4), Some(5)],
        current_pose: vec![
            joint([0.0, 1.5 * scale, 0.0], [0.0, 0.0, 0.0, 1.0], scale),
            joint([-0.35, 0.0, 0.0], half_turn_x, 1.0),
            joint([0.0, 0.9, 0.0], [0.0, 0.0, 0.0, 1.0], 1.0),
            joint([0.0, 0.9, 0.0], [0.0, 0.0, 0.0, 1.0], 1.0),
            joint([0.35, 0.0, 0.0], half_turn_x, 1.0),
            joint([0.0, 0.9, 0.0], [0.0, 0.0, 0.0, 1.0], 1.0),
            joint([0.0, 0.9, 0.0], [0.0, 0.0, 0.0, 1.0], 1.0),
        ],
        pelvis: 0,
        legs: vec![
            leg("left", 1, 2, 3, [0.0, 0.0, -1.0]),
            leg("right", 4, 5, 6, [0.0, 0.0, -1.0]),
        ],
        supports: Vec::new(),
        ground_point: [0.0, 0.0, 0.0],
        up: [0.0, 1.0, 0.0],
        maximum_pelvis_correction: 0.3 * scale,
    }
}

fn rotate(q: [f64; 4], v: [f64; 3]) -> [f64; 3] {
    let u = [q[0], q[1], q[2]];
    let cross = |a: [f64; 3], b: [f64; 3]| {
        [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ]
    };
    let uv = cross(u, v);
    let uuv = cross(u, uv);
    [
        v[0] + 2.0 * (q[3] * uv[0] + uuv[0]),
        v[1] + 2.0 * (q[3] * uv[1] + uuv[1]),
        v[2] + 2.0 * (q[3] * uv[2] + uuv[2]),
    ]
}

fn world(input: &PoseContactInput) -> Vec<([f64; 3], [f64; 4], f64)> {
    let mut result: Vec<([f64; 3], [f64; 4], f64)> = Vec::new();
    for (index, local) in input.current_pose.iter().enumerate() {
        if let Some(parent) = input.parents[index] {
            let (position, pq, ps) = result[parent];
            let delta = rotate(pq, local.translation.map(|v| v * ps));
            result.push((
                [
                    position[0] + delta[0],
                    position[1] + delta[1],
                    position[2] + delta[2],
                ],
                qmul(pq, local.rotation),
                ps * local.scale[0],
            ));
        } else {
            result.push((local.translation, local.rotation, local.scale[0]));
        }
    }
    result
}

fn qmul(a: [f64; 4], b: [f64; 4]) -> [f64; 4] {
    let [x, y, z, w] = a;
    let [bx, by, bz, bw] = b;
    [
        x * bw + w * bx + y * bz - z * by,
        y * bw + w * by + z * bx - x * bz,
        z * bw + w * bz + x * by - y * bx,
        w * bw - x * bx - y * by - z * bz,
    ]
}

fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

#[test]
fn mirrored_legs_keep_calibrated_bend_sign_and_lengths_at_half_unit_scales() {
    for scale in [0.5, 1.0, 2.0] {
        let mut input = biped(scale);
        input.supports = vec![
            support(0, [-0.35 * scale, 0.0, 0.12 * scale], 1.0),
            support(1, [0.35 * scale, 0.0, 0.12 * scale], 1.0),
        ];
        let output = solve_pose_v1(&input).unwrap();
        assert!(output.finite);
        assert_eq!(output.legs.len(), 2);
        let corrected = PoseContactInput {
            current_pose: output.corrected_pose.clone(),
            ..input.clone()
        };
        let positions = world(&corrected);
        for diagnostic in &output.legs {
            let hip = positions[diagnostic.hip].0;
            let knee = positions[diagnostic.knee].0;
            let ankle = positions[diagnostic.ankle].0;
            assert!((distance(hip, knee) - 0.9 * scale).abs() < 2.0e-8);
            assert!((distance(knee, ankle) - 0.9 * scale).abs() < 2.0e-8);
            assert!(
                knee[2] > hip[2],
                "{} bend plane sign must not flip",
                diagnostic.leg
            );
            assert!(diagnostic.sole_residual < 2.0e-7);
            assert!(diagnostic.signed_ground_height.abs() < 2.0e-7);
            assert!(diagnostic.reachable);
        }
        assert!(output.pelvis_translation.iter().all(|v| v.is_finite()));
    }
}

#[test]
fn airborne_input_returns_the_current_pose_without_hidden_state_or_mutation() {
    let input = biped(1.0);
    let output = solve_pose_v1(&input).unwrap();
    assert_eq!(output, solve_pose_v1(&input).unwrap());
    assert_eq!(output.corrected_pose, input.current_pose);
    assert_eq!(output.pelvis_translation, [0.0; 3]);
    assert!(output
        .legs
        .iter()
        .all(|leg| !leg.supported && leg.sole_residual == 0.0));

    let mut zero_weight = input.clone();
    zero_weight.supports = vec![support(0, [-2.0, 3.0, 4.0], 0.0)];
    let zero_output = solve_pose_v1(&zero_weight).unwrap();
    assert_eq!(zero_output.corrected_pose, zero_weight.current_pose);
    assert_eq!(zero_output.pelvis_translation, [0.0; 3]);
}

#[test]
fn already_satisfied_bent_contact_preserves_joint_frames_and_sole_position() {
    let mut input = biped(1.0);
    let half_bend = 12.0_f64.to_radians() * 0.5;
    input.current_pose[2].rotation = [half_bend.sin(), 0.0, 0.0, half_bend.cos()];
    input.legs[0].sole_offset_ankle_local = [0.04, -0.07, 0.11];
    let current_world = world(&input);
    let ankle = current_world[3];
    let offset = rotate(
        ankle.1,
        input.legs[0]
            .sole_offset_ankle_local
            .map(|value| value * ankle.2),
    );
    input.supports = vec![FootSupport {
        leg: 0,
        weight: 1.0,
        desired_sole_position: [
            ankle.0[0] + offset[0],
            ankle.0[1] + offset[1],
            ankle.0[2] + offset[2],
        ],
        desired_ankle_orientation: ankle.1,
    }];

    let output = solve_pose_v1(&input).unwrap();
    let corrected = PoseContactInput {
        current_pose: output.corrected_pose.clone(),
        ..input.clone()
    };
    let corrected_world = world(&corrected);
    assert!(output
        .pelvis_translation
        .iter()
        .all(|value| value.abs() < 1.0e-8));
    for joint in [1, 2, 3] {
        assert!(distance(current_world[joint].0, corrected_world[joint].0) < 1.0e-8);
        let rotation_dot = current_world[joint]
            .1
            .iter()
            .zip(corrected_world[joint].1.iter())
            .map(|(left, right)| left * right)
            .sum::<f64>()
            .abs();
        assert!(rotation_dot > 1.0 - 1.0e-8, "joint {joint} roll changed");
    }
    assert!(output.legs[0].sole_residual < 2.0e-7);
}

#[test]
fn pole_parallel_to_target_uses_previous_plane_without_flipping_the_knee() {
    let mut input = biped(1.0);
    let half_bend = 10.0_f64.to_radians() * 0.5;
    input.current_pose[2].rotation = [half_bend.sin(), 0.0, 0.0, half_bend.cos()];
    input.maximum_pelvis_correction = 0.0;
    input.supports = vec![support(0, [-0.35, 1.5, 0.5], 1.0)];

    let output = solve_pose_v1(&input).unwrap();
    let leg = &output.legs[0];
    let upper = [
        leg.corrected_knee_position[0] - leg.corrected_hip_position[0],
        leg.corrected_knee_position[1] - leg.corrected_hip_position[1],
        leg.corrected_knee_position[2] - leg.corrected_hip_position[2],
    ];
    let lower = [
        leg.corrected_ankle_position[0] - leg.corrected_knee_position[0],
        leg.corrected_ankle_position[1] - leg.corrected_knee_position[1],
        leg.corrected_ankle_position[2] - leg.corrected_knee_position[2],
    ];
    let plane_x = upper[1] * lower[2] - upper[2] * lower[1];
    assert!(
        plane_x > 0.0,
        "the previous positive bend plane must persist"
    );
    assert!(leg.sole_residual < 2.0e-7);
}

#[test]
fn straight_knees_and_unreachable_targets_are_finite_and_bounded() {
    let mut near = biped(1.0);
    near.current_pose[0].translation[1] = 1.7999;
    near.maximum_pelvis_correction = 0.0;
    near.supports = vec![support(0, [-0.35, 0.0, 0.0], 1.0)];
    let near_output = solve_pose_v1(&near).unwrap();
    assert!(near_output.finite);
    assert!(near_output.legs[0].clamped);
    assert!(near_output.legs[0].bend_degrees >= 1.999 && near_output.legs[0].bend_degrees < 2.1);

    let mut far = biped(1.0);
    far.supports = vec![support(0, [-0.35, 10.0, 3.0], 1.0)];
    let far_output = solve_pose_v1(&far).unwrap();
    let diagnostic = &far_output.legs[0];
    assert!(diagnostic.clamped);
    assert!(!diagnostic.reachable);
    assert!(diagnostic.residual > 5.0);
    assert!(
        far_output
            .pelvis_translation
            .iter()
            .map(|v| v * v)
            .sum::<f64>()
            .sqrt()
            <= 0.30000001
    );
    assert!(far_output
        .corrected_pose
        .iter()
        .flat_map(|j| j
            .translation
            .iter()
            .chain(j.rotation.iter())
            .chain(j.scale.iter()))
        .all(|v| v.is_finite()));
}

#[test]
fn calibrated_non_axis_axes_and_rest_roll_drive_the_returned_segment_orientations() {
    let mut input = biped(1.0);
    let hip_local_q = [0.0, 0.0, 0.3826834323650898, 0.9238795325112867];
    let knee_local_q = [0.0, 0.25881904510252074, 0.0, 0.9659258262890683];
    input.current_pose[1].rotation = qmul([1.0, 0.0, 0.0, 0.0], hip_local_q);
    input.current_pose[1].translation = [-0.35, 0.0, 0.0];
    input.current_pose[2].rotation = knee_local_q;
    let upper = [0.0, 1.0, 0.0];
    let lower = [0.0, 1.0, 0.0];
    input.current_pose[2].translation = upper.map(|v| v * 0.9);
    input.current_pose[3].translation = lower.map(|v| v * 0.9);
    input.legs[0].upper_axis_local = upper;
    input.legs[0].hip_bend_pole_local = [0.0, 0.0, -1.0];
    input.legs[0].lower_axis_local = lower;
    input.legs[0].knee_plane_normal_local = [1.0, 0.0, 0.0];
    input.supports = vec![support(0, [-0.35, 0.0, 0.15], 1.0)];
    let output = solve_pose_v1(&input).unwrap();
    let hierarchy = PoseContactInput {
        current_pose: output.corrected_pose.clone(),
        ..input.clone()
    };
    let resolved = world(&hierarchy);
    let diagnostic = &output.legs[0];
    let actual_upper = [
        resolved[2].0[0] - resolved[1].0[0],
        resolved[2].0[1] - resolved[1].0[1],
        resolved[2].0[2] - resolved[1].0[2],
    ];
    let actual_lower = [
        resolved[3].0[0] - resolved[2].0[0],
        resolved[3].0[1] - resolved[2].0[1],
        resolved[3].0[2] - resolved[2].0[2],
    ];
    let expected_upper = rotate(diagnostic.hip_world_orientation, upper);
    let expected_lower = rotate(diagnostic.knee_world_orientation, lower);
    let cosine = |a: [f64; 3], b: [f64; 3]| {
        let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        dot / (distance(a, [0.0; 3]) * distance(b, [0.0; 3]))
    };
    assert!(cosine(actual_upper, expected_upper) > 1.0 - 1.0e-8);
    assert!(cosine(actual_lower, expected_lower) > 1.0 - 1.0e-8);
    assert!(
        actual_upper[2] > 0.0,
        "rest-roll solve must retain the calibrated bend side"
    );
}

#[test]
fn an_interrupted_current_pose_is_a_complete_next_tick_input() {
    let mut first = biped(1.0);
    first.supports = vec![support(0, [-0.35, 0.0, 0.0], 0.5)];
    let first_output = solve_pose_v1(&first).unwrap();
    let mut interrupted = PoseContactInput {
        current_pose: first_output.corrected_pose,
        ..first
    };
    interrupted.supports = vec![support(0, [-0.35, 0.0, 0.2], 0.75)];
    let next = solve_pose_v1(&interrupted).unwrap();
    assert!(next.finite && next.legs[0].supported);
    assert!(next.legs[0]
        .hip_world_orientation
        .iter()
        .all(|v| v.is_finite()));
}

#[test]
fn zero_weight_does_not_reorient_or_solve_that_leg() {
    let mut input = biped(1.0);
    input.supports = vec![
        support(0, [-0.35, 0.0, 0.15], 0.0),
        support(1, [0.35, 0.0, 0.15], 1.0),
    ];
    let output = solve_pose_v1(&input).unwrap();
    assert!(!output.legs[0].supported);
    assert_eq!(output.corrected_pose[1], input.current_pose[1]);
    assert_eq!(output.corrected_pose[2], input.current_pose[2]);
    assert_eq!(output.corrected_pose[3], input.current_pose[3]);
}

#[test]
fn fractional_contact_weights_include_sole_offset_and_orientation() {
    for weight in [0.25, 0.5, 0.75] {
        let mut input = biped(1.0);
        input.legs[0].sole_offset_ankle_local = [0.0, -0.08, 0.12];
        input.supports = vec![FootSupport {
            leg: 0,
            weight,
            desired_sole_position: [-0.35, -0.2, 0.3],
            desired_ankle_orientation: [0.25881904510252074, 0.0, 0.0, 0.9659258262890683],
        }];
        let output = solve_pose_v1(&input).unwrap();
        assert!(output.legs[0].supported);
        assert!(
            output.legs[0].sole_residual < 2.0e-7,
            "weight {weight}, residual {}",
            output.legs[0].sole_residual
        );
    }
}

#[test]
fn shared_pelvis_correction_obeys_the_bound_and_invalid_inputs_fail_explicitly() {
    let mut input = biped(1.0);
    input.legs[0].minimum_bend_degrees = 60.0;
    input.legs[1].minimum_bend_degrees = 60.0;
    input.maximum_pelvis_correction = 0.2;
    input.supports = vec![
        support(0, [-0.35, -0.15, 0.0], 1.0),
        support(1, [0.35, -0.15, 0.0], 1.0),
    ];
    let output = solve_pose_v1(&input).unwrap();
    let correction_length = output
        .pelvis_translation
        .iter()
        .map(|v| v * v)
        .sum::<f64>()
        .sqrt();
    assert!(correction_length <= 0.20000001);
    assert!(correction_length > 0.0);

    input.current_pose[0].translation[0] = f64::NAN;
    assert!(solve_pose_v1(&input).is_err());
    let mut wrong_version = biped(1.0);
    wrong_version.api_version += 1;
    assert!(solve_pose_v1(&wrong_version).is_err());
    let mut nested_legs = biped(1.0);
    nested_legs.parents[4] = Some(3);
    assert!(solve_pose_v1(&nested_legs).is_err());
}
