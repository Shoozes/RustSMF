use rustsmf_retarget_core::{
    analyze_json_v1, analyze_v1, AnalysisInputV1, AnalysisResultV1, ClipSnapshotV1, ConventionV1,
    SkeletonNodeSnapshotV1, SkeletonSnapshotV1, TrackSnapshotV1,
};
use serde::Serialize;
use std::collections::BTreeMap;
#[path = "support/animal_fixtures.rs"]
mod animal_fixtures;

#[derive(Serialize)]
struct Case {
    name: &'static str,
    input: AnalysisInputV1,
    result: AnalysisResultV1,
}

fn node(
    name: &str,
    parent: Option<usize>,
    is_bone: bool,
    position: [f64; 3],
) -> SkeletonNodeSnapshotV1 {
    SkeletonNodeSnapshotV1 {
        name: name.into(),
        parent,
        is_bone,
        position,
        quaternion: [0.0, 0.0, 0.0, 1.0],
        scale: [1.0, 1.0, 1.0],
        world_position: position,
        world_quaternion: [0.0, 0.0, 0.0, 1.0],
    }
}

fn rig(names: &[&str]) -> SkeletonSnapshotV1 {
    let nodes = names
        .iter()
        .enumerate()
        .map(|(i, name)| node(name, i.checked_sub(1), true, [0.0, i as f64, 0.0]))
        .collect();
    SkeletonSnapshotV1 {
        nodes,
        bones: (0..names.len()).collect(),
    }
}

fn input(source: &[&str], target: &[&str]) -> AnalysisInputV1 {
    AnalysisInputV1 {
        api_version: 1,
        source: rig(source),
        target: rig(target),
        manual_map: BTreeMap::new(),
        source_convention: ConventionV1::Auto,
        target_convention: ConventionV1::Auto,
        allow_fuzzy: false,
        clips: Vec::new(),
    }
}

fn case(name: &'static str, input: AnalysisInputV1) -> Case {
    let result = analyze_v1(&input, || false).expect("valid fixture should analyze");
    Case {
        name,
        input,
        result,
    }
}

fn track(name: &str, bone: &str, property: &str) -> TrackSnapshotV1 {
    TrackSnapshotV1 {
        name: format!("{name}.{property}"),
        bone: Some(bone.into()),
        property: Some(property.into()),
    }
}

/// Reusable first-party native/WASM parity fixtures. Inputs and native results
/// are emitted together so both runtimes consume byte-equivalent analysis data.
fn cases() -> Vec<Case> {
    let mut mixamo_unity = input(
        &[
            "mixamorig:Hips",
            "mixamorig:Spine",
            "mixamorig:Head",
            "mixamorig:LeftArm",
        ],
        &["pelvis", "spine0", "head", "arm_l"],
    );
    mixamo_unity.source_convention = ConventionV1::Mixamo;
    mixamo_unity.target_convention = ConventionV1::Unity;
    mixamo_unity.clips.push(ClipSnapshotV1 {
        name: "Walk".into(),
        duration: 1.25,
        tracks: vec![
            track("mixamorig:LeftArm", "mixamorig:LeftArm", "quaternion"),
            track("mixamorig:ArmHelper", "mixamorig:ArmHelper", "quaternion"),
        ],
    });

    let mut ue4_rigify = input(
        &[
            "root",
            "spine_01",
            "head",
            "upperarm_l",
            "lowerarm_l",
            "hand_l",
        ],
        &[
            "hips",
            "DEF-spine.001",
            "DEF-head",
            "DEF-upper_arm.L",
            "DEF-forearm.L",
            "DEF-hand.L",
        ],
    );
    ue4_rigify.source_convention = ConventionV1::Ue4;
    ue4_rigify.target_convention = ConventionV1::Rigify;

    let mut unity_mixamo = input(
        &["Hips", "Spine", "Head", "LeftUpperArm"],
        &[
            "mixamorig:Hips",
            "mixamorig:Spine",
            "mixamorig:Head",
            "mixamorig:LeftArm",
        ],
    );
    unity_mixamo.source_convention = ConventionV1::Unity;
    unity_mixamo.target_convention = ConventionV1::Mixamo;

    let mut fingers = input(
        &["LeftHandIndex1", "LeftHandIndex2", "RightHandPinky1"],
        &["DEF-f_index.01.L", "DEF-f_index.02.L", "DEF-f_little.01.R"],
    );
    fingers.source_convention = ConventionV1::Mixamo;
    fingers.target_convention = ConventionV1::Rigify;

    let side_conflict = input(&["LeftArm_R", "hips", "head"], &["arm_l", "hips", "head"]);
    let ambiguous = input(
        &["hips", "head", "LeftArm"],
        &["hips", "head", "arm_l", "upperarm_l"],
    );

    // A non-bone node between mapped bones verifies compatibility walks the
    // full scene ancestry rather than assuming adjacent entries in bones[].
    let mut helper_ancestry = input(&["hips", "arm_l", "head"], &["hips", "arm_l", "head"]);
    helper_ancestry.source.nodes = vec![
        node("hips", None, true, [0.0, 0.0, 0.0]),
        node("helper_parent", Some(0), false, [0.0, 0.2, 0.0]),
        node("arm_l", Some(1), true, [-1.0, 0.7, 0.0]),
        node("head", Some(2), true, [0.0, 2.0, 0.0]),
    ];
    helper_ancestry.source.bones = vec![0, 2, 3];
    helper_ancestry.target.nodes = vec![
        node("hips", None, true, [0.0, 0.0, 0.0]),
        node("arm_l", Some(0), true, [-1.0, 0.5, 0.0]),
        node("head", Some(1), true, [0.0, 2.0, 0.0]),
    ];
    helper_ancestry.target.bones = vec![0, 1, 2];

    let mut bad_override = input(&["hips", "head"], &["hips", "head"]);
    bad_override
        .manual_map
        .insert("ghost_source".into(), "head".into());
    let mut duplicate_target = input(&["hips", "head", "arm_l"], &["hips", "head"]);
    duplicate_target
        .manual_map
        .insert("hips".into(), "head".into());
    duplicate_target
        .manual_map
        .insert("head".into(), "head".into());
    let opaque = input(&["joint0", "joint1"], &["bone0", "bone1"]);
    let opaque_bare_numeric = input(&["0", "1"], &["0", "1"]);
    let opaque_smf_nodes = input(&["SMF_Node_0", "SMF_Node_1"], &["SMF_Node_0", "SMF_Node_1"]);
    let mut opaque_explicit = input(&["0", "1"], &["1", "0"]);
    opaque_explicit.manual_map.insert("0".into(), "1".into());
    opaque_explicit.manual_map.insert("1".into(), "0".into());
    let near_numeric = input(
        &["finger2", "spine01", "jointA", "SMF_Node_0_extra"],
        &["finger2", "spine01", "jointA", "SMF_Node_0_extra"],
    );

    let mut proportions = input(
        &["hips", "spine", "head", "leftArm"],
        &["hips", "spine", "head", "leftArm"],
    );
    proportions.target.nodes[3].world_position = [10.0, 3.0, 0.0];

    let mut invalid_frame = input(&["hips", "head"], &["hips", "head"]);
    invalid_frame.target.nodes[1].quaternion = [0.0, 0.0, 0.0, 0.0];
    let mut unmapped_track = input(&["hips", "head"], &["hips", "head"]);
    unmapped_track.clips.push(ClipSnapshotV1 {
        name: "Unknown Channel".into(),
        duration: 0.5,
        tracks: vec![track("tail.position", "tail", "position")],
    });

    let mut unnamed = input(&["hips", "head"], &["hips", "head"]);
    for rig in [&mut unnamed.source, &mut unnamed.target] {
        rig.nodes.push(node("", Some(0), false, [0., 0., 0.]));
        rig.nodes[1].parent = Some(2);
    }
    let names: Vec<String> = (0..512).map(|i| format!("deform_{i}")).collect();
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();
    let mut boundary = input(&refs, &refs);
    boundary.manual_map = names
        .iter()
        .map(|name| (name.clone(), name.clone()))
        .collect();
    vec![
        case("unnamed_nonbone_ancestors", unnamed),
        case("bone_limit_512", boundary),
        case("mixamo_to_unity_with_clip_and_helper_track", mixamo_unity),
        case("ue4_to_rigify", ue4_rigify),
        case("unity_to_mixamo", unity_mixamo),
        case("rigify_finger_chains", fingers),
        case("conflicting_side_context", side_conflict),
        case("ambiguous_target_roles", ambiguous),
        case("helper_ancestor_proportions", helper_ancestry),
        case("invalid_manual_override", bad_override),
        case("duplicate_manual_target", duplicate_target),
        case("opaque_numeric_rigs", opaque),
        case("opaque_bare_numeric_same_names", opaque_bare_numeric),
        case("opaque_smf_nodes_same_names", opaque_smf_nodes),
        case("opaque_explicit_numeric_maps", opaque_explicit),
        case("near_numeric_names_legitimate", near_numeric),
        case("proportion_mismatch", proportions),
        case("invalid_reference_frame", invalid_frame),
        case("unmapped_clip_track", unmapped_track),
    ]
}

fn main() {
    let mut all = cases();
    for (name, input, expected, code) in animal_fixtures::animal_cases() {
        let c = case(name, input);
        assert_eq!(c.result.mapping.map, expected, "{name}");
        if let Some(code) = code {
            assert!(
                c.result.diagnostics.iter().any(|d| d.code == code),
                "{name}"
            );
        }
        all.push(c);
    }
    let refusals: Vec<_> = [true, false].into_iter().map(|source| {
        let mut value = input(&["hips"], &["hips"]);
        let names: Vec<String> = (0..513).map(|i| format!("deform_{i}")).collect();
        let refs: Vec<&str> = names.iter().map(String::as_str).collect();
        if source {value.source = rig(&refs);} else {value.target = rig(&refs);}
        let result: serde_json::Value = serde_json::from_str(&analyze_json_v1(&serde_json::to_string(&value).unwrap())).unwrap();
        assert!(result.get("error").is_some(), "513 bones must be refused");
        serde_json::json!({"name": if source {"source_bone_limit_513"} else {"target_bone_limit_513"}, "input": value, "result": result})
    }).collect();
    println!(
        "{}",
        serde_json::to_string(&serde_json::json!({"cases": all, "refusals": refusals}))
            .expect("fixtures serialize")
    );
}
