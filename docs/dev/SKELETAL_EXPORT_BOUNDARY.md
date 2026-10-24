# Two-key export-boundary preservation

P7C's singular right43/44 intake exposed a difference between stored source
poses and emitted v1 keys. At 42/60 the exporter samples 0.7 seconds; the GLB's
float32 key is at 0.699999988079071. Changing the next source chord can therefore
change emitted key 42 and runtime poses before the authored interval. The old
raw-GLB preservation check did not prove the emitted runtime property.

`skeletalTwoKeyExportBoundary.ts` supplies the explicit producer-only
`preserve-unselected-emitted-keys.v1` context for `prepareSkeletalExport`.
It accepts the existing singular `report` or strict one/two-record `reports`,
mutually exclusively. All applicable reports, disjoint footprints, clip bindings,
direct joint chains, stored values and correction bounds validate before mixers
are allocated. Every declared `before` rotation is restored together in one
pre-authoring baseline per clip. Unselected emitted integer keys sample that
baseline at nominal `tick/60`; the selected tick union samples the authored GLB.
Reports are filtered by packet clips. Caller arrays/reports remain immutable.

Source references always sample the independently re-imported authored GLB at
their original phases. This context changes no mesh, skin, bind, root extraction,
reference schedule, engine format, evaluator, tolerance or resource limit. It
does not round every sample to float32. Omitted context retains prior output.
The baseline mixer releases on success, failure and cancellation; the caller's
track arrays and provenance report remain unchanged. The exporter fingerprint
includes the new helper.

## Original singular proof and integration

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
The original singular CLI integration accepted the explicit v3-only `export.twoKeyExportBoundary`
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

<a id="next-bounded-pass"></a>
## Plural union boundary — completed 2026-10-24

The selected producer repair, explicit plural boundary composition, is complete
locally. The following comparison and Done When retain its accepted scope. The read-only
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
receiving qualification. The comparison selected the implementation whose fresh qualification is recorded
below; the historical candidates remain unchanged.

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


## Plural union results

All five Done When criteria are closed locally at producer
`55ad2c76679f41ba75a680c0a83f85c69851bb743d0d366937bd896ee63ebf27`,
exporter `3c8339995f717e3dbdb08b732b49acc3bbce0a16fb1f9f30faaef244ecdeef77`,
based on main `22dfbd6` with the recorded implementation diff. Bundle
`85702c3c37be1d59f988daa66ec13a07af341f6fbf218eab3a8f9255575cc395`
retains plural model `d8d9a606...`, all 590 original reference poses
(501,671,081 bytes), mappings and 13/7-degree authoring reports. All six selected
accessor extrema remain exact. Only six left87/88 emitted keys per gait packet
change versus qualified singular; all right/unselected keys, 45 clips, 105 other
clip occurrences, 29 raw walk channels, supports, root, mesh/skin/bind/lineage,
idle/p25/calibration and the terminal curve remain exact.

Fresh native Rust and actual WASM agree at all 361 walk phases for both graphs.
All 348 poses outside [86,89] and the entire right arc/terminal tail are exact.
Both 13-pose arcs pass: right maximum 0.020891640925 m and left maximum
0.020938074220 m, each below 0.021012886071 m. Six independent endpoints,
24 transition seams, loop closure, 27 segments and zero knee inversions pass.
Every one of 23,240 planted per-vertex observations uses its true entry anchor.
All 447 positive drift increases are retained (374 previously passing, 73 already
failing); none creates a threshold failure. Largest increase is 0.000403009271 m
at88.25, left vertex3383. Largest already-failed increase is 0.000237563384 m
at88.5, left vertex3489.

Fresh 46-packet/590-reference receiving passes isolation, six-tick restored replay
and cleanup. The actual 637-pose pilot completes with expected exit1: global sole
gap/penetration now pass; drift and whole-skin remain failed with exact first/max
witnesses (drift phases2/23.75, skin24.25/51). Other pilot cases remain exact.
The canonical local gate passes 706 frontend tests and 14 Rust checks. Both
record orders give identical model/asset/mapping/reference content; settings may
bind caller order. Actual singular opted-in, singular omitted and plural omitted
compatibility controls retain all prior model/artifact/settings bytes.

Evidence and acceptance are retained at
`D:/Compact_Evidence/RustSMF/runs/p7c-plural-union-boundary-20261024/`.
`acceptance.json` binds the criterion receipts; `summary.json` binds final docs,
source identity, protected files and owned cleanup. Earlier receiver attempts
using an older build directory and diagnostic-adapter failures remain retained;
qualified-build reuse is hash-exact and no engine rebuild was needed. The first
full gate exposed context-route budget pressure; the general route now delegates
boundary tests to their focused owner. No source/reference/evaluator/tolerance,
engine v1, Rust overlay, shared dependency or prior evidence was changed by the
verification harness. Full P7C and visual acceptance remain open; next is a
read-only review of the two residual failures. No new anatomical repair or
publication is included.

<a id="residual-physical-attribution"></a>
## Residual physical attribution — complete 2026-10-24

Read-only in-memory sampling reproduces every retained walkSlow criterion,
first/max witness and root-travel value exactly over all 361 poses. Qualified
producer 55ad2c76, model d8d9a606 and bundle 85702c3c remain unchanged. Existing
native/WASM parity is reused; the new samples use the exact qualified WASM bytes.
No native build/copy, candidate, support or reference was generated or changed.

Planted drift is source motion against fixed declared anchors, not receiving
error. Five of six windows fail. Each has 70 sole vertices; the complete sweep
checks 332 patch observations and 23,240 per-vertex observations:

| Patch / anchor window | Failing quarter phases | Failed vertex observations | Current maximum (m) |
| --- | --- | --- | --- |
| Left [0, 24) | 2–23.75 | 5,998 | 0.673400722680 at 23.75/v3467 |
| Left [44, 58) | 46.5–57.75 | 3,197 | 0.270333727838 at 57.75/v3398 |
| Left [84, 89) | 87.5–88.75 | 98 | 0.055268455117 at 88.75/v3467 |
| Right [26, 27) | None | 0 | 0.032996749464 at 26.75/v119 |
| Right [29, 47) | 30.75–46.75 | 4,505 | 0.224639746135 at 46.75/v20 |
| Right [66, 87) | 67.5–86.75 | 5,346 | 0.308010030618 at 85/v110 |

The limit remains 0.042025772142 m. First violation stays phase 2/v3398,
0.043712615010 m. At the global maximum, signed projection of displacement onto
the measured drift direction is 0.087489648 m root translation, 0.092581979 m
root yaw and 0.493329096 m residual leg/skin motion; these sum to the measured
0.673400723 m and are not independent repair predictions. Original STEP source
already exceeds the current limit in those same five windows at the current
peak phases. Continuous interpolation and retained local authoring affect their
values, but do not create the broad stance-sliding family. Declared planted
semantics remain binding; changing labels/windows would hide this failure.

Whole-skin failure has 3,549 violating vertex observations over 63 poses and
122 unique vertices. Every positive influence belongs to RightLeg, RightFoot
or RightToeBase. It has two distinct mechanisms:

- At 24.25–24.75,210 observations over 70 vertices are a continuous-derivative
  interpolation dip between original STEP poses. The original at 24.25 reaches
  only 0.000359052 m penetration; the emitted derivative's first witness remains
  v0/24.25 at 0.031723661124 m and this island peaks at 24.5/v0, 0.042937258177 m.
- At 48.5–63.25, 3,339 observations over 60 poses inherit a right-foot swing
  floor crossing already present in the source. Of these, 2,846 occur with
  planted left support [47, 58), and 493 in unsupported [58, 66). The global
  maximum stays phase 51/v2, 0.206904965068 m; original STEP source at 51 is
  0.206905144981 m below floor. The conditioned source and emitted runtime
  agree within 2.64e-7 m at the five sampled source controls. The receiving
  evaluator and tolerances do not explain either island.

At 51, RightFoot origin is 0.334254568 m high while RightToeBase is -0.141425843 m;
v2 is weighted 28.1773% to the foot and 71.8227% to the toe. Root-only clearance
needs at least 0.185892079 m lift to meet the existing 0.021012886071 m skin limit,
but active left-sole gap permits only 0.017001670 m. A global lift cannot satisfy
both criteria. All active left-sole influences are exclusively LeftLeg/Foot/Toe;
this supports testing the independent right chain while fixing root and pelvis.

Compact findings are retained in
`D:/Compact_Evidence/RustSMF/runs/p7c-slow-walk-attribution-20261024/`.
`measurements.json`, `family-attribution.json` and `source-interpolation.json`
bind complete families, original/conditioned controls, source modes and the
root-lift obstruction. Original full-precision witnesses and all qualification
remain retained. Attribution is complete; both physical criteria still fail.

<a id="right-swing-clearance-feasibility"></a>
## Selected producer pass — right-swing clearance feasibility

Next phase: bounded producer feasibility, not production integration. RustSMF
owns the experiment; GaimEngine supplies the unchanged evaluator. Test only
right UpLeg/Leg/Foot local rotations within experimental bracket [47, 66], keeping
pelvis/root travel/yaw, left chain, toe local transform, all translations/scales,
mesh/skin/bind, original supports and 13/7-degree bakes fixed. Predeclare a finite
family, correction/lift ranges and search budget before trials. Derive stored
correction bounds from measurement; do not silently borrow a prior bake's bound.
The bracket is chosen from the right support gap and contains all 60 poses in
the larger island; it is not certified safe before the controls pass. This is
one leg and one island, covering 94.1% of current skin violations. The short
24.25–24.75 island and all planted-drift repair are explicitly outside this pass.

Done When:

1. Bind the current graph and untouched source/guards. Report a measured feasible
   family or the tested family's obstruction; failed search is not global
   impossibility. Do not change support labels, floor, thresholds or intervals.
2. A feasible candidate must clear all 3,726 skin vertices at all 77 quarter
   poses in [47, 66] under 0.021012886071 m, preserve active sole criteria, and
   retain calibrated bend sign and 27 segment lengths. Check the serialized,
   independently reloaded curve and its actual emitted runtime, including
   nominal-versus-float32 boundary sampling.
3. Keep all 284 outside quarter poses and emitted boundary samples 47/66 exact.
   Preserve all 23,240 planted drift observations, both accepted 13-pose arcs,
   calibration 22.5, terminal curve/tail, all 24 seams, six independent endpoints,
   root, 45 other clips and unselected keys/channels. Preserve the early skin
   island and first 24.25/v0 witness exactly. Retain the old 51/v2 maximum as
   baseline evidence; a successful targeted candidate may reduce that maximum
   and must report its new global witness. Full P7C will still have drift and
   the early skin failure, even if this larger island clears.
4. Bind actual native/WASM prototype comparison to reused exact build outputs;
   release owned resources. Return the smallest producer integration contract if
   feasible. The current strict two-record job is already occupied by 43/44 and
   87/88; do not replace those records or extend public admission during this
   experiment. Later integration must separately renew 46/590, isolation, restored
   replay, actual 637 pilot and the canonical gate at its new producer identity.

No production authoring, new support editing, engine changes or publication are
included in the completed attribution. Preserve v1, all three Rust overlays,
shared dependencies, current qualification and every retained failure/prototype.

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-progress-publication | change=polished proof criteria while retaining the selected unimplemented union boundary scope -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-plural-comparison | change=attributed retained runtime leakage and selected explicit union sampling with source-bound proof criteria -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-boundary-review | change=rechecked producer integration and bound the assembled singular receiving pass-down -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-boundary-integration | change=wired strict singular policy and recorded ordinary CLI compatibility while retaining singular qualification boundary -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-export-boundary-preservation | change=describe disjoint producer sampling repair and proven six-phase scope while retaining full intake requirements -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-plural-union-boundary | change=closed bounded union sampling with renewed runtime proof and retained physical failures -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-union-review-cleanup | change=retained qualified implementation and bounded the next read-only attribution -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-residual-attribution | change=measured all residual families and bounded the fixed-root swing experiment -->
