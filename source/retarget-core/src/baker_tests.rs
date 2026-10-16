use crate::baker::*;
use crate::sampler::BakeRequestV1;
use serde_json::json;
use std::cell::Cell;
pub(crate) fn request() -> BakeRequestV1 {
    let node = |name: &str, parent: Option<usize>, y: f64| json!({"name":name,"parent":parent,"isBone":true,"position":[0,y,0],"quaternion":[0,0,0,1],"scale":[1,1,1],"worldPosition":[0,y,0],"worldQuaternion":[0,0,0,1]});
    serde_json::from_value(json!({"apiVersion":1,"operation":"bake",
      "source":{"nodes":[node("Root",None,0.),node("Tip",Some(0),1.)],"bones":[0,1]},
      "target":{"nodes":[node("Root",None,0.),node("Tip",Some(0),2.)],"bones":[0,1]},
      "mapping":{"Root":"Root","Tip":"Tip"},
      "mappingDetails":{"ok":true,"map":{"Root":"Root","Tip":"Tip"},"decisions":[{"source":"Root","target":"Root","method":"manual","confidence":1},{"source":"Tip","target":"Tip","method":"manual","confidence":1}],"diagnostics":[],"sourceUp":null,"targetUp":null,"upCorrection":null,"sourceLateral":null,"targetLateral":null,"orientationCorrection":null},
      "clips":[{"clip":{"name":"Known","duration":1,"blendMode":2500,"tracks":[{"node":0,"property":"position","interpolation":"linear","times":[0,1],"values":[0,0,0,1,0,0]}]},"options":{"sampleRateHz":60}}],"sampleTimes":[0]})).unwrap()
}
#[test]
fn known_root_travel_and_borrowed_inputs() {
    let r = request();
    let before = serde_json::to_string(&r).unwrap();
    let result = bake_v1(&r, || false);
    assert_eq!(result.status, "baked");
    assert_eq!(result.clips[0].report.root_motion_scale, 2.);
    let track = &result.clips[0].clip.tracks[0];
    assert_eq!(&track.values[180..], &[2., 0., 0.]);
    assert_eq!(serde_json::to_string(&r).unwrap(), before);
}
#[test]
fn cancellation_during_validation_and_baking_is_atomic_and_reusable() {
    let r = request();
    let calls = Cell::new(0);
    assert_eq!(
        bake_v1(&r, || {
            calls.set(calls.get() + 1);
            false
        })
        .status,
        "baked"
    );
    let full = calls.get();
    assert!(full > 100);
    for threshold in [0, 4, full / 2, full - 2] {
        calls.set(0);
        let out = bake_v1(&r, || {
            let n = calls.get();
            calls.set(n + 1);
            n >= threshold
        });
        assert_eq!(out.status, "error");
        assert_eq!(out.error.unwrap().code, "BAKE_CANCELLED");
        assert!(out.clips.is_empty());
    }
    assert_eq!(bake_v1(&r, || false).status, "baked");
}
#[test]
fn batch_errors_never_return_completed_prefixes() {
    let mut r = request();
    let mut next = r.clips[0].clone();
    next.options.insert("naturalMotion".into(), json!({}));
    r.clips.push(next);
    let out = bake_v1(&r, || false);
    assert_eq!(out.error.unwrap().code, "BAKE_UNSUPPORTED_FEATURE");
    assert!(out.clips.is_empty());
    r.clips[1].options.clear();
    r.clips[1]
        .options
        .insert("rootMotionScale".into(), json!(-1));
    let out = bake_v1(&r, || false);
    assert!(out.clips.is_empty());
    assert_eq!(out.status, "error");
}
#[test]
fn bounded_output_and_json_fail_closed() {
    let mut r = request();
    r.clips[0].options.insert("sampleRateHz".into(), json!(240));
    r.clips[0].clip.duration = 100.;
    assert_eq!(
        bake_v1(&r, || false).error.unwrap().code,
        "BAKE_OUTPUT_LIMIT"
    );
    for text in ["{", "null", "{}"] {
        let out: serde_json::Value = serde_json::from_str(&bake_json_v1(text)).unwrap();
        assert_eq!(out["status"], "error");
        assert_eq!(out["clips"], json!([]));
    }
    let text = " ".repeat(crate::sampler::MAX_JSON_BYTES + 1);
    let out: serde_json::Value = serde_json::from_str(&bake_json_v1(&text)).unwrap();
    assert_eq!(out["error"]["code"], "BAKE_INPUT_LIMIT");
}
