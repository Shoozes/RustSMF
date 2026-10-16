//! Endpoint blend, constrained rebake and final independent residual checks.
use crate::advanced::{checkpoint, invalid};
use crate::bake_math::*;
use crate::sampler::{BakeRequestV1, Checked, ClipJobV1, ClipV1, TrackV1, TransformV1};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PoseSpec {
    target_clip: String,
    target_frame: usize,
    root_offset: V,
    root_yaw_degrees: Option<f64>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct End {
    target_clip: String,
    target_frame: usize,
    root_offset: V,
    root_yaw_degrees: Option<f64>,
    span_frames: usize,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Intermediate {
    target_clip: String,
    target_frame: usize,
    root_offset: V,
    root_yaw_degrees: Option<f64>,
    frame: usize,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Envelope {
    entry: End,
    exit: End,
    intermediate_poses: Option<Vec<Intermediate>>,
}
fn spec(e: &End) -> PoseSpec {
    PoseSpec {
        target_clip: e.target_clip.clone(),
        target_frame: e.target_frame,
        root_offset: e.root_offset,
        root_yaw_degrees: e.root_yaw_degrees,
    }
}
fn validate(p: &PoseSpec) -> Checked<()> {
    if p.target_clip.trim().is_empty()
        || p.target_clip.encode_utf16().count() > 160
        || p.target_frame > 19999
        || p.root_offset
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 10000.)
        || p.root_yaw_degrees
            .is_some_and(|v| !v.is_finite() || v.abs() > 180.)
    {
        Err(invalid("endpointEnvelope.pose"))
    } else {
        Ok(())
    }
}
fn one(
    r: &BakeRequestV1,
    job: ClipJobV1,
    cancel: &impl Fn() -> bool,
) -> Checked<crate::baker::BakedClipV1> {
    let mut request = r.clone();
    request.clips = vec![job];
    let mut response = crate::baker::advanced_bake(&request, cancel);
    if let Some(error) = response.error {
        return Err(error);
    }
    Ok(response.clips.remove(0))
}
fn emit(
    poses: &[Vec<TransformV1>],
    r: &BakeRequestV1,
    times: &[f32],
    name: String,
    duration: f64,
) -> ClipV1 {
    let mut tracks = vec![];
    for i in &r.target.bones {
        let mut positions = vec![];
        let mut rotations = vec![];
        let mut scales = vec![];
        let mut previous: Option<Q> = None;
        for pose in poses {
            let p = &pose[*i];
            positions.extend(p.position.map(|v| v as f32));
            scales.extend(p.scale.map(|v| v as f32));
            let mut q = p.quaternion;
            if previous.is_some_and(|old| old.iter().zip(q).map(|(a, b)| a * b).sum::<f64>() < 0.) {
                q = q.map(|v| -v);
            }
            rotations.extend(q.map(|v| v as f32));
            previous = Some(q);
        }
        for (property, values) in [
            ("position", positions),
            ("quaternion", rotations),
            ("scale", scales),
        ] {
            tracks.push(TrackV1 {
                node: *i,
                name: Some(format!("{}.{}", r.target.nodes[*i].name, property)),
                bone_channel: Some(true),
                property: property.into(),
                interpolation: "step".into(),
                times: times.to_vec(),
                values,
            });
        }
    }
    ClipV1 {
        name,
        duration,
        blend_mode: 2500,
        tracks,
    }
}
pub(crate) fn bake(
    r: &BakeRequestV1,
    job: &ClipJobV1,
    envelope: &Envelope,
    cancel: &impl Fn() -> bool,
) -> Checked<crate::baker::BakedClipV1> {
    checkpoint(cancel)?;
    if job.options.get("sampleRateHz") != Some(&json!(60))
        || job.options.get("interpolation") != Some(&json!("step"))
        || ["poseRecovery", "jointConstraints"]
            .iter()
            .any(|k| job.options.contains_key(*k))
        || ["forearmTwist", "scaleTransfer"].iter().any(|k| {
            job.options
                .get(*k)
                .and_then(Value::as_array)
                .is_some_and(|v| !v.is_empty())
        })
        || job
            .options
            .get("localReferenceCorrections")
            .and_then(Value::as_object)
            .is_some_and(|v| !v.is_empty())
    {
        return Err(invalid("endpointEnvelope.conflict"));
    }
    let mut core = job.clone();
    for key in ["endpointEnvelope", "naturalMotion", "poseRanges"] {
        core.options.remove(key);
    }
    core.endpoint_target_clips.clear();
    let mut base = one(r, core, cancel)?;
    base.clip.name = job.clip.name.clone();
    let c = &base.clip;
    let count = (c.duration * 60.).round() as usize + 1;
    let t = &r.target;
    if envelope.entry.span_frames < 2
        || envelope.exit.span_frames < 2
        || envelope
            .entry
            .span_frames
            .saturating_add(envelope.exit.span_frames)
            >= count
        || count > 20000
        || count.saturating_mul(t.nodes.len()) > 200000
        || ((count as f64 - 1.) / 60. - c.duration).abs() > 1e-6
    {
        return Err(invalid("endpointEnvelope.windows"));
    }
    let times = &c
        .tracks
        .first()
        .ok_or_else(|| invalid("endpointEnvelope.tracks"))?
        .times;
    if times.len() != count
        || times.iter().enumerate().any(|(f, v)| {
            (*v as f64 - f as f64 / 60.).abs() > (f as f64 / 60.).max(1.) * 2f64.powi(-23)
        })
        || c.tracks.iter().any(|c| c.times != *times)
    {
        return Err(invalid("endpointEnvelope.grid"));
    }
    let roots: Vec<_> = t
        .bones
        .iter()
        .copied()
        .filter(|i| !t.nodes[*i].parent.is_some_and(|p| t.nodes[p].is_bone))
        .collect();
    if roots.len() != 1 {
        return Err(invalid("endpointEnvelope.root"));
    }
    let root = roots[0];
    let tr: Vec<_> = t
        .nodes
        .iter()
        .map(|n| TransformV1 {
            position: n.position,
            quaternion: n.quaternion,
            scale: n.scale,
        })
        .collect();
    let tw = worlds(t, &tr);
    for i in &t.bones {
        let mut node = Some(*i);
        while let Some(i) = node {
            checkpoint(cancel)?;
            let s = tr[i].scale;
            if s[0] <= 0. || (s[0] - s[1]).abs() > 1e-6 || (s[0] - s[2]).abs() > 1e-6 {
                return Err(invalid("endpointEnvelope.scale"));
            }
            node = t.nodes[i].parent;
        }
    }
    let parent = t.nodes[root].parent.map(|p| tw[p]).unwrap_or_else(|| {
        crate::sampler::matrix(&TransformV1 {
            position: [0.; 3],
            quaternion: ID,
            scale: [1.; 3],
        })
    });
    let inverse_parent = inverse_affine(parent);
    let offset = |v: V| {
        [
            inverse_parent[0] * v[0] + inverse_parent[4] * v[1] + inverse_parent[8] * v[2],
            inverse_parent[1] * v[0] + inverse_parent[5] * v[1] + inverse_parent[9] * v[2],
            inverse_parent[2] * v[0] + inverse_parent[6] * v[1] + inverse_parent[10] * v[2],
        ]
    };
    let endpoint = |p: PoseSpec| -> Checked<Vec<TransformV1>> {
        validate(&p)?;
        let matches: Vec<_> = job
            .endpoint_target_clips
            .iter()
            .filter(|c| c.name == p.target_clip)
            .collect();
        if matches.len() != 1 {
            return Err(crate::sampler::error(
                "ADVANCED_INPUT_INVALID",
                "endpointEnvelope.targetClip",
                &format!(
                    "Missing or ambiguous target endpoint clip {}.",
                    p.target_clip
                ),
            ));
        }
        let mut pose =
            crate::natural::pose_at(matches[0], t, &tr, p.target_frame as f64 / 60., cancel)?;
        if let Some(yaw) = p.root_yaw_degrees.filter(|v| *v != 0.) {
            let angle = yaw.to_radians();
            let c = libm::cos(angle);
            let s = libm::sin(angle);
            let yaw = [c, 0., -s, 0., 0., 1., 0., 0., s, 0., c, 0., 0., 0., 0., 1.];
            let local = crate::sampler::multiply(
                &crate::sampler::multiply(
                    &crate::sampler::multiply(&inverse_parent, &yaw),
                    &parent,
                ),
                &crate::sampler::matrix(&pose[root]),
            );
            pose[root].position = point(local);
            pose[root].quaternion = norm(decompose_q(local));
        }
        pose[root].position = add(pose[root].position, offset(p.root_offset));
        Ok(pose)
    };
    let entry = endpoint(spec(&envelope.entry))?;
    let exit = endpoint(spec(&envelope.exit))?;
    let height = job
        .options
        .get("naturalMotion")
        .and_then(|v| v.get("grounding"))
        .and_then(|v| v.get(&job.clip.name))
        .and_then(|v| v.get("rootHeightOffset"))
        .and_then(Value::as_f64)
        .unwrap_or(0.);
    let keys = if let Some(intermediate) = &envelope.intermediate_poses {
        if intermediate.is_empty() || intermediate.len() > 128 || height != 0. {
            return Err(invalid("endpointEnvelope.intermediate"));
        }
        let mut keys = vec![(0, entry.clone())];
        for (index, p) in intermediate.iter().enumerate() {
            if p.frame < envelope.entry.span_frames
                || p.frame >= count - envelope.exit.span_frames
                || index > 0 && p.frame <= intermediate[index - 1].frame
            {
                return Err(invalid("endpointEnvelope.intermediate.frame"));
            }
            keys.push((
                p.frame,
                endpoint(PoseSpec {
                    target_clip: p.target_clip.clone(),
                    target_frame: p.target_frame,
                    root_offset: p.root_offset,
                    root_yaw_degrees: p.root_yaw_degrees,
                })?,
            ));
        }
        keys.push((count - 1, exit.clone()));
        Some(keys)
    } else {
        None
    };
    let mut poses = vec![];
    for frame in 0..count {
        checkpoint(cancel)?;
        let mut pose = crate::natural::pose_at(c, t, &tr, frame as f64 / 60., cancel)?;
        pose[root].position = add(pose[root].position, offset([0., height, 0.]));
        if let Some(keys) = &keys {
            let index = keys
                .iter()
                .position(|p| p.0 >= frame)
                .unwrap_or(keys.len() - 1)
                .max(1);
            let (af, a) = &keys[index - 1];
            let (bf, b) = &keys[index];
            let alpha = (frame - af) as f64 / (bf - af) as f64;
            let w = alpha * alpha * (3. - 2. * alpha);
            for i in &t.bones {
                pose[*i].position = add(
                    a[*i].position,
                    scale(sub(b[*i].position, a[*i].position), w),
                );
                pose[*i].quaternion = norm(slerp(a[*i].quaternion, b[*i].quaternion, w));
            }
        }
        let entering = frame < envelope.entry.span_frames;
        let leaving = frame >= count - envelope.exit.span_frames;
        if entering || leaving {
            let alpha = if entering {
                1. - frame as f64 / (envelope.entry.span_frames - 1) as f64
            } else {
                (frame - (count - envelope.exit.span_frames)) as f64
                    / (envelope.exit.span_frames - 1) as f64
            };
            let w = alpha * alpha * (3. - 2. * alpha);
            let target = if entering { &entry } else { &exit };
            for i in &t.bones {
                pose[*i].position = add(
                    pose[*i].position,
                    scale(sub(target[*i].position, pose[*i].position), w),
                );
                pose[*i].quaternion = norm(slerp(pose[*i].quaternion, target[*i].quaternion, w));
            }
        }
        poses.push(pose);
    }
    let blended = emit(&poses, r, times, job.clip.name.clone(), c.duration);
    let map: BTreeMap<_, _> = t
        .bones
        .iter()
        .map(|i| {
            let name = t.nodes[*i].name.clone();
            (name.clone(), name)
        })
        .collect();
    let mut request = r.clone();
    request.source = t.clone();
    request.mapping = map.clone();
    request.mapping_details = Some(crate::RigMapV1 {
        ok: true,
        map,
        decisions: t
            .bones
            .iter()
            .map(|i| {
                let name = t.nodes[*i].name.clone();
                crate::MapDecisionV1 {
                    source: name.clone(),
                    target: name.clone(),
                    canonical: crate::role(&name, crate::ConventionV1::Auto),
                    method: "manual".into(),
                    confidence: 1.,
                }
            })
            .collect(),
        diagnostics: vec![],
        source_up: None,
        target_up: None,
        up_correction: None,
        source_lateral: None,
        target_lateral: None,
        orientation_correction: None,
    });
    let mut options = BTreeMap::from([
        ("applyUpCorrection".into(), json!(false)),
        ("alignMappedBoneDirections".into(), json!(false)),
        ("scaleRootMotion".into(), json!(false)),
        ("sampleRateHz".into(), json!(60)),
        ("interpolation".into(), json!("step")),
        (
            "sourceReferencePose".into(),
            json!(if job.target_reference_clip.is_some() {
                "clip"
            } else {
                "rest"
            }),
        ),
    ]);
    for key in ["clipName", "nextDownRationalTimes", "poseRanges"] {
        if let Some(v) = job.options.get(key) {
            options.insert(key.into(), v.clone());
        }
    }
    if let Some(natural) = job.options.get("naturalMotion") {
        let mut natural = natural.clone();
        natural
            .as_object_mut()
            .ok_or_else(|| invalid("naturalMotion"))?
            .remove("torso");
        if let Some(ground) = natural
            .get_mut("grounding")
            .and_then(|g| g.get_mut(&job.clip.name))
        {
            ground["rootHeightOffset"] = json!(0);
        }
        options.insert("naturalMotion".into(), natural);
    }
    let constrained = ClipJobV1 {
        clip: blended,
        options,
        source_reference_clip: job.target_reference_clip.clone(),
        target_reference_clip: job.target_reference_clip.clone(),
        endpoint_target_clips: vec![],
    };
    let mut result = one(&request, constrained, cancel)?;
    let mut final_poses = vec![];
    for frame in 0..count {
        checkpoint(cancel)?;
        final_poses.push(crate::natural::pose_at(
            &result.clip,
            t,
            &tr,
            frame as f64 / 60.,
            cancel,
        )?);
    }
    let residual = |actual: &[TransformV1], wanted: &[TransformV1]| -> Value {
        let a = worlds(t, actual);
        let b = worlds(t, wanted);
        let mut distance: f64 = 0.;
        let mut degrees: f64 = 0.;
        let mut position_bone = "";
        let mut rotation_bone = "";
        for i in &t.bones {
            let d = length(sub(point(a[*i]), point(b[*i])));
            let angle = angle(norm(decompose_q(a[*i])), norm(decompose_q(b[*i]))).to_degrees();
            if d > distance {
                distance = d;
                position_bone = &t.nodes[*i].name;
            }
            if angle > degrees {
                degrees = angle;
                rotation_bone = &t.nodes[*i].name;
            }
        }
        json!({"maximumPosition":distance,"positionBone":position_bone,"maximumDegrees":degrees,"rotationBone":rotation_bone})
    };
    let entry = residual(&final_poses[0], &entry);
    let exit = residual(final_poses.last().unwrap(), &exit);
    if [&entry, &exit].iter().any(|r| {
        r["maximumPosition"].as_f64().unwrap() > 1e-5
            || r["maximumDegrees"].as_f64().unwrap() > 0.001
    }) {
        return Err(invalid("endpointEnvelope.constraintConflict"));
    }
    result.report.advanced.insert(
        "endpointEnvelope".into(),
        json!({"status":"matched","entry":entry,"exit":exit}),
    );
    result.clip = emit(
        &final_poses,
        r,
        &result.clip.tracks[0].times,
        result.clip.name.clone(),
        result.clip.duration,
    );
    Ok(result)
}
