use super::*;

fn animal_node(name: &str, parent: Option<usize>, p: [f64; 3]) -> SkeletonNodeSnapshotV1 {
    SkeletonNodeSnapshotV1 {
        name: name.into(),
        parent,
        is_bone: true,
        position: p,
        world_position: p,
        quaternion: [0., 0., 0., 1.],
        world_quaternion: [0., 0., 0., 1.],
        scale: [1.; 3],
    }
}

fn animal_rig(chains: &[&[&str]]) -> SkeletonSnapshotV1 {
    let mut nodes = vec![
        animal_node("Hips", None, [0., 1., 0.]),
        animal_node("Head", Some(0), [0., 2., 1.]),
    ];
    for (c, names) in chains.iter().enumerate() {
        let mut parent = 0;
        for (j, name) in names.iter().enumerate() {
            let i = nodes.len();
            nodes.push(animal_node(
                name,
                Some(parent),
                [c as f64 + 1., 1. - j as f64 * 0.2, 0.],
            ));
            parent = i;
        }
    }
    SkeletonSnapshotV1 {
        bones: (0..nodes.len()).collect(),
        nodes,
    }
}

fn animal_input(source: &[&[&str]], target: &[&[&str]]) -> AnalysisInputV1 {
    AnalysisInputV1 {
        api_version: 1,
        source: animal_rig(source),
        target: animal_rig(target),
        manual_map: BTreeMap::new(),
        source_convention: ConventionV1::Auto,
        target_convention: ConventionV1::Auto,
        allow_fuzzy: true,
        clips: vec![],
    }
}

fn body_map() -> BTreeMap<String, String> {
    [
        ("Hips".into(), "Hips".into()),
        ("Head".into(), "Head".into()),
    ]
    .into()
}

pub type AnimalCase = (
    &'static str,
    AnalysisInputV1,
    BTreeMap<String, String>,
    Option<&'static str>,
);

pub fn animal_cases() -> Vec<AnimalCase> {
    let fore = ["ForeUpper_L", "ForeLower_L", "ForePaw_L"];
    let front = ["DEF-front_upper.L", "DEF-front_lower.L", "DEF-front_paw.L"];
    let tail = ["Tail01", "Tail02", "Tail03"];
    let other_tail = ["DEF-tail.001", "DEF-tail.002", "DEF-tail.003"];
    let wing = ["WingUpper_R", "WingLower_R", "WingTip_R"];
    let other_wing = ["RightWingShoulder", "RightWingElbow", "RightWingTip"];
    let mut cases = Vec::new();
    for (name, s, t) in [
        ("animal_quadruped_fore_aliases", fore, front),
        ("animal_ordered_tail", tail, other_tail),
        ("animal_paired_wing_aliases", wing, other_wing),
    ] {
        let mut expected = body_map();
        expected.extend(s.iter().zip(t).map(|(a, b)| (a.to_string(), b.to_string())));
        cases.push((name, animal_input(&[&s], &[&t]), expected, None));
    }
    let hind = ["HindUpper_R", "HindLower_R", "HindFoot_R", "HindPaw_R"];
    let rear = [
        "RightRearThigh",
        "RightRearShin",
        "RightRearAnkle",
        "RightRearPaw",
    ];
    let mut expected = body_map();
    expected.extend(
        hind.iter()
            .zip(rear)
            .map(|(a, b)| (a.to_string(), b.to_string())),
    );
    cases.push((
        "animal_hind_aliases",
        animal_input(&[&hind], &[&rear]),
        expected,
        None,
    ));
    for (name, s, t) in [
        (
            "animal_wrong_side",
            fore,
            ["ForeUpper_R", "ForeLower_R", "ForePaw_R"],
        ),
        (
            "animal_fore_hind_conflict",
            fore,
            ["HindUpper_L", "HindLower_L", "HindPaw_L"],
        ),
        (
            "animal_side_conflict",
            ["LeftForeUpper_R", "ForeLower_L", "ForePaw_L"],
            front,
        ),
        (
            "animal_segment_role_conflict",
            fore,
            ["FrontUpper_L", "FrontFoot_L", "FrontPaw_L"],
        ),
        ("animal_reversed_tail", tail, ["Tail03", "Tail02", "Tail01"]),
        (
            "animal_numeric_requires_map",
            ["joint0", "joint1", "joint2"],
            front,
        ),
    ] {
        cases.push((
            name,
            animal_input(&[&s], &[&t]),
            body_map(),
            Some(if name == "animal_numeric_requires_map" {
                "RIG_MAP_OPAQUE_REQUIRES_MANUAL"
            } else {
                "RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"
            }),
        ));
    }
    for (name, t) in [
        ("animal_unequal_chain", vec!["Tail01", "Tail02"]),
        ("animal_branched_chain", vec!["Tail01", "Tail02", "Tail03"]),
        (
            "animal_duplicate_segment",
            vec!["Tail01", "Tail02", "Tail02"],
        ),
    ] {
        let mut i = animal_input(&[&tail], &[&t]);
        if name == "animal_branched_chain" {
            i.target.nodes[4].parent = Some(2);
        }
        cases.push((name, i, body_map(), Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED")));
    }
    let mut helper = animal_input(&[&tail], &[&other_tail]);
    let i = helper.source.nodes.len();
    helper
        .source
        .nodes
        .push(animal_node("Tail_Helper", Some(2), [1., 0.9, 0.]));
    helper.source.nodes[3].parent = Some(i);
    helper.source.bones.push(i);
    let mut expected = body_map();
    expected.extend(
        tail.iter()
            .zip(other_tail)
            .map(|(a, b)| (a.to_string(), b.to_string())),
    );
    cases.push((
        "animal_helper_ancestry",
        helper.clone(),
        expected.clone(),
        None,
    ));
    helper.source.nodes[i].is_bone = false;
    helper.source.bones.retain(|&n| n != i);
    cases.push(("animal_nonbone_ancestry", helper, expected, None));
    let mut invalid = animal_input(&[&tail], &[&other_tail]);
    invalid.target.nodes[3].quaternion = [0.; 4];
    cases.push((
        "animal_invalid_rest",
        invalid,
        body_map(),
        Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),
    ));
    let mut explicit = animal_input(&[&fore], &[&front]);
    explicit.manual_map.insert(fore[0].into(), front[2].into());
    let mut expected = body_map();
    expected.insert(fore[0].into(), front[2].into());
    cases.push((
        "animal_authoritative_override",
        explicit,
        expected,
        Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),
    ));
    let mut proportions = animal_input(&[&tail], &[&other_tail]);
    proportions.target.nodes[4].world_position = [1., -4., 0.];
    let mut expected = body_map();
    expected.extend(
        tail.iter()
            .zip(other_tail)
            .map(|(a, b)| (a.to_string(), b.to_string())),
    );
    cases.push((
        "animal_differing_proportions",
        proportions,
        expected,
        Some("RIG_PROPORTION_MISMATCH"),
    ));
    let s = [
        &fore[..],
        &["ForeUpper_R", "ForeLower_R", "ForePaw_R"][..],
        &["HindUpper_L", "HindLower_L", "HindPaw_L"][..],
        &["HindUpper_R", "HindLower_R", "HindPaw_R"][..],
        &tail[..],
        &["WingUpper_L", "WingLower_L", "WingTip_L"][..],
        &wing[..],
    ];
    let t = [
        &front[..],
        &["FrontUpper_R", "FrontLower_R", "FrontPaw_R"][..],
        &["RearUpper_L", "RearLower_L", "RearPaw_L"][..],
        &["RearUpper_R", "RearLower_R", "RearPaw_R"][..],
        &other_tail[..],
        &["LeftWingShoulder", "LeftWingElbow", "LeftWingTip"][..],
        &other_wing[..],
    ];
    let mut expected = body_map();
    for (s, t) in s.iter().zip(t) {
        expected.extend(s.iter().zip(t).map(|(a, b)| (a.to_string(), b.to_string())));
    }
    cases.push((
        "animal_all_paired_chains",
        animal_input(&s, &t),
        expected,
        None,
    ));
    let mut inherited = animal_input(&[&fore], &[&front]);
    inherited.source.nodes[3].name = "Lower_L".into();
    inherited.source.nodes[4].name = "Paw_L".into();
    let mut expected = body_map();
    expected.extend(
        [
            ("ForeUpper_L", front[0]),
            ("Lower_L", front[1]),
            ("Paw_L", front[2]),
        ]
        .map(|(a, b)| (a.into(), b.into())),
    );
    cases.push(("animal_inherited_limb_context", inherited, expected, None));
    cases.push((
        "animal_missing_interior_tail",
        animal_input(&[&tail], &[&["Tail01", "Tail03", "Tail04"]]),
        body_map(),
        Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),
    ));
    let mut cross = animal_input(&[&fore], &[&front]);
    cross.source.nodes[1].name = "HindUpper_L".into();
    cross.source.nodes[2].parent = Some(1);
    let mut expected = BTreeMap::new();
    expected.insert("Hips".into(), "Hips".into());
    cases.push((
        "animal_cross_limb_ancestry",
        cross,
        expected,
        Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),
    ));
    cases.push((
        "animal_ambiguous_segment_name",
        animal_input(
            &[&["ForeUpperLower_L", "ForeLower_L", "ForePaw_L"]],
            &[&front],
        ),
        body_map(),
        Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),
    ));
    cases.push((
        "animal_segment_number_overflow",
        animal_input(
            &[&["Tail99999999999999999999999", "Tail02", "Tail03"]],
            &[&other_tail],
        ),
        body_map(),
        Some("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),
    ));
    cases
}
