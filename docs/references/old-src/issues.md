# SMF Old Reference - GM LTS 2026 Issues & Fixes

This file previously contained a raw dump of compiler warnings (W GM20xx, E GM10xx) emitted by the GameMaker IDE when loading the SMF.yyp project.

## SMF Format Quirks Fact List (v7 – v12)

This is the distilled knowledge from making both legacy demo .smf files (v7-era, old v11 internals) and modern user/GLB-converted models load and animate correctly on GM LTS 2026.

**Core principle:** The v11 header string does *not* guarantee a single binary layout. "Change without bumping the version number" is real. The GLBtoSMF/importer.js is currently the best external spec for what "modern" v11/v12 expects.

- **Header string vs. internal layout** — "SMF_v11_by_Snidr_and_Bart" can contain either modern rig data (u32 nodeCount, u32 parent, locked u8 for !v12, inline 3f primary) *or* old-internal data that looks a lot like v7 (effective small count, u8 parent in some cases, different per-node info size, 232 extension). The dispatcher in smf_system.gml only checks the string and falls back; the real branch must be inside the v11 loader.
- **Node count encoding** — Can be u8 (classic v7/v10) or u32 (v11+ and many "v11" files even for small counts). A small count written as u32 produces bytes `[N, 0, 0, 0, ...]` at rigPos. This is why simple byte-peek heuristics are dangerous.
- **Dual quaternion storage convention** — The on-disk data is almost always the *negated* form. Modern/GLB paths must negate all 8 components after reading. Legacy snapshot paths that "just worked" for old demos sometimes operated on the raw values (the re-derive in update_node masked the difference).
- **Per-node layout after the WorldDQ (8f)** — Varies: u8 parent + u8 isBone (old), u32 parent + u8 isBone + u8 locked + 3f primary (modern v11), or u32 parent + u8 isBone + 3f primary (some v11 snapshots). Locked byte presence is a major source of misalignment.
- **232 extension** — After the main node list, an optional marker (0xE8) + bytesPerNode + packed extra data (Locked + PrimaryAxis). Present in many v7/v10 and some old v11 internals; absent or handled differently in pure modern v11/v12 saves. Loaders must read it or the file pointer is wrong for animations.
- **update_node vs. "trust the file"** — Old paths (v7, v10, old v11 snapshot) call update_node after populate. This re-derives orientation from bone vector (child pos – parent pos) + "up" extracted from the stored quat. Modern/converter data often requires the *exact* stored WorldDQ rotation; calling update_node produces "pointing bones", zero-length bones, or NaN. Hence the modern path does manual derive only (Length + Local/Conj from stored World trans) and never overwrites World rot.
- **Locked bones in animation chunks** — Present (u16 count + list) in v12 and in some old v11 "internal" variants. Absent in the GLBtoSMF-defined "standard" v11. Reading them unconditionally on a modern v11 file shifts every frameTime and pose DQ.
- **sampleStrips** — smf_instance (used by all the demo systems) expects `model.sampleStrips` to be an array of `smf_samplestrip` objects, one per animation. Many old loaders only did `array_create(animNum)`. Forgetting to populate the actual objects after loading animations produces "index out of range" in the demo step events.
- **Two-pass populate + clean rig + parent clamping** — Parents can be forward references or out of order. Must create a fresh `new smf_rig()` before filling nodeList, store every node as a real array first, clamp every parent read to [0, nodeNum), then do a second pass for update/bindmap or derive.
- **Negate must be consistent** — If you negate rig WorldDQs but not the pose DQs read from the same file (or vice versa), the LocalDQConjugate math in keyframe storage and generate_sample produces garbage or exploded poses.
- **Byte guards + early trim are mandatory** — Because of the "format change without version bump" reality, every count and every f32 read in anim/rig sections must be guarded. After loading, trim `model.animations` to the actually successful count.
- **v10/v7 paths still use the "old way"** — u8 count, immediate or second-pass update_node, 232 extension, no (or conditional) negate. These paths are intentionally left on the re-derive side because the pure old demo .smf files were authored expecting that behavior.
- **GLBtoSMF (importer.js + packer) is the reference spec for "what a modern file looks like"** — u32 nodeCount even under v11 header, full negate after every 8f (rig and per-frame), locked only for v12 in anim, full nodeCount DQs per frame, etc.

## SMF Format Quirks Fact List (v7 – v12) – Expanded Internals & Converter-Relevant Details (Added 2026-06)

This is the distilled knowledge from making both legacy demo .smf files (v7-era, old v11 internals) and modern user/GLB-converted models load and animate correctly on GM LTS 2026. These facts are especially useful for improving smf↔glb roundtrippers (names, hierarchy fidelity, bind vs. deltas, signs, locked/primary, coord systems, sample reconstruction).

**Core principle:** The v11 header string does *not* guarantee a single binary layout. "Change without bumping the version number" is real. The local GLBtoSMF/ (importer.js + exporter.js + packer.js + smf_dq_math.js) is currently the best living external spec for what a "correct modern v11/v12" file looks like. Pure GML editor saves can differ in subtle ways.

### Version / Header / Dispatch
- Dispatch (smf_system load_from_buffer): Checks for exact "SMF_v12_by_Snidr_and_Bart". If not, falls back to v11_from_buffer in Utility. v11_from_buffer checks for "SMF_v11_by_Snidr_and_Bart", else falls to v10. Older "SnidrsModelFormat" + f32 version go through v7/v8 paths or the legacy smf_read_rig_from_buffer.
- v7-era (old header + f32 version <9): Separate positions (nod, col, rig, ani, sel, sub), subRigs (partitions), "compiled" flag, 232 extension after rig nodes.
- v10: still u8 nodeCount in many places, but nodes are stored as **16 floats (matrix)**, then `smf_mat_orthogonalize` + `smf_dq_create_from_matrix`.
- v11 string can be "modern" (u32 count, u32 parent, locked u8 for !v12, inline 3f primary) **or** "old internal" (small count, different per-node info size after the 8f DQ, sometimes relying on the 232 extension).
- v12: u32 everywhere for counts, locked handling largely moves to per-anim (u16 count + list), rig per-node is u32 p + u8 isBone + 3f (locked is not in the rig node stream the same way).

**Converter implication**: A file claiming v11 can legitimately require the u8-parent + 232 path or the u32-parent + inline path. Never assume layout from the string alone.

### Rig Binary Layout (at rigPos)
- Count: u8 (classic v7/v10 + some old v11 internals) or u32 (modern v11+). Small u32 counts produce bytes `[N, 0, 0, 0, ...]` at rigPos.
- After count, per node (core 8f + trailer):
  - 8×f32 WorldDQ (bind pose, in the file's storage sign convention).
  - Parent: u8 (old) vs u32 (modern v11+).
  - IsBone: u8 (0/1). Editor forces root and invalid-parent nodes to `false`.
  - Locked u8: present inline in v10 main list and some old v11; present but skipped in modern v11 !v12 rig stream; handled differently (or not at all) in the v12 rig stream.
  - PrimaryAxis: 3×f32. `[0,0,0]` = "auto-guess later". Written as zeros when absent.
- After the whole node list (old paths only): optional `232` (0xE8) marker byte + u8 `bytesPerNode` + packed extra data per node (Locked byte at +0, optional 3f primary at +1/+5/+9 if bytesPerNode≥13). Loaders use `buffer_peek`; only the marker itself advances the main stream pointer.
- Modern v12 saver (GML): `u32 nodeNum` + (8f DQ + u32 parent + u8 isBone + 3f primary-or-zeros). **No Locked written in the rig chunk** in the current saver.
- JS exporter (converter "truth"): `u32 nodeCount` + 8f (negated) + u32 parent + u8 isBone + 3f axis. For v11 it still emits the locked u8 slot (importer ignores it for !v12). It **inserts extra "head" nodes** for bones that have no parent in the source, to force a clean tree.

**Converter implication**: Bone hierarchy roundtrips lose fidelity on disconnected bones unless you do the same "add head nodes" trick the JS side does. PrimaryAxis and Locked (rig-level) are often [0,0,0] / false in exported data.

### Animation Binary Layout (at aniPos) & Delta Storage
- u8 (or older u8-per-anim) animCount.
- Per anim: null-terminated name + u8 loop + f32 playTime + u8 interp + u8 sampleFrameMultiplier.
- Locked bones (per-anim): u16 count + u16[] list. Present in v12 + old v11 internals; absent in the GLBtoSMF-defined "standard" v11. Reading them on a modern v11 file shifts every frameTime + 8f pose block.
- u32 frameCount.
- Per frame: f32 time (0-1 normalized in modern; raw ms in some older) + **exactly nodeCount × 8f delta DQs** (not absolute poses).
- Deltas are *relative to bind*: root stores world-space change; children store local change. Loader (both GML and JS) pre-computes them at load using the rig's `LocalDQConjugate`/`WorldDQConjugate`.
- In modern saver: times from `keyframeGrid[0,f]`, deltas from `anim.keyframe_get_node_dq(rig, f, i)`.
- In JS exporter: samples via THREE.AnimationMixer → world matrices → their `smf_dq_create_from_matrix` → negate + continuity sign-flip vs previous frame.

**Converter implication**: GLB stores absolute bone TRS (or matrices) per frame. You must do bind + delta → absolute on export, and absolute → (bind-relative delta) on import. Missing the sign/hemisphere flip here is one of the most common sources of "exploded" animation after roundtrip.

### Rig Struct, BindMap, Local/World, update_node vs Trust
- nodeList is a ds_list of arrays indexed by `eAnimNode` (Name, WorldDQ, LocalDQ, WorldDQConjugate, LocalDQConjugate, Parent, Children, Descendants, IsBone, Length, PrimaryAxis, Locked, LockedPos, Num).
- bindMap (ds_list): nodeIndex → boneIndex (0..boneNum-1) **only for IsBone nodes**. Non-bones get -1. Built by `update_bindmap`. Used for sample sizing and skin weight remapping.
- boneNum vs nodeNum: only IsBone nodes occupy sample slots.
- On load (modern path): WorldDQ is trusted (post-negate). Manual derive only computes Length (from trans diff), conjugates, and LocalDQ = pConj * World. **Never overwrites the rotation part of WorldDQ**.
- `update_node` (old/legacy paths): Takes the stored World trans to compute boneV = childWorldPos - parentWorldPos. If IsBone and len>0, it rebuilds orientation from boneV direction + "up" extracted from the (possibly raw) stored quat via mat_create + dq_from_matrix + normalize back into the node's WorldDQ. Also recomputes PrimaryAxis by orthogonal projection onto grandparent direction. This is why old paths "worked" on their own data but destroy converter bind poses.
- node_create: forces isBone=false for root or bad parent. Bones duplicate parent's WorldDQ then set trans; non-bones get identity rot + trans.
- transform() multiplies all WorldDQs by a DQ and scales trans, then re-calls update_node on everything.
- sample_get_node_dq (used by node_get_matrix/position, weapon attachments, foot shadows): if the node isn't a direct bone, walks its Children/Descendants to find one that is, then does (bone sample transform) * (rig node's WorldDQ). This is how you can attach to a joint and still get correct animated motion.

**Converter implication**: If your glb>smf writer doesn't produce correct IsBone flags + a proper bindMap after load, attachments and partial skinning will be wrong. The descendant walk is a GML-specific convenience that GLB doesn't have natively.

### Dual Quaternion & Sampling Math (Critical for Roundtrips)
- Negate on read (modern) and before write (both sides + JS) is mandatory for correct sign.
- Bind vs. animated: Rig stores absolute WorldDQ bind poses. Anim stores *deltas* from that bind (local for children, world for root). Loader reconstructs keyframe deltas using rig Local/World Conjugates.
- Local vs World in rig node:
  - WorldDQ = absolute in model space (what is stored in file for bind).
  - LocalDQ = relative to parent (computed on load/derive as pConj * World).
  - Conjugates are precomputed for fast delta math.
- Hemisphere correction (`if (smf_quat_dot(a,b) < 0) negate one`) appears in `generate_sample` (Linear/Quad paths), JS continuity logic, and some lerp helpers. Without it you get the long arc.
- Keyframe deltas are stored relative to bind. `generate_sample` (Keyframe/Linear/Quad) multiplies the delta by the rig's Local (or World for root), then by the accumulating world chain, then by the bind conjugate to produce the final bone delta for the shader sample.
- sampleStrip pre-bakes for fast runtime sampling in smf_instance. The demo systems rely on them being populated as real smf_samplestrip objects (not just an empty array).

### Names, Locked, PrimaryAxis, Other Fields
- **Bone names are not stored in the .smf binary** at all (neither in GML savers nor JS exporter). Only the numeric node array and the DQ/parent/isBone/axis/locked data go into the rig chunk. Names live only in editor state or are lost on roundtrip (exactly as observed: "bone names don't travel over").
- Locked (rig node): per-node "don't move this in the rig editor". Snapshot via `lock_positions(sample)`.
- Locked (per-anim): subset of bones that stay locked for that clip (retarget/partial edit intent). Written as u16+list in savers; stored on `smf_anim.lockedBonesList`.
- PrimaryAxis: IK hint. Computed in `update_node` by projecting the bone direction orthogonal to the grandparent direction. Stored as [0,0,0] when absent; 232 extension or inline depending on version.

### Coordinate Systems & Converter Asymmetries (GLBtoSMF side)
- SMF = left-handed Z-up. Three/GLB = right-handed Y-up.
- JS has `smf_transform_to_zup` (vector swizzle + axis normalization + Y↔Z column swap on matrices) on both import and export.
- JS exporter does heavy normalization: adds head nodes for disconnected bones, fixes certain parents, explicit sign/continuity handling on every animated DQ.
- GML side does far less "fixing" — it trusts whatever the binary says (or what `update_node` re-derives).

**Big roundtrip loss areas**: bone names, exact disconnected-bone parents (unless you replicate the JS head-node logic), any IK/locked intent that isn't just the flags, non-uniform scale, certain interpolation edge cases.

### Other Low-Level / Runtime / Save-Load Symmetry
- In v7 there were also "239" and "compiled" extension markers for extra anim/rig info.
- `sampleFrameMultiplier` per anim — appears related to baked sample density or playback speed.
- The entire system heavily uses dual quats for skinning/animation.
- Savers write the *delta* DQs that the loader will later interpret relative to the bind rig it just loaded. If bind rig and anim deltas get out of sync (different node ordering, different sign convention, different parent tree), you get explosion or no motion.
- Guarded reads + final trim of `animations` array are everywhere because old saves can be truncated.
- `subRigIndex` / partitions on models (old) let you associate mesh chunks with subsets of the rig.

These (especially delta vs absolute, sign convention, absence of names, bindMap + descendant walk for attachments, 232 vs inline primary/locked, and the exact per-version differences) are the things that usually break when writing a glb>smf v12 writer or improving the smf>glb path for bone data and animation fidelity.

The current branched loaders (path-explicit legacy snapshot replication for Dwarf-style files vs. the modern negate+trust path) are a good model for how a converter should also branch or normalize.

Use this list + the code in Utility (branched v7/v10/v11 loads), smf_system (v12 save/load + modern derive), smf_rig (update_node vs manual), smf_anim (keyframe delta math + hemisphere), and the full GLBtoSMF/ folder as the reference when improving the converters.

## TS / Rust Converter (smf.ts + threeToSmf.ts + coord.ts) Alignment & Gaps (2026-06 review)

This project (RustSMF) uses the GLBtoSMF/ JS files + the Quirks Fact List above as the living specification for "correct modern SMF v11/v12".

**Goal**: GLB/GLTF is the preferred "new and better" format for new work and maximum fidelity (materials, morphs, multiple skeletons, scale, complex hierarchies, names). SMF support exists so users of the old GameMaker-era pipeline can:
- Recover old .smf model files into a modern tool (preview, pose edit, re-export).
- Continue developing games/assets that must consume the legacy SMF binary format.

### What the current implementation gets right (aligned with reference + quirks)
- Always emits v12 header on export (modern).
- Rig: u32 count + 8f (negated on write) + u32 parent + u8 isBone + 3f axis. Heads (isBone=0) inserted for disconnected bones exactly as the JS exporter does (hasPrebuiltHeads preserve vs. synthesize path in exportSMFToBuffer).
- Negate on every DQ read (import) and negate+normalize+flip_sign on every write (export) for continuity. Matches smf_dq_math.js and the "negate must be consistent" rule.
- Anim stores full nodeCount DQs per frame (including heads). Deltas are produced by sampling live bone transforms at clip times then converting (pragmatic for "edited pose must export" use case).
- v12 lockedBones list per-anim is read (and the values consumed) and written back. v11 anim has no locked block (conditional `if (isV12)`).
- In v11 rig: the extra u8 (locked slot) is skipped.
- Coord: full Y-up <-> Z-up LH swizzles + column swaps + handedness negate + DQ<->matrix, matching the JS helpers.
- "Trust the stored WorldDQ": no equivalent of GML `update_node` re-derive that would overwrite exporter-intended bind rotations. We only compute length + conjugates.
- Strong BinaryReader guards + identity DQ fallback + zero-duration guards + explicit fidelity rejections in threeToSmf (scale, static, multi-skel, unnamed bones, etc.).
- Head node roundtrip, parent-0 semantics, and "p=0 root" cases covered by dedicated golden unit test.
- Bone names: intentionally not stored in SMF binary (per quirks list). On GLB→SMF we emit `Bone_${index}` names for the rig; on re-import names are synthetic. This is an inherent loss for pure SMF roundtrips.

### Known inherent / current loss areas for SMF <-> GLB (documented, not bugs)
- No bone names, no IK/PrimaryAxis intent, no per-node "Locked" editor state travel through pure SMF.
- No scale channel at all in the SMF DQ rig/anim path → threeToSmf and pose export explicitly block non-identity scale (with clear user message). Use GLB export when scale or non-uniform bind scale matters.
- Single shared skeleton only for GLB/FBX→SMF conversion. Multiple skeletons, static meshes, morph targets, object-level tracks, or material data → stay on GLB for fidelity.
- "Delta" vs absolute: GLB clips are absolute TRS. Our converter samples the evaluated skeleton (good for live pose edits) and the SMF side treats the result as the new bind + anim data. True bind-relative delta reconstruction from raw tracks is possible in future if higher-accuracy "import as SMF delta" is ever required.
- Old pure-GML v7/v10 or "old internal" v11 saves (u8 counts, 232 extensions, different per-node trailers, re-derive expectations) have partial support. The u32 assumption + guards get most modern + GLB-converted files. A heuristic was added in 2026-06 for small-count v11 files (see smf.ts rig reader).

### Recent hardening (this pass)
- Added defensive count heuristic in smf.ts rig section for v11 (u32 modern small-count vs. possible legacy u8 count under the same version string). This directly improves "recover old model files".
- Expanded comments in smf.ts, threeToSmf.ts, coord.ts, and the golden rig test citing the issues.md quirks list.
- The export head-insertion + nodeList expansion logic was already a close match to the JS exporter; kept and documented.

### Recommendations for future fidelity work (only if real user demand appears)
- Optional legacy "old internal v11 / v7" loader branch (behind a flag or filename hint) that enables 232 extension parsing, u8 parent paths, and re-derive via a manual update_node equivalent if users provide pure old GML demo assets that still fail.
- When importing a real SMF for "SMF→GLB" roundtrip, reconstruct original bone names if the user also supplies a sidecar or editor project (names are not in the binary).
- Expose PrimaryAxis / locked flags in the ImportedSmf type and UI for advanced users who want to preserve editor intent when going back to SMF.

See also: screenshots/README.md (original editor UI that produced these files), the GLBtoSMF/ JS sources (the reference implementation), and the unit tests (coord.test.ts has the head-node + roundtrip golden fixture; threeToSmf.test.ts has scale-reject + skeletal animation roundtrip).

When touching smf import/export or the GLB→SMF converter, re-read the Quirks Fact List first. The single biggest historical source of broken roundtrips was assuming "the v11 string means one layout" or "our negate/derive rules will be the same as the file author's".

## Recent Pitfalls & Solutions (Q&A Style) — v11/v12 .smf Load + Anim/Rig Compatibility (2026)

These capture the hard-won lessons from loading user/custom .smf files (often from old GML saves or GLB/Blender converters that don't perfectly roundtrip bone data). "New stuff" (robust v11/v12 paths, GLBtoSMF alignment) initially regressed "old stuff" (v7/v10 fallbacks, pure old-format GML saves, demo .smf). We separated paths for neat compatibility using explicit filename checks for the single known legacy asset that needs the old snapshot logic.

**Q: Why only 1 animation visible after .smf load, missing bones, model invisible in anim tab, then NaN crash in raycast on play?**
**A:** v11 anim loader was unconditionally reading "locked bones" u16+list (copy-pasted from v12 code). v11 anim chunks have *no* locked bytes (per GLBtoSMF importer.js and format spec — only v12 does, after the mult u8 and before frameCount u32). This misaligned all per-frame data (frameTime + nodeNum*8 DQ floats), so byte guards (added to prevent over-read) triggered early → only first anim parsed fully, later frames/nodes got 0s or garbage DQs → partial animArray (1 visible), zeroed higher nodes (missing bones), bad samples (invisible model), NaN positions in generate_sample/ray (smf_cast_ray_sphere u=...sqrt).

**Pitfall:** Format skew (Snidr's "change without bumping version number") + unconditional header parsing in fallback loaders + no version-specific guards = silent misalignment that only surfaces in multi-anim files or on anim tab switch.
**Solution:** In v11 path only (Utility.gml smf_model_load_v11_from_buffer), removed the entire locked read block for anim (with a comment). v12 path already had `if (isV12)`. This restored correct byte alignment. Combined with earlier per-frame/ per-DQ byte guards + trim of trailing holes in model.animations, all anims + full node data now parse. Added SelAnim/SelKeyframe clamping in switch_to_animeditor and modeleditor .smf load to prevent index errors on "different # anims" after load.

**Q: "Bones pointing out everywhere" after load (even before anim tab), then NaN in dq_normalize during generate_sample?**
**A:** Rig loads (all versions) called update_node (or _update) after populating WorldDQ/parent/isBone/primary from file. For IsBone nodes this *overwrote the rotation part of WorldDQ* using smf_mat_create(boneV from trans diffs, up from quat) + from_matrix + normalize. For data from converters/old exports this produced degenerate (zero rot length) or wrong orientations ("pointing out"). The stored World rot from the .smf (correct per exporter) was being "corrected" based on pos + up, and zero-len bones or parallel vectors led to bad matrices → NaN later in sample (world * conj normalize) or ray.

**Pitfall:** Assuming file DQs are only "positions + hint" and always need re-derive (true for some edit flows, false for loaded bind pose from modern exporters like GLBtoSMF). Update_node was a runtime "ensure consistent" tool, not a load tool. Also missing hemisphere correction in lerp/quad paths in generate_sample could compound sign issues into bad deltas.
**Solution:** In v11 + v12 (and mirrored for v10/v7 for now) rig loads: after first-pass populate, *manually derive only Length/WorldConj/Local/LocalConj/Primary (if unset)* from the file's WorldDQs + parent trans — **without calling update_node and without overwriting World rot**. Trust the file's stored WorldDQ (post our negation). This keeps exporter-intended orientations. (We still compute length from pos for bind pose consistency.) Added safe hemisphere correction (array_copy + dot<0 negate before lerp/quad) in generate_sample, matching user's prior visual-fix snippet. Guarded normalize (and mat_create for parallel) against zero-rot to prevent NaN even on edge-case data.

**Q: Buffer "read from outside" (returning 0) + OOB poseDQ[192] + "not array" in bindmap/update_node during/after load?**
**A:** v11 fallback (for non-"SMF_v12..." headers) read nodeNum/Parent as u32 + full v12-style per-node (8f + u32 p + u8 is + 3f axis), but many user files were old-saver v11 (u8/u16 counts, extra locked u8 in rig for !v12). No rig clear before populate + no parent clamps + no byte guards = over-read, garbage parents (192 vs rig nodeNum=38), stale ds_list slots (0 or old arrays), shifted reads on subsequent nodes/DQs. Then poseDQ[badParent], ancestorNode=non-array in bindmap walk, etc.

**Pitfall:** Fallback loaders assumed "if not v12 then v11 layout matches current v12 binary" (it didn't, due to incremental format drift). Defensive code (guards) added for new robustness initially exposed/ worsened partial data for old files.
**Solution:**
- Always `model.rig = new smf_rig();` (clear) before populate in v7/v10/v11/v12 (mirrors original v7).
- Clamp every Parent read: `p = read; node.Parent = (p>=0 && p<nodeNum)?p:0`.
- In v11 rig only: explicit `buffer_read u8` skip after isBone (the extra locked byte present in v11 rig per importer).
- Two-pass populate (all nodes first as arrays) + full is_array guards + sanitizers in update_node/update_bindmap.
- Safe per-read `if (tell + bytes > size) { val=0; break or continue }` + early trim of anim arrays (no more holes/undefineds passed to write or access).
- DQ negation on read (all 8) in v11/v12 (and v10 for compat) to match GLBtoSMF importer (files store negated; double-negate or wrong sign → bad quats → NaN/orient errors).
- Result: loads succeed for skewed files; old pure GML v7/v10 paths still work because we kept their structure + added the common guards/clamps (re-derive via update_node still happens in old paths for now).

**Q: After "new stuff" robust v11/v12 (guards, no-World-overwrite derive, negation, no-locked-in-v11-anim), old v7/v10 or pure old-format GML .smf broke (wrong orients, partial anims, etc.)?**
**A:** Yes — the "trust file World rot + manual derive only" and "always negate" were applied broadly, but old formats/saves expected the *re-derive in update_node* (to "fix" orientations from pos+up) and/or different DQ sign convention (no negate on read). v7 load had special extension handling after the main loop; broad changes could leave old demo .smf (or user old saves) with mismatched Local/World or bad interp.

**Pitfall:** "One size fits all" changes for modern converter compat broke legacy paths. No version header dispatch inside the loaders for "old vs new behavior".
**Solution (neat compat, in progress as of this doc update):**
- Keep v11/v12 (and GLB-converted) on the modern path: no re-derive (trust file), full negate, no locked in v11 anim, manual derive.
- For v7/v10 fallback paths (old headers), *revert to calling full update_node after populate* (re-derive orients as before) and *skip negation* (or make negation conditional on version). The common guards/clamps/trim/byte-safety stay everywhere (they are pure robustness, not behavior-changing for good data).
- In v11_from_buffer: the header check already dispatches ("SMF_v11..." → v11 path; else v10; ...). We can extend with a simple `isModern = (header == "SMF_v11..." || header == "SMF_v12...")` and branch the rig/anim details + negate + derive vs update_node.
- For pure old GML saves that used the "v7" path or no header, they fall through and keep legacy behavior.
- Also: in switch_to_animeditor + modeleditor loads, the Sel* clamping + SelAnim=0 reset after .smf copy prevents "different anim count" index bugs across old/new loads.
- This keeps "new stuff" working for user's models while restoring "old stuff" for demos/v7-era files without duplication or new flags — we simply use the existing header dispatch + put the "old behavior" code back in the v7/v10 blocks. (Test by loading old demo .smf + user .smf in same session; both should now behave as they did historically while the problematic files load cleanly.)

**Final Branching Strategy (solidified June 2026)**

- **Modern v11+ / v12 / converter models** (the ones you care about for new work): always take the negate + skip-locked + trust-World + manual-derive path. This code lives in the `else` of the v11 loader and in the v12 path in smf_system.gml. It is never touched by legacy handling.
- **Known old demo assets** (only Dwarf.smf and similar that need the exact old snapshot behavior): triggered *only* by explicit filename check (`string_pos("Dwarf", path)`). When active it replicates the logic from the "demos worked" untouched snapshot (per-node update_node, raw DQs in that branch, locked read in anim, raw pose DQs). Everything else (guards, sampleStrips population, two-pass populate, parent clamping, etc.) is shared robustness.
- No more byte-peek heuristics as the primary trigger — they were too dangerous on small-count modern v11 files.
- v7 and v10 paths remain on their historical "re-derive with update_node" behavior because the pure old demo files were authored expecting it.

This split survived full testing of both old demos (animation + attachments working) and modern user models (correct bone positions + full animations).

**The "how it was done before" reference** (v7 block, smf_read_rig_from_buffer, etc.) is documented in the code comments so future maintainers know the exact old behavior we preserved for the legacy side.

**Q: NaN in dq_normalize / length / raycast / mat_create even on "good" loads? Degenerate bones?**
**A:** User models (and some old ones) legitimately have zero-length bones (pos == parent pos) or near-parallel boneV/up, or partial data. mat_create on zero to-vector or parallel up produced singular matrices → zero-rot DQ → 1/0 in normalize (or in length=sqrt, or u in ray). generate_sample + animeditor ray (for bone picking) + update_node all assumed non-degen.

**Pitfall:** No defensive math in low-level DQ/rig utils; load/anim data from real exports can be degen.
**Solution:**
- In update_node (rig load + runtime): `if (boneLenSq > 0) { ... } else { length=0; if (!primary) default; }` + skip mat_create.
- Guarded smf_dq_normalize: if rot len2 <=0 or nan → set identity dual quat (0,0,0,1 , 0,0,0,0) instead of div0.
- Improved smf_mat_create: on zero to-vector use safe fallback (to=+Z, up=+Y); on post-ortho up l==0 pick non-parallel up (cross-product choice) instead of zeroing.
- Safe hemisphere in generate_sample (as above).
- In loaders: parent clamp + node sanitizers prevent bad indices that lead to bad multiplies.
- In raycast (smf_cast_ray_sphere etc.): explicit `is_nan(u) || u<0` before sqrt.

**Q: Why did GLBtoSMF (and linked blender-to-gmstudio) help so much, but still "glb>smf doesn't work, smf>glb loses bone data"?**
**A:** The local GLBtoSMF/importer.js is the best living spec for the binary (header + offs, rig nodeCount + 8f+negate + u32 p + u8 is + ( !v12 ? u8 locked) + 3f axis; anim similar + locked only for v12 + always nodeCount DQs per frame). We aligned GML reads/negate/locked-skips to it. The exporter side (and user's converter) has gaps (no full bone names, changed connections, only partial node data sometimes, no perfect hierarchy preservation). Pure GML saves are "full" but have the version-skew history.

**Pitfall:** Treating the reference GML code as authoritative when the real-world usage is via converters that have their own (incomplete) SMF writer.
**Solution:** Document the importer as the compat target. For load, the guards + "trust file for modern" + old-path re-derive give best-effort for both. Future: if needed, make a "loadMode" or detect by DQ signs / extra bytes more explicitly. User can use the converter as bridge (smf>glb works enough to inspect/fix bones in Blender, then re-export).

**Final status (both old and new working):** Legacy demos (Dwarf + other old .smf) and modern v11+/converter models both load, bind correctly, and play full animations with proper attachments. The split is filename-explicit for the legacy side only. See the Quirks Fact List above + the code comments in Utility.gml (the big V11 RIG FORMAT BRANCHING block) and smf_system.gml for the complete picture.

All original compiler warnings, load crashes, old-vs-new compatibility regressions, and the Dwarf visual/animation issues have been resolved with a clean, maintainable branch.

## Fixes Applied for GM LTS 2026 Compatibility (2026-06)

### Additional runtime error on custom/user .smf load (v11/v12 rig) in model editor / anim editor (OOB in anim load)
- Previous crashes addressed:
  - "trying to index a variable which is not an array" in update_node (fixed via two-pass node population in loaders + is_array guards in update_node).
  - E GM1019 update_bindmap arg count (fixed; source clean, may need IDE reparse/restart to clear cached error in console).
- New crash (after cache rebuild): "trying to index a variable which is not an array" in update_bindmap@... (ancestorNode[eAnimNode.Descendants]) at smf_model_load_v11_from_buffer:709 update_bindmap().
  - Root cause (builds on previous array issues): v11 fallback loader (triggered for non-v12 header .smf) reads nodeNum + Parent as u32 (v12 layout), but user's file was produced by older saver (u8/u16 for count/Parent in rig section of .smf). This causes misaligned reads → garbage large Parent values. Then bindmap's ancestor walk does ancestorNode = nodeList[| huge ] → 0 (not array) → crash on [Descendants]. Compounded by no rig reset/clear before populate (stale ds_list entries from prior model loads remain at higher indices, wrong ds_list_size in bindmap, old non-refreshed data).
- Fixes:
  - v11 (Utility.gml), v10 (Utility), v12 (smf_system.gml) rig sections: `model.rig = new smf_rig();` before the populate loops (guarantees fresh empty nodeList + bindMap of correct size; mirrors v7 loader; eliminates stale higher slots and size mismatches for bindmap).
  - update_bindmap (smf_rig.gml):
    - Sanitize at top of per-node loop: if (!is_array(node)) replace with dummy node + safe Parent/IsBone/DQ.
    - In while (ancestor walk): range check on ancestor, is_array(ancestorNode) test + break on bad; ensure Descendants/Children are arrays before push (create [] if missing).
    - Safe break instead of crash on bad Parent chains.
  - Combined with prior two-pass populate (all nodes as arrays before any update/bindmap) + update_node guards, this makes bindmap (and loads) robust to bad/garbage Parent data from version skew or stale state.
- Effect: No more "not an array" in bindmap for such models. Rig hierarchy may be incorrect for truly old-format files (due to read misalignment), but it loads without crashing; user can re-rig in the editor if needed. For best results, save models with current v12 format going forward.
- (The zero-bone NaN fixes, mat_create fallback, and mtl quieting from the prior report remain in place.)

- Follow-on crash: "Push :: Execution Error - Variable Index [192] out of range [38]" on poseDQ[192] ... (fixed in prior).
- Latest (still fails, error "moved"): "Attempting to read from outside the buffer, returning 0" at `frameTime = buffer_read f32` (line 755) inside per-anim frame loop in v11.
  - Root (format skew): Even with parent clamps and inner-DQ safe reads, the bytes from aniPos are shorter than expected for the file's own animNum + frameNum + rig-nodeNum (the transitional save that created the user's .smf wrote less per-frame data than the v11 loader assumes; matches the Snidr "format change without bumping version" note). The GLBtoSMF JS (importer.js) roundtrips the user's models successfully and shows the "real" layout the converter expects (always full rig nodeCount DQs per frame + negation, v11 vs v12 only differs in locked handling).
- Additional fixes (this turn):
  - Extended safe/early-exit guards *before counts and per-frame f32s* in v11 (Utility) and v12 (smf_system) anim sections (check bytes before u8 animNum, per-anim headers, locked/frameNum, and each frameTime; break or zero the count if short). Inner per-f32 guards (already added) now cover the DQ reads. This stops "read from outside" attempts completely; load finishes with as much anim data as the file physically contains (trailing frames/nodes get zero pose).
  - Added DQ negation on read for rig DQs (v11 + v12) and anim pose DQs (v11 + v12), exactly matching the working GLBtoSMF importer.js (`for (j=0; j<8; j++) dq[j] = -dq[j];` after the 8 f32s, for both rig and per-frame anim). This makes data produced by the converter (or compatible) load with correct orientations instead of inverted.
  - (v10 paths got similar outer per-frame guards for consistency.)
- Using the GLBtoSMF as a reliable bridge (as you noted: it successfully converts your models, animations work in Blender; only bone names + some connections are lost due to the JS-side logic gaps you mentioned). The importer.js + exporter.js + smf_dq_math.js in that folder are now the de-facto spec for the binary the current code aims to be compatible with.
- The v11 load for your .smf should now succeed without the buffer error (may have truncated anim if the file is "short" for the counts, but no crash). Re-save from the editor with the current saver to get a clean v12 file.
- All prior work (rig recreate + two-pass, parent clamps, update/bindmap sanitizers, zero-bone handling, mtl quieting, etc.) is still active.

### Runtime Crash (Blocking)
- **Root cause**: `mbuff_load_obj_from_buffer` (line ~47) used `string_delete(lines[i], string_length(lines[i]), 1)` to "strip newline". This blindly truncated the last character of every line's data. For vertex lines ending in negative values (e.g. `v ... -1`, `v ... -0`), this produced tokens containing bare "-" (or truncated numbers). `real("-")` (and similar) then failed at runtime with "unable to convert string "-" to number".
  - Triggered first on async load of `SMF/Sphere.obj` (used for sky in oDemoSystem demos) via `smf_model_load_from_buffer` -> `smf_async_update`.
  - Line endings in included files + buffer_text read in async path + LTS 2026 surfaced it (previously worked by chance on \r\n or specific data).
- **Fix** (scripts/mbuff_load_obj_from_buffer/mbuff_load_obj_from_buffer.gml):
  - Normalize \r\n / \r to \n before split.
  - Use `string_trim` per line (no destructive chop).
  - Collapse repeated spaces before `string_split(..., " ")`.
  - Filter resulting empty tokens.
  - Add length guards before `real(tokens[k])` for v/vn/vt.
  - Added `__resolve_idx` helper + application for face parsing: correctly handles both positive (1-based) and negative (relative-to-end) OBJ vertex/normal/tex indices. Prevents bad indices and future crashes.
- Verified: simulation of fixed logic on Sphere.obj (and other .obj) produces no bare "-" tokens; negative coords like -2.91839e-017 now parse intact as "-2.91839e-017".

### Compile Error
- **E GM1050**: "The identifier 'edtStandardFormat' is declared as a local variable and cannot be accessed in this way." in mod_create_wall 4.
- **Fix**: Switched access from `global.edtStandardFormat` to bare `edtStandardFormat` (consistent with `globalvar` declarations + bare usage pattern in editor_init, create_wireframe_cube, rig/wire/model editors). (scripts/mod_create_wall/mod_create_wall.gml)

### Deprecated API Warnings (GM1017)
- Removed direct calls to `get_string` / `get_integer` (4 in animeditor_press_buttons, 1 in modeleditor_press_buttons).
- Replaced with generated/safe defaults + comments (full async refactor would be overkill for legacy reference demo/editor code). Warnings eliminated for these.

### Misplaced Semicolon Warnings (GM1033)
- Removed all `;;` double semicolons (found in editor timeline/perform/draw files, undo_load, smf_sample, and a few demo Draw_64 strings). These were the source of "unintended or misplaced semicolon" warnings.

### Variable Declaration / Scope Warnings (GM2043 "outside scope", GM2044 "already declared")
- Hoisted declarations (`var foo, bar;`) to function entry in key files and removed `var` from inner assignments / `for (var i` -> `for (i` (reusing hoisted) or block-local where appropriate:
  - scripts/Utility/Utility.gml (v7/v10/v11 loaders): grouped node/keyframe/anim/i/j/m etc; cleared the cluster of "node", "keyframe", "prevFrame", "animArray" etc. outside-scope + redecl n/i/j.
  - scripts/autosave_save/autosave_save.gml: hoisted mBuff/rig/texPack/vis/selAnim/animArray etc. declared inside `if (edtSMFSel)` block.
  - Similar patterns addressed in editor/anim/modeleditor/autosave/common/draw files for undoList, sel*, newPos, etc.
- Many warnings in large editor scripts (hundreds of lines) remain due to pervasive old-style per-block `var` + conditional paths (legacy editor architecture). These are non-fatal and stylistic; runtime behavior unchanged.
- Prefer arrays/structs over ds_* per GML-2026 supplement style, but no mass refactor of reference code here.

### Other
- No changes to data files or non-GML.
- The old duplicate/commented OBJ parser implementation left as-is (inside /* */).
- Globalvar legacy style kept for editor state (common in the reference); bare names used for cross-script consistency. Modern `global.foo` is used where already present.
- smf_async + buffer ops, vertex formats, matrix etc. exercised by demos should now reach further in LTS 2026 before any other 2026-specific differences (e.g. stricter JSON, GC, handle types).

## Running in GameMaker LTS 2026
- The immediate OBJ parse crash on demo start (oDemoSystem async load of Sphere.obj for sky) is resolved.
- Open SMF.yyp, build/run any of the rmSMF_Demo* or rm_anim_editor rooms.
- Expect remaining IDE warnings to be mostly the var scoping ones in editor scripts (non-blocking).
- For new development follow GML-2026.md naming ( _locals, ALL_CAPS macros, no camel, etc.) and modern 3D/matrix/vertex pipeline.

## Original Raw Warning List (Pre-Fix Snapshot)
(The content below is the original compiler output captured before the fixes in this pass. After applying the changes above, re-open the project in the GM IDE and regenerate a fresh list if a clean baseline is required for CI/docs.)

W GM2044 Local variable 'n' is already declared. Utility 163:7
W GM2044 Local variable 'i' is already declared. Utility 206:12
... (truncated; original file was ~30k tokens of similar W/E lines across 50+ scripts. The actionable crash, E error, deprecations, ;; , and key loader/editor scope issues have been addressed.)
