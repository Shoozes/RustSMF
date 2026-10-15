//! Interpolation behavior follows Three.js 0.182.0 (MIT, copyright 2010-2025 three.js authors).
//! See ../THREE_LICENSE.txt for the retained upstream license.
//! Experimental portable sampling contract. No mapping or clip baking is performed here.
use crate::SkeletonSnapshotV1;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

pub const MAX_JSON_BYTES: usize = 16 * 1024 * 1024;
const MAX_VALUES: usize = 16_000_000;
const MAX_NODES: usize = 4096;
const MAX_SAMPLES: usize = 20_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackV1 {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bone_channel: Option<bool>,
    pub node: usize,
    pub property: String,
    pub interpolation: String,
    pub times: Vec<f32>,
    pub values: Vec<f32>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipV1 {
    pub name: String,
    pub duration: f64,
    pub blend_mode: u32,
    pub tracks: Vec<TrackV1>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipJobV1 {
    pub clip: ClipV1,
    #[serde(default)]
    pub options: BTreeMap<String, serde_json::Value>,
    pub source_reference_clip: Option<ClipV1>,
    pub target_reference_clip: Option<ClipV1>,
    #[serde(default)]
    pub endpoint_target_clips: Vec<ClipV1>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BakeRequestV1 {
    pub api_version: u32,
    pub operation: String,
    pub source: SkeletonSnapshotV1,
    pub target: SkeletonSnapshotV1,
    pub mapping: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mapping_details: Option<crate::RigMapV1>,
    pub clips: Vec<ClipJobV1>,
    pub sample_times: Vec<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SampleErrorV1 {
    pub code: String,
    pub path: String,
    pub message: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TransformV1 {
    pub position: [f64; 3],
    pub quaternion: [f64; 4],
    pub scale: [f64; 3],
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PoseV1 {
    pub local: Vec<TransformV1>,
    pub world_matrices: Vec<[f64; 16]>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimedPoseV1 {
    pub time: f64,
    pub pose: PoseV1,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SampledClipV1 {
    pub job: usize,
    pub role: String,
    pub name: String,
    pub samples: Vec<TimedPoseV1>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SampleResponseV1 {
    pub api_version: u32,
    pub stage: String,
    pub capabilities: Vec<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SampleErrorV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_rest: Option<PoseV1>,
    pub clips: Vec<SampledClipV1>,
}
pub(crate) type Checked<T> = Result<T, SampleErrorV1>;
pub(crate) fn error(code: &str, path: &str, message: &str) -> SampleErrorV1 {
    SampleErrorV1 {
        code: code.into(),
        path: path.into(),
        message: message.into(),
    }
}
fn invalid(path: &str) -> SampleErrorV1 {
    error(
        "SAMPLER_INPUT_INVALID",
        path,
        "Invalid or out-of-bounds portable sampling input.",
    )
}
pub(crate) fn checkpoint(cancel: &impl Fn() -> bool) -> Checked<()> {
    if cancel() {
        Err(error("SAMPLER_CANCELLED", "$", "Sampling cancelled."))
    } else {
        Ok(())
    }
}
fn bounded(values: &[f64], limit: f64) -> bool {
    values.iter().all(|v| v.is_finite() && v.abs() <= limit)
}
fn quaternion(q: &[f64]) -> bool {
    bounded(q, 1.0001) && (q.iter().map(|v| v * v).sum::<f64>() - 1.0).abs() < 1e-4
}
fn skeleton(
    s: &SkeletonSnapshotV1,
    path: &str,
    cancel: &impl Fn() -> bool,
    strict_world: bool,
) -> Checked<()> {
    if s.nodes.is_empty() || s.nodes.len() > MAX_NODES || s.bones.is_empty() || s.bones.len() > 2048
    {
        return Err(invalid(path));
    }
    let mut names = HashSet::new();
    for (i, node) in s.nodes.iter().enumerate() {
        checkpoint(cancel)?;
        if node.name.is_empty()
            || node.name.len() > 1024
            || !names.insert(&node.name)
            || node.parent.is_some_and(|p| p >= i)
            || !bounded(&node.position, 1e12)
            || !quaternion(&node.quaternion)
            || !bounded(&node.scale, 1e6)
            || !bounded(&node.world_position, 1e12)
            || if strict_world {
                !quaternion(&node.world_quaternion)
            } else {
                !bounded(&node.world_quaternion, 1e6)
            }
        {
            return Err(invalid(path));
        }
    }
    let mut bones = HashSet::new();
    if s.bones
        .iter()
        .any(|i| !bones.insert(i) || !s.nodes.get(*i).is_some_and(|n| n.is_bone))
    {
        return Err(invalid(path));
    }
    Ok(())
}
fn clip(
    clip: &ClipV1,
    s: &SkeletonSnapshotV1,
    values: &mut usize,
    path: &str,
    cancel: &impl Fn() -> bool,
) -> Checked<()> {
    if clip.name.len() > 1024
        || !clip.duration.is_finite()
        || clip.duration <= 0.0
        || clip.duration > 1e9
        || clip.tracks.len() > 32768
    {
        return Err(invalid(path));
    }
    if clip.blend_mode != 2500 {
        return Err(error(
            "SAMPLER_UNSUPPORTED_FEATURE",
            path,
            "Additive clips require bake semantics and cannot be sampled here.",
        ));
    }
    let mut channels = HashSet::new();
    for t in &clip.tracks {
        checkpoint(cancel)?;
        let size = match t.property.as_str() {
            "position" | "scale" => 3,
            "quaternion" => 4,
            _ => {
                return Err(error(
                    "SAMPLER_UNSUPPORTED_FEATURE",
                    path,
                    "Only transform channels can be sampled.",
                ))
            }
        };
        let cubic = t.interpolation == "gltf-cubic-spline";
        if !["step", "linear", "smooth", "gltf-cubic-spline"].contains(&t.interpolation.as_str())
            || (size == 4 && t.interpolation == "smooth")
        {
            return Err(error(
                "SAMPLER_UNSUPPORTED_FEATURE",
                path,
                "Unsupported interpolation mode.",
            ));
        }
        *values = values
            .saturating_add(t.times.len())
            .saturating_add(t.values.len());
        if *values > MAX_VALUES
            || t.name.as_ref().is_some_and(|s| s.len() > 4096)
            || t.node >= s.nodes.len()
            || !channels.insert((t.node, &t.property))
            || t.times.is_empty()
            || t.values.len() != t.times.len() * size * if cubic { 3 } else { 1 }
            || t.times
                .iter()
                .any(|v| !v.is_finite() || *v < 0.0 || *v as f64 > clip.duration + 1e-6)
            || t.times.windows(2).any(|v| v[0] >= v[1])
            || t.values.iter().any(|v| !v.is_finite() || v.abs() > 1e12)
        {
            return Err(invalid(path));
        }
        if size == 4 {
            for k in 0..t.times.len() {
                let start = (k * if cubic { 3 } else { 1 } + usize::from(cubic)) * 4;
                if !quaternion(
                    &t.values[start..start + 4]
                        .iter()
                        .map(|v| *v as f64)
                        .collect::<Vec<_>>(),
                ) {
                    return Err(invalid(path));
                }
            }
        }
    }
    Ok(())
}
fn inputs(r: &BakeRequestV1, cancel: &impl Fn() -> bool) -> Checked<()> {
    validate(r, cancel, true)
}
pub(crate) fn validate(
    r: &BakeRequestV1,
    cancel: &impl Fn() -> bool,
    sampling: bool,
) -> Checked<()> {
    checkpoint(cancel)?;
    if r.api_version != 1 {
        return Err(invalid("apiVersion"));
    }
    if r.operation != if sampling { "sample" } else { "bake" } {
        return Err(error(
            "SAMPLER_UNSUPPORTED_FEATURE",
            "operation",
            "This runtime samples TRS only; complete clip baking is not available.",
        ));
    }
    skeleton(&r.source, "source", cancel, sampling)?;
    skeleton(&r.target, "target", cancel, sampling)?;
    if r.clips.is_empty()
        || r.clips.len() > 256
        || r.sample_times.is_empty()
        || r.sample_times.len() > MAX_SAMPLES
        || !bounded(&r.sample_times, 1e9)
    {
        return Err(invalid("clips/sampleTimes"));
    }
    let source_names: HashSet<_> = r
        .source
        .bones
        .iter()
        .map(|i| &r.source.nodes[*i].name)
        .collect();
    let target_names: HashSet<_> = r
        .target
        .bones
        .iter()
        .map(|i| &r.target.nodes[*i].name)
        .collect();
    let mut targets = HashSet::new();
    if r.mapping
        .iter()
        .any(|(s, t)| !source_names.contains(s) || !target_names.contains(t) || !targets.insert(t))
    {
        return Err(invalid("mapping"));
    }
    let mut values = 0usize;
    let mut output = r.target.nodes.len() * 26;
    for job in &r.clips {
        checkpoint(cancel)?;
        if sampling && !job.options.is_empty() {
            return Err(error(
                "SAMPLER_UNSUPPORTED_FEATURE",
                "options",
                "Bake options are inventoried but not executed by the experimental sampler.",
            ));
        }
        if job.endpoint_target_clips.len() > 256 {
            return Err(invalid("endpointTargetClips"));
        }
        for (c, s, path) in std::iter::once((&job.clip, &r.source, "clip"))
            .chain(
                job.source_reference_clip
                    .iter()
                    .map(|c| (c, &r.source, "sourceReferenceClip")),
            )
            .chain(
                job.target_reference_clip
                    .iter()
                    .map(|c| (c, &r.target, "targetReferenceClip")),
            )
            .chain(
                job.endpoint_target_clips
                    .iter()
                    .map(|c| (c, &r.target, "endpointTargetClips")),
            )
        {
            output = output.saturating_add(
                r.sample_times
                    .len()
                    .saturating_mul(s.nodes.len())
                    .saturating_mul(26),
            );
            if sampling && output > MAX_VALUES {
                return Err(error(
                    "SAMPLER_OUTPUT_LIMIT",
                    "sampleTimes",
                    "Sampled output exceeds 16 million scalar values.",
                ));
            }
            clip(c, s, &mut values, path, cancel)?;
        }
    }
    Ok(())
}
fn round32(v: f64) -> f64 {
    (v as f32) as f64
}
fn normalize(q: &mut [f64]) {
    let length = q.iter().map(|v| v * v).sum::<f64>().sqrt();
    if length == 0.0 {
        q.copy_from_slice(&[0.0, 0.0, 0.0, 1.0]);
    } else {
        for v in q {
            *v = round32(*v / length);
        }
    }
}
pub(crate) fn track(t: &TrackV1, time: f64) -> Vec<f64> {
    let size = if t.property == "quaternion" { 4 } else { 3 };
    let cubic = t.interpolation == "gltf-cubic-spline";
    let key = |i: usize, slot: usize, component: usize| {
        t.values[(i * if cubic { 3 } else { 1 } + slot) * size + component] as f64
    };
    let upper = t.times.partition_point(|v| *v as f64 <= time);
    if upper == 0 || upper == t.times.len() || t.interpolation == "step" {
        let index = upper.saturating_sub(1).min(t.times.len() - 1);
        return (0..size)
            .map(|i| key(index, usize::from(cubic), i))
            .collect();
    }
    let lo = upper - 1;
    let start = t.times[lo] as f64;
    let end = t.times[upper] as f64;
    let p = (time - start) / (end - start);
    let pp = p * p;
    let ppp = pp * p;
    if size == 4 && !cubic {
        let a: Vec<_> = (0..4).map(|i| key(lo, 0, i)).collect();
        let mut b: Vec<_> = (0..4).map(|i| key(upper, 0, i)).collect();
        if time == start || a == b {
            return a;
        }
        let mut dot = a.iter().zip(&b).map(|(a, b)| a * b).sum::<f64>();
        if dot < 0.0 {
            for v in &mut b {
                *v = -*v;
            }
            dot = -dot;
        }
        let mut result = if dot < 0.9995 {
            let theta = libm::acos(dot);
            let denominator = libm::sin(theta);
            (0..4)
                .map(|i| {
                    round32(
                        a[i] * libm::sin((1.0 - p) * theta) / denominator
                            + b[i] * libm::sin(p * theta) / denominator,
                    )
                })
                .collect::<Vec<_>>()
        } else {
            (0..4).map(|i| a[i] * (1.0 - p) + b[i] * p).collect()
        };
        if dot >= 0.9995 {
            normalize(&mut result);
        }
        return result;
    }
    let mut result = Vec::with_capacity(size);
    for i in 0..size {
        let value = if cubic {
            (2.0 * ppp - 3.0 * pp + 1.0) * key(lo, 1, i)
                + (ppp - 2.0 * pp + p) * (end - start) * key(lo, 2, i)
                + (-2.0 * ppp + 3.0 * pp) * key(upper, 1, i)
                + (ppp - pp) * (end - start) * key(upper, 0, i)
        } else if t.interpolation == "smooth" {
            // Three.js CubicInterpolant's default natural (zero curvature) boundaries.
            let (prev, tp) = if upper >= 2 {
                (upper - 2, t.times[upper - 2] as f64)
            } else {
                (upper, end)
            };
            let (next, tn) = if upper + 1 < t.times.len() {
                (upper + 1, t.times[upper + 1] as f64)
            } else {
                (lo, start)
            };
            let wp = (end - start) * 0.5 / (start - tp);
            let wn = (end - start) * 0.5 / (tn - end);
            (-wp * ppp + 2.0 * wp * pp - wp * p) * key(prev, 0, i)
                + ((1.0 + wp) * ppp + (-1.5 - 2.0 * wp) * pp + (-0.5 + wp) * p + 1.0)
                    * key(lo, 0, i)
                + ((-1.0 - wn) * ppp + (1.5 + wn) * pp + 0.5 * p) * key(upper, 0, i)
                + (wn * ppp - wn * pp) * key(next, 0, i)
        } else {
            (1.0 - p) * key(lo, 0, i) + p * key(upper, 0, i)
        };
        result.push(round32(value));
    }
    if size == 4 {
        normalize(&mut result);
    }
    result
}
pub(crate) fn matrix(t: &TransformV1) -> [f64; 16] {
    let [x, y, z, w] = t.quaternion;
    let [sx, sy, sz] = t.scale;
    [
        (1.0 - 2.0 * (y * y + z * z)) * sx,
        2.0 * (x * y + w * z) * sx,
        2.0 * (x * z - w * y) * sx,
        0.0,
        2.0 * (x * y - w * z) * sy,
        (1.0 - 2.0 * (x * x + z * z)) * sy,
        2.0 * (y * z + w * x) * sy,
        0.0,
        2.0 * (x * z + w * y) * sz,
        2.0 * (y * z - w * x) * sz,
        (1.0 - 2.0 * (x * x + y * y)) * sz,
        0.0,
        t.position[0],
        t.position[1],
        t.position[2],
        1.0,
    ]
}
pub(crate) fn multiply(a: &[f64; 16], b: &[f64; 16]) -> [f64; 16] {
    let mut out = [0.0; 16];
    for col in 0..4 {
        for row in 0..4 {
            out[col * 4 + row] = (0..4).map(|i| a[i * 4 + row] * b[col * 4 + i]).sum();
        }
    }
    out
}
fn pose(
    s: &SkeletonSnapshotV1,
    c: Option<&ClipV1>,
    time: f64,
    cancel: &impl Fn() -> bool,
) -> Checked<PoseV1> {
    let mut local: Vec<_> = s
        .nodes
        .iter()
        .map(|n| TransformV1 {
            position: n.position,
            quaternion: n.quaternion,
            scale: n.scale,
        })
        .collect();
    if let Some(c) = c {
        for t in &c.tracks {
            checkpoint(cancel)?;
            let values = track(t, time);
            let target = &mut local[t.node];
            match t.property.as_str() {
                "position" => target.position.copy_from_slice(&values),
                "scale" => target.scale.copy_from_slice(&values),
                _ => target.quaternion.copy_from_slice(&values),
            }
        }
    }
    let mut world_matrices = Vec::with_capacity(local.len());
    for (i, t) in local.iter().enumerate() {
        checkpoint(cancel)?;
        let m = matrix(t);
        let world = s.nodes[i]
            .parent
            .map_or(m, |p| multiply(&world_matrices[p], &m));
        if !world.iter().all(|v| v.is_finite()) {
            return Err(error(
                "SAMPLER_NUMERIC_ERROR",
                "pose",
                "Sampled transforms are not finite.",
            ));
        }
        world_matrices.push(world);
    }
    Ok(PoseV1 {
        local,
        world_matrices,
    })
}
fn execute(r: &BakeRequestV1, cancel: &impl Fn() -> bool) -> Checked<(PoseV1, Vec<SampledClipV1>)> {
    inputs(r, cancel)?;
    let target_rest = pose(&r.target, None, 0.0, cancel)?;
    let mut clips = Vec::new();
    for (job_index, job) in r.clips.iter().enumerate() {
        for (c, s, role) in std::iter::once((&job.clip, &r.source, "source"))
            .chain(
                job.source_reference_clip
                    .iter()
                    .map(|c| (c, &r.source, "source-reference")),
            )
            .chain(
                job.target_reference_clip
                    .iter()
                    .map(|c| (c, &r.target, "target-reference")),
            )
            .chain(
                job.endpoint_target_clips
                    .iter()
                    .map(|c| (c, &r.target, "endpoint-target")),
            )
        {
            let mut samples = Vec::with_capacity(r.sample_times.len());
            for time in &r.sample_times {
                checkpoint(cancel)?;
                samples.push(TimedPoseV1 {
                    time: *time,
                    pose: pose(s, Some(c), *time, cancel)?,
                });
            }
            clips.push(SampledClipV1 {
                job: job_index,
                role: role.into(),
                name: c.name.clone(),
                samples,
            });
        }
    }
    Ok((target_rest, clips))
}
pub fn sample_v1(request: &BakeRequestV1, cancelled: impl Fn() -> bool) -> SampleResponseV1 {
    response(execute(request, &cancelled))
}
fn response(result: Checked<(PoseV1, Vec<SampledClipV1>)>) -> SampleResponseV1 {
    let mut output = SampleResponseV1 {
        api_version: 1,
        stage: "sampler".into(),
        capabilities: vec!["sample-trs-v1".into()],
        status: "error".into(),
        error: None,
        target_rest: None,
        clips: Vec::new(),
    };
    match result {
        Ok((target, clips)) => {
            output.status = "sampled".into();
            output.target_rest = Some(target);
            output.clips = clips;
        }
        Err(err) => output.error = Some(err),
    }
    output
}
pub fn sample_json_v1(input: &str) -> String {
    let result = if input.len() > MAX_JSON_BYTES {
        Err(error(
            "SAMPLER_INPUT_LIMIT",
            "$",
            "Portable JSON exceeds 16 MiB.",
        ))
    } else {
        serde_json::from_str::<BakeRequestV1>(input)
            .map_err(|_| invalid("$"))
            .and_then(|r| execute(&r, &|| false))
    };
    serde_json::to_string(&response(result)).expect("sampler results are finite")
}
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(js_name=sample_json_v1)]
pub fn wasm_sample_json_v1(input: &str) -> String {
    sample_json_v1(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    fn request() -> BakeRequestV1 {
        serde_json::from_value(serde_json::json!({"apiVersion":1,"operation":"sample",
          "source":{"nodes":[{"name":"Root","parent":null,"isBone":true,"position":[0,0,0],"quaternion":[0,0,0,1],"scale":[1,1,1],"worldPosition":[0,0,0],"worldQuaternion":[0,0,0,1]}],"bones":[0]},
          "target":{"nodes":[{"name":"Root","parent":null,"isBone":true,"position":[0,1,0],"quaternion":[0,0,0,1],"scale":[1,1,1],"worldPosition":[0,1,0],"worldQuaternion":[0,0,0,1]}],"bones":[0]},
          "mapping":{"Root":"Root"},"clips":[{"clip":{"name":"Motion","duration":2,"blendMode":2500,"tracks":[{"node":0,"property":"position","interpolation":"linear","times":[0,2],"values":[0,0,0,2,4,6]}]},"options":{}}],"sampleTimes":[-1,0,0.5,1,2,3]})).unwrap()
    }
    #[test]
    fn known_linear_and_endpoint_samples_do_not_mutate_inputs() {
        let r = request();
        let before = serde_json::to_string(&r).unwrap();
        let out = sample_v1(&r, || false);
        assert_eq!(out.status, "sampled");
        assert_eq!(
            out.clips[0].samples[2].pose.local[0].position,
            [0.5, 1.0, 1.5]
        );
        assert_eq!(out.clips[0].samples[0].pose.local[0].position, [0.0; 3]);
        assert_eq!(
            out.clips[0].samples[5].pose.local[0].position,
            [2.0, 4.0, 6.0]
        );
        assert_eq!(serde_json::to_string(&r).unwrap(), before);
    }
    #[test]
    fn hermite_tangents_are_in_seconds() {
        let mut r = request();
        let t = &mut r.clips[0].clip.tracks[0];
        t.interpolation = "gltf-cubic-spline".into();
        t.values = vec![
            0., 0., 0., 0., 0., 0., 1., 0., 0., 0., 0., 0., 2., 0., 0., 0., 0., 0.,
        ];
        let out = sample_v1(&r, || false);
        assert_eq!(
            out.clips[0].samples[2].pose.local[0].position,
            [0.59375, 0., 0.]
        );
    }
    #[test]
    fn cancellation_during_validation_and_sampling_returns_no_partial_output() {
        let r = request();
        let count = Cell::new(0);
        assert_eq!(
            sample_v1(&r, || {
                count.set(count.get() + 1);
                false
            })
            .status,
            "sampled"
        );
        let total = count.get();
        assert!(total > 20);
        for limit in [0, 4, total - 3] {
            let calls = Cell::new(0);
            let out = sample_v1(&r, || {
                let n = calls.get();
                calls.set(n + 1);
                n >= limit
            });
            assert_eq!(out.error.unwrap().code, "SAMPLER_CANCELLED");
            assert!(out.clips.is_empty());
            assert!(out.target_rest.is_none());
        }
    }
    #[test]
    fn json_limits_unknown_fields_nonfinite_and_bake_capability_are_explicit() {
        let mut r = request();
        r.operation = "bake".into();
        assert_eq!(
            sample_v1(&r, || false).error.unwrap().code,
            "SAMPLER_UNSUPPORTED_FEATURE"
        );
        r.operation = "sample".into();
        r.clips[0]
            .options
            .insert("future".into(), serde_json::json!(true));
        assert_eq!(
            sample_v1(&r, || false).error.unwrap().code,
            "SAMPLER_UNSUPPORTED_FEATURE"
        );
        let parsed: serde_json::Value = serde_json::from_str(&sample_json_v1("{}")).unwrap();
        assert_eq!(parsed["error"]["code"], "SAMPLER_INPUT_INVALID");
        let large = " ".repeat(MAX_JSON_BYTES + 1);
        let parsed: serde_json::Value = serde_json::from_str(&sample_json_v1(&large)).unwrap();
        assert_eq!(parsed["error"]["code"], "SAMPLER_INPUT_LIMIT");
        let mut r = request();
        r.sample_times[0] = f64::NAN;
        assert_eq!(
            sample_v1(&r, || false).error.unwrap().code,
            "SAMPLER_INPUT_INVALID"
        );
        let mut value = serde_json::to_value(request()).unwrap();
        value["future"] = true.into();
        let parsed: serde_json::Value =
            serde_json::from_str(&sample_json_v1(&value.to_string())).unwrap();
        assert_eq!(parsed["error"]["code"], "SAMPLER_INPUT_INVALID");
    }
    #[test]
    fn invalid_hierarchy_duplicate_channels_and_output_budget_are_rejected() {
        let mut r = request();
        r.source.nodes[0].parent = Some(0);
        assert_eq!(sample_v1(&r, || false).status, "error");
        let mut r = request();
        let t = r.clips[0].clip.tracks[0].clone();
        r.clips[0].clip.tracks.push(t);
        assert_eq!(sample_v1(&r, || false).status, "error");
        let mut r = request();
        r.sample_times = vec![0.; MAX_SAMPLES];
        r.clips = vec![r.clips[0].clone(); 32];
        assert_eq!(
            sample_v1(&r, || false).error.unwrap().code,
            "SAMPLER_OUTPUT_LIMIT"
        );
    }
    #[test]
    fn infinite_composed_matrices_fail_without_serializing_nonfinite_numbers() {
        let mut r = request();
        let template = r.source.nodes[0].clone();
        for i in 0..64 {
            let mut node = template.clone();
            node.name = format!("Node{i}");
            node.scale = [1e6; 3];
            node.parent = Some(i);
            r.source.nodes.push(node);
        }
        assert_eq!(
            sample_v1(&r, || false).error.unwrap().code,
            "SAMPLER_NUMERIC_ERROR"
        );
    }
}
