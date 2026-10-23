use rustsmf_pose_contact::{
    solve_pose_v1, FootSupport, JointTrs, LegCalibration, PoseContactInput,
};
use serde_json::{json, Value};
use std::io::{self, Read};

type Result<T> = std::result::Result<T, String>;
fn keys(v: &Value, names: &[&str]) -> Result<()> {
    let object = v.as_object().ok_or("expected object")?;
    if object.len() != names.len() || names.iter().any(|name| !object.contains_key(*name)) {
        return Err("unexpected or missing batch fields".into());
    }
    Ok(())
}
fn array(v: &Value) -> Result<&Vec<Value>> {
    v.as_array().ok_or("expected array".into())
}
fn number(v: &Value) -> Result<f64> {
    v.as_f64()
        .filter(|n| n.is_finite())
        .ok_or("expected finite number".into())
}
fn index(v: &Value) -> Result<usize> {
    v.as_u64()
        .and_then(|n| usize::try_from(n).ok())
        .ok_or("expected index".into())
}
fn vector<const N: usize>(v: &Value) -> Result<[f64; N]> {
    let values = array(v)?;
    if values.len() != N {
        return Err("unexpected vector length".into());
    }
    let mut result = [0.0; N];
    for (i, value) in values.iter().enumerate() {
        result[i] = number(value)?;
    }
    Ok(result)
}
fn process(input: &Value) -> Result<Value> {
    keys(
        input,
        &[
            "schema",
            "parents",
            "pelvis",
            "legs",
            "maximumPelvisCorrection",
            "frames",
        ],
    )?;
    if input["schema"] != "rustsmf.pose-contact-batch.v1" {
        return Err("unsupported batch schema".into());
    }
    let parents = array(&input["parents"])?;
    let frames = array(&input["frames"])?;
    if parents.is_empty()
        || parents.len() > 256
        || frames.is_empty()
        || frames.len() > 3601
        || parents.len() * frames.len() > 131072
    {
        return Err("batch exceeds pose bounds".into());
    }
    let parents = parents
        .iter()
        .map(|v| {
            if v.as_i64() == Some(-1) {
                Ok(None)
            } else {
                index(v).map(Some)
            }
        })
        .collect::<Result<Vec<_>>>()?;
    let legs = array(&input["legs"])?;
    if legs.is_empty() || legs.len() > 2 {
        return Err("batch needs one or two legs".into());
    }
    let legs = legs
        .iter()
        .map(|v| {
            keys(
                v,
                &[
                    "name",
                    "hip",
                    "knee",
                    "ankle",
                    "upperAxis",
                    "pole",
                    "lowerAxis",
                    "normal",
                    "minimumBend",
                    "maximumBend",
                ],
            )?;
            Ok(LegCalibration {
                name: v["name"]
                    .as_str()
                    .filter(|n| !n.is_empty() && n.len() <= 64)
                    .ok_or("invalid leg name")?
                    .to_string(),
                hip: index(&v["hip"])?,
                knee: index(&v["knee"])?,
                ankle: index(&v["ankle"])?,
                upper_axis_local: vector(&v["upperAxis"])?,
                hip_bend_pole_local: vector(&v["pole"])?,
                lower_axis_local: vector(&v["lowerAxis"])?,
                knee_plane_normal_local: vector(&v["normal"])?,
                sole_offset_ankle_local: [0.0; 3],
                minimum_bend_degrees: number(&v["minimumBend"])?,
                maximum_bend_degrees: number(&v["maximumBend"])?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let mut result = Vec::with_capacity(frames.len());
    for (frame, value) in frames.iter().enumerate() {
        keys(value, &["pose", "supports"])?;
        let pose = array(&value["pose"])?;
        if pose.len() != parents.len() {
            return Err("frame joint count mismatch".into());
        }
        let pose = pose
            .iter()
            .map(|v| {
                let a = vector::<10>(v)?;
                Ok(JointTrs {
                    translation: a[0..3].try_into().unwrap(),
                    rotation: a[3..7].try_into().unwrap(),
                    scale: a[7..10].try_into().unwrap(),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let supports = array(&value["supports"])?;
        if supports.len() > legs.len() {
            return Err("too many supports".into());
        }
        let supports = supports
            .iter()
            .map(|v| {
                keys(v, &["leg", "position", "rotation"])?;
                Ok(FootSupport {
                    leg: index(&v["leg"])?,
                    weight: 1.0,
                    desired_sole_position: vector(&v["position"])?,
                    desired_ankle_orientation: vector(&v["rotation"])?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let input = PoseContactInput {
            api_version: 1,
            parents: parents.clone(),
            current_pose: pose,
            pelvis: index(&input["pelvis"])?,
            legs: legs.clone(),
            supports,
            ground_point: [0.0; 3],
            up: [0.0, 1.0, 0.0],
            maximum_pelvis_correction: number(&input["maximumPelvisCorrection"])?,
        };
        let solved = solve_pose_v1(&input).map_err(|error| format!("frame {frame}: {error}"))?;
        result.push(json!({"pose": solved.corrected_pose.iter().map(|p| [p.translation.as_slice(),p.rotation.as_slice(),p.scale.as_slice()].concat()).collect::<Vec<_>>(),
            "pelvisTranslation": solved.pelvis_translation, "legs": solved.legs.iter().map(|l| json!({"residual":l.sole_residual,"bendDegrees":l.bend_degrees,"reachable":l.reachable,"clamped":l.clamped})).collect::<Vec<_>>() }));
    }
    Ok(json!({"schema":"rustsmf.pose-contact-batch-result.v1","frames":result}))
}
fn run() -> Result<()> {
    let mut bytes = Vec::new();
    io::stdin()
        .take(8 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("batch exceeds 8 MiB".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    println!("{}", process(&value)?);
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("Pose contact batch refused: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_and_oversized_batches_refuse() {
        assert!(process(&json!({})).is_err());
        assert!(process(&json!({"schema":"wrong","parents":[],"pelvis":0,"legs":[],"maximumPelvisCorrection":0,"frames":[]})).is_err());
        assert!(vector::<3>(&json!([1, 2])).is_err());
        assert!(index(&json!(-2)).is_err());
    }
}
