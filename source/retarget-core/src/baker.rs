//! Experimental core baking. Production continues to use the TypeScript worker.
use crate::bake_math::*;
use crate::sampler::{
    self, BakeRequestV1, Checked, ClipJobV1, ClipV1, SampleErrorV1, TrackV1, TransformV1,
};
use crate::{MapDecisionV1, SkeletonSnapshotV1};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

const LIMIT: usize = 16_000_000;
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
use crate::advanced::AdvancedOptions;
#[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
type AdvancedOptions = ();
#[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
struct NaturalFrame {
    rotations: HashMap<usize, Q>,
    foot_corrections: HashMap<usize, Q>,
    descendant_rotations: HashMap<usize, Q>,
    root: V,
    root_authored: bool,
}
fn invalid(path: &str) -> SampleErrorV1 {
    sampler::error(
        "BAKE_INPUT_INVALID",
        path,
        "Invalid core bake input or incompatible options.",
    )
}
fn unsupported(path: &str) -> SampleErrorV1 {
    sampler::error(
        "BAKE_UNSUPPORTED_FEATURE",
        path,
        "Only inventoried core bake features are supported.",
    )
}
fn checkpoint(cancel: &impl Fn() -> bool) -> Checked<()> {
    if cancel() {
        Err(sampler::error(
            "BAKE_CANCELLED",
            "$",
            "Core bake cancelled.",
        ))
    } else {
        Ok(())
    }
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    clip_name: Option<String>,
    apply_up_correction: Option<bool>,
    scale_root_motion: Option<bool>,
    root_motion_scale: Option<f64>,
    extract_root_motion_bone: Option<String>,
    visual_timing: Option<Timing>,
    sample_rate_hz: Option<f64>,
    interpolation: Option<String>,
    next_down_rational_times: Option<bool>,
    align_mapped_bone_directions: Option<bool>,
    direction_alignment_bones: Option<Vec<String>>,
    direction_transfer_mode: Option<String>,
    direction_transfer_bones: Option<Vec<String>>,
    source_reference_pose: Option<String>,
    preserve_target_leaf_rotations: Option<bool>,
    preserve_target_rotations: Option<Vec<String>>,
    scale_transfer: Option<Vec<ScaleTransfer>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Timing {
    duration_frames: usize,
    cycles: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    landmarks: Option<Vec<Landmark>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Landmark {
    output_frame: usize,
    source_phase: f64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ScaleTransfer {
    source_bone: String,
    target_bone: String,
    axes: [String; 3],
    strength: [f64; 3],
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BakedClipV1 {
    pub clip: ClipV1,
    pub report: CoreBakeReportV1,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreBakeReportV1 {
    #[serde(default, flatten)]
    pub advanced: BTreeMap<String, Value>,
    pub source_clip: String,
    pub target_clip: String,
    pub duration: f64,
    pub sample_count: usize,
    pub quaternion_track_count: usize,
    pub position_track_count: usize,
    pub scale_track_count: usize,
    pub discarded_tracks: Vec<String>,
    pub hierarchy_only_tracks: Vec<String>,
    pub mapped_bones: Vec<MapDecisionV1>,
    pub root_motion_scale: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_motion_extraction: Option<RootExtractionV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visual_timing: Option<VisualTimingReportV1>,
    pub up_correction: Q,
    pub orientation_correction: Q,
    pub sample_rate_hz: Option<f64>,
    pub interpolation: String,
    pub next_down_rational_times: bool,
    pub direction_aligned_bones: Vec<String>,
    pub direction_transfer_mode: String,
    pub direction_transfer_bones: Option<Vec<String>>,
    pub source_reference_pose: String,
    pub source_reference_clip: Option<String>,
    pub target_reference_clip: Option<String>,
    pub preserved_target_leaf_rotations: Vec<String>,
    pub preserved_target_rotations: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RootExtractionV1 {
    pub bone: String,
    pub maximum_displacement: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualTimingReportV1 {
    #[serde(flatten)]
    timing: Timing,
    pub source_duration: f64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BakeResponseV1 {
    pub api_version: u32,
    pub stage: String,
    pub capabilities: Vec<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SampleErrorV1>,
    pub clips: Vec<BakedClipV1>,
}
fn parent(s: &SkeletonSnapshotV1, i: usize) -> Option<usize> {
    s.nodes[i].parent.filter(|p| s.nodes[*p].is_bone)
}
fn depth(s: &SkeletonSnapshotV1, mut i: usize) -> usize {
    let mut n = 0;
    while let Some(p) = parent(s, i) {
        n += 1;
        i = p;
    }
    n
}
fn descendant(s: &SkeletonSnapshotV1, mut i: usize, a: usize) -> bool {
    while let Some(p) = parent(s, i) {
        if p == a {
            return true;
        }
        i = p;
    }
    false
}
fn tracked(s: &SkeletonSnapshotV1, mut i: usize, set: &HashSet<usize>) -> bool {
    loop {
        if set.contains(&i) {
            return true;
        }
        match parent(s, i) {
            Some(p) => i = p,
            None => return false,
        }
    }
}
fn rest(s: &SkeletonSnapshotV1) -> Vec<TransformV1> {
    s.nodes
        .iter()
        .map(|n| TransformV1 {
            position: n.position,
            quaternion: n.quaternion,
            scale: n.scale,
        })
        .collect()
}
fn evaluate(
    local: &mut [TransformV1],
    c: &ClipV1,
    s: &SkeletonSnapshotV1,
    time: f64,
    scales: &HashSet<usize>,
    cancel: &impl Fn() -> bool,
) -> Checked<()> {
    for t in &c.tracks {
        checkpoint(cancel)?;
        if !s.bones.contains(&t.node) || t.bone_channel == Some(false) {
            continue;
        }
        let v = sample(t, time);
        match t.property.as_str() {
            "position" => local[t.node].position.copy_from_slice(&v),
            "quaternion" => local[t.node].quaternion = norm(v.try_into().unwrap()),
            "scale"
                if scales.contains(&t.node)
                    && name(t, s) == format!("{}.scale", s.nodes[t.node].name) =>
            {
                local[t.node].scale.copy_from_slice(&v)
            }
            _ => {}
        }
    }
    Ok(())
}
fn name(t: &TrackV1, s: &SkeletonSnapshotV1) -> String {
    t.name
        .clone()
        .unwrap_or_else(|| format!("{}.{}", s.nodes[t.node].name, t.property))
}
fn options(job: &ClipJobV1) -> Checked<Options> {
    option_fields(&job.options, !job.endpoint_target_clips.is_empty())
}
fn option_fields(fields: &BTreeMap<String, Value>, endpoint_clips: bool) -> Checked<Options> {
    let core = [
        "clipName",
        "applyUpCorrection",
        "scaleRootMotion",
        "rootMotionScale",
        "extractRootMotionBone",
        "visualTiming",
        "sampleRateHz",
        "interpolation",
        "nextDownRationalTimes",
        "alignMappedBoneDirections",
        "directionAlignmentBones",
        "directionTransferMode",
        "directionTransferBones",
        "sourceReferencePose",
        "preserveTargetLeafRotations",
        "preserveTargetRotations",
        "scaleTransfer",
    ];
    if fields.keys().any(|k| !core.contains(&k.as_str())) || endpoint_clips {
        return Err(unsupported("options"));
    }
    // Explicit null is not an omitted option at this strict experimental boundary.
    if fields.values().any(Value::is_null) {
        return Err(invalid("options"));
    }
    let options: Options = serde_json::from_value(json!(fields)).map_err(|_| invalid("options"))?;
    if options.clip_name.as_ref().is_some_and(|v| v.len() > 1024)
        || options
            .extract_root_motion_bone
            .as_ref()
            .is_some_and(|v| v.len() > 1024)
        || [
            &options.direction_alignment_bones,
            &options.direction_transfer_bones,
            &options.preserve_target_rotations,
        ]
        .into_iter()
        .flatten()
        .any(|v| v.len() > 2048 || v.iter().any(|s| s.len() > 1024))
        || options.scale_transfer.as_ref().is_some_and(|v| {
            v.len() > 16
                || v.iter()
                    .any(|s| s.source_bone.len() > 1024 || s.target_bone.len() > 1024)
        })
    {
        return Err(invalid("options.limits"));
    }
    Ok(options)
}
fn schedule(c: &ClipV1, s: &SkeletonSnapshotV1, o: &Options) -> Checked<(Vec<f64>, Vec<f64>, f64)> {
    let duration = o
        .visual_timing
        .as_ref()
        .map_or(c.duration, |t| t.duration_frames as f64 / 60.);
    if let Some(t) = &o.visual_timing {
        if t.duration_frames < 1
            || t.duration_frames > 3600
            || t.cycles < 1
            || t.cycles > 8
            || t.duration_frames % t.cycles != 0
            || o.sample_rate_hz != Some(60.)
        {
            return Err(invalid("visualTiming"));
        }
        if let Some(p) = &t.landmarks {
            if t.cycles != 1
                || p.len() < 2
                || p.len() > 16
                || p[0].output_frame != 0
                || p[0].source_phase != 0.
                || p.last().unwrap().output_frame != t.duration_frames
                || p.last().unwrap().source_phase != 1.
                || p.iter().any(|p| {
                    p.output_frame > t.duration_frames
                        || !p.source_phase.is_finite()
                        || !(0. ..=1.).contains(&p.source_phase)
                })
                || p.windows(2).any(|p| {
                    p[1].output_frame <= p[0].output_frame || p[1].source_phase < p[0].source_phase
                })
            {
                return Err(invalid("visualTiming.landmarks"));
            }
        }
    }
    let (mut evaluation, mut output) = (Vec::new(), Vec::new());
    if let Some(rate) = o.sample_rate_hz {
        if !rate.is_finite() || rate <= 0. || rate > 240. {
            return Err(invalid("sampleRateHz"));
        }
        let exact = duration * rate;
        let nearest = exact.round();
        let frames = if (exact - nearest).abs() <= 1e-3 {
            nearest
        } else {
            exact.ceil()
        };
        if frames + 1. > 20000. {
            return Err(sampler::error(
                "BAKE_OUTPUT_LIMIT",
                "sampleRateHz",
                "Bake exceeds 20000 samples.",
            ));
        }
        for frame in 0..=frames as usize {
            let rational = frame as f64 / rate;
            let time = duration.min(rational);
            let mut out = time as f32;
            if o.next_down_rational_times == Some(true) && out as f64 > time && out != 0. {
                out = f32::from_bits(out.to_bits() - 1);
            }
            evaluation.push(duration.min((rational as f32) as f64));
            output.push(out as f64);
        }
    } else {
        if o.next_down_rational_times == Some(true) {
            return Err(invalid("nextDownRationalTimes"));
        }
        let mut times = vec![0., duration];
        for t in &c.tracks {
            if s.bones.contains(&t.node)
                && t.bone_channel != Some(false)
                && (t.property != "scale"
                    || o.scale_transfer.as_ref().is_some_and(|specs| {
                        specs.iter().any(|v| v.source_bone == s.nodes[t.node].name)
                    }))
            {
                times.extend(t.times.iter().map(|v| *v as f64));
            }
        }
        times.sort_by(f64::total_cmp);
        for v in times {
            if v < -1e-6 || v > duration + 1e-6 {
                continue;
            }
            let v = v.max(0.).min(duration);
            if evaluation
                .last()
                .is_none_or(|prev: &f64| (v - *prev).abs() > 1e-6)
            {
                evaluation.push(v);
            }
        }
        if evaluation.len() > 20000 {
            return Err(sampler::error(
                "BAKE_OUTPUT_LIMIT",
                "times",
                "Bake exceeds 20000 samples.",
            ));
        }
        output = evaluation.iter().map(|v| (*v as f32) as f64).collect();
    }
    if let Some(t) = &o.visual_timing {
        for (frame, time) in evaluation.iter_mut().enumerate() {
            let phase = if frame >= t.duration_frames {
                1.
            } else if let Some(points) = &t.landmarks {
                let pair = points
                    .windows(2)
                    .find(|p| frame <= p[1].output_frame)
                    .unwrap();
                let (a, b) = (&pair[0], &pair[1]);
                a.source_phase
                    + (b.source_phase - a.source_phase) * (frame - a.output_frame) as f64
                        / (b.output_frame - a.output_frame) as f64
            } else {
                (frame % (t.duration_frames / t.cycles)) as f64
                    / (t.duration_frames / t.cycles) as f64
            };
            *time = c.duration.min(((phase * c.duration) as f32) as f64);
        }
    }
    Ok((evaluation, output, duration))
}
#[derive(Clone)]
struct Pair {
    source: usize,
    target: usize,
    decision: MapDecisionV1,
}
struct Constraint {
    source: usize,
    descendant: usize,
    target: usize,
    reference: V,
    local: V,
    rest: V,
}
fn bake_job(
    r: &BakeRequestV1,
    job: &ClipJobV1,
    o: &Options,
    pairs: &[Pair],
    cancel: &impl Fn() -> bool,
    budget: &mut usize,
    _advanced: Option<&AdvancedOptions>,
) -> Checked<BakedClipV1> {
    checkpoint(cancel)?;
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let advanced = _advanced;
    let (s, t, c) = (&r.source, &r.target, &job.clip);
    let sr = rest(s);
    let sw = worlds(s, &sr);
    let mut tr = rest(t);
    let mut target_q = HashSet::new();
    let mut target_p = HashSet::new();
    let target_scale: HashSet<usize> = o
        .scale_transfer
        .iter()
        .flatten()
        .filter_map(|x| {
            t.bones
                .iter()
                .find(|i| t.nodes[**i].name == x.target_bone)
                .copied()
        })
        .collect();
    if let Some(reference) = &job.target_reference_clip {
        for ch in &reference.tracks {
            if t.bones.contains(&ch.node) && ch.bone_channel != Some(false) {
                match ch.property.as_str() {
                    "quaternion" => {
                        target_q.insert(ch.node);
                    }
                    "position" => {
                        target_p.insert(ch.node);
                    }
                    _ => {}
                }
            }
        }
        if target_q.is_empty() && target_p.is_empty() {
            return Err(invalid("targetReferenceClip"));
        }
        evaluate(&mut tr, reference, t, 0., &target_scale, cancel)?;
    }
    let tw = worlds(t, &tr);
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let curls = advanced
        .map(|a| crate::advanced::curls(a, r, &tr, &tw))
        .transpose()?
        .unwrap_or_default();
    #[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
    let curls: HashMap<usize, Q> = HashMap::new();
    let q_sources: HashSet<_> = c
        .tracks
        .iter()
        .filter(|ch| {
            s.bones.contains(&ch.node)
                && ch.bone_channel != Some(false)
                && ch.property == "quaternion"
        })
        .map(|ch| ch.node)
        .collect();
    let p_sources: HashSet<_> = c
        .tracks
        .iter()
        .filter(|ch| {
            s.bones.contains(&ch.node)
                && ch.bone_channel != Some(false)
                && ch.property == "position"
        })
        .map(|ch| ch.node)
        .collect();
    if q_sources.is_empty()
        && p_sources.is_empty()
        && o.scale_transfer.as_ref().is_none_or(Vec::is_empty)
    {
        return Err(invalid("clip.tracks"));
    }
    let active: Vec<_> = pairs
        .iter()
        .filter(|p| tracked(s, p.source, &q_sources) || tracked(s, p.source, &p_sources))
        .collect();
    let world_animated: HashSet<_> = active
        .iter()
        .filter(|p| tracked(s, p.source, &q_sources))
        .map(|p| p.source)
        .collect();
    let mut order = t.bones.clone();
    order.sort_by_key(|i| depth(t, *i));
    let intermediate: HashSet<_> = order
        .iter()
        .filter(|i| {
            !active.iter().any(|p| p.target == **i)
                && active.iter().any(|p| descendant(t, p.target, **i))
        })
        .copied()
        .collect();
    let leaves: Vec<_> = if o.preserve_target_leaf_rotations == Some(true) {
        active
            .iter()
            .filter(|p| {
                !active
                    .iter()
                    .any(|c| c.target != p.target && descendant(t, c.target, p.target))
            })
            .map(|p| t.nodes[p.target].name.clone())
            .collect()
    } else {
        vec![]
    };
    let mut preserved = leaves.clone();
    for name in o.preserve_target_rotations.iter().flatten() {
        if !active.iter().any(|p| t.nodes[p.target].name == *name) {
            return Err(invalid("preserveTargetRotations"));
        }
        if !preserved.contains(name) {
            preserved.push(name.clone());
        }
    }
    let details = r.mapping_details.as_ref().unwrap();
    let up = if o.apply_up_correction == Some(false) {
        ID
    } else {
        norm(details.up_correction.unwrap_or(ID))
    };
    let correction = if o.apply_up_correction == Some(false) {
        ID
    } else {
        norm(
            details
                .orientation_correction
                .or(details.up_correction)
                .unwrap_or(ID),
        )
    };
    let height = |w: &[M], source: bool| {
        let ys: Vec<_> = pairs
            .iter()
            .map(|p| w[if source { p.source } else { p.target }][13])
            .collect();
        ys.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - ys.iter().copied().fold(f64::INFINITY, f64::min)
    };
    let sh = height(&sw, true);
    let th = height(&tw, false);
    let automatic =
        if o.scale_root_motion == Some(false) || pairs.len() < 2 || sh <= 1e-8 || th <= 1e-8 {
            1.
        } else {
            th / sh
        };
    if o.root_motion_scale
        .is_some_and(|v| !v.is_finite() || v <= 0. || o.scale_root_motion == Some(false))
    {
        return Err(invalid("rootMotionScale"));
    }
    let root_scale = o.root_motion_scale.unwrap_or(automatic);
    if !root_scale.is_finite() {
        return Err(invalid("rootMotionScale"));
    }
    let root = active.iter().min_by_key(|p| depth(s, p.source)).copied();
    let root_position = root.is_some_and(|p| tracked(s, p.source, &p_sources));
    let extraction = if let Some(name) = &o.extract_root_motion_bone {
        Some(
            s.bones
                .iter()
                .copied()
                .find(|i| {
                    s.nodes[*i].name == *name && root.is_some_and(|p| descendant(s, p.source, *i))
                })
                .ok_or_else(|| invalid("extractRootMotionBone"))?,
        )
    } else {
        None
    };
    let mut constraints = Vec::new();
    if o.align_mapped_bone_directions != Some(false) {
        for p in &active {
            let descendants: Vec<_> = active
                .iter()
                .filter(|c| descendant(s, c.source, p.source) && descendant(t, c.target, p.target))
                .collect();
            let nearest = descendants
                .iter()
                .map(|c| depth(s, c.source) - depth(s, p.source))
                .min();
            let nearest: Vec<_> = descendants
                .into_iter()
                .filter(|c| Some(depth(s, c.source) - depth(s, p.source)) == nearest)
                .collect();
            if nearest.len() != 1 {
                continue;
            }
            let d = nearest[0];
            let local = rotate(
                inv(decompose_q(tw[p.target])),
                sub(point(tw[d.target]), point(tw[p.target])),
            );
            let reference = sub(point(sw[d.source]), point(sw[p.source]));
            if dot(local, local) <= 1e-12 || dot(reference, reference) <= 1e-12 {
                continue;
            }
            constraints.push(Constraint {
                source: p.source,
                descendant: d.source,
                target: p.target,
                reference: unit(reference),
                local: unit(local),
                rest: unit(rotate(decompose_q(tw[p.target]), unit(local))),
            });
        }
    }
    if let Some(names) = &o.direction_alignment_bones {
        if names.is_empty()
            || o.align_mapped_bone_directions == Some(false)
            || names.iter().collect::<HashSet<_>>().len() != names.len()
            || names.iter().any(|n| {
                n.trim().is_empty() || !constraints.iter().any(|c| t.nodes[c.target].name == *n)
            })
        {
            return Err(invalid("directionAlignmentBones"));
        }
        constraints.retain(|c| names.contains(&t.nodes[c.target].name));
    }
    let mode = o.direction_transfer_mode.as_deref().unwrap_or("relative");
    if !["relative", "absolute"].contains(&mode)
        || o.direction_transfer_bones
            .iter()
            .flatten()
            .any(|n| !constraints.iter().any(|c| t.nodes[c.target].name == *n))
    {
        return Err(invalid("directionTransferBones"));
    }
    let reference_pose = o.source_reference_pose.as_deref().unwrap_or("rest");
    if !["rest", "first-frame", "clip"].contains(&reference_pose) {
        return Err(invalid("sourceReferencePose"));
    }
    let reference = match reference_pose {
        "first-frame" => Some(c),
        "clip" => Some(
            job.source_reference_clip
                .as_ref()
                .ok_or_else(|| invalid("sourceReferenceClip"))?,
        ),
        _ => None,
    };
    let mut reference_local = sr.clone();
    if let Some(reference) = reference {
        if !reference.tracks.iter().any(|ch| {
            s.bones.contains(&ch.node) && ch.bone_channel != Some(false) && ch.property != "scale"
        }) {
            return Err(invalid("sourceReferenceClip"));
        }
        evaluate(
            &mut reference_local,
            reference,
            s,
            0.,
            &HashSet::new(),
            cancel,
        )?;
    }
    let reference_world = worlds(s, &reference_local);
    if reference.is_some() {
        for co in &mut constraints {
            let v = sub(
                point(reference_world[co.descendant]),
                point(reference_world[co.source]),
            );
            if dot(v, v) > 1e-12 {
                co.reference = unit(v);
            }
        }
    }
    let mut scales = Vec::new();
    let mut scale_targets = HashSet::new();
    for spec in o.scale_transfer.iter().flatten() {
        checkpoint(cancel)?;
        let si = s
            .bones
            .iter()
            .copied()
            .find(|i| s.nodes[*i].name == spec.source_bone)
            .ok_or_else(|| invalid("scaleTransfer.sourceBone"))?;
        let ti = t
            .bones
            .iter()
            .copied()
            .find(|i| t.nodes[*i].name == spec.target_bone)
            .ok_or_else(|| invalid("scaleTransfer.targetBone"))?;
        if !pairs.iter().any(|p| p.source == si)
            || !scale_targets.insert(ti)
            || spec
                .axes
                .iter()
                .any(|a| !["x", "y", "z"].contains(&a.as_str()))
            || spec
                .strength
                .iter()
                .any(|v| !v.is_finite() || !(0. ..=1.).contains(v))
        {
            return Err(invalid("scaleTransfer"));
        }
        let find = |clip: &ClipV1| {
            clip.tracks
                .iter()
                .find(|ch| {
                    ch.node == si
                        && ch.property == "scale"
                        && name(ch, s) == format!("{}.scale", s.nodes[si].name)
                })
                .cloned()
        };
        let track = find(c).ok_or_else(|| invalid("scaleTransfer.track"))?;
        let neutral = reference
            .and_then(find)
            .map(|ch| sampler::track(&ch, 0.))
            .unwrap_or(sr[si].scale.to_vec());
        if neutral
            .iter()
            .chain(tr[ti].scale.iter())
            .any(|v| !v.is_finite() || *v <= 0.)
        {
            return Err(invalid("scaleTransfer.reference"));
        }
        scales.push((spec, ti, track, neutral));
    }
    let (evaluation, times, duration) = schedule(c, s, o)?;
    *budget = budget.saturating_add(
        times
            .len()
            .saturating_mul(t.bones.len() * 9 + scales.len() * 4 + 1),
    );
    if *budget > LIMIT {
        return Err(sampler::error(
            "BAKE_OUTPUT_LIMIT",
            "clips",
            "Baked output exceeds 16 million scalars.",
        ));
    }
    let interpolation = o.interpolation.as_deref().unwrap_or("linear");
    if !["linear", "step"].contains(&interpolation) {
        return Err(invalid("interpolation"));
    }
    let mut q_values: Vec<(usize, Vec<f64>)> = vec![];
    let mut p_values: Vec<(usize, Vec<f64>)> = vec![];
    let mut scale_values = vec![vec![]; scales.len()];
    let mut max_displacement: f64 = 0.;
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let context = crate::advanced::BakeContext {
        request: r,
        job,
        target_rest: &tr,
        target_world: &tw,
        source_reference: &reference_world,
        samples: times.len(),
        root: root.map(|p| p.target),
        curls: &curls,
        preserved: &preserved,
        animated: &world_animated,
    };
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let mut natural = advanced
        .map(|a| crate::advanced::natural(a, &context, cancel))
        .transpose()?
        .flatten();
    fn push(values: &mut Vec<(usize, Vec<f64>)>, node: usize, v: &[f64]) {
        if let Some((_, dest)) = values.iter_mut().find(|(i, _)| *i == node) {
            dest.extend_from_slice(v);
        } else {
            values.push((node, v.to_vec()));
        }
    }
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let frames = evaluation.iter().enumerate();
    #[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
    let frames = evaluation.iter().map(|time| ((), time));
    for (_frame_index, time) in frames {
        checkpoint(cancel)?;
        let mut animated = sr.clone();
        evaluate(&mut animated, c, s, *time, &HashSet::new(), cancel)?;
        let aw = worlds(s, &animated);
        #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
        let mut root_world = root.map_or([0.; 3], |p| point(tw[p.target]));
        #[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
        let root_world;
        let mut root_local = None;
        if let Some(p) = root.filter(|_| root_position) {
            let mut delta = sub(point(aw[p.source]), point(reference_world[p.source]));
            if let Some(extract) = extraction {
                let travel = sub(point(aw[extract]), point(reference_world[extract]));
                max_displacement = max_displacement.max(length(travel));
                delta = sub(delta, travel);
            }
            root_world = add(
                point(tw[p.target]),
                scale(rotate(correction, delta), root_scale),
            );
            root_local = Some(
                t.nodes[p.target]
                    .parent
                    .map_or(root_world, |parent| inverse_point(tw[parent], root_world)),
            );
        }
        #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
        let natural_frame = natural
            .as_mut()
            .map(|n| n.frame(&context, &aw, correction, _frame_index, root_world, cancel))
            .transpose()?;
        #[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
        let natural_frame: Option<NaturalFrame> = None;
        if let Some(n) = &natural_frame {
            if n.root_authored || root_local.is_some() {
                if let Some(p) = root {
                    root_local = Some(
                        t.nodes[p.target]
                            .parent
                            .map_or(n.root, |parent| inverse_point(tw[parent], n.root)),
                    );
                }
            }
        }
        let mut desired = HashMap::<usize, Q>::new();
        for i in &order {
            checkpoint(cancel)?;
            let i = *i;
            let p = active.iter().find(|p| p.target == i);
            let pq = parent(t, i).map(|p| {
                desired
                    .get(&p)
                    .copied()
                    .unwrap_or_else(|| decompose_q(tw[p]))
            });
            let override_world = natural_frame
                .as_ref()
                .and_then(|n| n.rotations.get(&i))
                .copied();
            let swing = natural_frame
                .as_ref()
                .and_then(|n| n.descendant_rotations.get(&i))
                .copied();
            let mut world = if let Some(local) = swing.filter(|_| pq.is_some()) {
                norm(mul(pq.unwrap(), local))
            } else if let Some(world) = override_world {
                world
            } else if let Some(pq) = pq.filter(|_| preserved.contains(&t.nodes[i].name)) {
                norm(mul(pq, tr[i].quaternion))
            } else if let Some(p) = p.filter(|p| world_animated.contains(&p.source)) {
                let delta = norm(mul(
                    decompose_q(aw[p.source]),
                    inv(decompose_q(reference_world[p.source])),
                ));
                let delta = norm(mul(mul(correction, delta), inv(correction)));
                let mut world = norm(mul(delta, decompose_q(tw[i])));
                if let Some(co) = constraints.iter().find(|co| co.target == i) {
                    let dir = sub(point(aw[co.descendant]), point(aw[co.source]));
                    if dot(dir, dir) > 1e-12 {
                        let dir = unit(dir);
                        let absolute = mode == "absolute"
                            && o.direction_transfer_bones
                                .as_ref()
                                .is_none_or(|names| names.contains(&t.nodes[i].name));
                        let desired = if absolute {
                            unit(rotate(correction, dir))
                        } else {
                            unit(rotate(
                                norm(mul(
                                    mul(correction, between(co.reference, dir)),
                                    inv(correction),
                                )),
                                co.rest,
                            ))
                        };
                        let current = unit(rotate(world, co.local));
                        world = norm(mul(between(current, desired), world));
                    }
                }
                if let Some(n) = &natural_frame {
                    let mut ancestor = parent(t, i);
                    while let Some(p) = ancestor {
                        if let Some(q) = n.foot_corrections.get(&p) {
                            world = norm(mul(*q, world));
                            break;
                        }
                        ancestor = parent(t, p);
                    }
                }
                world
            } else if let Some(pq) = pq {
                norm(mul(
                    pq,
                    curls.get(&i).map_or(tr[i].quaternion, |offset| {
                        norm(mul(tr[i].quaternion, *offset))
                    }),
                ))
            } else {
                curls.get(&i).map_or_else(
                    || decompose_q(tw[i]),
                    |offset| norm(mul(decompose_q(tw[i]), *offset)),
                )
            };
            if world.iter().any(|v| !v.is_finite()) {
                return Err(invalid("pose.quaternion"));
            }
            desired.insert(i, world);
            if override_world.is_none()
                && (curls.contains_key(&i) || (intermediate.contains(&i) && target_q.contains(&i)))
            {
                let local = curls.get(&i).map_or(tr[i].quaternion, |offset| {
                    norm(mul(tr[i].quaternion, *offset))
                });
                push(&mut q_values, i, &local);
            }
            if intermediate.contains(&i) && target_p.contains(&i) {
                push(&mut p_values, i, &tr[i].position);
            }
            if override_world.is_some() || p.is_some_and(|p| world_animated.contains(&p.source)) {
                let parent_q =
                    pq.unwrap_or_else(|| t.nodes[i].parent.map_or(ID, |p| rotation(tw[p])));
                world = norm(mul(inv(parent_q), world));
                push(&mut q_values, i, &world);
            }
        }
        if let (Some(p), Some(local)) = (root, root_local) {
            push(&mut p_values, p.target, &local);
        }
        for (index, (spec, ti, ch, neutral)) in scales.iter().enumerate() {
            let value = sampler::track(ch, *time);
            for axis in 0..3 {
                let source_axis = match spec.axes[axis].as_str() {
                    "x" => 0,
                    "y" => 1,
                    _ => 2,
                };
                let ratio = value[source_axis] / neutral[source_axis];
                if !ratio.is_finite() || !(0.25..=4.).contains(&ratio) {
                    return Err(invalid("scaleTransfer.ratio"));
                }
                scale_values[index]
                    .push((tr[*ti].scale[axis] * (1. + spec.strength[axis] * (ratio - 1.))) as f32);
            }
        }
    }
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let mut advanced_report = advanced
        .map(|a| crate::advanced::finish(a, &context, &mut q_values, &mut p_values, cancel))
        .transpose()?
        .unwrap_or_default();
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    if let Some(n) = &natural {
        advanced_report.insert("naturalMotion".into(), n.report(&tw));
    }
    #[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
    let advanced_report = BTreeMap::new();
    let mut tracks = Vec::new();
    for (property, values) in [("quaternion", &q_values), ("position", &p_values)] {
        for (i, values) in values {
            tracks.push(TrackV1 {
                bone_channel: Some(true),
                name: Some(format!("{}.{}", t.nodes[*i].name, property)),
                node: *i,
                property: property.into(),
                interpolation: interpolation.into(),
                times: times.iter().map(|v| *v as f32).collect(),
                values: values.iter().map(|v| *v as f32).collect(),
            });
        }
    }
    for (index, (_, ti, _, _)) in scales.iter().enumerate() {
        tracks.push(TrackV1 {
            bone_channel: Some(true),
            name: Some(format!("{}.scale", t.nodes[*ti].name)),
            node: *ti,
            property: "scale".into(),
            interpolation: interpolation.into(),
            times: times.iter().map(|v| *v as f32).collect(),
            values: scale_values[index].clone(),
        });
    }
    if tracks.is_empty() {
        return Err(invalid("output.tracks"));
    }
    if !max_displacement.is_finite()
        || tracks
            .iter()
            .any(|ch| ch.values.iter().any(|v| !v.is_finite()))
    {
        return Err(sampler::error(
            "BAKE_NUMERIC_ERROR",
            "output",
            "Baked output must be finite.",
        ));
    }
    let clip_name = o
        .clip_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(if c.name.is_empty() {
            "retargeted_clip"
        } else {
            &c.name
        });
    let discarded: Vec<_> = c
        .tracks
        .iter()
        .filter(|ch| {
            (!s.bones.contains(&ch.node) || ch.bone_channel == Some(false))
                || ch.property == "scale"
        })
        .filter(|ch| {
            !scales
                .iter()
                .any(|(_, _, scale, _)| name(scale, s) == name(ch, s))
        })
        .map(|ch| name(ch, s))
        .collect();
    let hierarchy: Vec<_> = c
        .tracks
        .iter()
        .filter(|ch| {
            s.bones.contains(&ch.node)
                && ch.bone_channel != Some(false)
                && ch.property != "scale"
                && !pairs.iter().any(|p| p.source == ch.node)
        })
        .map(|ch| name(ch, s))
        .collect();
    let mut report = json!({"sourceClip":if c.name.is_empty(){"(unnamed)"}else{&c.name},"targetClip":clip_name,"duration":duration,"sampleCount":times.len(),
        "quaternionTrackCount":q_values.len(),"positionTrackCount":p_values.len(),"scaleTrackCount":scales.len(),"discardedTracks":discarded,"hierarchyOnlyTracks":hierarchy,
        "mappedBones":active.iter().map(|p|&p.decision).collect::<Vec<_>>(),"rootMotionScale":root_scale,"upCorrection":up,"orientationCorrection":correction,
        "sampleRateHz":o.sample_rate_hz,"interpolation":interpolation,"nextDownRationalTimes":o.next_down_rational_times.unwrap_or(false),
        "directionAlignedBones":constraints.iter().map(|co|&t.nodes[co.target].name).collect::<Vec<_>>(),"directionTransferMode":mode,"directionTransferBones":o.direction_transfer_bones,
        "sourceReferencePose":reference_pose,"sourceReferenceClip":reference.map(|c|c.name.as_str()).filter(|s|!s.is_empty()),"targetReferenceClip":job.target_reference_clip.as_ref().map(|c|c.name.as_str()).filter(|s|!s.is_empty()),
        "preservedTargetLeafRotations":leaves,"preservedTargetRotations":preserved});
    if let Some(i) = extraction {
        report["rootMotionExtraction"] =
            json!({"bone":s.nodes[i].name,"maximumDisplacement":max_displacement});
    }
    if let Some(timing) = &o.visual_timing {
        let mut timing = serde_json::to_value(timing).unwrap();
        timing["sourceDuration"] = json!(c.duration);
        report["visualTiming"] = timing;
    }
    let mut report: CoreBakeReportV1 =
        serde_json::from_value(report).map_err(|_| invalid("output.report"))?;
    report.advanced = advanced_report;
    Ok(BakedClipV1 {
        clip: ClipV1 {
            name: clip_name.into(),
            duration,
            blend_mode: 2500,
            tracks,
        },
        report,
    })
}
fn execute(
    r: &BakeRequestV1,
    cancel: &impl Fn() -> bool,
    _advanced: bool,
) -> Checked<Vec<BakedClipV1>> {
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let advanced = _advanced;
    checkpoint(cancel)?;
    sampler::validate(r, cancel, false).map_err(|e| {
        if e.code == "SAMPLER_CANCELLED" {
            sampler::error("BAKE_CANCELLED", "$", "Core bake cancelled.")
        } else {
            e
        }
    })?;
    let details = r
        .mapping_details
        .as_ref()
        .ok_or_else(|| invalid("mappingDetails"))?;
    if !details.ok
        || details.diagnostics.len() > 10000
        || details.diagnostics.iter().any(|d| d.level == "error")
        || details.map != r.mapping
        || details.decisions.len() != r.mapping.len()
        || details.decisions.is_empty()
    {
        return Err(invalid("mappingDetails"));
    }
    for q in [details.up_correction, details.orientation_correction]
        .into_iter()
        .flatten()
    {
        if q.iter().any(|v| !v.is_finite() || v.abs() > 1e6)
            || q.iter().map(|v| v * v).sum::<f64>() < 1e-12
        {
            return Err(invalid("mappingDetails.correction"));
        }
    }
    let mut used = HashSet::new();
    let mut pairs = Vec::new();
    for d in &details.decisions {
        checkpoint(cancel)?;
        if r.mapping.get(&d.source) != Some(&d.target)
            || !used.insert(&d.source)
            || !d.confidence.is_finite()
            || !(0. ..=1.).contains(&d.confidence)
            || !["manual", "canonical", "normalized", "fuzzy"].contains(&d.method.as_str())
            || d.canonical.as_ref().is_some_and(|s| s.len() > 128)
        {
            return Err(invalid("mappingDetails.decisions"));
        }
        let source = r
            .source
            .bones
            .iter()
            .copied()
            .find(|i| r.source.nodes[*i].name == d.source)
            .ok_or_else(|| invalid("mappingDetails.source"))?;
        let target = r
            .target
            .bones
            .iter()
            .copied()
            .find(|i| r.target.nodes[*i].name == d.target)
            .ok_or_else(|| invalid("mappingDetails.target"))?;
        pairs.push(Pair {
            source,
            target,
            decision: d.clone(),
        });
    }
    // Validate every job's capability before solving any job. No mixed partial batch.
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    if advanced {
        crate::advanced::validate_options(r, cancel)?;
    }
    #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
    let options: Vec<_> = r
        .clips
        .iter()
        .map(|job| {
            if advanced {
                let (core, a) = crate::advanced::split(job)?;
                Ok((option_fields(&core, false)?, Some(a)))
            } else {
                Ok((options(job)?, None))
            }
        })
        .collect::<Checked<_>>()?;
    #[cfg(all(target_arch = "wasm32", not(feature = "advanced-bake")))]
    let options: Vec<(Options, Option<AdvancedOptions>)> = r
        .clips
        .iter()
        .map(|job| Ok((options(job)?, None)))
        .collect::<Checked<_>>()?;
    let mut clips = Vec::new();
    let mut budget: usize = 0;
    for (job, (o, a)) in r.clips.iter().zip(&options) {
        #[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
        if let Some(envelope) = a.as_ref().and_then(|a| a.endpoint.as_ref()) {
            let baked = crate::endpoint::bake(r, job, envelope, cancel)?;
            budget = budget.saturating_add(
                baked
                    .clip
                    .tracks
                    .iter()
                    .map(|c| c.times.len() + c.values.len())
                    .sum::<usize>(),
            );
            if budget > LIMIT {
                return Err(sampler::error(
                    "BAKE_OUTPUT_LIMIT",
                    "clips",
                    "Baked output exceeds 16 million scalars.",
                ));
            }
            clips.push(baked);
            continue;
        }
        clips.push(bake_job(
            r,
            job,
            o,
            &pairs,
            cancel,
            &mut budget,
            a.as_ref(),
        )?);
    }
    checkpoint(cancel)?;
    Ok(clips)
}
pub fn bake_v1(request: &BakeRequestV1, cancelled: impl Fn() -> bool) -> BakeResponseV1 {
    response(execute(request, &cancelled, false))
}
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub(crate) fn advanced_bake(r: &BakeRequestV1, cancel: &impl Fn() -> bool) -> BakeResponseV1 {
    let mut out = response(execute(r, cancel, true));
    out.stage = "advanced-bake".into();
    out.capabilities = vec!["core-bake-v1".into(), "advanced-bake-v1".into()];
    out
}
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub(crate) fn advanced_error(e: SampleErrorV1) -> BakeResponseV1 {
    let mut out = response(Err(e));
    out.stage = "advanced-bake".into();
    out.capabilities = vec!["core-bake-v1".into(), "advanced-bake-v1".into()];
    out
}
fn response(result: Checked<Vec<BakedClipV1>>) -> BakeResponseV1 {
    let mut out = BakeResponseV1 {
        api_version: 1,
        stage: "core-bake".into(),
        capabilities: vec!["core-bake-v1".into()],
        status: "error".into(),
        error: None,
        clips: vec![],
    };
    match result {
        Ok(clips) => {
            out.status = "baked".into();
            out.clips = clips;
        }
        Err(e) => out.error = Some(e),
    }
    out
}
pub fn bake_json_v1(input: &str) -> String {
    let result = if input.len() > sampler::MAX_JSON_BYTES {
        Err(sampler::error(
            "BAKE_INPUT_LIMIT",
            "$",
            "Portable JSON exceeds 16 MiB.",
        ))
    } else {
        serde_json::from_str::<BakeRequestV1>(input)
            .map_err(|_| invalid("$"))
            .and_then(|r| execute(&r, &|| false, false))
    };
    serde_json::to_string(&response(result)).expect("validated bake output")
}
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name=bake_json_v1)]
pub fn wasm_bake_json_v1(input: &str) -> String {
    bake_json_v1(input)
}
