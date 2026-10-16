use crate::{advanced::*, baker_tests::request};
use serde_json::json;
use std::cell::Cell;
#[test]
fn production_refusals_identify_missing_clip_and_flagged_bone_frames() {
    let mut r = request();
    r.clips[0].options.insert("sampleRateHz".into(), json!(60));
    r.clips[0]
        .options
        .insert("interpolation".into(), json!("step"));
    let pose = json!({"targetClip":"Missing","targetFrame":0,"spanFrames":4,"rootOffset":[0,0,0]});
    r.clips[0]
        .options
        .insert("endpointEnvelope".into(), json!({"entry":pose,"exit":pose}));
    let out = bake_advanced_v1(&r, || false);
    assert!(out.clips.is_empty());
    assert_eq!(
        out.error.unwrap().message,
        "Missing or ambiguous target endpoint clip Missing."
    );
    r.clips[0].options.remove("endpointEnvelope");
    r.clips[0].clip.tracks.push(serde_json::from_value(json!({"node":0,"name":"Root.quaternion","boneChannel":true,"property":"quaternion","interpolation":"linear","times":[0,1],"values":[0,0,0,1,0.70710677,0,0,0.70710677]})).unwrap());
    r.clips[0].options.insert("poseRanges".into(), json!({"schema":"rustsmf.pose-ranges.v1","id":"message","policy":"reject","joints":[{"bone":"Root","referenceRotation":[0,0,0,1],"twistAxis":[0,1,0],"bendAxis":[1,0,0],"flexionDegrees":[-1,1],"lateralDegrees":[-1,1],"twistDegrees":[-1,1],"maximumSwingDegrees":1}]}));
    let out = bake_advanced_v1(&r, || false);
    assert!(out.clips.is_empty());
    let error = out.error.unwrap();
    assert_eq!(error.path, "poseRanges.reject");
    for detail in ["Known:", "body-range flags", "Root", "at frame", "range -1"] {
        assert!(error.message.contains(detail), "{}", error.message);
    }
}
#[test]
fn production_progress_reports_completed_clips_and_cancellation_is_atomic() {
    use std::cell::RefCell;
    let mut request = request();
    request.clips.push(request.clips[0].clone());
    let before = serde_json::to_string(&request).unwrap();
    let progress = RefCell::new(Vec::new());
    let cancelled = Cell::new(false);
    let out =
        crate::baker::advanced_bake_progress(&request, &|| cancelled.get(), &|done, total| {
            progress.borrow_mut().push((done, total));
            if done == 1 {
                cancelled.set(true);
            }
        });
    assert_eq!(*progress.borrow(), vec![(0, 2), (1, 2)]);
    assert_eq!(out.error.unwrap().code, "BAKE_CANCELLED");
    assert!(out.clips.is_empty());
    progress.borrow_mut().clear();
    let out = crate::baker::advanced_bake_progress(&request, &|| false, &|done, total| {
        progress.borrow_mut().push((done, total))
    });
    assert_eq!(*progress.borrow(), vec![(0, 2), (1, 2), (2, 2)]);
    assert_eq!(out.status, "baked");
    assert_eq!(serde_json::to_string(&request).unwrap(), before);
}
#[test]
fn portable_rest_rotations_preserve_json_float64_bits() {
    let parsed: [f64; 4] = serde_json::from_str(
        "[0.05884121484451565,-0.1556700560912141,0.08729348111089756,0.982183482465329]",
    )
    .unwrap();
    let expected: [f64; 4] = [
        0.05884121484451565,
        -0.1556700560912141,
        0.08729348111089756,
        0.982183482465329,
    ];
    assert_eq!(parsed.map(f64::to_bits), expected.map(f64::to_bits));
}
#[test]
fn advanced_post_passes_are_owned_cancelable_and_reusable() {
    let mut request = request();
    request.clips[0].options.insert(
        "poseRecovery".into(),
        json!({"peakFrame":20,"holdThroughFrame":30,"returnByFrame":50}),
    );
    let before = serde_json::to_string(&request).unwrap();
    let calls = Cell::new(0);
    let out = bake_advanced_v1(&request, || {
        calls.set(calls.get() + 1);
        false
    });
    assert_eq!(out.status, "baked");
    assert!(out.clips[0].report.advanced.contains_key("poseRecovery"));
    assert_eq!(&out.clips[0].clip.tracks[0].values[180..], &[0., 0., 0.]);
    let full = calls.get();
    for threshold in [0, 4, full / 2, full - 2] {
        calls.set(0);
        let out = bake_advanced_v1(&request, || {
            let n = calls.get();
            calls.set(n + 1);
            n >= threshold
        });
        assert_eq!(out.status, "error");
        assert_eq!(out.error.unwrap().code, "BAKE_CANCELLED");
        assert!(out.clips.is_empty());
    }
    assert_eq!(bake_advanced_v1(&request, || false).status, "baked");
    assert_eq!(serde_json::to_string(&request).unwrap(), before);
    assert_eq!(
        crate::baker::bake_v1(&request, || false)
            .error
            .unwrap()
            .code,
        "BAKE_UNSUPPORTED_FEATURE"
    );
}
#[test]
fn advanced_json_and_mixed_batches_fail_atomically() {
    let mut r = request();
    let mut second = r.clips[0].clone();
    second.options.insert(
        "localReferenceCorrections".into(),
        json!({"Missing":{"from":[0,0,0,1],"to":[0,0,0,1]}}),
    );
    r.clips.push(second);
    let out = bake_advanced_v1(&r, || false);
    assert_eq!(out.status, "error");
    assert!(out.clips.is_empty());
    for text in ["null", "{}", "{"] {
        let out: serde_json::Value = serde_json::from_str(&bake_advanced_json_v1(text)).unwrap();
        assert_eq!(out["status"], "error");
        assert_eq!(out["clips"], json!([]));
    }
    let text = " ".repeat(crate::sampler::MAX_JSON_BYTES + 1);
    let out: serde_json::Value = serde_json::from_str(&bake_advanced_json_v1(&text)).unwrap();
    assert_eq!(out["error"]["code"], "BAKE_INPUT_LIMIT");
}
#[test]
fn native_advanced_options_reject_deep_or_oversized_values_before_cloning() {
    let mut r = request();
    let mut value = json!(0);
    for _ in 0..66 {
        value = json!([value]);
    }
    r.clips[0]
        .options
        .insert("localReferenceCorrections".into(), value);
    let out = bake_advanced_v1(&r, || false);
    assert_eq!(out.error.unwrap().path, "options.depth");
    assert!(out.clips.is_empty());
    r.clips[0].options.insert(
        "localReferenceCorrections".into(),
        json!("x".repeat(crate::sampler::MAX_JSON_BYTES)),
    );
    let out = bake_advanced_v1(&r, || false);
    assert_eq!(out.error.unwrap().code, "BAKE_INPUT_LIMIT");
    assert!(out.clips.is_empty());
}
