use serde::{Deserialize, Serialize};
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub mod advanced;
#[cfg(all(test, any(not(target_arch = "wasm32"), feature = "advanced-bake")))]
mod advanced_tests;
mod bake_math;
pub mod baker;
#[cfg(test)]
mod baker_tests;
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
mod endpoint;
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
mod natural;
pub mod sampler;
use std::collections::{BTreeMap, HashMap, HashSet};

pub const API_VERSION_V1: u32 = 1;
const MAX_NODES: usize = 10_000;
const MAX_BONES: usize = 512;
const MAX_CLIPS: usize = 256;
const MAX_TRACKS: usize = 100_000;
const MAX_TEXT_BYTES: usize = 8 * 1024 * 1024;
const MAX_POSITION_COMPONENT: f64 = 1.0e12;
const MAX_TRANSFORM_COMPONENT: f64 = 1.0e6;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkeletonNodeSnapshotV1 {
    pub name: String,
    pub parent: Option<usize>,
    pub is_bone: bool,
    pub position: [f64; 3],
    pub quaternion: [f64; 4],
    pub scale: [f64; 3],
    pub world_position: [f64; 3],
    pub world_quaternion: [f64; 4],
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkeletonSnapshotV1 {
    pub nodes: Vec<SkeletonNodeSnapshotV1>,
    pub bones: Vec<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackSnapshotV1 {
    pub name: String,
    pub bone: Option<String>,
    pub property: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipSnapshotV1 {
    pub name: String,
    pub duration: f64,
    pub tracks: Vec<TrackSnapshotV1>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConventionV1 {
    Auto,
    Mixamo,
    Ue4,
    Unity,
    Rigify,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisInputV1 {
    pub api_version: u32,
    pub source: SkeletonSnapshotV1,
    pub target: SkeletonSnapshotV1,
    #[serde(default)]
    pub manual_map: BTreeMap<String, String>,
    pub source_convention: ConventionV1,
    pub target_convention: ConventionV1,
    pub allow_fuzzy: bool,
    #[serde(default)]
    pub clips: Vec<ClipSnapshotV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapDecisionV1 {
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical: Option<String>,
    pub method: String,
    pub confidence: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticV1 {
    pub level: String,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_bone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_bone: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigMapV1 {
    pub ok: bool,
    pub map: BTreeMap<String, String>,
    pub decisions: Vec<MapDecisionV1>,
    pub diagnostics: Vec<DiagnosticV1>,
    pub source_up: Option<[f64; 3]>,
    pub target_up: Option<[f64; 3]>,
    pub up_correction: Option<[f64; 4]>,
    pub source_lateral: Option<[f64; 3]>,
    pub target_lateral: Option<[f64; 3]>,
    pub orientation_correction: Option<[f64; 4]>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SegmentComparisonV1 {
    pub source_parent: String,
    pub source_child: String,
    pub target_parent: String,
    pub target_child: String,
    pub source_length: f64,
    pub target_length: f64,
    pub normalized_target_to_source_ratio: f64,
    pub warning: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigCompatibilityV1 {
    pub source_mapped_span: f64,
    pub target_mapped_span: f64,
    pub target_to_source_unit_scale: f64,
    pub segment_warning_threshold: f64,
    pub segments: Vec<SegmentComparisonV1>,
    pub warning_count: usize,
    pub minimum_normalized_ratio: Option<f64>,
    pub maximum_normalized_ratio: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResultV1 {
    pub api_version: u32,
    pub mapping: RigMapV1,
    pub proportions: Option<RigCompatibilityV1>,
    pub diagnostics: Vec<DiagnosticV1>,
    pub status: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnalysisError {
    InvalidInput,
    Cancelled,
}

fn diagnostic(
    level: &str,
    code: &str,
    message: impl Into<String>,
    source: Option<&str>,
    target: Option<&str>,
) -> DiagnosticV1 {
    DiagnosticV1 {
        level: level.into(),
        code: code.into(),
        message: message.into(),
        source_bone: source.map(str::to_owned),
        target_bone: target.map(str::to_owned),
    }
}
fn finite(values: &[f64]) -> bool {
    values.iter().all(|x| x.is_finite())
}
fn within(values: &[f64], limit: f64) -> bool {
    values.iter().all(|x| x.abs() <= limit)
}
fn cancelled(check: &mut impl FnMut() -> bool) -> Result<(), AnalysisError> {
    if check() {
        Err(AnalysisError::Cancelled)
    } else {
        Ok(())
    }
}

fn validate_skeleton(
    s: &SkeletonSnapshotV1,
    check_cancelled: &mut impl FnMut() -> bool,
) -> Result<(), AnalysisError> {
    if s.nodes.is_empty()
        || s.nodes.len() > MAX_NODES
        || s.bones.is_empty()
        || s.bones.len() > MAX_BONES
    {
        return Err(AnalysisError::InvalidInput);
    }
    let mut seen = HashSet::new();
    for (i, node) in s.nodes.iter().enumerate() {
        cancelled(check_cancelled)?;
        if node.name.len() > 1024
            || node.name.trim().is_empty()
            || !finite(&node.position)
            || !within(&node.position, MAX_POSITION_COMPONENT)
            || !finite(&node.quaternion)
            || !within(&node.quaternion, MAX_TRANSFORM_COMPONENT)
            || !finite(&node.scale)
            || !within(&node.scale, MAX_TRANSFORM_COMPONENT)
            || !finite(&node.world_position)
            || !within(&node.world_position, MAX_POSITION_COMPONENT)
            || !finite(&node.world_quaternion)
            || !within(&node.world_quaternion, MAX_TRANSFORM_COMPONENT)
        {
            return Err(AnalysisError::InvalidInput);
        }
        if node.parent.is_some_and(|p| p >= s.nodes.len() || p == i) {
            return Err(AnalysisError::InvalidInput);
        }
    }
    let mut state = vec![0_u8; s.nodes.len()];
    for start in 0..s.nodes.len() {
        cancelled(check_cancelled)?;
        if state[start] == 2 {
            continue;
        }
        let mut path = Vec::new();
        let mut cursor = Some(start);
        while let Some(index) = cursor {
            cancelled(check_cancelled)?;
            match state[index] {
                1 => return Err(AnalysisError::InvalidInput),
                2 => break,
                _ => {
                    state[index] = 1;
                    path.push(index);
                    cursor = s.nodes[index].parent;
                }
            }
        }
        for index in path {
            state[index] = 2;
        }
    }
    for &i in &s.bones {
        cancelled(check_cancelled)?;
        if i >= s.nodes.len() || !s.nodes[i].is_bone || !seen.insert(i) {
            return Err(AnalysisError::InvalidInput);
        }
    }
    Ok(())
}
fn bone_nodes(s: &SkeletonSnapshotV1) -> Vec<&SkeletonNodeSnapshotV1> {
    s.bones.iter().map(|&i| &s.nodes[i]).collect()
}
fn opaque(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    if !lower.is_empty() && lower.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    if lower
        .strip_prefix("smf_node_")
        .is_some_and(|r| !r.is_empty() && r.chars().all(|c| c.is_ascii_digit()))
    {
        return true;
    }
    ["joint", "bone", "node"].iter().any(|p| {
        lower.strip_prefix(p).is_some_and(|r| {
            !r.is_empty() && r.chars().all(|c| c.is_ascii_digit() || " ._:-".contains(c))
        })
    })
}
fn normalized(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    let lower = lower
        .strip_prefix("mixamorig:")
        .or_else(|| lower.strip_prefix("mixamorig"))
        .unwrap_or(&lower);
    lower
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn is_helper_name(name: &str) -> bool {
    let n = normalized(name);
    [
        "ik", "pole", "ctrl", "control", "twist", "roll", "helper", "socket",
    ]
    .iter()
    .any(|part| n.contains(part))
}
fn side_signals(stripped: &str, raw: &str) -> (bool, bool) {
    let left = stripped.starts_with("left")
        || raw.contains("_l_")
        || raw.ends_with("_l")
        || raw.ends_with(".l")
        || raw.ends_with("-l")
        || [
            "lshoulder",
            "lupperarm",
            "larm",
            "lforearm",
            "lhand",
            "lthigh",
            "lupperleg",
            "lleg",
            "lfoot",
            "ltoe",
        ]
        .iter()
        .any(|prefix| stripped.starts_with(prefix))
        || [
            "shoulderl",
            "upperarml",
            "arml",
            "forearml",
            "handl",
            "thighl",
            "upperlegl",
            "legl",
            "footl",
            "toel",
        ]
        .iter()
        .any(|suffix| stripped.ends_with(suffix));
    let right = stripped.starts_with("right")
        || raw.contains("_r_")
        || raw.ends_with("_r")
        || raw.ends_with(".r")
        || raw.ends_with("-r")
        || [
            "rshoulder",
            "rupperarm",
            "rarm",
            "rforearm",
            "rhand",
            "rthigh",
            "rupperleg",
            "rleg",
            "rfoot",
            "rtoe",
        ]
        .iter()
        .any(|prefix| stripped.starts_with(prefix))
        || [
            "shoulderr",
            "upperarmr",
            "armr",
            "forearmr",
            "handr",
            "thighr",
            "upperlegr",
            "legr",
            "footr",
            "toer",
        ]
        .iter()
        .any(|suffix| stripped.ends_with(suffix));
    (left, right)
}

fn side_ambiguous(name: &str) -> bool {
    if is_helper_name(name) {
        return false;
    }
    let n = normalized(name);
    let stripped = n
        .strip_prefix("def")
        .or_else(|| n.strip_prefix("org"))
        .unwrap_or(&n);
    let raw = name.to_ascii_lowercase();
    let (left, right) = side_signals(stripped, &raw);
    left && right
}

fn role(name: &str, _convention: ConventionV1) -> Option<String> {
    let n = normalized(name);
    // Explicitly ignore non-deform rig controls and twist helpers.
    if is_helper_name(name) {
        return None;
    }
    let stripped = n
        .strip_prefix("def")
        .or_else(|| n.strip_prefix("org"))
        .unwrap_or(&n);
    // Rigify sides commonly survive as `.L`/`.R` only before normalization; use raw text too.
    let raw = name.to_ascii_lowercase();
    let (left, right) = side_signals(stripped, &raw);
    if left && right {
        return None;
    }
    let side_stripped = if left {
        stripped.strip_prefix("left").unwrap_or(stripped)
    } else if right {
        stripped.strip_prefix("right").unwrap_or(stripped)
    } else {
        stripped
    };
    let side_stripped = if raw.contains("_l_")
        || raw.ends_with("_l")
        || raw.contains(".l")
        || raw.contains("-l")
    {
        side_stripped.replace("handl", "hand")
    } else if raw.contains("_r_") || raw.ends_with("_r") || raw.contains(".r") || raw.contains("-r")
    {
        side_stripped.replace("handr", "hand")
    } else {
        side_stripped.to_owned()
    };
    let base = if left || right {
        side_stripped.trim_end_matches(['l', 'r'])
    } else {
        &side_stripped
    };
    let is = |terms: &[&str]| terms.iter().any(|t| base == *t || base.starts_with(t));
    let is_exact = |terms: &[&str]| terms.contains(&base);
    let finger_base = base
        .strip_prefix("hand")
        .unwrap_or(base)
        .strip_prefix('f')
        .unwrap_or_else(|| base.strip_prefix("hand").unwrap_or(base));
    let finger = finger_role(finger_base, left, right);
    let found = if is(&["hips", "hip", "pelvis", "root"]) {
        Some("hips")
    } else if is_exact(&["spine", "spine0"]) {
        Some("spine")
    } else if is_exact(&["spine1", "spine01", "spine02", "spine001"]) || base == "midspine" {
        Some("spine1")
    } else if is_exact(&["spine2", "spine03", "spine002"]) || is(&["chest", "upperchest"]) {
        Some("spine2")
    } else if is(&["neck"]) {
        Some("neck")
    } else if is(&["head"]) {
        Some("head")
    } else if is(&["shoulder", "clavicle"]) {
        if left {
            Some("leftShoulder")
        } else if right {
            Some("rightShoulder")
        } else {
            None
        }
    } else if is(&["upperarm", "arm", "uparm"]) {
        if left {
            Some("leftArm")
        } else if right {
            Some("rightArm")
        } else {
            None
        }
    } else if is(&["lowerarm", "forearm", "elbow"]) {
        if left {
            Some("leftForearm")
        } else if right {
            Some("rightForearm")
        } else {
            None
        }
    } else if is(&["hand", "wrist"]) {
        if left {
            Some("leftHand")
        } else if right {
            Some("rightHand")
        } else {
            None
        }
    } else if is(&["thigh", "upleg", "upperleg"]) {
        if left {
            Some("leftUpLeg")
        } else if right {
            Some("rightUpLeg")
        } else {
            None
        }
    } else if is(&["shin", "calf", "lowerleg", "leg"]) {
        if left {
            Some("leftLeg")
        } else if right {
            Some("rightLeg")
        } else {
            None
        }
    } else if is(&["foot", "ankle"]) {
        if left {
            Some("leftFoot")
        } else if right {
            Some("rightFoot")
        } else {
            None
        }
    } else if is(&["toe", "toes"]) {
        if left {
            Some("leftToe")
        } else if right {
            Some("rightToe")
        } else {
            None
        }
    } else {
        None
    };
    finger.or_else(|| found.map(str::to_owned))
}

fn finger_role(base: &str, left: bool, right: bool) -> Option<String> {
    let side = if left {
        "left"
    } else if right {
        "right"
    } else {
        return None;
    };
    let finger = [
        ("thumb", "thumb"),
        ("index", "index"),
        ("middle", "middle"),
        ("ring", "ring"),
        ("pinky", "little"),
        ("little", "little"),
    ]
    .into_iter()
    .find_map(|(prefix, canonical)| base.strip_prefix(prefix).map(|tail| (canonical, tail)))?;
    let tail = finger.1.strip_prefix('f').unwrap_or(finger.1);
    let digits = tail.trim_start_matches(|c: char| !c.is_ascii_digit());
    let segment = digits
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();
    let segment = if segment.is_empty() {
        0
    } else {
        segment.parse::<u32>().ok()?
    };
    Some(format!("finger:{side}:{}:{segment}", finger.0))
}
fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    let d = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    libm::sqrt(d.iter().map(|x| x * x).sum())
}
fn norm(a: [f64; 3]) -> f64 {
    libm::sqrt(a.iter().map(|x| x * x).sum())
}
fn unit(a: [f64; 3]) -> Option<[f64; 3]> {
    let n = norm(a);
    (n > 1e-12).then(|| [a[0] / n, a[1] / n, a[2] / n])
}
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn quat_between(a: [f64; 3], b: [f64; 3]) -> Option<[f64; 4]> {
    let a = unit(a)?;
    let b = unit(b)?;
    let d = dot(a, b).clamp(-1.0, 1.0);
    if d > 0.999999 {
        return Some([0., 0., 0., 1.]);
    }
    if d < -0.999999 {
        let f = if a[0].abs() < 0.9 {
            [1., 0., 0.]
        } else {
            [0., 0., 1.]
        };
        let axis = unit(cross(a, f))?;
        return Some([axis[0], axis[1], axis[2], 0.]);
    }
    let c = cross(a, b);
    let q = [c[0], c[1], c[2], 1. + d];
    let n = libm::sqrt(q.iter().map(|x| x * x).sum());
    Some([q[0] / n, q[1] / n, q[2] / n, q[3] / n])
}
fn rotate(q: [f64; 4], v: [f64; 3]) -> [f64; 3] {
    let u = [q[0], q[1], q[2]];
    let uv = cross(u, v);
    let uuv = cross(u, uv);
    [
        v[0] + 2. * (q[3] * uv[0] + uuv[0]),
        v[1] + 2. * (q[3] * uv[1] + uuv[1]),
        v[2] + 2. * (q[3] * uv[2] + uuv[2]),
    ]
}
fn qmul(a: [f64; 4], b: [f64; 4]) -> [f64; 4] {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}
fn mapped_axis(
    nodes: &[&SkeletonNodeSnapshotV1],
    map: &BTreeMap<String, String>,
    target: bool,
    lateral: bool,
) -> Option<[f64; 3]> {
    let by_name: HashMap<&str, &&SkeletonNodeSnapshotV1> =
        nodes.iter().map(|n| (n.name.as_str(), n)).collect();
    let find = |r: &str| {
        let name = if target {
            map.values()
                .find(|t| role(t, ConventionV1::Auto).as_deref() == Some(r))?
        } else {
            map.keys()
                .find(|s| role(s, ConventionV1::Auto).as_deref() == Some(r))
                .or_else(|| {
                    map.iter()
                        .find(|(_, t)| role(t, ConventionV1::Auto).as_deref() == Some(r))
                        .map(|(s, _)| s)
                })?
        };
        by_name.get(name.as_str()).copied().copied()
    };
    if !lateral {
        let h = find("hips")?;
        let head = find("head").or_else(|| find("neck"))?;
        let d = [
            head.world_position[0] - h.world_position[0],
            head.world_position[1] - h.world_position[1],
            head.world_position[2] - h.world_position[2],
        ];
        return unit(d);
    }
    let up = mapped_axis(nodes, map, target, false)?;
    let pairs = [
        ("rightHand", "leftHand"),
        ("rightArm", "leftArm"),
        ("rightShoulder", "leftShoulder"),
        ("rightFoot", "leftFoot"),
        ("rightUpLeg", "leftUpLeg"),
    ];
    let mut sum = [0., 0., 0.];
    let mut count = 0;
    for (r, l) in pairs {
        if let (Some(a), Some(b)) = (find(r), find(l)) {
            let mut d = [
                a.world_position[0] - b.world_position[0],
                a.world_position[1] - b.world_position[1],
                a.world_position[2] - b.world_position[2],
            ];
            let proj = dot(d, up);
            for i in 0..3 {
                d[i] -= up[i] * proj;
            }
            if let Some(v) = unit(d) {
                for i in 0..3 {
                    sum[i] += v[i];
                }
                count += 1;
            }
        }
    }
    (count > 0).then(|| unit(sum)).flatten()
}
fn build_compat(
    source_snapshot: &SkeletonSnapshotV1,
    target_snapshot: &SkeletonSnapshotV1,
    map: &BTreeMap<String, String>,
    decisions: &[MapDecisionV1],
) -> Option<RigCompatibilityV1> {
    let source = bone_nodes(source_snapshot);
    let target = bone_nodes(target_snapshot);
    let sn: HashMap<&str, &&SkeletonNodeSnapshotV1> =
        source.iter().map(|n| (n.name.as_str(), n)).collect();
    let tn: HashMap<&str, &&SkeletonNodeSnapshotV1> =
        target.iter().map(|n| (n.name.as_str(), n)).collect();
    let active: Vec<_> = decisions
        .iter()
        .filter_map(|d| Some((d, *sn.get(d.source.as_str())?, *tn.get(d.target.as_str())?)))
        .collect();
    if active.len() < 2 {
        return None;
    }
    let span = |items: &Vec<(
        &MapDecisionV1,
        &&SkeletonNodeSnapshotV1,
        &&SkeletonNodeSnapshotV1,
    )>,
                which: usize| {
        let mut max: f64 = 0.;
        for i in 0..items.len() {
            for j in i + 1..items.len() {
                max = max.max(distance(
                    if which == 1 {
                        items[i].1.world_position
                    } else {
                        items[i].2.world_position
                    },
                    if which == 1 {
                        items[j].1.world_position
                    } else {
                        items[j].2.world_position
                    },
                ));
            }
        }
        max
    };
    let ss = span(&active, 1);
    let ts = span(&active, 2);
    if ss <= 1e-8 || ts <= 1e-8 {
        return None;
    }
    let scale = ss / ts;
    let mut segments = Vec::new();
    for (d, s, t) in &active {
        let source_parent = nearest_mapped_parent(s, &source_snapshot.nodes, map, true);
        let target_parent = nearest_mapped_parent(t, &target_snapshot.nodes, map, false);
        let (Some((sp_name, sp_node)), Some((tp_name, tp_node))) = (source_parent, target_parent)
        else {
            continue;
        };
        if map.get(sp_name).map(String::as_str) != Some(tp_name) {
            continue;
        }
        let sl = distance(sp_node.world_position, s.world_position);
        let tl = distance(tp_node.world_position, t.world_position);
        if sl <= ss * 1e-4 || tl <= ts * 1e-4 {
            continue;
        }
        let ratio = tl * scale / sl;
        segments.push(SegmentComparisonV1 {
            source_parent: sp_name.into(),
            source_child: d.source.clone(),
            target_parent: tp_name.into(),
            target_child: d.target.clone(),
            source_length: sl,
            target_length: tl,
            normalized_target_to_source_ratio: ratio,
            warning: ratio < 0.65 || ratio > 1.35,
        });
    }
    segments.sort_by(|a, b| a.target_child.cmp(&b.target_child));
    let ratios: Vec<f64> = segments
        .iter()
        .map(|x| x.normalized_target_to_source_ratio)
        .collect();
    Some(RigCompatibilityV1 {
        source_mapped_span: ss,
        target_mapped_span: ts,
        target_to_source_unit_scale: scale,
        segment_warning_threshold: 0.35,
        warning_count: segments.iter().filter(|x| x.warning).count(),
        minimum_normalized_ratio: ratios.iter().copied().reduce(f64::min),
        maximum_normalized_ratio: ratios.iter().copied().reduce(f64::max),
        segments,
    })
}
fn nearest_mapped_parent<'a>(
    node: &'a SkeletonNodeSnapshotV1,
    nodes: &'a [SkeletonNodeSnapshotV1],
    map: &BTreeMap<String, String>,
    source: bool,
) -> Option<(&'a str, &'a SkeletonNodeSnapshotV1)> {
    let mut cursor = node.parent;
    while let Some(i) = cursor {
        let p = nodes.get(i)?;
        let name = if source {
            map.contains_key(&p.name)
        } else {
            map.values().any(|v| v == &p.name)
        };
        if name {
            return Some((p.name.as_str(), p));
        }
        cursor = p.parent;
    }
    None
}

pub fn analyze_v1(
    input: &AnalysisInputV1,
    mut is_cancelled: impl FnMut() -> bool,
) -> Result<AnalysisResultV1, AnalysisError> {
    let text_bytes = input
        .manual_map
        .iter()
        .map(|(source, target)| source.len().saturating_add(target.len()))
        .chain(input.source.nodes.iter().map(|node| node.name.len()))
        .chain(input.target.nodes.iter().map(|node| node.name.len()))
        .chain(input.clips.iter().flat_map(|clip| {
            std::iter::once(clip.name.len()).chain(clip.tracks.iter().flat_map(|track| {
                std::iter::once(track.name.len())
                    .chain(track.bone.iter().map(String::len))
                    .chain(track.property.iter().map(String::len))
            }))
        }))
        .try_fold(0usize, usize::checked_add);
    if input.api_version != API_VERSION_V1
        || input.manual_map.len() > MAX_BONES
        || input.clips.len() > MAX_CLIPS
        || text_bytes.is_none_or(|bytes| bytes > MAX_TEXT_BYTES)
        || input.clips.iter().map(|c| c.tracks.len()).sum::<usize>() > MAX_TRACKS
        || input.clips.iter().any(|c| {
            !c.duration.is_finite()
                || c.duration < 0.
                || c.name.len() > 1024
                || c.tracks.iter().any(|t| t.name.len() > 4096)
                || c.tracks
                    .iter()
                    .any(|t| t.bone.as_ref().is_some_and(|name| name.len() > 1024))
                || c.tracks
                    .iter()
                    .any(|t| t.property.as_ref().is_some_and(|name| name.len() > 128))
        })
    {
        return Err(AnalysisError::InvalidInput);
    }
    validate_skeleton(&input.source, &mut is_cancelled)?;
    validate_skeleton(&input.target, &mut is_cancelled)?;
    cancelled(&mut is_cancelled)?;
    let source = bone_nodes(&input.source);
    let target = bone_nodes(&input.target);
    let mut ds = Vec::new();
    for (side, bones) in [("source", &source), ("target", &target)] {
        let mut counts = HashMap::<&str, usize>::new();
        for bone in bones {
            *counts.entry(&bone.name).or_default() += 1;
            let local_q = norm([bone.quaternion[0], bone.quaternion[1], bone.quaternion[2]])
                .hypot(bone.quaternion[3]);
            let world_q = norm([
                bone.world_quaternion[0],
                bone.world_quaternion[1],
                bone.world_quaternion[2],
            ])
            .hypot(bone.world_quaternion[3]);
            if local_q <= 1e-9
                || world_q <= 1e-9
                || bone.scale.iter().any(|scale| scale.abs() <= 1e-9)
            {
                ds.push(diagnostic(
                    "warning",
                    "RIG_REFERENCE_FRAME_INVALID",
                    format!("{side} bone {} has a degenerate rest transform; reference-frame diagnostics may be incomplete.", bone.name),
                    (side == "source").then_some(bone.name.as_str()),
                    (side == "target").then_some(bone.name.as_str()),
                ));
            }
        }
        for (name, count) in counts {
            if count > 1 {
                ds.push(diagnostic(
                    "error",
                    if side == "source" { "RIG_SOURCE_DUPLICATE_BONE" } else { "RIG_TARGET_DUPLICATE_BONE" },
                    format!("{side} skeleton contains {count} bones named {name}; an unambiguous map cannot be formed."),
                    (side == "source").then_some(name),
                    (side == "target").then_some(name),
                ));
            }
        }
    }
    let mut decisions = Vec::new();
    let mut occupied = HashSet::new();
    let mut mapped = HashSet::new();
    for (s, t) in &input.manual_map {
        cancelled(&mut is_cancelled)?;
        if !source.iter().any(|n| n.name == s.as_str()) {
            ds.push(diagnostic(
                "error",
                "RIG_MAP_MANUAL_SOURCE_MISSING",
                format!("Manual source bone {s} does not exist."),
                Some(s),
                Some(t),
            ));
            continue;
        }
        if !target.iter().any(|n| n.name == t.as_str()) {
            ds.push(diagnostic(
                "error",
                "RIG_MAP_MANUAL_TARGET_MISSING",
                format!("Manual target bone {t} does not exist."),
                Some(s),
                Some(t),
            ));
            continue;
        }
        if !occupied.insert(t.clone()) {
            ds.push(diagnostic(
                "error",
                "RIG_MAP_DUPLICATE_TARGET",
                format!("Target bone {t} would receive more than one source bone."),
                Some(s),
                Some(t),
            ));
            continue;
        }
        decisions.push(MapDecisionV1 {
            source: s.clone(),
            target: t.clone(),
            canonical: role(t, input.target_convention),
            method: "manual".into(),
            confidence: 1.,
        });
        mapped.insert(s.clone());
    }
    for s in &source {
        if side_ambiguous(&s.name) && !mapped.contains(&s.name) {
            ds.push(diagnostic(
                "warning",
                "RIG_MAP_SIDE_AMBIGUOUS",
                format!(
                    "Source bone {} contains conflicting left/right context; choose a mapping explicitly.",
                    s.name
                ),
                Some(&s.name),
                None,
            ));
        }
    }
    let opaque_unmapped: Vec<_> = source
        .iter()
        .filter(|n| opaque(&n.name) && !mapped.contains(&n.name))
        .collect();
    if !opaque_unmapped.is_empty() && input.manual_map.is_empty() {
        ds.push(diagnostic("error","RIG_MAP_OPAQUE_REQUIRES_MANUAL","Opaque/numeric rigs require explicit reviewed mappings; automatic name matching is disabled for them.",None,None));
    } else {
        for n in &opaque_unmapped {
            ds.push(diagnostic("warning","RIG_MAP_OPAQUE_UNMAPPED",format!("Opaque bone {} is not a direct target; helper motion may still contribute through mapped descendants.",n.name),Some(&n.name),None));
        }
    }
    let mut roles: HashMap<String, Vec<&SkeletonNodeSnapshotV1>> = HashMap::new();
    for t in &target {
        if !side_ambiguous(&t.name) {
            if let Some(r) = role(&t.name, input.target_convention) {
                roles.entry(r).or_default().push(t);
            }
        }
    }
    for s in &source {
        cancelled(&mut is_cancelled)?;
        if mapped.contains(&s.name)
            || opaque(&s.name)
            || is_helper_name(&s.name)
            || side_ambiguous(&s.name)
        {
            continue;
        }
        let Some(r) = role(&s.name, input.source_convention) else {
            continue;
        };
        if let Some(candidates) = roles.get(&r) {
            if candidates.len() > 1 {
                ds.push(diagnostic(
                    "warning",
                    "RIG_MAP_ROLE_AMBIGUOUS",
                    format!(
                        "More than one target bone represents {r}; choose a mapping explicitly."
                    ),
                    Some(&s.name),
                    None,
                ));
                continue;
            }
            let t = candidates[0];
            if occupied.contains(&t.name) {
                continue;
            }
            occupied.insert(t.name.clone());
            mapped.insert(s.name.clone());
            decisions.push(MapDecisionV1 {
                source: s.name.clone(),
                target: t.name.clone(),
                canonical: Some(r.clone()),
                method: "canonical".into(),
                confidence: 1.,
            });
        }
    }
    // Exact normalized names resolve only when globally unique and non-opaque.
    for s in &source {
        cancelled(&mut is_cancelled)?;
        if mapped.contains(&s.name)
            || opaque(&s.name)
            || is_helper_name(&s.name)
            || side_ambiguous(&s.name)
        {
            continue;
        }
        let key = normalized(&s.name);
        let candidates: Vec<_> = target
            .iter()
            .filter(|t| {
                !is_helper_name(&t.name)
                    && !side_ambiguous(&t.name)
                    && !occupied.contains(&t.name)
                    && normalized(&t.name) == key
            })
            .collect();
        if candidates.len() == 1 {
            let t = candidates[0];
            occupied.insert(t.name.clone());
            mapped.insert(s.name.clone());
            decisions.push(MapDecisionV1 {
                source: s.name.clone(),
                target: t.name.clone(),
                canonical: None,
                method: "normalized".into(),
                confidence: 0.98,
            });
        } else if candidates.len() > 1 {
            ds.push(diagnostic(
                "warning",
                "RIG_MAP_NORMALIZED_AMBIGUOUS",
                format!("Normalized name {key} matches multiple target bones."),
                Some(&s.name),
                None,
            ));
        }
    }
    if input.allow_fuzzy {
        for s in &source {
            cancelled(&mut is_cancelled)?;
            if mapped.contains(&s.name)
                || opaque(&s.name)
                || is_helper_name(&s.name)
                || side_ambiguous(&s.name)
            {
                continue;
            }
            let key = normalized(&s.name);
            let sr = role(&s.name, input.source_convention);
            let mut candidates: Vec<_> = target
                .iter()
                .filter(|t| {
                    !is_helper_name(&t.name)
                        && !side_ambiguous(&t.name)
                        && !occupied.contains(&t.name)
                })
                .filter_map(|t| {
                    let tr = role(&t.name, input.target_convention);
                    if sr.is_some() && tr.is_some() && sr != tr {
                        return None;
                    }
                    Some((levenshtein(&key, &normalized(&t.name)), *t, tr))
                })
                .collect();
            candidates.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.name.cmp(&b.1.name)));
            if let Some((dist, t, tr)) = candidates.first().cloned() {
                let limit = (key.len() as f64 * 0.25).floor().max(1.) as usize;
                if dist <= limit && (candidates.get(1).is_none_or(|x| x.0 != dist)) {
                    let confidence = (1. - dist as f64 / (key.len().max(1) as f64)).max(0.5);
                    occupied.insert(t.name.clone());
                    mapped.insert(s.name.clone());
                    decisions.push(MapDecisionV1 {
                        source: s.name.clone(),
                        target: t.name.clone(),
                        canonical: sr.or(tr),
                        method: "fuzzy".into(),
                        confidence,
                    });
                    ds.push(diagnostic(
                        "warning",
                        "RIG_MAP_FUZZY_MATCH",
                        format!(
                            "Fuzzy match {} → {} (confidence {:.2}); review before applying.",
                            s.name, t.name, confidence
                        ),
                        Some(&s.name),
                        Some(&t.name),
                    ));
                }
            }
        }
    }
    for s in &source {
        if !mapped.contains(&s.name)
            && !opaque(&s.name)
            && !is_helper_name(&s.name)
            && !side_ambiguous(&s.name)
        {
            ds.push(diagnostic(
                "warning",
                "RIG_MAP_UNMATCHED_SOURCE",
                format!(
                    "Source bone {} is unmatched; its tracks will be discarded.",
                    s.name
                ),
                Some(&s.name),
                None,
            ));
        }
    }
    for t in &target {
        if !occupied.contains(&t.name) && !is_helper_name(&t.name) && !opaque(&t.name) {
            ds.push(diagnostic(
                "info",
                "RIG_MAP_UNMAPPED_TARGET",
                format!("Target bone {} has no mapped source channel and will retain its reference pose.", t.name),
                None,
                Some(&t.name),
            ));
        }
    }
    let mut map = BTreeMap::new();
    for d in &decisions {
        map.insert(d.source.clone(), d.target.clone());
    }
    for clip in &input.clips {
        for track in &clip.tracks {
            let bone = track
                .bone
                .as_deref()
                .or_else(|| track.name.split('.').next());
            if let Some(name) = bone {
                if !map.contains_key(name) && !is_helper_name(name) {
                    ds.push(diagnostic(
                        "warning",
                        "RIG_MAP_UNMAPPED_TRACK",
                        format!(
                            "Animation channel {} has no mapped source bone.",
                            track.name
                        ),
                        Some(name),
                        None,
                    ));
                }
            }
        }
    }
    let su = mapped_axis(&source, &map, false, false);
    let tu = mapped_axis(&target, &map, true, false);
    let sl = mapped_axis(&source, &map, false, true);
    let tl = mapped_axis(&target, &map, true, true);
    let correction = su.zip(tu).and_then(|(a, b)| quat_between(a, b));
    let orientation = correction.map(|up| {
        if let (Some(s), Some(t), Some(tu)) = (sl, tl, tu) {
            let aligned = rotate(up, s);
            let a = [
                aligned[0] - tu[0] * dot(aligned, tu),
                aligned[1] - tu[1] * dot(aligned, tu),
                aligned[2] - tu[2] * dot(aligned, tu),
            ];
            let b = [
                t[0] - tu[0] * dot(t, tu),
                t[1] - tu[1] * dot(t, tu),
                t[2] - tu[2] * dot(t, tu),
            ];
            if let (Some(a), Some(b)) = (unit(a), unit(b)) {
                let angle = libm::atan2(dot(tu, cross(a, b)), dot(a, b).clamp(-1., 1.));
                let q = [
                    tu[0] * libm::sin(angle / 2.),
                    tu[1] * libm::sin(angle / 2.),
                    tu[2] * libm::sin(angle / 2.),
                    libm::cos(angle / 2.),
                ];
                let out = qmul(q, up);
                let n = libm::sqrt(out.iter().map(|x| x * x).sum());
                return [out[0] / n, out[1] / n, out[2] / n, out[3] / n];
            }
        }
        up
    });
    if su.is_none() || tu.is_none() {
        ds.push(diagnostic("warning","RIG_MAP_UP_AXIS_UNRESOLVED","Hip-to-head direction could not be resolved on both rigs; no automatic up-axis correction is safe.",None,None));
    }
    if decisions.is_empty() {
        ds.push(diagnostic(
            "error",
            "RIG_MAP_EMPTY",
            "No compatible bone mappings were resolved.",
            None,
            None,
        ));
    }
    let ok = !ds.iter().any(|d| d.level == "error");
    let proportions = if ok {
        build_compat(&input.source, &input.target, &map, &decisions)
    } else {
        None
    };
    if ok && proportions.is_none() {
        ds.push(diagnostic("warning","RIG_COMPATIBILITY_UNAVAILABLE","At least two distinct mapped bones with a non-zero span are needed for proportion diagnostics.",None,None));
    }
    if let Some(p) = &proportions {
        if p.warning_count > 0 {
            ds.push(diagnostic(
                "warning",
                "RIG_PROPORTION_MISMATCH",
                format!(
                    "{} mapped segments differ beyond the 35% normalized proportion threshold.",
                    p.warning_count
                ),
                None,
                None,
            ));
        }
    }
    cancelled(&mut is_cancelled)?;
    let status = if !ok {
        "blocked"
    } else if ds.iter().any(|d| d.level == "warning")
        || decisions.iter().any(|d| d.method == "fuzzy")
    {
        "needs-review"
    } else {
        "ready"
    }
    .to_string();
    Ok(AnalysisResultV1 {
        api_version: API_VERSION_V1,
        mapping: RigMapV1 {
            ok,
            map,
            decisions,
            diagnostics: ds.clone(),
            source_up: su,
            target_up: tu,
            up_correction: correction,
            source_lateral: sl,
            target_lateral: tl,
            orientation_correction: orientation,
        },
        proportions,
        diagnostics: ds,
        status,
    })
}
fn levenshtein(a: &str, b: &str) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, x) in a.bytes().enumerate() {
        let mut cur = vec![i + 1];
        for (j, y) in b.bytes().enumerate() {
            cur.push(
                (cur[j] + 1)
                    .min(prev[j + 1] + 1)
                    .min(prev[j] + usize::from(x != y)),
            );
        }
        prev = cur;
    }
    prev[b.len()]
}

pub fn analyze_json_v1(input_json: &str) -> String {
    let result = std::panic::catch_unwind(|| {
        serde_json::from_str::<AnalysisInputV1>(input_json)
            .map_err(|_| AnalysisError::InvalidInput)
            .and_then(|input| analyze_v1(&input, || false))
    });
    match result {
        Ok(Ok(value)) => serde_json::to_string(&value)
            .unwrap_or_else(|_| "{\"error\":\"serialization failed\"}".into()),
        Ok(Err(AnalysisError::Cancelled)) => "{\"error\":\"cancelled\"}".into(),
        Ok(Err(AnalysisError::InvalidInput)) => "{\"error\":\"invalid input\"}".into(),
        Err(_) => "{\"error\":\"analysis failed\"}".into(),
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name = analyze_json_v1)]
pub fn wasm_analyze_json_v1(input_json: &str) -> String {
    analyze_json_v1(input_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn node(name: &str, parent: Option<usize>, p: [f64; 3]) -> SkeletonNodeSnapshotV1 {
        SkeletonNodeSnapshotV1 {
            name: name.into(),
            parent,
            is_bone: true,
            position: p,
            quaternion: [0., 0., 0., 1.],
            scale: [1., 1., 1.],
            world_position: p,
            world_quaternion: [0., 0., 0., 1.],
        }
    }
    fn rig(names: &[&str]) -> SkeletonSnapshotV1 {
        let nodes = names
            .iter()
            .enumerate()
            .map(|(i, n)| node(n, i.checked_sub(1), [0., i as f64, 0.]))
            .collect();
        SkeletonSnapshotV1 {
            nodes,
            bones: (0..names.len()).collect(),
        }
    }
    fn input(a: &[&str], b: &[&str]) -> AnalysisInputV1 {
        AnalysisInputV1 {
            api_version: 1,
            source: rig(a),
            target: rig(b),
            manual_map: BTreeMap::new(),
            source_convention: ConventionV1::Auto,
            target_convention: ConventionV1::Auto,
            allow_fuzzy: false,
            clips: vec![],
        }
    }
    #[test]
    fn presets_cover_mixamo_ue_unity_rigify() {
        for (a, b, src, dst) in [
            ("mixamorig:Hips", "pelvis", "leftUpLeg", "LeftUpLeg"),
            ("pelvis", "root", "upperarm_l", "LeftArm"),
            ("Hips", "hips", "LeftArm", "leftArm"),
            ("DEF-spine.001", "spine1", "DEF-upper_arm.L", "leftArm"),
        ] {
            let r = analyze_v1(&input(&[a, src], &[b, dst]), || false).unwrap();
            assert_eq!(r.mapping.map.get(a).unwrap(), b);
            assert_eq!(r.mapping.map.get(src).unwrap(), dst);
        }
        let ue4_rigify = input(&["root", "spine_01"], &["hips", "DEF-spine.001"]);
        let r = analyze_v1(&ue4_rigify, || false).unwrap();
        assert_eq!(r.mapping.map.get("root").map(String::as_str), Some("hips"));
        assert_eq!(
            r.mapping.map.get("spine_01").map(String::as_str),
            Some("DEF-spine.001")
        );
    }
    #[test]
    fn cross_convention_finger_names_keep_side_and_chain_segment() {
        let r = analyze_v1(
            &input(
                &["LeftHandIndex1", "LeftHandIndex2", "RightHandPinky1"],
                &["DEF-f_index.01.L", "DEF-f_index.02.L", "DEF-f_little.01.R"],
            ),
            || false,
        )
        .unwrap();
        assert_eq!(
            r.mapping.map.get("LeftHandIndex1"),
            Some(&"DEF-f_index.01.L".into())
        );
        assert_eq!(
            r.mapping.map.get("LeftHandIndex2"),
            Some(&"DEF-f_index.02.L".into())
        );
        assert_eq!(
            r.mapping.map.get("RightHandPinky1"),
            Some(&"DEF-f_little.01.R".into())
        );
        assert!(r.mapping.decisions.iter().all(|decision| decision
            .canonical
            .as_deref()
            .is_some_and(|role| role.starts_with("finger:"))));
    }
    #[test]
    fn opaque_rigs_need_explicit_map_and_duplicates_are_blocked() {
        let mut i = input(&["joint0", "joint1"], &["joint0", "joint1"]);
        let r = analyze_v1(&i, || false).unwrap();
        assert_eq!(r.status, "blocked");
        i.manual_map.insert("joint0".into(), "joint0".into());
        i.manual_map.insert("joint1".into(), "joint0".into());
        let r = analyze_v1(&i, || false).unwrap();
        assert!(r
            .mapping
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_DUPLICATE_TARGET"));
    }
    #[test]
    fn bare_numeric_and_smf_node_names_require_explicit_maps() {
        for names in [["0", "1"], ["SMF_Node_0", "SMF_Node_1"]] {
            let r = analyze_v1(&input(&names, &names), || false).unwrap();
            assert!(
                r.mapping.map.is_empty(),
                "opaque names must not auto-match: {names:?}"
            );
            assert_eq!(r.status, "blocked");
            assert!(r
                .diagnostics
                .iter()
                .any(|d| d.code == "RIG_MAP_OPAQUE_REQUIRES_MANUAL"));
        }

        let mut explicit = input(&["0", "1"], &["1", "0"]);
        explicit.manual_map.insert("0".into(), "1".into());
        explicit.manual_map.insert("1".into(), "0".into());
        let r = analyze_v1(&explicit, || false).unwrap();
        assert_eq!(r.mapping.map.get("0").map(String::as_str), Some("1"));
        assert_eq!(r.mapping.map.get("1").map(String::as_str), Some("0"));
        assert!(r.mapping.decisions.iter().all(|d| d.method == "manual"));

        let mut explicit_smf = input(&["SMF_Node_0", "SMF_Node_1"], &["SMF_Node_1", "SMF_Node_0"]);
        explicit_smf
            .manual_map
            .insert("SMF_Node_0".into(), "SMF_Node_1".into());
        explicit_smf
            .manual_map
            .insert("SMF_Node_1".into(), "SMF_Node_0".into());
        let r = analyze_v1(&explicit_smf, || false).unwrap();
        assert_eq!(
            r.mapping.map.get("SMF_Node_0").map(String::as_str),
            Some("SMF_Node_1")
        );
        assert_eq!(
            r.mapping.map.get("SMF_Node_1").map(String::as_str),
            Some("SMF_Node_0")
        );
    }
    #[test]
    fn near_numeric_legitimate_names_can_still_match() {
        let names = ["finger2", "spine01", "jointA", "SMF_Node_0_extra"];
        let r = analyze_v1(&input(&names, &names), || false).unwrap();
        for name in names {
            assert_eq!(r.mapping.map.get(name).map(String::as_str), Some(name));
        }
        assert!(!r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_OPAQUE_REQUIRES_MANUAL"));
    }
    #[test]
    fn invalid_manual_maps_and_ambiguity_are_reported() {
        let mut i = input(&["LeftArm"], &["arm_l", "upperarm_l"]);
        let r = analyze_v1(&i, || false).unwrap();
        assert_eq!(r.status, "blocked");
        assert!(r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_ROLE_AMBIGUOUS"));
        i.manual_map.insert("missing".into(), "arm_l".into());
        let r = analyze_v1(&i, || false).unwrap();
        assert!(r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_MANUAL_SOURCE_MISSING"));
    }
    #[test]
    fn conflicting_side_markers_remain_unmapped_until_explicitly_reviewed() {
        let mut i = input(&["LeftArm_R", "hips", "head"], &["arm_l", "hips", "head"]);
        let r = analyze_v1(&i, || false).unwrap();
        assert!(!r.mapping.map.contains_key("LeftArm_R"));
        assert!(r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_SIDE_AMBIGUOUS"));
        i.manual_map.insert("LeftArm_R".into(), "arm_l".into());
        let r = analyze_v1(&i, || false).unwrap();
        assert_eq!(
            r.mapping.map.get("LeftArm_R").map(String::as_str),
            Some("arm_l")
        );
        assert!(!r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_SIDE_AMBIGUOUS"));
    }
    #[test]
    fn controls_and_twist_are_never_auto_mapped() {
        let r = analyze_v1(
            &input(
                &["DEF-upper_arm.L", "upper_arm_twist.L", "hand_ik.L"],
                &["upperarm_l", "upperarm_twist_l", "handik_l"],
            ),
            || false,
        )
        .unwrap();
        assert_eq!(r.mapping.map.len(), 1);
    }
    #[test]
    fn cancellation_and_invalid_snapshots_are_errors() {
        let i = input(&["hips", "head"], &["hips", "head"]);
        assert_eq!(analyze_v1(&i, || true), Err(AnalysisError::Cancelled));
        let mut bad = i;
        bad.source.nodes[0].parent = Some(1);
        assert_eq!(analyze_v1(&bad, || false), Err(AnalysisError::InvalidInput));
    }
    #[test]
    fn extreme_transforms_and_oversized_text_are_rejected_before_diagnostics() {
        let mut bad_transform = input(&["hips", "head"], &["hips", "head"]);
        bad_transform.source.nodes[1].world_position[1] = f64::MAX;
        assert_eq!(
            analyze_v1(&bad_transform, || false),
            Err(AnalysisError::InvalidInput)
        );

        let mut oversized = input(&["hips", "head"], &["hips", "head"]);
        oversized.clips.push(ClipSnapshotV1 {
            name: "large".into(),
            duration: 1.0,
            tracks: vec![TrackSnapshotV1 {
                name: "x".repeat(MAX_TEXT_BYTES + 1),
                bone: None,
                property: None,
            }],
        });
        assert_eq!(
            analyze_v1(&oversized, || false),
            Err(AnalysisError::InvalidInput)
        );
    }
    #[test]
    fn unequal_proportions_are_measured_and_equal_counts_are_not_exact() {
        let mut i = input(
            &["hips", "spine", "head", "leftArm"],
            &["hips", "spine", "head", "leftArm"],
        );
        i.target.nodes[3].world_position = [10., 3., 0.];
        let r = analyze_v1(&i, || false).unwrap();
        let p = r.proportions.unwrap();
        assert!(p.source_mapped_span > 0.);
        assert!(p.target_to_source_unit_scale.is_finite());
        assert!(p.warning_count > 0);
        assert!(r.mapping.decisions.iter().all(|d| d.method != "exact"));
    }
    #[test]
    fn duplicate_bones_and_degenerate_reference_frames_are_reported() {
        let mut i = input(&["hips", "head"], &["hips", "head"]);
        i.source.nodes.push(node("hips", None, [0., 0., 0.]));
        i.source.bones.push(2);
        i.target.nodes[1].quaternion = [0., 0., 0., 0.];
        let r = analyze_v1(&i, || false).unwrap();
        assert_eq!(r.status, "blocked");
        assert!(r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_SOURCE_DUPLICATE_BONE"));
        assert!(r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_REFERENCE_FRAME_INVALID"));
    }
    #[test]
    fn clip_unmapped_tracks_are_diagnosed() {
        let mut i = input(&["hips", "head"], &["hips", "head"]);
        i.clips.push(ClipSnapshotV1 {
            name: "idle".into(),
            duration: 1.,
            tracks: vec![TrackSnapshotV1 {
                name: "unknown.position".into(),
                bone: Some("unknown".into()),
                property: Some("position".into()),
            }],
        });
        let r = analyze_v1(&i, || false).unwrap();
        assert!(r
            .diagnostics
            .iter()
            .any(|d| d.code == "RIG_MAP_UNMAPPED_TRACK"));
    }
}
