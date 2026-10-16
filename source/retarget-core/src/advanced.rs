//! Experimental advanced solving; the production editor remains on TypeScript.
use crate::bake_math::*;
use crate::sampler::{self, BakeRequestV1, Checked, ClipJobV1, TransformV1};
use crate::SkeletonSnapshotV1;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

pub(crate) fn invalid(path: &str) -> sampler::SampleErrorV1 {
    sampler::error(
        "ADVANCED_INPUT_INVALID",
        path,
        "Invalid advanced bake calibration or incompatible options.",
    )
}
pub(crate) fn checkpoint(cancel: &impl Fn() -> bool) -> Checked<()> {
    if cancel() {
        Err(sampler::error(
            "BAKE_CANCELLED",
            "$",
            "Advanced bake cancelled.",
        ))
    } else {
        Ok(())
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Curl {
    palm_bone: String,
    bones: Vec<String>,
    palm_normal: V,
    degrees: Vec<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Recovery {
    peak_frame: usize,
    hold_through_frame: usize,
    return_by_frame: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Correction {
    from: Q,
    to: Q,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Twist {
    forearm: String,
    hand: String,
    share: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct JointRange {
    bone: String,
    reference_rotation: Q,
    twist_axis: V,
    bend_axis: V,
    flexion_degrees: [f64; 2],
    lateral_degrees: [f64; 2],
    twist_degrees: [f64; 2],
    maximum_swing_degrees: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Ranges {
    schema: String,
    id: String,
    policy: String,
    joints: Vec<JointRange>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Head {
    neck: String,
    head: String,
    transition_degrees: f64,
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AdvancedOptions {
    pub(crate) natural: Option<crate::natural::Profile>,
    pub(crate) endpoint: Option<crate::endpoint::Envelope>,
    #[serde(default)]
    curls: Vec<Curl>,
    #[serde(default)]
    recovery: Option<Recovery>,
    #[serde(default)]
    corrections: BTreeMap<String, Correction>,
    #[serde(default)]
    twist: Vec<Twist>,
    #[serde(default)]
    ranges: Option<Ranges>,
    #[serde(default)]
    head: Option<Head>,
}
fn named(s: &str) -> bool {
    !s.trim().is_empty() && s.encode_utf16().count() <= 160
}
fn unit_length(v: &[f64]) -> bool {
    v.iter().all(|x| x.is_finite())
        && (libm::sqrt(v.iter().map(|x| x * x).sum()) - 1.).abs() <= 1e-4
}
fn bone(s: &SkeletonSnapshotV1, name: &str) -> Checked<usize> {
    s.bones
        .iter()
        .copied()
        .find(|i| s.nodes[*i].name == name)
        .ok_or_else(|| invalid("bone"))
}
pub(crate) fn validate_options(r: &BakeRequestV1, cancel: &impl Fn() -> bool) -> Checked<()> {
    fn walk(
        value: &Value,
        depth: usize,
        budget: &mut usize,
        cancel: &impl Fn() -> bool,
    ) -> Checked<()> {
        checkpoint(cancel)?;
        if depth > 64 {
            return Err(invalid("options.depth"));
        }
        *budget = budget.saturating_add(match value {
            Value::String(s) => s.len() + 4,
            _ => 8,
        });
        if *budget > sampler::MAX_JSON_BYTES {
            return Err(sampler::error(
                "BAKE_INPUT_LIMIT",
                "options",
                "Advanced options exceed the bounded value budget.",
            ));
        }
        match value {
            Value::Array(a) => {
                for v in a {
                    walk(v, depth + 1, budget, cancel)?;
                }
            }
            Value::Object(o) => {
                for (k, v) in o {
                    *budget = budget.saturating_add(k.len() + 4);
                    walk(v, depth + 1, budget, cancel)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    let mut budget: usize = 0;
    for job in &r.clips {
        for (k, v) in &job.options {
            budget = budget.saturating_add(k.len() + 4);
            walk(v, 0, &mut budget, cancel)?;
        }
    }
    Ok(())
}
pub(crate) fn split(job: &ClipJobV1) -> Checked<(BTreeMap<String, Value>, AdvancedOptions)> {
    let mut core = job.options.clone();
    let mut extra = serde_json::Map::new();
    for (wire, field) in [
        ("targetChainCurls", "curls"),
        ("poseRecovery", "recovery"),
        ("localReferenceCorrections", "corrections"),
        ("forearmTwist", "twist"),
        ("poseRanges", "ranges"),
        ("jointConstraints", "head"),
        ("naturalMotion", "natural"),
        ("endpointEnvelope", "endpoint"),
    ] {
        if let Some(value) = core.remove(wire) {
            fn has_null(v: &Value) -> bool {
                match v {
                    Value::Null => true,
                    Value::Array(a) => a.iter().any(has_null),
                    Value::Object(o) => o.values().any(has_null),
                    _ => false,
                }
            }
            if has_null(&value) {
                return Err(invalid(wire));
            }
            extra.insert(field.into(), value);
        }
    }
    let a: AdvancedOptions =
        serde_json::from_value(Value::Object(extra)).map_err(|_| invalid("options"))?;
    if a.curls.len() > 64 || a.corrections.len() > 64 || a.twist.len() > 2 {
        return Err(invalid("options.limits"));
    }
    for (name, c) in &a.corrections {
        if !named(name) || !unit_length(&c.from) || !unit_length(&c.to) {
            return Err(invalid("localReferenceCorrections"));
        }
    }
    let mut names = HashSet::new();
    for p in &a.twist {
        if !named(&p.forearm)
            || !named(&p.hand)
            || !names.insert(&p.forearm)
            || !names.insert(&p.hand)
            || !p.share.is_finite()
            || p.share <= 0.
            || p.share >= 1.
        {
            return Err(invalid("forearmTwist"));
        }
    }
    if let Some(p) = &a.ranges {
        if p.schema != "rustsmf.pose-ranges.v1"
            || p.id.is_empty()
            || p.id.len() > 80
            || !p
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
            || !["report", "reject"].contains(&p.policy.as_str())
            || p.joints.is_empty()
            || p.joints.len() > 64
        {
            return Err(invalid("poseRanges"));
        }
        let mut names = HashSet::new();
        for j in &p.joints {
            if !named(&j.bone)
                || !names.insert(&j.bone)
                || !unit_length(&j.reference_rotation)
                || !unit_length(&j.twist_axis)
                || !unit_length(&j.bend_axis)
                || dot(j.twist_axis, j.bend_axis).abs() > 1e-4
                || !j.maximum_swing_degrees.is_finite()
                || j.maximum_swing_degrees <= 0.
                || j.maximum_swing_degrees > 180.
                || [j.flexion_degrees, j.lateral_degrees, j.twist_degrees]
                    .iter()
                    .any(|r| {
                        !r.iter().all(|v| v.is_finite())
                            || r[0] < -180.
                            || r[1] > 180.
                            || r[0] >= r[1]
                    })
            {
                return Err(invalid("poseRanges.joints"));
            }
        }
    }
    if let Some(h) = &a.head {
        if !named(&h.neck)
            || !named(&h.head)
            || h.neck == h.head
            || !h.transition_degrees.is_finite()
            || h.transition_degrees <= 0.
            || h.transition_degrees > 20.
        {
            return Err(invalid("jointConstraints"));
        }
    }
    Ok((core, a))
}
pub(crate) struct BakeContext<'a> {
    pub request: &'a BakeRequestV1,
    pub job: &'a ClipJobV1,
    pub target_rest: &'a [TransformV1],
    pub target_world: &'a [M],
    pub source_reference: &'a [M],
    pub samples: usize,
    pub root: Option<usize>,
    pub curls: &'a HashMap<usize, Q>,
    pub preserved: &'a [String],
    pub animated: &'a HashSet<usize>,
}
pub(crate) fn natural(
    a: &AdvancedOptions,
    ctx: &BakeContext,
    cancel: &impl Fn() -> bool,
) -> Checked<Option<crate::natural::Natural>> {
    let (r, job, tr, tw, samples) = (
        ctx.request,
        ctx.job,
        ctx.target_rest,
        ctx.target_world,
        ctx.samples,
    );
    let Some(profile) = &a.natural else {
        return Ok(None);
    };
    let mut prepared = crate::natural::prepare(profile, ctx, cancel)?;
    prepared.conflicts(
        r,
        &a.corrections,
        a.head.as_ref().map(|h| (h.neck.as_str(), h.head.as_str())),
    )?;
    if prepared.needs_anchors() {
        if job.options.get("sampleRateHz") != Some(&json!(60)) {
            return Err(invalid("naturalMotion.anchors.sampleRateHz"));
        }
        let mut request = r.clone();
        request.clips = vec![job.clone()];
        for key in ["naturalMotion", "poseRanges", "jointConstraints"] {
            request.clips[0].options.remove(key);
        }
        let mut base = crate::baker::advanced_bake(&request, cancel);
        if let Some(error) = base.error {
            return Err(error);
        }
        let clip = base.clips.remove(0).clip;
        prepared.anchors(&clip, &r.target, tr, tw, samples, cancel)?;
    }
    Ok(Some(prepared))
}
pub(crate) fn curls(
    a: &AdvancedOptions,
    r: &BakeRequestV1,
    tr: &[TransformV1],
    tw: &[M],
) -> Checked<HashMap<usize, Q>> {
    let t = &r.target;
    let mut out = HashMap::new();
    for c in &a.curls {
        if !named(&c.palm_bone)
            || c.bones.is_empty()
            || c.bones.len() > 2048
            || c.bones.len() != c.degrees.len()
            || c.degrees.iter().any(|d| !d.is_finite() || d.abs() > 180.)
            || c.palm_normal.iter().any(|v| !v.is_finite())
            || dot(c.palm_normal, c.palm_normal) <= 1e-12
        {
            return Err(invalid("targetChainCurls"));
        }
        let palm = bone(t, &c.palm_bone)?;
        let normal = unit(rotate(decompose_q(tw[palm]), unit(c.palm_normal)));
        let mut parent = palm;
        for (n, name) in c.bones.iter().enumerate() {
            let i = bone(t, name)?;
            if !named(name)
                || r.mapping.values().any(|v| v == name)
                || out.contains_key(&i)
                || t.nodes[i].parent != Some(parent)
            {
                return Err(invalid("targetChainCurls.bones"));
            }
            let segment = if n + 1 < c.bones.len() {
                sub(point(tw[bone(t, &c.bones[n + 1])?]), point(tw[i]))
            } else {
                rotate(decompose_q(tw[i]), [0., 1., 0.])
            };
            let hinge = unit(crate::cross(unit(segment), normal));
            if dot(hinge, hinge) <= 1e-12 {
                return Err(invalid("targetChainCurls.palmNormal"));
            }
            out.insert(
                i,
                axis_angle(
                    unit(rotate(inv(decompose_q(tw[i])), hinge)),
                    c.degrees[n].to_radians(),
                ),
            );
            parent = i;
        }
    }
    let _ = tr;
    Ok(out)
}
pub(crate) type Channels = Vec<(usize, Vec<f64>)>;
fn read(values: &[f64], frame: usize) -> Q {
    norm(std::array::from_fn(|i| values[frame * 4 + i]))
}
fn append(values: &mut Vec<f64>, mut q: Q) {
    if values.len() >= 4 {
        let old = &values[values.len() - 4..];
        if old.iter().zip(q).map(|(a, b)| *a * b).sum::<f64>() < 0. {
            q = q.map(|v| -v);
        }
    }
    values.extend(q.map(|v| v));
}
fn measured(j: &JointRange, q: Q) -> [f64; 4] {
    let mut d = norm(mul(inv(j.reference_rotation), q));
    let sign = if d[3] != 0. {
        d[3]
    } else {
        d[..3].iter().find(|v| **v != 0.).copied().unwrap_or(0.)
    };
    if sign < 0. {
        d = d.map(|v| -v);
    }
    let projected = dot([d[0], d[1], d[2]], j.twist_axis);
    let raw = [
        j.twist_axis[0] * projected,
        j.twist_axis[1] * projected,
        j.twist_axis[2] * projected,
        d[3],
    ];
    let twist = if raw.iter().map(|v| v * v).sum::<f64>() < 1e-12 {
        ID
    } else {
        norm(raw)
    };
    let swing = norm(mul(d, inv(twist)));
    let mut vector = [swing[0], swing[1], swing[2]];
    let angle = 2. * libm::atan2(length(vector), swing[3].max(0.));
    if dot(vector, vector) > 1e-12 {
        vector = scale(unit(vector), angle.to_degrees());
    }
    [
        dot(vector, j.bend_axis),
        dot(vector, crate::cross(j.twist_axis, j.bend_axis)),
        (2. * libm::atan2(dot([twist[0], twist[1], twist[2]], j.twist_axis), twist[3]))
            .to_degrees(),
        angle.to_degrees(),
    ]
}
fn upper(value: f64, upper: f64, margin: f64) -> f64 {
    if margin == 0. {
        return value.min(upper);
    }
    let d = value - (upper - margin);
    if d <= 0. {
        value
    } else if d >= 2. * margin {
        upper
    } else {
        upper - margin + d - d * d / (4. * margin)
    }
}
fn constrain(q: Q, j: &JointRange, margin: f64) -> Q {
    let values = measured(j, q);
    let limit = |v: f64, r: [f64; 2]| {
        let w = margin.min((r[1] - r[0]) / 4.);
        -upper(-upper(v, r[1], w), -r[0], w)
    };
    let f = limit(values[0], j.flexion_degrees);
    let l = limit(values[1], j.lateral_degrees);
    let twist = limit(values[2], j.twist_degrees);
    let swing = add(
        scale(j.bend_axis, f),
        scale(crate::cross(j.twist_axis, j.bend_axis), l),
    );
    let angle = length(swing);
    let bounded = upper(
        angle,
        j.maximum_swing_degrees,
        margin.min(j.maximum_swing_degrees / 4.),
    );
    let swing = if angle > 1e-10 {
        axis_angle(scale(swing, 1. / angle), bounded.to_radians())
    } else {
        ID
    };
    norm(mul(
        mul(j.reference_rotation, swing),
        axis_angle(j.twist_axis, twist.to_radians()),
    ))
}
pub(crate) fn finish(
    a: &AdvancedOptions,
    ctx: &BakeContext,
    rotations: &mut Channels,
    positions: &mut Channels,
    cancel: &impl Fn() -> bool,
) -> Checked<BTreeMap<String, Value>> {
    let (r, job, tr, samples, preserved, curls, animated) = (
        ctx.request,
        ctx.job,
        ctx.target_rest,
        ctx.samples,
        ctx.preserved,
        ctx.curls,
        ctx.animated,
    );
    let t = &r.target;
    let mut report = BTreeMap::from([
        ("targetChainCurls".into(), json!(a.curls)),
        ("poseRecovery".into(), json!(a.recovery)),
        ("localReferenceCorrections".into(), json!(a.corrections)),
        ("naturalMotion".into(), Value::Null),
    ]);
    if let Some(h) = &a.head {
        let neck = bone(t, &h.neck)?;
        let head = bone(t, &h.head)?;
        let profile = a
            .ranges
            .as_ref()
            .ok_or_else(|| invalid("jointConstraints.poseRanges"))?;
        let nr = profile
            .joints
            .iter()
            .find(|j| j.bone == h.neck)
            .ok_or_else(|| invalid("jointConstraints.neck"))?;
        let hr = profile
            .joints
            .iter()
            .find(|j| j.bone == h.head)
            .ok_or_else(|| invalid("jointConstraints.head"))?;
        if t.nodes[head].parent != Some(neck)
            || !t.nodes[neck].parent.is_some_and(|i| t.nodes[i].is_bone)
            || t.nodes
                .iter()
                .any(|n| n.is_bone && n.parent == Some(neck) && n.name != h.head)
            || job.options.get("alignMappedBoneDirections") != Some(&json!(false))
            || a.recovery.is_some()
            || [nr, hr].iter().any(|j| {
                [j.flexion_degrees, j.lateral_degrees, j.twist_degrees]
                    .iter()
                    .any(|r| r[0] > 0. || r[1] < 0.)
            })
            || [neck, head].iter().any(|i| {
                !r.mapping.iter().any(|(source, target)| {
                    *target == t.nodes[*i].name
                        && bone(&r.source, source).is_ok_and(|i| animated.contains(&i))
                }) || !rotations.iter().any(|(n, _)| n == i)
            })
        {
            return Err(invalid("jointConstraints.chain"));
        }
        let mut current = Some(head);
        while let Some(i) = current {
            if preserved.contains(&t.nodes[i].name)
                || curls.contains_key(&i)
                || a.corrections.contains_key(&t.nodes[i].name)
            {
                return Err(invalid("jointConstraints.ownership"));
            }
            current = t.nodes[i].parent.filter(|p| t.nodes[*p].is_bone);
        }
        let mut nv = vec![];
        let mut hv = vec![];
        let mut corrected = 0;
        let mut maximum: f64 = 0.;
        let mut residual: f64 = 0.;
        let mut residual_frame: Option<usize> = None;
        let original_neck = &rotations.iter().find(|(i, _)| *i == neck).unwrap().1;
        let original_head = &rotations.iter().find(|(i, _)| *i == head).unwrap().1;
        for frame in 0..samples {
            checkpoint(cancel)?;
            let neck = read(original_neck, frame);
            let head = read(original_head, frame);
            let intended = norm(mul(neck, head));
            let mut n = constrain(neck, nr, h.transition_degrees);
            let mut hq = constrain(norm(mul(inv(n), intended)), hr, h.transition_degrees);
            for _ in 0..64 {
                checkpoint(cancel)?;
                if angle(mul(n, hq), intended) < 1e-7 {
                    break;
                }
                n = constrain(norm(mul(intended, inv(hq))), nr, 0.);
                hq = constrain(norm(mul(inv(n), intended)), hr, 0.);
            }
            let correction = angle(neck, n).max(angle(head, hq)).to_degrees();
            let remaining = angle(mul(n, hq), intended).to_degrees();
            if correction > 1e-4 {
                corrected += 1;
            }
            maximum = maximum.max(correction);
            if remaining > residual {
                residual = remaining;
                residual_frame = Some(frame);
            }
            nv.extend(n);
            hv.extend(hq);
        }
        rotations.iter_mut().find(|(i, _)| *i == neck).unwrap().1 = nv;
        rotations.iter_mut().find(|(i, _)| *i == head).unwrap().1 = hv;
        report.insert("jointConstraints".into(),json!({"neck":h.neck,"head":h.head,"correctedSamples":corrected,"maximumCorrectionDegrees":maximum,"maximumResidualDegrees":residual,"maximumResidualFrame":residual_frame}));
    }
    if let Some(e) = &a.recovery {
        if e.peak_frame >= samples
            || e.hold_through_frame < e.peak_frame
            || e.return_by_frame <= e.hold_through_frame
            || e.return_by_frame >= samples
            || job
                .options
                .get("scaleTransfer")
                .and_then(Value::as_array)
                .is_some_and(|v| !v.is_empty())
        {
            return Err(invalid("poseRecovery"));
        }
        for (i, values) in rotations.iter_mut() {
            let peak = read(values, e.peak_frame);
            for frame in e.peak_frame + 1..samples {
                checkpoint(cancel)?;
                let q = if frame <= e.hold_through_frame {
                    peak
                } else if frame <= e.return_by_frame {
                    norm(slerp(
                        peak,
                        tr[*i].quaternion,
                        (frame - e.hold_through_frame) as f64
                            / (e.return_by_frame - e.hold_through_frame) as f64,
                    ))
                } else {
                    tr[*i].quaternion
                };
                for k in 0..4 {
                    values[frame * 4 + k] = q[k];
                }
            }
        }
        for (i, values) in positions.iter_mut() {
            let peak: V = std::array::from_fn(|k| values[e.peak_frame * 3 + k]);
            for frame in e.peak_frame + 1..samples {
                checkpoint(cancel)?;
                let alpha = if frame <= e.hold_through_frame {
                    0.
                } else {
                    ((frame - e.hold_through_frame) as f64
                        / (e.return_by_frame - e.hold_through_frame) as f64)
                        .min(1.)
                };
                for k in 0..3 {
                    values[frame * 3 + k] = peak[k] + (tr[*i].position[k] - peak[k]) * alpha;
                }
            }
        }
    }
    for (name, c) in &a.corrections {
        let i = bone(t, name)?;
        let (_, values) = rotations
            .iter_mut()
            .find(|(n, _)| *n == i)
            .ok_or_else(|| invalid("localReferenceCorrections.track"))?;
        let offset = norm(mul(norm(c.to), inv(norm(c.from))));
        for frame in 0..samples {
            checkpoint(cancel)?;
            let q = norm(mul(offset, read(values, frame)));
            for k in 0..4 {
                values[frame * 4 + k] = q[k];
            }
        }
    }
    if !a.twist.is_empty() {
        if job.options.get("alignMappedBoneDirections") != Some(&json!(false))
            || job.options.get("interpolation") != Some(&json!("step"))
            || a.recovery.is_some()
            || a.head.is_some()
            || !a.corrections.is_empty()
            || job.options.contains_key("naturalMotion")
            || a.twist
                .iter()
                .any(|p| preserved.contains(&p.forearm) || preserved.contains(&p.hand))
        {
            return Err(invalid("forearmTwist.conflict"));
        }
        let mut reports = vec![];
        let mut replacements = vec![];
        for p in &a.twist {
            checkpoint(cancel)?;
            let arm = bone(t, &p.forearm)?;
            let hand = bone(t, &p.hand)?;
            if t.nodes[hand].parent != Some(arm)
                || t.nodes
                    .iter()
                    .any(|n| n.parent == Some(arm) && n.name != p.hand)
                || positions.iter().any(|(i, _)| *i == hand)
            {
                return Err(invalid("forearmTwist.chain"));
            }
            let mut current = Some(hand);
            while let Some(i) = current {
                let s = tr[i].scale;
                if s[0] <= 0. || (s[0] - s[1]).abs() > 1e-8 || (s[0] - s[2]).abs() > 1e-8 {
                    return Err(invalid("forearmTwist.scale"));
                }
                current = t.nodes[i].parent;
            }
            if dot(tr[hand].position, tr[hand].position) < 1e-12 {
                return Err(invalid("forearmTwist.axis"));
            }
            let axis = unit(tr[hand].position);
            let reference = norm(tr[hand].quaternion);
            let reference_axis = rotate(inv(reference), axis);
            let av = &rotations
                .iter()
                .find(|(i, _)| *i == arm)
                .ok_or_else(|| invalid("forearmTwist.track"))?
                .1;
            let hv = &rotations
                .iter()
                .find(|(i, _)| *i == hand)
                .ok_or_else(|| invalid("forearmTwist.track"))?
                .1;
            let (mut ar, mut hr) = (vec![], vec![]);
            let mut previous: Option<f64> = None;
            let mut maximum: f64 = 0.;
            for frame in 0..samples {
                checkpoint(cancel)?;
                let arm = read(av, frame);
                let hand = read(hv, frame);
                let mut delta = norm(mul(inv(reference), hand));
                if delta[3] < 0. {
                    delta = delta.map(|v| -v);
                }
                let projected = dot([delta[0], delta[1], delta[2]], reference_axis);
                if libm::hypot(projected, delta[3]) < 1e-8 {
                    return Err(invalid("forearmTwist.singularity"));
                }
                let mut angle = 2. * libm::atan2(projected, delta[3]);
                if let Some(old) = previous {
                    angle += libm::floor((old - angle) / (2. * std::f64::consts::PI) + 0.5)
                        * 2.
                        * std::f64::consts::PI;
                }
                previous = Some(angle);
                let transfer = axis_angle(axis, angle * p.share);
                append(&mut ar, norm(mul(arm, transfer)));
                append(&mut hr, norm(mul(inv(transfer), hand)));
                maximum = maximum.max((angle * p.share).to_degrees().abs());
            }
            let closed = |v: &[f64]| angle(read(v, 0), read(v, samples - 1)) < 1e-5;
            if samples > 1 && closed(av) && closed(hv) && (!closed(&ar) || !closed(&hr)) {
                return Err(invalid("forearmTwist.seam"));
            }
            replacements.push((arm, ar));
            replacements.push((hand, hr));
            reports.push(json!({"forearm":p.forearm,"hand":p.hand,"share":p.share,"axis":axis,"referenceRotation":reference,"maximumTransferredDegrees":maximum}));
        }
        for (i, v) in replacements {
            *rotations.iter_mut().find(|(n, _)| *n == i).unwrap() = (i, v);
        }
        report.insert("forearmTwist".into(), json!(reports));
    }
    if let Some(p) = &a.ranges {
        let mut issues: Vec<Value> = vec![];
        for j in &p.joints {
            bone(t, &j.bone)?;
        }
        for frame in 0..samples {
            checkpoint(cancel)?;
            for j in &p.joints {
                let i = bone(t, &j.bone)?;
                let q = rotations
                    .iter()
                    .find(|(n, _)| *n == i)
                    .map_or(tr[i].quaternion, |(_, v)| read(v, frame));
                let values = measured(j, q);
                for (k, (component, limits)) in [
                    ("flexion", j.flexion_degrees),
                    ("lateral", j.lateral_degrees),
                    ("twist", j.twist_degrees),
                    ("swing", [0., j.maximum_swing_degrees]),
                ]
                .iter()
                .enumerate()
                {
                    let v = values[k];
                    let excess = (limits[0] - v).max(v - limits[1]);
                    if excess <= 1e-4 {
                        continue;
                    }
                    if let Some(prior) = issues
                        .iter_mut()
                        .find(|x| x["bone"] == j.bone && x["component"] == *component)
                    {
                        prior["lastFrame"] = json!(frame);
                        prior["samples"] = json!(prior["samples"].as_u64().unwrap() + 1);
                        if excess > prior["excessDegrees"].as_f64().unwrap() {
                            prior["worstFrame"] = json!(frame);
                            prior["worstDegrees"] = json!(v);
                            prior["excessDegrees"] = json!(excess);
                        }
                    } else {
                        issues.push(json!({"bone":j.bone,"component":component,"limits":limits,"firstFrame":frame,"lastFrame":frame,"worstFrame":frame,"worstDegrees":v,"excessDegrees":excess,"samples":1}));
                    }
                }
            }
        }
        let clip = job
            .options
            .get("clipName")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(if job.clip.name.is_empty() {
                "retargeted_clip"
            } else {
                &job.clip.name
            });
        if let Some(first) = issues.first().filter(|_| p.policy == "reject") {
            return Err(sampler::error(
                "ADVANCED_INPUT_INVALID",
                "poseRanges.reject",
                &format!(
                    "{}: {} body-range flags; {} {} {:.1}° at frame {} (range {} to {}°)",
                    clip,
                    issues.len(),
                    first["bone"].as_str().unwrap_or(""),
                    first["component"].as_str().unwrap_or(""),
                    first["worstDegrees"].as_f64().unwrap_or(0.),
                    first["worstFrame"],
                    first["limits"][0],
                    first["limits"][1]
                ),
            ));
        }
        report.insert("poseRanges".into(),json!({"profile":p.id,"clip":clip,"status":if issues.is_empty(){"within-profile"}else{"review-required"},"sampleCount":samples,"checkedJoints":p.joints.len(),"issues":issues}));
    }
    Ok(report)
}

pub fn bake_advanced_v1(
    request: &BakeRequestV1,
    cancelled: impl Fn() -> bool,
) -> crate::baker::BakeResponseV1 {
    crate::baker::advanced_bake(request, &cancelled)
}
pub fn bake_advanced_json_v1(input: &str) -> String {
    let result = if input.len() > sampler::MAX_JSON_BYTES {
        Err(sampler::error(
            "BAKE_INPUT_LIMIT",
            "$",
            "Portable JSON exceeds 16 MiB.",
        ))
    } else {
        serde_json::from_str::<BakeRequestV1>(input)
            .map_err(|_| invalid("$"))
            .map(|r| bake_advanced_v1(&r, || false))
    };
    let response = match result {
        Ok(r) => r,
        Err(e) => crate::baker::advanced_error(e),
    };
    serde_json::to_string(&response).expect("validated advanced output")
}
#[cfg(all(target_arch = "wasm32", feature = "advanced-bake"))]
#[wasm_bindgen::prelude::wasm_bindgen(js_name=bake_advanced_json_v1)]
pub fn wasm_bake_advanced_json_v1(input: &str) -> String {
    bake_advanced_json_v1(input)
}

#[cfg(all(target_arch = "wasm32", feature = "advanced-bake"))]
#[wasm_bindgen::prelude::wasm_bindgen(js_name=bake_with_progress_json_v1)]
pub fn wasm_bake_with_progress_json_v1(input: &str, progress: &js_sys::Function) -> String {
    use std::cell::Cell;
    let failed = Cell::new(false);
    let result = if input.len() > sampler::MAX_JSON_BYTES {
        Err(sampler::error(
            "BAKE_INPUT_LIMIT",
            "$",
            "Portable JSON exceeds 16 MiB.",
        ))
    } else {
        serde_json::from_str::<BakeRequestV1>(input)
            .map_err(|_| invalid("$"))
            .map(|request| {
                crate::baker::advanced_bake_progress(&request, &|| failed.get(), &|done, total| {
                    if progress
                        .call2(
                            &wasm_bindgen::JsValue::NULL,
                            &wasm_bindgen::JsValue::from_f64(done as f64),
                            &wasm_bindgen::JsValue::from_f64(total as f64),
                        )
                        .is_err()
                    {
                        failed.set(true);
                    }
                })
            })
    };
    serde_json::to_string(&result.unwrap_or_else(crate::baker::advanced_error))
        .expect("validated advanced output")
}
