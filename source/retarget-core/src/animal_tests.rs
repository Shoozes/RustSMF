use super::*;
#[path = "../examples/support/animal_fixtures.rs"]
mod fixtures;

#[test]
fn animal_chains_match_independent_expected_maps_and_refusals() {
    for (name, input, expected, code) in fixtures::animal_cases() {
        let result = analyze_v1(&input, || false).unwrap();
        assert_eq!(result.mapping.map, expected, "{name}");
        if let Some(code) = code {
            assert!(
                result.diagnostics.iter().any(|d| d.code == code),
                "{name}: {code}"
            );
        }
        if name.contains("fore_aliases") || name.contains("hind_aliases") {
            assert!(
                result.mapping.up_correction.is_none(),
                "quadrupeds cannot use a hip/head up axis"
            );
        }
    }
}

#[test]
fn mutation_controls_detect_wrong_side_fore_hind_and_tail_order() {
    for (_, input, expected, _) in fixtures::animal_cases().into_iter().take(3) {
        let baseline = analyze_v1(&input, || false).unwrap().mapping.map;
        assert_eq!(baseline, expected);
        let mut damaged = input;
        damaged.target.nodes.swap(2, 4);
        // Keep the hierarchy valid while reversing the named anatomical endpoints.
        damaged.target.nodes[2].parent = Some(0);
        damaged.target.nodes[4].parent = Some(3);
        assert_ne!(
            analyze_v1(&damaged, || false).unwrap().mapping.map,
            expected
        );
    }
}
