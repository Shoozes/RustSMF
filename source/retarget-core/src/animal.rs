use super::*;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ChainKey(&'static str, &'static str);

#[derive(Clone)]
struct Member {
    index: usize,
    key: ChainKey,
    stage: Option<u8>,
    number: Option<u32>,
}

pub(super) struct Chains {
    groups: BTreeMap<ChainKey, Vec<Member>>,
    pub names: HashSet<String>,
    pub quadruped: bool,
}

fn label(name: &str) -> (String, &'static str, bool) {
    let raw = name.rsplit(':').next().unwrap_or(name).to_ascii_lowercase();
    let n = normalized(&raw);
    let n = n
        .strip_prefix("def")
        .or_else(|| n.strip_prefix("org"))
        .unwrap_or(&n);
    let (left, right) = side_signals(n, &raw);
    let side = if left {
        "left"
    } else if right {
        "right"
    } else {
        "center"
    };
    let n = n
        .strip_prefix("left")
        .or_else(|| n.strip_prefix("right"))
        .unwrap_or(n);
    let suffix = ["_l", ".l", "-l", "_r", ".r", "-r"]
        .iter()
        .any(|s| raw.ends_with(s));
    let n = if suffix { &n[..n.len() - 1] } else { n };
    (n.to_owned(), side, left && right)
}

fn family(n: &str) -> Option<&'static str> {
    if n.starts_with("tail") {
        Some("tail")
    } else if n.starts_with("wing") {
        Some("wing")
    } else if n.starts_with("front") || (n.starts_with("fore") && !n.starts_with("forearm")) {
        Some("fore")
    } else if n.starts_with("hind") || n.starts_with("rear") || n.starts_with("backleg") {
        Some("hind")
    } else {
        None
    }
}

fn stages(n: &str) -> [bool; 4] {
    [
        n.contains("upper") || n.contains("thigh") || n.contains("shoulder"),
        n.contains("lower")
            || n.contains("shin")
            || n.contains("calf")
            || n.contains("elbow")
            || n.contains("forearm"),
        n.contains("foot") || n.contains("ankle"),
        n.contains("paw") || n.contains("tip"),
    ]
}

fn stage(n: &str) -> Option<u8> {
    stages(n)
        .iter()
        .position(|&present| present)
        .map(|i| i as u8)
}

fn member(rig: &SkeletonSnapshotV1, index: usize) -> Option<Member> {
    let node = &rig.nodes[index];
    if opaque(&node.name) || is_helper_name(&node.name) {
        return None;
    }
    let (base, mut side, mut conflict) = label(&node.name);
    conflict |= stages(&base).iter().filter(|&&v| v).count() > 1;
    let own_family = family(&base);
    let mut kind = own_family;
    // Only identifiable segments inherit context, never arbitrary descendants.
    let inheritable = stage(&base).is_some();
    let mut cursor = node.parent;
    while let Some(i) = cursor {
        let parent = &rig.nodes[i];
        let (name, parent_side, bad_side) = label(&parent.name);
        if let Some(parent_kind) = family(&name) {
            conflict |= matches!(kind, Some("fore" | "hind"))
                && matches!(parent_kind, "fore" | "hind")
                && kind != Some(parent_kind);
            if kind.is_none() && inheritable {
                kind = Some(parent_kind);
            }
            if kind == Some(parent_kind) {
                conflict |= bad_side
                    || (side != "center" && parent_side != "center" && side != parent_side);
                if side == "center" {
                    side = parent_side;
                }
            }
            break;
        }
        cursor = parent.parent;
    }
    let kind = kind?;
    // A fore/hind contradiction must never be rescued by normalized/fuzzy names.
    conflict |= (base.contains("front") || base.contains("fore"))
        && (base.contains("hind") || base.contains("rear"));
    if conflict || (kind != "tail" && side == "center") {
        side = "unresolved";
    }
    let digits: String = base.chars().filter(char::is_ascii_digit).collect();
    let number = digits.parse().ok();
    if !digits.is_empty() && number.is_none() {
        side = "unresolved";
    }
    Some(Member {
        index,
        key: ChainKey(kind, side),
        stage: if kind == "tail" { None } else { stage(&base) },
        number,
    })
}

pub(super) fn collect(rig: &SkeletonSnapshotV1) -> Chains {
    let mut out = Chains {
        groups: BTreeMap::new(),
        names: HashSet::new(),
        quadruped: false,
    };
    for &i in &rig.bones {
        if let Some(m) = member(rig, i) {
            out.names.insert(rig.nodes[i].name.clone());
            out.quadruped |= matches!(m.key.0, "fore" | "hind");
            out.groups.entry(m.key.clone()).or_default().push(m);
        }
    }
    out
}

fn ordered<'a>(rig: &SkeletonSnapshotV1, members: &'a [Member]) -> Option<Vec<&'a Member>> {
    let indices: HashSet<_> = members.iter().map(|m| m.index).collect();
    let parent = |m: &Member| {
        let mut cursor = rig.nodes[m.index].parent;
        while let Some(i) = cursor {
            if indices.contains(&i) {
                return Some(i);
            }
            // Only helpers may bridge deform members; unknown bones need review.
            if rig.bones.contains(&i) && !is_helper_name(&rig.nodes[i].name) {
                return None;
            }
            cursor = rig.nodes[i].parent;
        }
        None
    };
    let roots: Vec<_> = members.iter().filter(|m| parent(m).is_none()).collect();
    if roots.len() != 1 || members.len() < 2 {
        return None;
    }
    let mut chain = vec![roots[0]];
    loop {
        let last = chain.last()?.index;
        let children: Vec<_> = members.iter().filter(|m| parent(m) == Some(last)).collect();
        if children.is_empty() {
            break;
        }
        if children.len() != 1 {
            return None;
        }
        chain.push(children[0]);
    }
    if chain.len() != members.len() {
        return None;
    }
    for pair in chain.windows(2) {
        if pair[0]
            .stage
            .zip(pair[1].stage)
            .is_some_and(|(a, b)| a >= b)
            || pair[0]
                .number
                .zip(pair[1].number)
                .is_some_and(|(a, b)| a.checked_add(1) != Some(b))
            || distance(
                rig.nodes[pair[0].index].world_position,
                rig.nodes[pair[1].index].world_position,
            ) <= 1e-9
        {
            return None;
        }
    }
    if chain.iter().any(|m| {
        let n = &rig.nodes[m.index];
        n.scale.iter().any(|v| v.abs() <= 1e-9)
            || n.quaternion.iter().map(|v| v * v).sum::<f64>() <= 1e-18
            || n.world_quaternion.iter().map(|v| v * v).sum::<f64>() <= 1e-18
    }) {
        return None;
    }
    Some(chain)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn suggest(
    input: &AnalysisInputV1,
    source: &Chains,
    target: &Chains,
    decisions: &mut Vec<MapDecisionV1>,
    mapped: &mut HashSet<String>,
    occupied: &mut HashSet<String>,
    ds: &mut Vec<DiagnosticV1>,
    is_cancelled: &mut impl FnMut() -> bool,
) -> Result<(), AnalysisError> {
    for (key, members) in &source.groups {
        cancelled(is_cancelled)?;
        if members
            .iter()
            .all(|m| mapped.contains(&input.source.nodes[m.index].name))
        {
            continue;
        }
        let targets = target.groups.get(key);
        let ordered_source = ordered(&input.source, members);
        let ordered_target = targets.and_then(|m| ordered(&input.target, m));
        let valid = key.1 != "unresolved"
            && ordered_source
                .as_ref()
                .zip(ordered_target.as_ref())
                .is_some_and(|(s, t)| {
                    s.len() == t.len()
                        && s.iter().zip(t).all(|(a, b)| {
                            let sn = &input.source.nodes[a.index].name;
                            let tn = &input.target.nodes[b.index].name;
                            a.stage == b.stage
                                && if mapped.contains(sn) {
                                    decisions.iter().any(|d| &d.source == sn && &d.target == tn)
                                } else {
                                    !occupied.contains(tn)
                                }
                        })
                });
        if !valid {
            ds.push(diagnostic("warning", "RIG_MAP_ANIMAL_CHAIN_UNRESOLVED",
                format!("{} {} chain needs explicit mapping: review side, ancestry, segment roles/counts and rest frames.", key.1, key.0),
                Some(&input.source.nodes[members[0].index].name), None));
            continue;
        }
        for (segment, (s, t)) in ordered_source
            .unwrap()
            .iter()
            .zip(ordered_target.unwrap())
            .enumerate()
        {
            let s = &input.source.nodes[s.index].name;
            let t = &input.target.nodes[t.index].name;
            if mapped.contains(s) || occupied.contains(t) {
                continue;
            }
            decisions.push(MapDecisionV1 {
                source: s.clone(),
                target: t.clone(),
                canonical: Some(format!("animal:{}:{}:{segment}", key.0, key.1)),
                method: "canonical".into(),
                confidence: 0.95,
            });
            mapped.insert(s.clone());
            occupied.insert(t.clone());
        }
        ds.push(diagnostic("warning", "RIG_MAP_ANIMAL_REVIEW", format!("Review {} {} motion, rest frames and proportions before Apply; chain correspondence does not establish deformation quality.",key.1,key.0), None, None));
    }
    Ok(())
}
