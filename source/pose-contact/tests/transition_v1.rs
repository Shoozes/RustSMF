#[path = "support/transition_fixture.rs"]
mod support;
use rustsmf_pose_contact::transition_v1::*;

#[test]
fn deterministic_support_bake_preserves_lengths_bend_and_input_receipt() {
    assert_eq!(support::probe(), 9);
    assert_eq!(support::fingerprint(), 0x61931913f4cced0d);
}

#[test]
fn airborne_endpoints_fractional_phase_reverse_wrap_and_movement_are_explicit() {
    let mut input = support::fixture();
    for target in &mut input.targets {
        target.supports.clear();
        target.root_displacement = [0.2, 0.0, 0.0];
    }
    let output = bake_transition_v1(&input).unwrap();
    assert_eq!(output.frames[0][1..], input.from.frames[0][1..]);
    assert_eq!(output.frames[8][1..], input.to.frames[0][1..]);
    // to position at endpoint: (1.5 + 8 * 0.5) mod 4 = 1.5.
    assert!((output.frames[8][0].translation[0] - 0.245).abs() < 1.0e-12);
    assert!((output.frames[0][0].translation[0] - 0.2).abs() < 1.0e-12);
    input.from.frames[1][0].translation[0] = 0.4;
    let shifted = bake_transition_v1(&input).unwrap();
    assert!((shifted.frames[0][0].translation[0] - 0.4).abs() < 1.0e-12);
}

#[test]
fn invalid_contracts_and_correction_failures_never_return_partial_output() {
    let baseline = support::fixture();
    for case in 0..8 {
        let mut input = baseline.clone();
        match case {
            0 => input.api_version = 2,
            1 => input.to.frames[0][2].translation[1] += 0.1,
            2 => input.targets.pop().map(|_| ()).unwrap(),
            3 => input.from_selection.start_frame = f64::NAN,
            4 => input.to.frames[0][0].rotation = [0.0; 4],
            5 => input.targets[3].supports[0].desired_sole_position = [100.0; 3],
            6 => input.duration_samples = 121,
            _ => input.maximum_rotation_correction_degrees = 0.0,
        }
        assert!(bake_transition_v1(&input).is_err(), "case {case}");
    }
}

#[test]
fn airborne_invalid_knee_is_rejected_and_antipodal_quaternions_are_safe() {
    let mut input = support::fixture();
    for frame in &mut input.to.frames {
        for joint in frame {
            joint.rotation = joint.rotation.map(|v| -v);
        }
    }
    assert!(bake_transition_v1(&input).is_ok());
    for target in &mut input.targets {
        target.supports.clear();
    }
    for cycle in [&mut input.from, &mut input.to] {
        for frame in &mut cycle.frames {
            frame[2].rotation = [0.0, 0.0, 0.0, 1.0];
        }
    }
    assert!(matches!(
        bake_transition_v1(&input),
        Err(TransitionBakeError::SourcePose { frame: 0, .. })
    ));
}

#[test]
fn valid_boundary_poses_condition_the_interpolated_airborne_knee() {
    support::knee_boundary_probe();
}

#[test]
fn two_leg_weighted_supports_share_the_bounded_pelvis() {
    let mut input = support::fixture();
    input.rig.parents.extend([Some(0), Some(4), Some(5)]);
    let mut second = input.rig.legs[0].clone();
    second.name = "other".into();
    second.hip = 4;
    second.knee = 5;
    second.ankle = 6;
    input.rig.legs.push(second);
    for cycle in [&mut input.from, &mut input.to] {
        for frame in &mut cycle.frames {
            let mut chain = frame[1..4].to_vec();
            chain[0].translation[0] += 0.4;
            frame.extend(chain);
        }
    }
    for (frame, target) in input.targets.iter_mut().enumerate() {
        target.supports[0].weight = frame as f64 / 8.0;
        let mut second = target.supports[0].clone();
        second.leg = 1;
        second.desired_sole_position[0] += 0.4;
        target.supports.push(second);
    }
    let output = bake_transition_v1(&input).unwrap();
    for diagnostic in output.diagnostics {
        assert_eq!(diagnostic.legs.len(), 2);
        assert!(diagnostic
            .legs
            .iter()
            .all(|leg| leg.sole_residual <= 1.0e-6));
        let displacement = libm::sqrt(diagnostic.pelvis_translation.iter().map(|v| v * v).sum());
        assert!(displacement <= input.rig.maximum_pelvis_correction + 1.0e-8);
    }
}
