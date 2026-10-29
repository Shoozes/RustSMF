# Optional walkSlow root/body vertical derivative

The standalone RustSMF source includes a separate, opt-in CLI for the private
`walkSlow-root-y-to-body.v1` derivative. It accepts a self-contained conditioned
GLB and writes a new GLB. Existing v1/v2/v3 job schemas, ordinary omitted-option
exports, GaimEngine v1, support definitions and physical thresholds are unchanged.
The CLI does not require a GaimEngine checkout or process.

For `walkSlow`, each of the 91 LINEAR integer-phase keys at ticks 0–90 sets
`LocomotionRoot.position.y` to zero and adds its original Y to the direct
`mixamorigHips.position.y` carrier. The same representation transfer is applied
to the twelve `start`/`stop`/`reversal` `walkSlow` transitions at p0, p25, p50
and p75. Start/stop use seven keys and reversal uses two constant translation
keys. No keys, joints, rotations, root XZ/yaw, mesh, skin, supports or other
clips are authored. LINEAR root/body interpolation makes the transfer exact in
real arithmetic between stored keys; float32 storage is checked separately.

The helper refuses missing/ambiguous clips or joints, an absent direct parent
chain, non-LINEAR or noncanonical translation grids, overlapping accessors,
nonfinite values, root scale and non-yaw root rotation. It writes a fresh output
path and does not overwrite an existing artifact. Use it only on the bounded
composed source graph identified below.

```powershell
cd source
./node_modules/.bin/tsx frontend/scripts/skeletal-walk-root-body-cli.ts <conditioned.glb> <new-model.glb>
```

The qualified source is immutable bundle `eb6006aade20b1f741467ea252b18e7bac43b8457291797f9206d34fcdd75a16`
and conditioned GLB `b03f78f11c7177395f4c6080fcd36fdf759cb308a942854a863c60e44503bb44`.
The derivative GLB is `255b635355bc67aaff6148b450ad54ea813f77682ca3e002a251d93ec785a2db`.
Independent reload checked all 661 gait/transition quarter-tick poses:
maximum world joint-matrix difference `1.1921e-7`, maximum skinned-vertex
position difference `1.1921e-7 m`, against existing `1e-4` and `5e-5 m`
limits. Complete poses at fixed ticks 1 and 25 are included. Twenty six-tick
endpoint seams, including p25, peak at `2.936e-7 m` skin and `0.028°`, below
`0.021012886 m` and `5°`. Support patches and socket/mesh/bind data remain
exact. The final 46-packet/590-reference graph is
`679c238b4702c653db3d675a269eae286293cca37a45bac7a236d8ed2e356e69`.
Thirteen packet selections are affected; 93 unrelated selected clip payloads
and references remain exact. The largest root/body transfer residual in the
emitted asset is `1.1921e-7 m`.

Receipts, the graph, exact source files and the initial failed provenance
attempt remain under
`D:/Compact_Evidence/RustSMF/runs/p7c-walk-root-body-20261028/`.
`graph-admission/` and `graph-admission-proof.json` are the qualified outputs;
`graph/`, `graph-v2/`, and `graph-final/` are retained intermediate attempts,
not receiving candidates. The first complete bundle was refused by the
GaimEngine test-owned reader because its top-level vertex-order fingerprint
still used the source model identity. The corrected bundle recomputes that
fingerprint from each packet's new model mapping and passes the existing
read-only `readHumanoidInputBundle` admission with all 46 packets.
The first export attempt refused stale pelvis-layer provenance after the local
Y transfer. The final producer renewed that report from the transformed clip,
then passed ordinary immutable publication and local verify. Consumer V4
receiving, native/WASM replay, full physical/visual P7C and LTS acceptance are
separate GaimEngine work and are not claimed here.

The separately approved [hip-Y loop endpoint recipe](SKELETAL_HIP_Y_LOOP_ENDPOINT.md)
uses this derivative as its immutable input. It is a new explicit v4 export job;
the original root/body derivative and this v1 graph remain retained controls.

<!-- AI-edited: 2026-10-28 | agent=Codex/root | task=p7c-walk-root-body | change=document bounded opt-in vertical derivative and source-bound producer proof -->
