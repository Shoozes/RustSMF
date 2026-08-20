use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmfHeaderSummary {
    pub version: String,
    pub size: usize,
    pub off_tex: usize,
    pub off_model: usize,
    pub off_rig: usize,
    pub off_anim: usize,
}

#[derive(Debug, Serialize)]
pub struct SmfDesktopInfo {
    pub valid: bool,
    pub version: String,
    pub size: usize,
    pub off_tex: usize,
    pub off_model: usize,
    pub off_rig: usize,
    pub off_anim: usize,
    pub model_count: Option<u32>,
    pub rig_bone_count: Option<u32>,
    pub anim_clip_count: Option<u32>,
    pub error: Option<String>,
}

pub fn parse_smf_header_info(bytes: &[u8]) -> Result<SmfHeaderSummary, String> {
    if bytes.is_empty() {
        return Err("empty file".to_string());
    }
    if bytes.len() < 32 {
        return Err("too small".to_string());
    }

    let Some(version_end) = bytes.iter().position(|b| *b == 0) else {
        return Err("missing version terminator".to_string());
    };

    let version = String::from_utf8(bytes[..version_end].to_vec())
        .map_err(|_| "version is not valid UTF-8".to_string())?;
    let mut off = version_end + 1;

    if off + 16 > bytes.len() {
        return Err("header short".to_string());
    }

    let off_tex = read_u32_le(bytes, off)? as usize;
    off += 4;
    let off_model = read_u32_le(bytes, off)? as usize;
    off += 4;
    let off_rig = read_u32_le(bytes, off)? as usize;
    off += 4;
    let off_anim = read_u32_le(bytes, off)? as usize;
    let header_end = off
        .checked_add(4)
        .ok_or_else(|| "header offset overflow".to_string())?;

    if version != "SMF_v11_by_Snidr_and_Bart" && version != "SMF_v12_by_Snidr_and_Bart" {
        return Err(format!("unsupported version: {}", version));
    }
    let tex_count_end = off_tex
        .checked_add(1)
        .ok_or_else(|| "texture section offset overflow".to_string())?;
    let model_count_end = off_model
        .checked_add(1)
        .ok_or_else(|| "model section offset overflow".to_string())?;
    let rig_count_end = off_rig
        .checked_add(4)
        .ok_or_else(|| "rig section offset overflow".to_string())?;
    let anim_count_end = off_anim
        .checked_add(1)
        .ok_or_else(|| "animation section offset overflow".to_string())?;

    if off_tex < header_end
        || tex_count_end > off_model
        || model_count_end > off_rig
        || rig_count_end > off_anim
        || anim_count_end > bytes.len()
    {
        return Err("section offsets invalid or anim short".to_string());
    }

    Ok(SmfHeaderSummary {
        version,
        size: bytes.len(),
        off_tex,
        off_model,
        off_rig,
        off_anim,
    })
}

pub fn build_smf_desktop_info(bytes: &[u8]) -> SmfDesktopInfo {
    match parse_smf_header_info(bytes) {
        Ok(header) => SmfDesktopInfo {
            valid: true,
            version: header.version,
            size: header.size,
            off_tex: header.off_tex,
            off_model: header.off_model,
            off_rig: header.off_rig,
            off_anim: header.off_anim,
            model_count: read_u8(bytes, header.off_model).map(u32::from),
            rig_bone_count: read_u32_le(bytes, header.off_rig).ok(),
            anim_clip_count: read_u8(bytes, header.off_anim).map(u32::from),
            error: None,
        },
        Err(error) => SmfDesktopInfo {
            valid: false,
            version: String::new(),
            size: bytes.len(),
            off_tex: 0,
            off_model: 0,
            off_rig: 0,
            off_anim: 0,
            model_count: None,
            rig_bone_count: None,
            anim_clip_count: None,
            error: Some(error),
        },
    }
}

fn read_u8(bytes: &[u8], offset: usize) -> Option<u8> {
    bytes.get(offset).copied()
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    if offset + 4 > bytes.len() {
        return Err("u32 read beyond file".to_string());
    }
    Ok(u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_smf_bytes() -> Vec<u8> {
        let mut bytes = b"SMF_v12_by_Snidr_and_Bart\0".to_vec();
        let off_tex: u32 = 42;
        let off_model: u32 = 44;
        let off_rig: u32 = 48;
        let off_anim: u32 = 52;
        bytes.extend_from_slice(&off_tex.to_le_bytes());
        bytes.extend_from_slice(&off_model.to_le_bytes());
        bytes.extend_from_slice(&off_rig.to_le_bytes());
        bytes.extend_from_slice(&off_anim.to_le_bytes());
        while bytes.len() <= 56 {
            bytes.push(0);
        }
        bytes[off_model as usize] = 1;
        bytes[off_rig as usize] = 2;
        bytes[off_anim as usize] = 3;
        bytes
    }

    #[test]
    fn parses_valid_header_and_counts() {
        let bytes = minimal_smf_bytes();
        let header = parse_smf_header_info(&bytes).expect("valid header");
        assert_eq!(header.version, "SMF_v12_by_Snidr_and_Bart");
        assert_eq!(header.off_tex, 42);
        assert_eq!(header.off_model, 44);
        assert_eq!(header.off_rig, 48);
        assert_eq!(header.off_anim, 52);

        let info = build_smf_desktop_info(&bytes);
        assert!(info.valid);
        assert_eq!(info.model_count, Some(1));
        assert_eq!(info.rig_bone_count, Some(2));
        assert_eq!(info.anim_clip_count, Some(3));
    }

    #[test]
    fn rejects_missing_version_terminator() {
        let mut bytes = b"SMF_v12_by_Snidr_and_Bart".to_vec();
        bytes.resize(64, 0x41);

        let err = parse_smf_header_info(&bytes).expect_err("missing terminator should fail");
        assert_eq!(err, "missing version terminator");
    }

    #[test]
    fn rejects_bad_version_and_short_header() {
        let mut bad_version = b"NOTSMF\0".to_vec();
        bad_version.extend_from_slice(&[0; 32]);
        assert_eq!(
            parse_smf_header_info(&bad_version).expect_err("bad version should fail"),
            "unsupported version: NOTSMF",
        );

        let short = b"SMF_v12_by_Snidr_and_Bart\0".to_vec();
        assert_eq!(
            parse_smf_header_info(&short).expect_err("short header should fail"),
            "too small",
        );
    }

    #[test]
    fn rejects_invalid_section_offsets() {
        let mut bytes = minimal_smf_bytes();
        let off = b"SMF_v12_by_Snidr_and_Bart\0".len();
        let off_tex: u32 = 60;
        let off_model: u32 = 50;
        bytes[off..off + 4].copy_from_slice(&off_tex.to_le_bytes());
        bytes[off + 4..off + 8].copy_from_slice(&off_model.to_le_bytes());

        assert_eq!(
            parse_smf_header_info(&bytes).expect_err("non-monotonic offsets should fail"),
            "section offsets invalid or anim short",
        );
    }

    #[test]
    fn rejects_overlapping_or_truncated_section_envelopes() {
        let base = minimal_smf_bytes();
        let offsets_start = b"SMF_v12_by_Snidr_and_Bart\0".len();
        let invalid_offsets = [
            [41_u32, 44, 48, 52],
            [42_u32, 42, 48, 52],
            [42_u32, 44, 49, 52],
            [42_u32, 44, 48, base.len() as u32],
        ];

        for offsets in invalid_offsets {
            let mut bytes = base.clone();
            for (index, offset) in offsets.into_iter().enumerate() {
                let start = offsets_start + index * 4;
                bytes[start..start + 4].copy_from_slice(&offset.to_le_bytes());
            }

            let error = parse_smf_header_info(&bytes)
                .expect_err("overlapping or truncated sections must be rejected");
            assert_eq!(error, "section offsets invalid or anim short");

            let info = build_smf_desktop_info(&bytes);
            assert!(!info.valid);
            assert_eq!(
                info.error.as_deref(),
                Some("section offsets invalid or anim short")
            );
        }
    }
}
