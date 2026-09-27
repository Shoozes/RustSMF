use rustsmf_pose_contact::transition_v1::*;
use rustsmf_pose_contact::{
    solve_pose_v1, FootSupport, JointTrs, LegCalibration, PoseContactInput,
};

pub fn fixture() -> TransitionBakeInput {
    let joint = |translation, rotation| JointTrs {
        translation,
        rotation,
        scale: [1.0; 3],
    };
    let support = FootSupport {
        leg: 0,
        weight: 1.0,
        desired_sole_position: [0.0, 0.0, 0.1],
        desired_ankle_orientation: [1.0, 0.0, 0.0, 0.0],
    };
    let mut rig = PoseContactInput {
        api_version: 1,
        parents: vec![None, Some(0), Some(1), Some(2)],
        current_pose: vec![
            joint([0.0, 1.5, 0.0], [0.0, 0.0, 0.0, 1.0]),
            joint([0.0; 3], [1.0, 0.0, 0.0, 0.0]),
            joint([0.0, 0.9, 0.0], [0.0, 0.0, 0.0, 1.0]),
            joint([0.0, 0.9, 0.0], [0.0, 0.0, 0.0, 1.0]),
        ],
        pelvis: 0,
        legs: vec![LegCalibration {
            name: "leg".into(),
            hip: 1,
            knee: 2,
            ankle: 3,
            upper_axis_local: [0.0, 1.0, 0.0],
            hip_bend_pole_local: [0.0, 0.0, -1.0],
            lower_axis_local: [0.0, 1.0, 0.0],
            knee_plane_normal_local: [1.0, 0.0, 0.0],
            sole_offset_ankle_local: [0.0; 3],
            minimum_bend_degrees: 2.0,
            maximum_bend_degrees: 165.0,
        }],
        supports: vec![support.clone()],
        ground_point: [0.0; 3],
        up: [0.0, 1.0, 0.0],
        maximum_pelvis_correction: 0.3,
    };
    rig.current_pose = solve_pose_v1(&rig).unwrap().corrected_pose;
    let from = ConditionedCycle {
        source_identity: "neutral-fixture-a".into(),
        frames: vec![rig.current_pose.clone(); 4],
    };
    let mut to = from.clone();
    to.source_identity = "neutral-fixture-b".into();
    for (i, frame) in to.frames.iter_mut().enumerate() {
        frame[0].translation[0] += i as f64 * 0.03;
    }
    TransitionBakeInput {
        api_version: 1,
        from,
        to,
        from_selection: CycleSelection {
            start_frame: 0.5,
            frame_step: -0.5,
        },
        to_selection: CycleSelection {
            start_frame: 1.5,
            frame_step: 0.5,
        },
        duration_samples: 8,
        sample_rate_hz: 60.0,
        rig,
        profile_identity: "neutral-calibration".into(),
        targets: vec![
            TransitionTarget {
                root_displacement: [0.0; 3],
                supports: vec![support]
            };
            9
        ],
        maximum_sole_residual: 1.0e-6,
        maximum_rotation_correction_degrees: 45.0,
    }
}

/// The same assertions run natively and inside browser WebAssembly.
pub fn probe() -> u32 {
    knee_boundary_probe();
    let input = fixture();
    let output = bake_transition_v1(&input).unwrap();
    assert_eq!(output, bake_transition_v1(&input).unwrap());
    assert_eq!(output.provenance.input.as_ref(), &input);
    assert_eq!(output.frames.len(), 9);
    for diagnostic in &output.diagnostics {
        let leg = &diagnostic.legs[0];
        let distance = |a: [f64; 3], b: [f64; 3]| {
            libm::sqrt(a.iter().zip(b).map(|(a, b)| (a - b) * (a - b)).sum())
        };
        assert!(
            (distance(leg.corrected_hip_position, leg.corrected_knee_position) - 0.9).abs()
                < 1.0e-8
        );
        assert!(
            (distance(leg.corrected_knee_position, leg.corrected_ankle_position) - 0.9).abs()
                < 1.0e-8
        );
        assert!(leg.sole_residual < 1.0e-6);
        assert!(leg.bend_degrees >= 2.0 && leg.bend_degrees <= 165.0);
        assert!(leg.corrected_knee_position[2] > leg.corrected_hip_position[2]);
    }
    9
}

pub fn knee_boundary_probe() -> TransitionBakeOutput {
    let mut input = fixture();
    input.duration_samples = 2;
    input.targets = vec![
        TransitionTarget {
            root_displacement: [0.0; 3],
            supports: vec![]
        };
        3
    ];
    input.rig.legs[0].minimum_bend_degrees = 5.0;
    input.rig.legs[0].maximum_bend_degrees = 145.0;
    let half_bend = 2.5 * core::f64::consts::PI / 180.0;
    for (cycle, sign) in [(&mut input.from, -1.0), (&mut input.to, 1.0)] {
        cycle.frames.truncate(1);
        let bend_plane = sign * 30.0 * core::f64::consts::PI / 180.0;
        let (sx, cx) = (libm::sin(half_bend), libm::cos(half_bend));
        let (sy, cy) = (libm::sin(bend_plane), libm::cos(bend_plane));
        // Equal 5-degree bends with different bend planes: ordinary slerp shortens the bend.
        cycle.frames[0][2].rotation = [cy * sx, 0.0, sy * sx, cx];
    }
    input.from_selection.start_frame = 0.0;
    input.to_selection.start_frame = 0.0;
    let output = bake_transition_v1(&input).unwrap();
    assert_eq!(output.knee_conditioned_legs, vec![vec![], vec![0], vec![]]);
    assert!(!output.diagnostics[1].legs[0].supported);
    assert!((output.diagnostics[1].legs[0].bend_degrees - 5.0).abs() < 1.0e-8);
    assert_eq!(
        output.frames[1][0].translation,
        input.from.frames[0][0].translation
    );
    let mut incoming = input.rig.clone();
    incoming.current_pose = input.from.frames[0].clone();
    incoming.supports.clear();
    let q = incoming.current_pose[2].rotation;
    let length = libm::sqrt(q[0] * q[0] + q[3] * q[3]);
    incoming.current_pose[2].rotation = [q[0] / length, 0.0, 0.0, q[3] / length];
    let expected = solve_pose_v1(&incoming).unwrap().legs[0].ankle_world_orientation;
    let actual = output.diagnostics[1].legs[0].ankle_world_orientation;
    let orientation_dot: f64 = actual.iter().zip(expected).map(|(a, b)| a * b).sum();
    assert!((orientation_dot.abs() - 1.0).abs() < 1.0e-12);
    assert_eq!(output.provenance.input.targets[1].supports, vec![]);
    input.maximum_rotation_correction_degrees = 0.01;
    assert!(matches!(
        bake_transition_v1(&input),
        Err(TransitionBakeError::CorrectionLimit { frame: 1, .. })
    ));
    output
}

pub fn fingerprint() -> u64 {
    let outputs = [
        bake_transition_v1(&fixture()).unwrap(),
        knee_boundary_probe(),
    ];
    let mut hash = 0xcbf29ce484222325u64;
    for output in outputs {
        for frame in output.frames {
            for joint in frame {
                for value in joint
                    .translation
                    .into_iter()
                    .chain(joint.rotation)
                    .chain(joint.scale)
                {
                    for byte in value.to_bits().to_le_bytes() {
                        hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
                    }
                }
            }
        }
    }
    hash
}
