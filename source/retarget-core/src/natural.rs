//! Target-length natural motion math, independent of scenes and file I/O.
use crate::advanced::{checkpoint, invalid};
use crate::bake_math::*;
use crate::sampler::{BakeRequestV1, Checked, TransformV1};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
const EPS: f64 = 1e-10;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Leg {
    hip: String,
    knee: String,
    ankle: String,
    sole_offset: V,
    pole: V,
    min_bend_degrees: f64,
    max_bend_degrees: f64,
    max_pelvis_correction: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Torso {
    target_bones: Vec<String>,
    weights: Option<Vec<f64>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ground {
    stride_scale: f64,
    root_height_offset: f64,
    ground_height: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Limits {
    maximum_forward_degrees: f64,
    maximum_backward_degrees: f64,
    maximum_lateral_degrees: f64,
    minimum_swing_bend_degrees: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Patch {
    #[serde(skip_serializing_if = "Option::is_none")]
    bone: Option<String>,
    point: V,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Contact {
    foot: String,
    start_frame: usize,
    end_frame: usize,
    blend_frames: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    position_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    orientation_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contact_point: Option<V>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contact_bone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contact_patch: Option<Vec<Patch>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    anchor_frame: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blend_in_frames: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blend_out_frames: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wrap_to_start: Option<bool>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Swing {
    foot: String,
    start_frame: usize,
    end_frame: usize,
    start_anchor_frame: usize,
    end_anchor_frame: usize,
    start_grounded: bool,
    end_grounded: bool,
    lift: f64,
    descendant_rotations: Option<bool>,
    travel_power: Option<f64>,
    lateral_offset: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Profile {
    leg_orientation: Option<String>,
    grounding: Option<BTreeMap<String, Ground>>,
    reach_transfer: Option<String>,
    torso: Option<Torso>,
    legs: BTreeMap<String, Leg>,
    contacts: Option<BTreeMap<String, Vec<Contact>>>,
    root_travel_per_frame: Option<BTreeMap<String, V>>,
    root_travel_samples: Option<BTreeMap<String, Vec<V>>>,
    swing_trajectories: Option<BTreeMap<String, Vec<Swing>>>,
    leg_motion_limits: Option<BTreeMap<String, Limits>>,
}
#[derive(Clone)]
struct PreparedLeg {
    profile: Leg,
    source: [usize; 3],
    target: [usize; 3],
    first: f64,
    second: f64,
    source_reach: f64,
    source_bend: f64,
    target_bend: f64,
    reach: V,
    local: [V; 2],
    plane: V,
    sole: V,
    previous_plane: V,
    min: f64,
    max: f64,
}
struct PreparedContact {
    spec: Contact,
    report: Value,
    pin: Option<(V, Q)>,
    offsets: Option<Vec<V>>,
    patch: Option<Vec<Vec<V>>>,
    opening: Option<usize>,
}
fn validate_anchor_storage(
    samples: usize,
    bones: usize,
    contacts: &[PreparedContact],
) -> Checked<()> {
    let point_samples = contacts.iter().fold(0usize, |total, c| {
        let points = usize::from(c.spec.contact_bone.is_some())
            + c.spec.contact_patch.as_ref().map_or(0, Vec::len);
        total.saturating_add(samples.saturating_mul(points))
    });
    if samples.saturating_mul(bones) > 200000 || point_samples > 200000 {
        Err(invalid("naturalMotion.anchor.limit"))
    } else {
        Ok(())
    }
}
struct PreparedSwing {
    spec: Swing,
    start: (V, Q),
    end: (V, Q),
    descendants: Vec<(usize, Q, Q)>,
    report: Value,
}
pub(crate) struct Natural {
    profile: Profile,
    clip: String,
    pelvis: usize,
    source_pelvis: usize,
    torso: Vec<usize>,
    weights: Vec<f64>,
    terminal: Option<usize>,
    legs: Vec<PreparedLeg>,
    contacts: Vec<PreparedContact>,
    swings: Vec<PreparedSwing>,
    limit_report: Value,
}
pub(crate) struct Frame {
    pub rotations: HashMap<usize, Q>,
    pub foot_corrections: HashMap<usize, Q>,
    pub root: V,
    pub root_authored: bool,
    pub descendant_rotations: HashMap<usize, Q>,
}
fn bone(s: &crate::SkeletonSnapshotV1, name: &str) -> Checked<usize> {
    s.bones
        .iter()
        .copied()
        .find(|i| s.nodes[*i].name == name)
        .ok_or_else(|| invalid("naturalMotion.bone"))
}
fn descendant(s: &crate::SkeletonSnapshotV1, mut i: usize, a: usize) -> bool {
    while let Some(p) = s.nodes[i].parent.filter(|p| s.nodes[*p].is_bone) {
        if p == a {
            return true;
        }
        i = p;
    }
    false
}
fn vangle(a: V, b: V) -> f64 {
    let d = libm::sqrt(dot(a, a) * dot(b, b));
    if d == 0. {
        std::f64::consts::FRAC_PI_2
    } else {
        libm::acos((dot(a, b) / d).clamp(-1., 1.))
    }
}
fn frame_q(primary: V, plane: V) -> Checked<Q> {
    let x = unit(primary);
    let y = sub(plane, scale(x, dot(plane, x)));
    if dot(x, x) <= EPS || dot(y, y) <= EPS {
        return Err(invalid("naturalMotion.frame"));
    }
    let y = unit(y);
    let z = unit(crate::cross(x, y));
    Ok(norm(rotation([
        x[0], x[1], x[2], 0., y[0], y[1], y[2], 0., z[0], z[1], z[2], 0., 0., 0., 0., 1.,
    ])))
}
fn align(reference: V, reference_plane: V, solved: V, plane: V, q: Q) -> Checked<Q> {
    Ok(norm(mul(
        mul(
            frame_q(solved, plane)?,
            inv(frame_q(reference, reference_plane)?),
        ),
        q,
    )))
}
struct Solved {
    knee: V,
    ankle: V,
    bend: f64,
    residual: f64,
    clamped: bool,
    plane: V,
}
fn solve(leg: &PreparedLeg, hip: V, desired: V, knee: V, pole: V, min: f64) -> Checked<Solved> {
    let (previous, a, b, max) = (
        leg.previous_plane,
        leg.first,
        leg.second,
        leg.profile.max_bend_degrees,
    );
    if a <= EPS
        || b <= EPS
        || !min.is_finite()
        || !max.is_finite()
        || min < 0.
        || max >= 180.
        || min > max
    {
        return Err(invalid("naturalMotion.leg"));
    }
    let requested = sub(desired, hip);
    let requested_reach = length(requested);
    if requested_reach <= EPS {
        return Err(invalid("naturalMotion.collapsed"));
    }
    let direction = scale(requested, 1. / requested_reach);
    let reach = |angle: f64| {
        libm::sqrt((a * a + b * b + 2. * a * b * libm::cos(angle.to_radians())).max(0.))
    };
    let solved = requested_reach.clamp(reach(max), reach(min));
    let ankle = add(hip, scale(direction, solved));
    let along = (a * a - b * b + solved * solved) / (2. * solved);
    let perpendicular = libm::sqrt((a * a - along * along).max(0.));
    let mut pole = sub(pole, scale(direction, dot(pole, direction)));
    if dot(pole, pole) <= EPS && dot(previous, previous) > EPS {
        pole = crate::cross(previous, direction);
    }
    if dot(pole, pole) <= EPS {
        let k = sub(knee, hip);
        pole = sub(k, scale(direction, dot(k, direction)));
    }
    if dot(pole, pole) <= EPS {
        return Err(invalid("naturalMotion.pole"));
    }
    pole = unit(pole);
    let knee = add(
        add(hip, scale(direction, along)),
        scale(pole, perpendicular),
    );
    let mut plane = crate::cross(sub(knee, hip), sub(ankle, knee));
    if dot(plane, plane) <= EPS {
        plane = if dot(previous, previous) > EPS {
            previous
        } else {
            crate::cross(direction, pole)
        };
    }
    plane = unit(plane);
    let bend = 180.
        - libm::acos(((a * a + b * b - solved * solved) / (2. * a * b)).clamp(-1., 1.))
            .to_degrees();
    if !bend.is_finite() || ankle.iter().chain(knee.iter()).any(|v| !v.is_finite()) {
        return Err(invalid("naturalMotion.numeric"));
    }
    Ok(Solved {
        knee,
        ankle,
        bend,
        residual: length(sub(desired, ankle)),
        clamped: (solved - requested_reach).abs() > 1e-8,
        plane,
    })
}
fn ramp(c: &Contact) -> Checked<(usize, usize, usize, usize)> {
    let i = c.blend_in_frames.unwrap_or(c.blend_frames);
    let o = c.blend_out_frames.unwrap_or(c.blend_frames);
    let start = c.start_frame.saturating_add(i.saturating_sub(1));
    let end = c
        .end_frame
        .checked_sub(o.saturating_sub(1))
        .ok_or_else(|| invalid("naturalMotion.contact.ramp"))?;
    if end < start
        || c.anchor_frame.is_some_and(|a| {
            a < c.start_frame
                || a > c.end_frame
                || c.position_mode.as_deref() == Some("plane")
                || c.wrap_to_start == Some(true)
        })
    {
        return Err(invalid("naturalMotion.contact.ramp"));
    }
    Ok((i, o, start, end))
}
fn weight(c: &Contact, f: usize) -> f64 {
    let (i, o, _, _) = ramp(c).unwrap();
    if f < c.start_frame || f > c.end_frame {
        return 0.;
    }
    let x = if i == 0 {
        1.
    } else {
        (f - c.start_frame + 1) as f64 / i as f64
    };
    let y = if o == 0 {
        1.
    } else {
        (c.end_frame - f + 1) as f64 / o as f64
    };
    x.min(y).clamp(0., 1.)
}
fn heading(q: Q, reference: Q, previous: Q) -> Q {
    let d = norm(mul(q, inv(reference)));
    let h = [0., d[1], 0., d[3]];
    if h.iter().map(|v| v * v).sum::<f64>() < EPS {
        previous
    } else {
        norm(mul(norm(h), reference))
    }
}
fn orientation(c: &Contact, q: Q, reference: Q, previous: Q) -> Q {
    match c.orientation_mode.as_deref() {
        Some("animated") => q,
        Some("animated-heading") => heading(q, reference, previous),
        _ => reference,
    }
}
fn finite(v: V, limit: f64) -> bool {
    v.iter().all(|v| v.is_finite() && v.abs() <= limit)
}

pub(crate) fn prepare(
    profile: &Profile,
    ctx: &crate::advanced::BakeContext,
    cancel: &impl Fn() -> bool,
) -> Checked<Natural> {
    let (r, job, tw, reference, samples, root, occupied) = (
        ctx.request,
        ctx.job,
        ctx.target_world,
        ctx.source_reference,
        ctx.samples,
        ctx.root,
        ctx.curls,
    );
    let (s, t) = (&r.source, &r.target);
    let clip = &job.clip.name;
    let map_keys = |keys: Vec<&String>| -> Checked<()> {
        if keys.len() > 256
            || keys
                .iter()
                .any(|s| s.trim().is_empty() || s.encode_utf16().count() > 160)
        {
            Err(invalid("naturalMotion.clipNames"))
        } else {
            Ok(())
        }
    };
    if let Some(p) = &profile.contacts {
        map_keys(p.keys().collect())?;
    }
    if let Some(p) = &profile.grounding {
        map_keys(p.keys().collect())?;
    }
    if let Some(p) = &profile.root_travel_per_frame {
        map_keys(p.keys().collect())?;
    }
    if let Some(p) = &profile.root_travel_samples {
        map_keys(p.keys().collect())?;
    }
    if let Some(p) = &profile.leg_motion_limits {
        map_keys(p.keys().collect())?;
    }
    if let Some(all) = &profile.swing_trajectories {
        map_keys(all.keys().collect())?;
        if all.values().map(Vec::len).sum::<usize>() > 512 {
            return Err(invalid("naturalMotion.swings.limit"));
        }
        for list in all.values() {
            if list.is_empty() {
                return Err(invalid("naturalMotion.swings"));
            }
            for (index, s) in list.iter().enumerate() {
                checkpoint(cancel)?;
                if !["left", "right"].contains(&s.foot.as_str())
                    || [
                        s.start_frame,
                        s.end_frame,
                        s.start_anchor_frame,
                        s.end_anchor_frame,
                    ]
                    .iter()
                    .any(|v| *v > 19999)
                    || s.end_frame < s.start_frame.saturating_add(2)
                    || !s.lift.is_finite()
                    || s.lift < 0.
                    || s.lift > 10.
                    || s.travel_power
                        .is_some_and(|v| !v.is_finite() || !(1. ..=8.).contains(&v))
                    || s.lateral_offset
                        .is_some_and(|v| !v.is_finite() || v.abs() > 10.)
                    || list[..index].iter().any(|p| {
                        p.foot == s.foot
                            && ((p.descendant_rotations == Some(true))
                                != (s.descendant_rotations == Some(true))
                                || p.start_frame <= s.end_frame && s.start_frame <= p.end_frame)
                    })
                {
                    return Err(invalid("naturalMotion.swing"));
                }
            }
        }
    }
    let details = r.mapping_details.as_ref().unwrap();
    let source = |i: usize| -> Checked<usize> {
        let d = details
            .decisions
            .iter()
            .find(|d| d.target == t.nodes[i].name)
            .ok_or_else(|| invalid("naturalMotion.mapping"))?;
        bone(s, &d.source)
    };
    let hips = details
        .decisions
        .iter()
        .find(|d| d.canonical.as_deref() == Some("hips"))
        .ok_or_else(|| invalid("naturalMotion.hips"))?;
    let pelvis = bone(t, &hips.target)?;
    let source_pelvis = bone(s, &hips.source)?;
    let reference_mode = job
        .options
        .get("sourceReferencePose")
        .and_then(Value::as_str)
        .unwrap_or("rest");
    if root != Some(pelvis)
        || job.target_reference_clip.is_none()
        || !(reference_mode == "first-frame"
            || reference_mode == "clip" && job.source_reference_clip.is_some())
        || job
            .options
            .get("sampleRateHz")
            .is_some_and(|v| *v != json!(60))
    {
        return Err(invalid("naturalMotion.reference"));
    }
    if profile
        .leg_orientation
        .as_deref()
        .is_some_and(|v| !["animated", "calibrated"].contains(&v))
        || profile
            .reach_transfer
            .as_deref()
            .is_some_and(|v| !["reference-ratio", "calibrated-bend"].contains(&v))
        || profile.legs.len() != 2
    {
        return Err(invalid("naturalMotion.options"));
    }
    let mut reserved = HashSet::new();
    let mut reserve = |i: usize| -> Checked<()> {
        if occupied.contains_key(&i) || !reserved.insert(i) {
            Err(invalid("naturalMotion.ownership"))
        } else {
            Ok(())
        }
    };
    let mut torso = vec![];
    let mut weights = vec![];
    let mut terminal = None;
    if let Some(p) = &profile.torso {
        if p.target_bones.is_empty()
            || p.target_bones.len() > 2048
            || p.weights
                .as_ref()
                .is_some_and(|v| v.len() != p.target_bones.len())
        {
            return Err(invalid("naturalMotion.torso"));
        }
        for (n, name) in p.target_bones.iter().enumerate() {
            checkpoint(cancel)?;
            let i = bone(t, name)?;
            reserve(i)?;
            let parent = t.nodes[i]
                .parent
                .filter(|i| t.nodes[*i].is_bone)
                .ok_or_else(|| invalid("naturalMotion.torso.parent"))?;
            if n > 0 && parent != torso[n - 1] {
                return Err(invalid("naturalMotion.torso.chain"));
            }
            let len = length(sub(point(tw[i]), point(tw[parent])));
            let multiplier = p.weights.as_ref().map_or(1., |v| v[n]);
            if len <= EPS || !multiplier.is_finite() || multiplier < 0. {
                return Err(invalid("naturalMotion.torso.weights"));
            }
            torso.push(i);
            weights.push(len * multiplier);
        }
        let total: f64 = weights.iter().sum();
        if total <= EPS {
            return Err(invalid("naturalMotion.torso.weights"));
        }
        weights.iter_mut().for_each(|v| *v /= total);
        terminal = Some(source(*torso.last().unwrap())?);
    }
    let mut legs = vec![];
    for side in ["left", "right"] {
        checkpoint(cancel)?;
        let p = profile
            .legs
            .get(side)
            .ok_or_else(|| invalid("naturalMotion.legs"))?;
        let target = [bone(t, &p.hip)?, bone(t, &p.knee)?, bone(t, &p.ankle)?];
        for i in target {
            reserve(i)?;
        }
        if t.nodes[target[1]].parent != Some(target[0])
            || t.nodes[target[2]].parent != Some(target[1])
            || !finite(p.sole_offset, 10000.)
            || !finite(p.pole, 10000.)
            || !p.max_pelvis_correction.is_finite()
            || p.max_pelvis_correction < 0.
            || p.min_bend_degrees < 0.
            || p.max_bend_degrees >= 180.
            || p.min_bend_degrees > p.max_bend_degrees
        {
            return Err(invalid("naturalMotion.leg.calibration"));
        }
        let source = [source(target[0])?, source(target[1])?, source(target[2])?];
        let source_reach = length(sub(
            point(reference[source[2]]),
            point(reference[source[0]]),
        ));
        let source_bend = vangle(
            sub(point(reference[source[1]]), point(reference[source[0]])),
            sub(point(reference[source[2]]), point(reference[source[1]])),
        );
        let reach = sub(point(tw[target[2]]), point(tw[target[0]]));
        let first = sub(point(tw[target[1]]), point(tw[target[0]]));
        let second = sub(point(tw[target[2]]), point(tw[target[1]]));
        let mut plane = crate::cross(first, second);
        if dot(plane, plane) <= EPS {
            plane = crate::cross(unit(reach), rotate(decompose_q(tw[pelvis]), p.pole));
        }
        if source_reach <= EPS
            || dot(first, first) <= EPS
            || dot(second, second) <= EPS
            || dot(plane, plane) <= EPS
        {
            return Err(invalid("naturalMotion.leg.reference"));
        }
        if profile.reach_transfer.as_deref() == Some("calibrated-bend")
            && (source_bend < EPS || std::f64::consts::PI - source_bend < EPS)
        {
            return Err(invalid("naturalMotion.referenceBend"));
        }
        let plane = unit(plane);
        legs.push(PreparedLeg {
            profile: p.clone(),
            source,
            target,
            first: length(first),
            second: length(second),
            source_reach,
            source_bend,
            target_bend: vangle(first, second),
            reach,
            local: [
                unit(rotate(inv(decompose_q(tw[target[0]])), first)),
                unit(rotate(inv(decompose_q(tw[target[1]])), second)),
            ],
            plane,
            sole: add(
                point(tw[target[2]]),
                rotate(decompose_q(tw[target[2]]), p.sole_offset),
            ),
            previous_plane: plane,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
        });
    }
    if let Some(all) = &profile.grounding {
        if all.len() > 256
            || all.values().any(|g| {
                !g.stride_scale.is_finite()
                    || g.stride_scale <= 0.
                    || g.stride_scale > 4.
                    || !g.root_height_offset.is_finite()
                    || !g.ground_height.is_finite()
            })
        {
            return Err(invalid("naturalMotion.grounding"));
        }
    }
    if let Some(all) = &profile.root_travel_per_frame {
        if all.len() > 256 || all.values().any(|v| !finite(*v, 10000.)) {
            return Err(invalid("naturalMotion.rootTravel"));
        }
    }
    if let Some(all) = &profile.root_travel_samples {
        if all.len() > 256 || all.values().map(Vec::len).sum::<usize>() > 20000 {
            return Err(invalid("naturalMotion.rootTravelSamples"));
        }
        for (name, v) in all {
            if v.len() < 2
                || v[0] != [0.; 3]
                || v.iter().any(|v| !finite(*v, 10000.))
                || profile
                    .root_travel_per_frame
                    .as_ref()
                    .is_some_and(|p| p.contains_key(name))
                || !profile
                    .contacts
                    .as_ref()
                    .and_then(|c| c.get(name))
                    .is_some_and(|c| {
                        !c.is_empty() && c.iter().all(|c| c.wrap_to_start != Some(true))
                    })
            {
                return Err(invalid("naturalMotion.rootTravelSamples"));
            }
        }
        if let Some(v) = all.get(clip) {
            if v.len() != samples
                || job.options.get("sampleRateHz") != Some(&json!(60))
                || job.options.get("interpolation") != Some(&json!("step"))
            {
                return Err(invalid("naturalMotion.rootTravelSamples.grid"));
            }
        }
    }
    let specs = profile
        .contacts
        .as_ref()
        .and_then(|c| c.get(clip))
        .cloned()
        .unwrap_or_default();
    if specs.len() > 512 {
        return Err(invalid("naturalMotion.contacts"));
    }
    let mut contacts = vec![];
    for (index, c) in specs.iter().enumerate() {
        checkpoint(cancel)?;
        let side = match c.foot.as_str() {
            "left" => 0,
            "right" => 1,
            _ => return Err(invalid("naturalMotion.contact.foot")),
        };
        let leg = &legs[side];
        let (_, _, start, end) = ramp(c)?;
        if c.end_frame >= samples
            || c.position_mode
                .as_deref()
                .is_some_and(|v| !["planted", "plane"].contains(&v))
            || c.orientation_mode
                .as_deref()
                .is_some_and(|v| !["reference", "animated-heading", "animated"].contains(&v))
            || c.contact_point.is_some_and(|v| !finite(v, 10000.))
        {
            return Err(invalid("naturalMotion.contact"));
        }
        if let Some(name) = &c.contact_bone {
            if c.contact_point.is_none()
                || !descendant(t, bone(t, name)?, leg.target[2])
                || c.wrap_to_start == Some(true)
            {
                return Err(invalid("naturalMotion.contactBone"));
            }
        }
        if let Some(patch) = &c.contact_patch {
            if patch.len() < 2
                || patch.len() > 16
                || c.position_mode.as_deref() != Some("plane")
                || c.orientation_mode.as_deref() != Some("animated")
                || c.contact_point.is_some()
                || c.contact_bone.is_some()
                || c.anchor_frame.is_some()
                || c.wrap_to_start == Some(true)
            {
                return Err(invalid("naturalMotion.contactPatch"));
            }
            for p in patch {
                if !finite(p.point, 10000.)
                    || p.bone.as_ref().is_some_and(|name| {
                        bone(t, name).map_or(true, |i| !descendant(t, i, leg.target[2]))
                    })
                {
                    return Err(invalid("naturalMotion.contactPatch.bone"));
                }
            }
        }
        let opening = if c.wrap_to_start == Some(true) {
            let all: Vec<_> = specs
                .iter()
                .enumerate()
                .filter(|(_, v)| v.foot == c.foot && v.start_frame == 0)
                .collect();
            if all.len() != 1
                || c.start_frame == 0
                || c.end_frame != samples - 1
                || c.position_mode.as_deref() == Some("plane")
            {
                return Err(invalid("naturalMotion.contact.wrap"));
            }
            let (i, o) = all[0];
            if o.position_mode.as_deref() == Some("plane")
                || o.orientation_mode.as_deref().unwrap_or("reference")
                    != c.orientation_mode.as_deref().unwrap_or("reference")
                || o.contact_point.unwrap_or(leg.profile.sole_offset)
                    != c.contact_point.unwrap_or(leg.profile.sole_offset)
                || weight(o, 0) != 1.
                || weight(c, c.end_frame) != 1.
            {
                return Err(invalid("naturalMotion.contact.wrap"));
            }
            Some(i)
        } else {
            None
        };
        let mut report = serde_json::to_value(c).unwrap();
        for (k, v) in [
            ("clip", json!(clip)),
            ("fullWeightStartFrame", json!(start)),
            ("fullWeightEndFrame", json!(end)),
            ("maximumResidual", json!(0)),
            ("maximumResidualFrame", Value::Null),
            ("maximumPelvisCorrection", json!(0)),
            ("maximumPelvisCorrectionFrame", Value::Null),
            ("clampedSamples", json!(0)),
            ("unreachable", json!(false)),
        ] {
            report[k] = v;
        }
        if !profile
            .root_travel_samples
            .as_ref()
            .is_some_and(|p| p.contains_key(clip))
        {
            report["rootTravelPerFrame"] = json!(profile
                .root_travel_per_frame
                .as_ref()
                .and_then(|p| p.get(clip))
                .copied()
                .unwrap_or([0.; 3]));
        }
        contacts.push(PreparedContact {
            spec: c.clone(),
            report,
            pin: None,
            offsets: None,
            patch: None,
            opening,
        });
        let _ = index;
    }
    let limit = profile.leg_motion_limits.as_ref().and_then(|p| p.get(clip));
    if let Some(l) = limit {
        if [
            l.maximum_forward_degrees,
            l.maximum_backward_degrees,
            l.maximum_lateral_degrees,
        ]
        .iter()
        .any(|v| !v.is_finite() || *v < 0. || *v >= 90.)
            || !l.minimum_swing_bend_degrees.is_finite()
            || l.minimum_swing_bend_degrees < 0.
            || l.minimum_swing_bend_degrees >= 180.
        {
            return Err(invalid("naturalMotion.limits"));
        }
    }
    let limit_report=limit.map_or(Value::Null,|l|{let mut v=serde_json::to_value(l).unwrap();v["sides"]=json!({"left":{"constrainedSamples":0,"maximumRequestedForwardDegrees":0,"maximumRequestedBackwardDegrees":0,"maximumRequestedLateralDegrees":0},"right":{"constrainedSamples":0,"maximumRequestedForwardDegrees":0,"maximumRequestedBackwardDegrees":0,"maximumRequestedLateralDegrees":0}});v});
    Ok(Natural {
        profile: profile.clone(),
        clip: clip.clone(),
        pelvis,
        source_pelvis,
        torso,
        weights,
        terminal,
        legs,
        contacts,
        swings: vec![],
        limit_report,
    })
}
pub(crate) fn pose_at(
    c: &crate::sampler::ClipV1,
    t: &crate::SkeletonSnapshotV1,
    tr: &[TransformV1],
    time: f64,
    cancel: &impl Fn() -> bool,
) -> Checked<Vec<TransformV1>> {
    if time < 0. || time > c.duration + 1e-6 {
        return Err(invalid("targetPose.time"));
    }
    let mut local = tr.to_vec();
    for ch in &c.tracks {
        checkpoint(cancel)?;
        if ch.interpolation == "gltf-cubic-spline"
            || !t.bones.contains(&ch.node)
            || ch.bone_channel == Some(false)
            || ch.name.as_ref().is_some_and(|n| {
                n.rsplit('/').next()
                    != Some(format!("{}.{}", t.nodes[ch.node].name, ch.property).as_str())
            })
        {
            return Err(invalid("targetPose.binding"));
        }
        let v = sample(ch, c.duration.min((time as f32) as f64));
        match ch.property.as_str() {
            "position" => local[ch.node].position.copy_from_slice(&v),
            "quaternion" => local[ch.node].quaternion = v.try_into().unwrap(),
            "scale" => local[ch.node].scale.copy_from_slice(&v),
            _ => return Err(invalid("targetPose.channel")),
        }
    }
    for i in &t.bones {
        let p = &mut local[*i];
        if length(sub(p.scale, tr[*i].scale)) > 1e-6
            || p.scale.iter().any(|v| *v <= 0.)
            || t.nodes[*i].parent.is_some_and(|p| t.nodes[p].is_bone)
                && length(sub(p.position, tr[*i].position)) > 1e-6
            || (libm::sqrt(p.quaternion.iter().map(|v| v * v).sum()) - 1.).abs() > 1e-4
        {
            return Err(invalid("targetPose.transform"));
        }
        p.quaternion = norm(p.quaternion);
        p.scale = tr[*i].scale;
        if t.nodes[*i].parent.is_some_and(|p| t.nodes[p].is_bone) {
            p.position = tr[*i].position;
        }
    }
    Ok(local)
}
impl Natural {
    pub(crate) fn needs_anchors(&self) -> bool {
        self.contacts.iter().any(|c| {
            c.spec.anchor_frame.is_some()
                || c.spec.contact_bone.is_some()
                || c.spec.contact_patch.is_some()
        }) || self
            .profile
            .swing_trajectories
            .as_ref()
            .and_then(|p| p.get(&self.clip))
            .is_some_and(|s| !s.is_empty())
    }
    pub(crate) fn anchors(
        &mut self,
        base: &crate::sampler::ClipV1,
        t: &crate::SkeletonSnapshotV1,
        tr: &[TransformV1],
        tw: &[M],
        samples: usize,
        cancel: &impl Fn() -> bool,
    ) -> Checked<()> {
        validate_anchor_storage(samples, t.bones.len(), &self.contacts)?;
        let ground = self
            .profile
            .grounding
            .as_ref()
            .and_then(|g| g.get(&self.clip));
        let points = |ankle: usize, name: &str, point: V| -> Checked<Vec<V>> {
            let child = bone(t, name)?;
            (0..samples)
                .map(|frame| {
                    checkpoint(cancel)?;
                    let world = worlds(t, &pose_at(base, t, tr, frame as f64 / 60., cancel)?);
                    Ok(inverse_point(
                        world[ankle],
                        add(point_at(world[child], point), [0.; 3]),
                    ))
                })
                .collect()
        };
        for c in &mut self.contacts {
            let side = usize::from(c.spec.foot == "right");
            let leg = &self.legs[side];
            let ankle = leg.target[2];
            if let Some(name) = &c.spec.contact_bone {
                c.offsets = Some(points(ankle, name, c.spec.contact_point.unwrap())?);
            }
            if let Some(patch) = &c.spec.contact_patch {
                c.patch = Some(
                    patch
                        .iter()
                        .map(|p| {
                            if let Some(name) = &p.bone {
                                points(ankle, name, p.point)
                            } else {
                                Ok(vec![p.point; samples])
                            }
                        })
                        .collect::<Checked<_>>()?,
                );
            }
            if let Some(frame) = c.spec.anchor_frame {
                let world = worlds(t, &pose_at(base, t, tr, frame as f64 / 60., cancel)?);
                let offset = c
                    .offsets
                    .as_ref()
                    .map(|v| v[frame])
                    .or(c.spec.contact_point)
                    .unwrap_or(leg.profile.sole_offset);
                let mut sole = point_at(world[ankle], offset);
                sole[1] = ground.map_or(leg.sole[1], |g| g.ground_height);
                let q = orientation(
                    &c.spec,
                    norm(decompose_q(world[ankle])),
                    decompose_q(tw[ankle]),
                    decompose_q(tw[ankle]),
                );
                c.pin = Some((sole, q));
                c.report["anchorSolePoint"] = json!(sole);
                c.report["anchorFootQuaternion"] = json!(q);
            }
        }
        let all = self
            .profile
            .swing_trajectories
            .as_ref()
            .and_then(|p| p.get(&self.clip))
            .cloned()
            .unwrap_or_default();
        if all.len() > 512 {
            return Err(invalid("naturalMotion.swings.limit"));
        }
        for (index, spec) in all.iter().enumerate() {
            checkpoint(cancel)?;
            let side = match spec.foot.as_str() {
                "left" => 0,
                "right" => 1,
                _ => return Err(invalid("naturalMotion.swing.foot")),
            };
            let leg = &self.legs[side];
            if spec.end_frame < spec.start_frame.saturating_add(2)
                || [
                    spec.end_frame,
                    spec.start_anchor_frame,
                    spec.end_anchor_frame,
                ]
                .iter()
                .any(|v| *v >= samples)
                || !spec.lift.is_finite()
                || spec.lift < 0.
                || spec.lift > 10.
                || spec
                    .travel_power
                    .is_some_and(|v| !v.is_finite() || !(1. ..=8.).contains(&v))
                || spec
                    .lateral_offset
                    .is_some_and(|v| !v.is_finite() || v.abs() > 10.)
                || all[..index].iter().any(|p| {
                    p.foot == spec.foot
                        && ((p.descendant_rotations == Some(true))
                            != (spec.descendant_rotations == Some(true))
                            || p.start_frame <= spec.end_frame && spec.start_frame <= p.end_frame)
                })
            {
                return Err(invalid("naturalMotion.swing"));
            }
            let travel = self
                .profile
                .root_travel_samples
                .as_ref()
                .and_then(|p| p.get(&self.clip))
                .ok_or_else(|| invalid("naturalMotion.swing.rootTravel"))?;
            let anchor = |frame: usize, grounded: bool| -> Checked<(V, Q, Vec<TransformV1>)> {
                let pose = pose_at(base, t, tr, frame as f64 / 60., cancel)?;
                let world = worlds(t, &pose);
                let ankle = leg.target[2];
                let mut sole = point_at(world[ankle], leg.profile.sole_offset);
                let mut q = norm(decompose_q(world[ankle]));
                if grounded {
                    sole[1] = ground.map_or(leg.sole[1], |g| g.ground_height);
                    q = heading(q, decompose_q(tw[ankle]), decompose_q(tw[ankle]));
                }
                Ok((add(sole, travel[frame]), q, pose))
            };
            let (start, sq, sp) = anchor(spec.start_anchor_frame, spec.start_grounded)?;
            let (end, eq, ep) = anchor(spec.end_anchor_frame, spec.end_grounded)?;
            let descendants = if spec.descendant_rotations == Some(true) {
                t.bones
                    .iter()
                    .filter(|i| descendant(t, **i, leg.target[2]))
                    .map(|i| (*i, sp[*i].quaternion, ep[*i].quaternion))
                    .collect()
            } else {
                vec![]
            };
            self.swings.push(PreparedSwing{spec:spec.clone(),start:(start,sq),end:(end,eq),descendants,report:json!({"foot":spec.foot,"startFrame":spec.start_frame,"endFrame":spec.end_frame,"maximumResidual":0,"maximumResidualFrame":null})});
        }
        Ok(())
    }
    pub(crate) fn conflicts(
        &self,
        r: &BakeRequestV1,
        corrections: &BTreeMap<String, crate::advanced::Correction>,
        head: Option<(&str, &str)>,
    ) -> Checked<()> {
        let t = &r.target;
        for name in corrections.keys() {
            let i = bone(t, name)?;
            if self
                .legs
                .iter()
                .any(|l| l.target[2] == i || descendant(t, l.target[2], i))
            {
                return Err(invalid("naturalMotion.localReferenceCorrections"));
            }
        }
        if let Some((neck, head)) = head {
            for name in [neck, head] {
                let i = bone(t, name)?;
                if self.torso.contains(&i)
                    || self
                        .legs
                        .iter()
                        .any(|l| l.target[2] == i || descendant(t, l.target[2], i))
                {
                    return Err(invalid("naturalMotion.jointConstraints"));
                }
            }
        }
        Ok(())
    }
    pub(crate) fn frame(
        &mut self,
        ctx: &crate::advanced::BakeContext,
        aw: &[M],
        correction: Q,
        frame: usize,
        root: V,
        cancel: &impl Fn() -> bool,
    ) -> Checked<Frame> {
        let (r, tw, reference, animated) = (
            ctx.request,
            ctx.target_world,
            ctx.source_reference,
            ctx.animated,
        );
        let t = &r.target;
        let source = |i: usize| -> usize {
            let name = r
                .mapping
                .iter()
                .find(|(_, v)| **v == t.nodes[i].name)
                .unwrap()
                .0;
            bone(&r.source, name).unwrap()
        };
        let transfer = |target: usize| -> Q {
            let si = source(target);
            if !animated.contains(&si) {
                return decompose_q(tw[target]);
            }
            let delta = norm(mul(decompose_q(aw[si]), inv(decompose_q(reference[si]))));
            let delta = norm(mul(mul(correction, delta), inv(correction)));
            norm(mul(delta, decompose_q(tw[target])))
        };
        let pelvis = transfer(self.pelvis);
        let pelvis_delta = norm(mul(pelvis, inv(decompose_q(tw[self.pelvis]))));
        let mut rotations = HashMap::from([(self.pelvis, pelvis)]);
        let mut feet = HashMap::new();
        let mut descendants = HashMap::new();
        if let Some(terminal) = self.terminal {
            let articulation = mul(
                mul(
                    decompose_q(reference[self.source_pelvis]),
                    inv(decompose_q(aw[self.source_pelvis])),
                ),
                decompose_q(aw[terminal]),
            );
            let delta = norm(mul(articulation, inv(decompose_q(reference[terminal]))));
            let delta = norm(mul(mul(correction, delta), inv(correction)));
            let mut total = 0.;
            for (n, i) in self.torso.iter().enumerate() {
                total += self.weights[n];
                rotations.insert(
                    *i,
                    norm(mul(
                        mul(
                            mul(pelvis, inv(decompose_q(tw[self.pelvis]))),
                            slerp(ID, delta, total),
                        ),
                        decompose_q(tw[*i]),
                    )),
                );
            }
        }
        let ground = self
            .profile
            .grounding
            .as_ref()
            .and_then(|p| p.get(&self.clip));
        let mut root = root;
        if let Some(g) = ground {
            root[1] += g.root_height_offset;
        }
        struct LegFrame {
            hip: V,
            desired: V,
            natural_foot: Q,
            foot: Q,
            contact: Option<usize>,
            weight: f64,
            swing: Option<usize>,
            pole: V,
            min: f64,
        }
        let mut frames = vec![];
        let limits = self
            .profile
            .leg_motion_limits
            .as_ref()
            .and_then(|p| p.get(&self.clip));
        for side in 0..2 {
            checkpoint(cancel)?;
            let leg = &self.legs[side];
            let side_name = if side == 0 { "left" } else { "right" };
            let hip = add(
                rotate(
                    pelvis_delta,
                    sub(point(tw[leg.target[0]]), point(tw[self.pelvis])),
                ),
                root,
            );
            let source_hip = point(aw[leg.source[0]]);
            let source_reach = sub(point(aw[leg.source[2]]), source_hip);
            if dot(source_reach, source_reach) <= EPS {
                return Err(invalid("naturalMotion.collapsed"));
            }
            let ref_reach = sub(
                point(reference[leg.source[2]]),
                point(reference[leg.source[0]]),
            );
            let delta = norm(mul(
                mul(correction, between(unit(ref_reach), unit(source_reach))),
                inv(correction),
            ));
            let mut reach = scale(
                unit(rotate(delta, leg.reach)),
                length(leg.reach) * length(source_reach) / leg.source_reach,
            );
            if self.profile.reach_transfer.as_deref() == Some("calibrated-bend") {
                let first = sub(point(aw[leg.source[1]]), source_hip);
                let second = sub(point(aw[leg.source[2]]), point(aw[leg.source[1]]));
                if dot(first, first) <= EPS || dot(second, second) <= EPS {
                    return Err(invalid("naturalMotion.collapsed"));
                }
                let b = vangle(first, second);
                let mapped = if b <= leg.source_bend {
                    leg.target_bend * b / leg.source_bend
                } else {
                    leg.target_bend
                        + (std::f64::consts::PI - leg.target_bend) * (b - leg.source_bend)
                            / (std::f64::consts::PI - leg.source_bend)
                };
                let length = libm::sqrt(
                    (leg.first * leg.first
                        + leg.second * leg.second
                        + 2. * leg.first * leg.second * libm::cos(mapped))
                    .max(0.),
                );
                reach = scale(unit(reach), length);
            }
            if let Some(g) = ground {
                reach[2] *= g.stride_scale;
            }
            let contact = self.contacts.iter().position(|c| {
                c.spec.foot == side_name && frame >= c.spec.start_frame && frame <= c.spec.end_frame
            });
            let w = contact.map_or(0., |i| weight(&self.contacts[i].spec, frame));
            if let Some(l) = limits {
                let direction = unit(rotate(inv(pelvis), unit(reach)));
                let down = -direction[1];
                let sag = libm::atan2(direction[2], down).to_degrees();
                let lat = libm::atan2(direction[0], down).to_degrees();
                let sag_solved = sag.clamp(-l.maximum_backward_degrees, l.maximum_forward_degrees);
                let lat_solved = lat.clamp(-l.maximum_lateral_degrees, l.maximum_lateral_degrees);
                let constrained =
                    (sag_solved - sag).abs() > 1e-8 || (lat_solved - lat).abs() > 1e-8;
                let diag = &mut self.limit_report["sides"][side_name];
                for (k, v) in [
                    ("maximumRequestedForwardDegrees", sag),
                    ("maximumRequestedBackwardDegrees", -sag),
                    ("maximumRequestedLateralDegrees", lat.abs()),
                ] {
                    diag[k] = json!(diag[k].as_f64().unwrap().max(v));
                }
                let result = if constrained && w < 1. {
                    diag["constrainedSamples"] =
                        json!(diag["constrainedSamples"].as_u64().unwrap() + 1);
                    let bounded = unit([
                        libm::tan(lat_solved.to_radians()),
                        -1.,
                        libm::tan(sag_solved.to_radians()),
                    ]);
                    unit(rotate(
                        slerp(ID, between(direction, bounded), 1. - w),
                        direction,
                    ))
                } else {
                    direction
                };
                reach = scale(rotate(pelvis, result), length(reach));
            }
            let mut pole = rotate(pelvis, leg.profile.pole);
            if self.profile.leg_orientation.as_deref() == Some("animated") {
                let normal = crate::cross(
                    sub(point(aw[leg.source[1]]), source_hip),
                    sub(point(aw[leg.source[2]]), point(aw[leg.source[1]])),
                );
                if dot(normal, normal) > EPS {
                    let animated_pole = crate::cross(reach, rotate(correction, unit(normal)));
                    if dot(animated_pole, animated_pole) > EPS {
                        pole = unit(animated_pole);
                    }
                }
            }
            let mut ankle = add(hip, reach);
            let mut natural_foot = transfer(leg.target[2]);
            let swing = self.swings.iter().position(|s| {
                s.spec.foot == side_name && frame >= s.spec.start_frame && frame <= s.spec.end_frame
            });
            if let Some(i) = swing {
                let s = &self.swings[i];
                let alpha = (frame - s.spec.start_frame) as f64
                    / (s.spec.end_frame - s.spec.start_frame) as f64;
                let p = 1. - libm::pow(1. - alpha, s.spec.travel_power.unwrap_or(1.));
                let blend = p * p * (3. - 2. * p);
                let arc = 16. * alpha * alpha * (1. - alpha) * (1. - alpha);
                let mut sole = add(s.start.0, scale(sub(s.end.0, s.start.0), blend));
                sole[1] += s.spec.lift * arc;
                sole[0] += s.spec.lateral_offset.unwrap_or(0.) * arc;
                let travel = self.profile.root_travel_samples.as_ref().unwrap()[&self.clip][frame];
                sole = sub(sole, travel);
                natural_foot = norm(slerp(s.start.1, s.end.1, blend));
                ankle = sub(sole, rotate(natural_foot, leg.profile.sole_offset));
            }
            let mut foot = natural_foot;
            if let Some(i) = contact {
                let spec = self.contacts[i].spec.clone();
                let point = if let Some(patch) = &self.contacts[i].patch {
                    patch
                        .iter()
                        .map(|v| v[frame])
                        .min_by(|a, b| {
                            rotate(natural_foot, *a)[1].total_cmp(&rotate(natural_foot, *b)[1])
                        })
                        .unwrap()
                } else {
                    self.contacts[i]
                        .offsets
                        .as_ref()
                        .map(|v| v[frame])
                        .or(spec.contact_point)
                        .unwrap_or(leg.profile.sole_offset)
                };
                let sole = add(ankle, rotate(natural_foot, point));
                let plane = spec.position_mode.as_deref() == Some("plane");
                let mut pin = self.contacts[i].pin;
                if pin.is_none() {
                    if let Some(open) = self.contacts[i].opening {
                        let original = self.contacts[open]
                            .pin
                            .ok_or_else(|| invalid("naturalMotion.wrap.pin"))?;
                        let travel = self
                            .profile
                            .root_travel_per_frame
                            .as_ref()
                            .and_then(|p| p.get(&self.clip))
                            .copied()
                            .unwrap_or([0.; 3]);
                        pin = Some((
                            add(
                                original.0,
                                scale(travel, (spec.end_frame - spec.start_frame) as f64),
                            ),
                            original.1,
                        ));
                    }
                }
                if pin.is_none() || plane {
                    let mut pinned = sole;
                    pinned[1] = ground.map_or(leg.sole[1], |g| g.ground_height);
                    pin = Some((
                        pinned,
                        orientation(
                            &spec,
                            natural_foot,
                            decompose_q(tw[leg.target[2]]),
                            pin.map_or(decompose_q(tw[leg.target[2]]), |p| p.1),
                        ),
                    ));
                }
                let (pinned, pq) = pin.unwrap();
                self.contacts[i].pin = pin;
                foot = norm(slerp(natural_foot, pq, w));
                let anchor = if plane {
                    frame
                } else {
                    spec.anchor_frame.unwrap_or(spec.start_frame)
                };
                let displacement = if let Some(travel) = self
                    .profile
                    .root_travel_samples
                    .as_ref()
                    .and_then(|p| p.get(&self.clip))
                {
                    sub(travel[frame], travel[anchor])
                } else {
                    let travel = self
                        .profile
                        .root_travel_per_frame
                        .as_ref()
                        .and_then(|p| p.get(&self.clip))
                        .copied()
                        .unwrap_or([0.; 3]);
                    scale(travel, frame as f64 - anchor as f64)
                };
                let target = add(sole, scale(sub(sub(pinned, displacement), sole), w));
                ankle = sub(target, rotate(foot, point));
            }
            let min = leg.profile.min_bend_degrees
                + (limits.map_or(leg.profile.min_bend_degrees, |l| {
                    l.minimum_swing_bend_degrees
                }) - leg.profile.min_bend_degrees)
                    * (1. - w);
            frames.push(LegFrame {
                hip,
                desired: ankle,
                natural_foot,
                foot,
                contact,
                weight: w,
                swing,
                pole,
                min,
            });
        }
        let constraints: Vec<_> = frames
            .iter()
            .enumerate()
            .filter(|(_, f)| f.contact.is_some() || f.swing.is_some())
            .map(|(i, _)| i)
            .collect();
        let mut pelvis_correction = [0.; 3];
        if !constraints.is_empty() {
            let maximum = constraints
                .iter()
                .map(|i| self.legs[*i].profile.max_pelvis_correction)
                .fold(f64::INFINITY, f64::min)
                * constraints
                    .iter()
                    .map(|i| {
                        if frames[*i].contact.is_some() {
                            frames[*i].weight
                        } else {
                            1.
                        }
                    })
                    .fold(0., f64::max);
            if maximum > 0. {
                for _ in 0..32 {
                    checkpoint(cancel)?;
                    let mut worst: f64 = 0.;
                    for i in &constraints {
                        let f = &frames[*i];
                        let l = &self.legs[*i];
                        let solved = solve(
                            l,
                            add(f.hip, pelvis_correction),
                            f.desired,
                            point(tw[l.target[1]]),
                            f.pole,
                            f.min,
                        )?;
                        worst = worst.max(solved.residual);
                        pelvis_correction = add(pelvis_correction, sub(f.desired, solved.ankle));
                        if length(pelvis_correction) > maximum {
                            pelvis_correction = scale(unit(pelvis_correction), maximum);
                        }
                    }
                    if worst < 1e-9 {
                        break;
                    }
                }
            }
            root = add(root, pelvis_correction);
        }
        for (side, f) in frames.iter().enumerate() {
            checkpoint(cancel)?;
            let l = &mut self.legs[side];
            let hip = add(f.hip, pelvis_correction);
            let desired = if f.contact.is_none() && f.swing.is_none() {
                add(f.desired, pelvis_correction)
            } else {
                f.desired
            };
            let solved = solve(l, hip, desired, point(tw[l.target[1]]), f.pole, f.min)?;
            l.min = l.min.min(solved.bend);
            l.max = l.max.max(solved.bend);
            l.previous_plane = solved.plane;
            if let Some(i) = f.swing {
                let d = &mut self.swings[i].report;
                if solved.residual > d["maximumResidual"].as_f64().unwrap() {
                    d["maximumResidual"] = json!(solved.residual);
                    d["maximumResidualFrame"] = json!(frame);
                }
            }
            let dirs = [
                unit(sub(solved.knee, hip)),
                unit(sub(solved.ankle, solved.knee)),
            ];
            for n in 0..2 {
                let q = if self.profile.leg_orientation.as_deref() == Some("animated") {
                    let base = transfer(l.target[n]);
                    norm(mul(between(unit(rotate(base, l.local[n])), dirs[n]), base))
                } else {
                    align(
                        unit(rotate(decompose_q(tw[l.target[n]]), l.local[n])),
                        l.plane,
                        dirs[n],
                        solved.plane,
                        decompose_q(tw[l.target[n]]),
                    )?
                };
                rotations.insert(l.target[n], q);
            }
            if let Some(i) = f.contact {
                let d = &mut self.contacts[i].report;
                for (key, frame_key, value) in [
                    ("maximumResidual", "maximumResidualFrame", solved.residual),
                    (
                        "maximumPelvisCorrection",
                        "maximumPelvisCorrectionFrame",
                        length(pelvis_correction),
                    ),
                ] {
                    if value > d[key].as_f64().unwrap() {
                        d[key] = json!(value);
                        d[frame_key] = json!(frame);
                    }
                }
                if solved.clamped {
                    d["clampedSamples"] = json!(d["clampedSamples"].as_u64().unwrap() + 1);
                }
                if f.weight >= 1. && solved.residual > 1e-5 {
                    d["unreachable"] = json!(true);
                }
            }
            rotations.insert(l.target[2], f.foot);
            feet.insert(l.target[2], norm(mul(f.foot, inv(f.natural_foot))));
        }
        let mut intervals: HashMap<usize, Vec<(&Swing, Q, Q)>> = HashMap::new();
        for swing in &self.swings {
            for (i, start, end) in &swing.descendants {
                intervals
                    .entry(*i)
                    .or_default()
                    .push((&swing.spec, *start, *end));
            }
        }
        for (i, mut list) in intervals {
            list.sort_by_key(|x| x.0.start_frame);
            let (spec, start, end) = list
                .iter()
                .copied()
                .rfind(|x| x.0.start_frame <= frame)
                .unwrap_or(list[0]);
            let alpha = ((frame as f64 - spec.start_frame as f64)
                / (spec.end_frame - spec.start_frame) as f64)
                .clamp(0., 1.);
            descendants.insert(i, slerp(start, end, alpha * alpha * (3. - 2. * alpha)));
        }
        Ok(Frame {
            rotations,
            foot_corrections: feet,
            root,
            root_authored: ground.is_some() || !constraints.is_empty(),
            descendant_rotations: descendants,
        })
    }
    pub(crate) fn report(&self, tw: &[M]) -> Value {
        let mut legs = serde_json::Map::new();
        for (n, l) in self.legs.iter().enumerate() {
            let side = if n == 0 { "left" } else { "right" };
            legs.insert(side.into(),json!({"hip":l.profile.hip,"knee":l.profile.knee,"ankle":l.profile.ankle,"soleOffsetAnkleLocal":l.profile.sole_offset,"referenceSolePoint":l.sole,"referenceFootQuaternion":decompose_q(tw[l.target[2]]),"polePelvisLocal":l.profile.pole,"referenceBendPlaneNormal":l.plane,"minimumBendDegrees":l.min,"maximumBendDegrees":l.max}));
        }
        let mut out = json!({"contactSpace":"model","torso":self.profile.torso.as_ref().map(|p|json!({"targetBones":p.target_bones,"effectiveWeights":self.weights})),"legs":legs,"contacts":self.contacts.iter().map(|c|&c.report).collect::<Vec<_>>(),"legMotionLimit":self.limit_report});
        if !self.swings.is_empty() {
            out["swingTrajectories"] =
                json!(self.swings.iter().map(|s| &s.report).collect::<Vec<_>>());
        }
        if let Some(v) = self
            .profile
            .root_travel_samples
            .as_ref()
            .and_then(|p| p.get(&self.clip))
        {
            out["rootTravelSamples"] = json!(v);
        }
        out
    }
}
pub(crate) fn point_at(m: M, p: V) -> V {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contact(patch_points: usize, bone: bool) -> PreparedContact {
        let mut spec: Contact = serde_json::from_value(json!({
            "foot":"left", "startFrame":0, "endFrame":30, "blendFrames":1
        }))
        .unwrap();
        spec.contact_patch = (patch_points > 0).then(|| {
            (0..patch_points)
                .map(|_| Patch {
                    bone: None,
                    point: [0.; 3],
                })
                .collect()
        });
        spec.contact_bone = bone.then(|| "Toe".into());
        PreparedContact {
            spec,
            report: Value::Null,
            pin: None,
            offsets: None,
            patch: None,
            opening: None,
        }
    }

    #[test]
    fn anchor_storage_bounds_accumulated_points_before_allocation() {
        let patches: Vec<_> = (0..404).map(|_| contact(16, false)).collect();
        assert!(validate_anchor_storage(31, 12, &patches[..403]).is_ok());
        assert_eq!(
            validate_anchor_storage(31, 12, &patches).unwrap_err().path,
            "naturalMotion.anchor.limit"
        );
        let points = [contact(0, true), contact(0, true)];
        assert!(validate_anchor_storage(100000, 1, &points).is_ok());
        assert!(validate_anchor_storage(100001, 1, &points).is_err());
        assert!(validate_anchor_storage(usize::MAX, 1, &points).is_err());
        assert!(validate_anchor_storage(200001, 1, &[]).is_err());
    }
}
