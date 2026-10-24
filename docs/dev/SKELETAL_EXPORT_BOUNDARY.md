# Two-key export-boundary preservation

P7C's singular right43/44 intake exposed a difference between stored source
poses and emitted v1 keys. At 42/60 the exporter samples 0.7 seconds; the GLB's
float32 key is at 0.699999988079071. Changing the next source chord can therefore
change emitted key 42 and runtime poses before the authored interval. The old
raw-GLB preservation check did not prove the emitted runtime property.

`skeletalTwoKeyExportBoundary.ts` supplies the explicit producer-only
`preserve-unselected-emitted-keys.v1` context for `prepareSkeletalExport`.
It validates the generated singular two-key report against the re-imported
canonical chord tracks, including clip, direct joint chain, ticks, stored values
and correction bounds. It reconstructs the pre-authoring curve from the report's
exact `before` values. Unselected emitted integer keys use that curve at the
existing nominal `tick/60`; the two selected keys use the authored GLB.

Source references always sample the independently re-imported authored GLB at
their original phases. This context changes no mesh, skin, bind, root extraction,
reference schedule, engine format, evaluator, tolerance or resource limit. It
does not round every sample to float32. Omitted context retains prior output.
The baseline mixer releases on success, failure and cancellation; the caller's
track arrays and provenance report remain unchanged. The exporter fingerprint
includes the new helper.

## Current proof and integration

The disjoint helper/exporter slice has four focused boundary tests. They cover
both timestamp directions, exact unselected emitted keys, authored selected keys,
unchanged source references, deterministic/default output, malformed provenance,
NLERP-only admission and cancellation after mixer allocation. The neighboring
export, chord and immutable publication slice passed 15 tests before the final
cancellation test was added; production typechecking also passed.

The retained actual White Wolf model is byte-identical to the earlier right43/44
input. Native and WASM agree exactly at 41, 41.25, 41.5, 41.75, 42 and 45; all six
match the terminal baseline after this repair. All 1,173 unselected emitted joint
keys match, and all five independent gait references pass unchanged tolerances.
The subsequent dense probe streams all 361 walk poses in batches of eight;
native/WASM agree for both inputs and all 348 outside runtime poses remain exact.
Its 13 local whole-skin floor poses pass, with maximum penetration
0.020891640925105953 m against 0.021012886070915813 m.
The initial comparison-adapter failure is retained separately; it required the
receiver's normalized vertex mapping, not a producer or engine tolerance change.

Evidence is in the registered
`D:/Compact_Evidence/RustSMF/runs/p7c-export-boundary-preservation-20261024/` run.
`probe-boundary-fixed.json` and `probe-dense.json` bind model, producer, references
and cleanup.
The ordinary CLI now accepts the explicit v3-only `export.twoKeyExportBoundary`
policy with a singular NLERP bake. Omission remains valid; unsupported values,
other modes, missing singular authoring and plural selection refuse. The policy
is bound in hashed producer settings, and the generated report is passed only
to packets containing its gait. Existing omitted-option/plural output and engine
manifest semantics remain exact. The proposal was adapted because adding the
optional key unconditionally to this parser's exact-key list would require it.

The integration's 22 focused tests and test typechecking pass, including ordinary
CLI repeatability, settings identity, unselected emitted keys, unchanged independent
references, omitted/plural bytes, idle-only packets, refusal and cancellation.
Actual White Wolf CLI output matches the prepared dense proof's asset/reference
bytes; its model remains `137eece...`. Ordinary omitted and plural controls match
their retained model/asset/mapping/reference/settings bytes. Integration evidence
and the current canonical producer gate are in
`D:/Compact_Evidence/RustSMF/runs/p7c-composable-two-key-bake-20261024/integration-status.json`.

## Qualified singular intake — 2026-10-24

Review/Recheck matches all 20 baseline working-tree files to integration
`f44a2449...`. GaimEngine's ordinary CLI bundle
`51c442b52deaf3d4fd0f004a99e7ec1f19da1fcfdfe40e275edf27f3f394b86f`
now passes bounded acceptance: actual 46/590 native/WASM receiving, all 361 walk
poses with 348 outside poses exact, 13 local support/skin poses, 27 segments with
zero knee inversions, six independent idle/p25 endpoints, 24 transition seams,
isolation, restored six-tick replay and cleanup. The 637-pose physical diagnostic
correctly exits 1 with the same four failures; separate acceptance passes.

All 590 independent references (501,671,081 bytes) and all mappings remain exact.
Only 39 erroneous emitted key42 occurrences are restored across 13 packets;
selected43/44 keys stay exact. All 23,240 planted observations use their true
entry anchors. All 451 positive drift increases are already-failed observations;
there are no new threshold failures. The largest is 0.001527893643 m at
right v200@43.5. Stored and expanded gzip identities verify. The old 345/348
failure and 731-record drift artifact remain immutable.

Authoritative proof is
`D:/Compact_Evidence/GaimEngine/runs/p7c-export-boundary-preservation-20261024/acceptance.json`,
with `scopeQualified: true`; `reference-identity.json` binds the unchanged
references and corrected keys. HISTORY retains source, hashes and review proof.
This closes only the singular intake. Full P7C/visual acceptance remain open;
the earlier plural composition is a separate candidate. No publication is included.

## Next bounded pass

Selected producer repair: explicit plural boundary composition. The read-only
comparison binds qualified singular producer `f44a2449...`, model `137eece...`,
bundle `51c442b5...` against retained plural producer `3860565c...`, model
`d8d9a606...`, bundle `633f4373...`. No candidate was regenerated or changed.

Both retained graphs agree exactly between native Rust and actual WASM at all
361 walk poses. Relative to qualified singular, plural preserves only 335/348
poses outside the added left interval [86,89]. Thirteen differ: 41.25 through
42.75 by quarter ticks, 85.25/85.5/85.75, and 89.25/89.5/89.75. Even outside
the union [42,45] plus [86,89], only 326/335 match. The nine union-outside
differences are the three poses before42, three before86 and three after89.
Largest left-outside skin delta is `6.784674109140969e-8 m` at42; exactness fails
without changing any receiving tolerance. Root translation/yaw remain exact.

Raw GLB changes only the three left quaternion channels at87/88 and adjacent
chord tangents at86/89: 32 stored float components per channel. All 45 other
clips, 29 raw walk channels and right13-degree authoring report are exact.
Emitted data instead differs at three right key42 entries and three left
entries at each of86/87/88/89: 15 keys per gait occurrence, 195 across13 packets.
Only six left87/88 keys are intended additions; nine are boundary differences.
Mesh/skin/bind/lineage, root, supports, idle/p25/terminal reports and 105 other
clip occurrences match. This attributes the gap to nominal-time sampling of
changed float32 chords, beyond the stored GLB preservation already proved.

Extend the existing explicit `export.twoKeyExportBoundary` policy to the strict
one/two-record plural selection. Preserve the existing singular API/report and
its output. Validate every applicable report and disjoint footprint before
sampling. Restore all declared `before` rotations together as one pre-authoring
baseline; unselected emitted keys use that baseline and the union of selected
ticks uses the unchanged authored GLB. Filter by clip, without hard-coded gait,
side or tick names. Keep policy/settings and every helper in producer identity.
Omitted-option jobs, original modes and legacy singular behavior remain exact.

RustSMF owns job admission, CLI forwarding/settings, boundary reconstruction,
emitted sampling and tests. Verified owners are `skeletalExportJob.ts`,
`skeletal-export-cli.ts`, `skeletalTwoKeyExportBoundary.ts`, `skeletalExport.ts`
and their focused tests. Existing recipe parsing, source-fidelity union and
conditioner authoring must retain their guards. GaimEngine owns subsequent
receiving qualification. This comparison selects implementation; it does not
implement or qualify the proposed policy extension.

Done When:

1. Strict explicit NLERP admission supports the existing singular and one/two
   disjoint plural records. Invalid/ambiguous/overlapping/stale report selections,
   wrong modes and bounds refuse; late failure/cancellation releases resources.
   Existing singular opted-in and all omitted-option jobs retain model, asset,
   mapping, reference and settings bytes. Both record orders are deterministic
   for content; caller order may remain bound in settings. Unrelated packets
   receive no boundary context. Refusal publishes no receiving generation.
2. Ordinary CLI keeps model `d8d9a606...` and original plural reference/mapping
   bytes exact. Both declared key pairs and 13/7-degree authoring bounds stay
   unchanged. Compared with qualified singular, only the six left87/88 emitted
   keys may differ: all right keys, unselected keys, root, 45 clips, supports,
   mesh/skin/bind/lineage, idle/p25/calibration and stored terminal curve remain
   exact. Verify exact selected accessor extrema. Do not change reference phases,
   receiving compensation, evaluator, thresholds or permitted intervals.
3. Prove actual native/WASM parity for all 361 walk poses, all 348 outside [86,89]
   exact against the qualified singular graph, both local 13-pose arcs, unchanged
   right arc and terminal runtime tail, six independent endpoints, 24 seams,
   27 segments and zero knee inversions. Measure every planted observation at
   its true entry anchor; permit no new drift threshold failure and report every
   increase. Preserve drift/whole-skin first/max witnesses. Both global sole
   criteria must pass; remaining physical failures stay truthfully reported.
4. Bind the new producer and renew all 46 packets/590 independent native/WASM
   references, isolation, six-tick restored replay, cleanup and the actual 637-pose
   pilot; run the canonical local gate. Separate bounded acceptance must pass
   while the physical diagnostic retains its real failures. Neither earlier
   singular nor plural proof qualifies new output automatically.
5. Update owning docs/TODO/routes, release only task-owned disposable resources,
   and preserve GaimEngine v1, all three Rust overlays, shared dependencies and
   every retained candidate/failure/evidence byte. No new anatomical authoring,
   support editing, engine change, drift/floor repair or publication belongs to
   this batch. Full P7C and visual acceptance remain open.

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-progress-publication | change=polished proof criteria while retaining the selected unimplemented union boundary scope -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-plural-comparison | change=attributed retained runtime leakage and selected explicit union sampling with source-bound proof criteria -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-boundary-review | change=rechecked producer integration and bound the assembled singular receiving pass-down -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-boundary-integration | change=wired strict singular policy and recorded ordinary CLI compatibility while retaining singular qualification boundary -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-export-boundary-preservation | change=describe disjoint producer sampling repair and proven six-phase scope while retaining full intake requirements -->
