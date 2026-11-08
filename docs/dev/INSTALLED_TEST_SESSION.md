# Isolated installed-product tests

This RustSMF-owned Windows test route exercises an explicitly selected installed
executable on a task-owned non-input desktop. It requires no GenEye or consumer
engine checkout. Product code, default dependencies and release assets remain
separate from this test capability.

From PowerShell 7, provide an absolute installed executable, its selected SHA-256
and a fresh output directory. The default scenario remains Open/cancel:

```powershell
pwsh -NoProfile -File scripts/installed-test-session.ps1 `
  -Executable '<installed rustsmf.exe>' -ExpectedSha256 '<SHA-256>' `
  -OutputRoot '<fresh absolute directory>' -ProbeSeconds 10
```

`-Scenario OpenFixture -Fixture '<absolute input>' -FixtureSha256 '<SHA-256>'`
submits and loads that exact input. `-Scenario QueueWriteRetry` selects the bounded
Signal Robot case described below, with those same fixture arguments. The Windows
lane requires the OS .NET Framework compiler, Windows PowerShell 5.1, UI Automation
and the selected installation's WebView2 runtime. No installation or policy change
is performed. Normal regression checks use a neutral executable, not an installed
RustSMF or another first-party application.

<a id="attended-observation-20261108"></a>
## Attended selected-candidate observation — 2026-11-08

Explicit operator authorization enabled a visible session using a task adapter
of the existing native job/UIA/dialog helpers; the public runner stays isolated.
Loaded, paused-preview, applied/reopened PNGs and five seconds of 1x Walk at
30 fps passed review. Independent outputs and recovery/owned-process cleanup
passed. Supervised recording used the matching `--window-hwnd` selector.
[HISTORY](HISTORY.md#installed-attended-observation-20261108) owns full source,
fixture, occlusion limits and results; the retained run is
`installed-observation-attended-20261108`. This closes the selected criterion,
not old matrices, quiet isolated capture or a public release.

## Ownership and refusal

The launcher creates a unique non-input desktop and kill-on-close job. It assigns
a suspended worker to the job before resuming it. The worker launches the
hash-verified executable there with `--profile-dir` pointing at a fresh task profile. Browser argument,
executable and debugger overrides are removed from the worker environment only.
A dedicated non-window-owning MTA thread queries UIA. App and renderer PID/path/
creation time, session, HWND, desktop and profile are recorded. Every control
target must still belong to this exact job and desktop; renderer child PIDs are
verified independently of the root process.

The parent samples the input desktop and owned picker windows every 50 ms and
checks the input desktop again before release. This is sampled observation, not
event-complete proof against every transient window. There is no desktop switch,
physical pointer/input, foreground takeover, CUA, registry/security relaxation or
fallback to the input desktop. Missing controls or changed identities refuse.

Create `<OutputRoot>/cancel` to cancel the owned job. Timeout/failure/cancellation
retain a failed receipt, terminate the exact job and wait for zero active
processes, then close process/job/desktop handles. Cleanup is recorded separately
from the original error. Late UIA completion cannot mutate a returned timeout
verdict. Final shutdown sends no message to a historical HWND. Profiles and
scratch remain owned until closeout explicitly inventories/releases them;
receipts, fixture/output bytes and source manifests remain retained.

## Native Open and queue case

The driver waits for the actual filename edit/action button, sets the value,
reads it back through the native edit, and sends the native BN_CLICKED command
to the revalidated button parent. On the observed host, that parent is the
top-level dialog. The successful sequence does not prove parent choice alone
caused the earlier failure. Native Windows Button.Invoke attempted focus/input
and failed on this host, so native submissions do not use that proxy path.

The queue scenario is bounded to the first-party Signal Robot GLB, English UI,
GLB preset and fresh destinations. It pauses and resets playback to zero before
capture. It captures A/B, renames the live model afterwards, and demonstrates a
real dirty replacement refusal without discarding work. The same dirty refusal
must remain after the native write failure.

A is saved normally. For B, a bounded FileSystemWatcher watches only this run's
output folder and `.rustsmf-export-<owned PID>-*.tmp`. An owned handle permits
reads/writes but denies deletion/rename of the actual newly created native stage.
The app must report `Failed to install staged export ... (os error 32)` in its
failed item. Dialog cancellation/refusal or a missed sharing obstruction cannot
count as this case. No IPC success/failure is mocked and no product hook is added.
The failed stage is copied as evidence, its handle is released, and only its
exact recorded leftover path is removed. Retry incomplete must save B from its
retained capture while A's hash and exact modification ticks remain unchanged.
The live authored model must still export with its rename; queued files retain
their pre-edit names. Existing save destinations are refused by this bounded case.

The native execution receipt alone is not independent output acceptance. Run:

```powershell
node scripts/installed-queue-proof.mjs --receipt '<output>/receipt.json' `
  --out '<output>/independent.json'
node --test scripts/installed-test-session.test.mjs scripts/installed-queue-proof.test.mjs
```

The verifier reuses the independent accessor reader through the project's pinned
TypeScript. It checks indices/materials/skin/binds, clip tracks and sampled world
skin, source/output hashes, exact A modification time, failed-stage/B byte equality,
live rename and all cleanup/refusal evidence. It permits the observed import
primitive split and generated tangent attribute, with unchanged 1e-5 tolerance.
Its fixture profile has one source skin; this is not general asset qualification.
The public verify task includes the ten controls. The Windows lifecycle and
timeout tests explicitly skip on other platforms; positive installed proof
remains a separate required lane.

## Installed Sable transfer and animal assistance

`-Scenario SableTransfer` uses the same isolated desktop, native profile and
cleanup owner. It adds a hash-bound `-TransferManifest` and
`-TransferManifestSha256`; the manifest's target must match `-Fixture` exactly.
Both source files are checked before launch and again before UIA. The generated
fixtures retain original Sable geometry, skin, rest frames and hierarchy. Two
authored 12-degree local rotations exercise foreleg/tail transfer. An ambiguous
variant replaces one deform-tail name with `OpaqueLink`; it does not change a
producer recipe or use a consumer engine.

```powershell
$inputs = node scripts/installed-sable-fixtures.mjs --out '<fresh absolute inputs directory>' | ConvertFrom-Json
pwsh -NoProfile -File scripts/installed-test-session.ps1 `
  -Executable '<installed rustsmf.exe>' -ExpectedSha256 '<selected SHA-256>' `
  -OutputRoot '<fresh absolute output directory>' -Scenario SableTransfer `
  -Fixture $inputs.target.path -FixtureSha256 $inputs.target.sha256 `
  -TransferManifest $inputs.path -TransferManifestSha256 $inputs.sha256
node scripts/installed-sable-proof.mjs --receipt '<output>/receipt.json' `
  --out '<output>/independent.json'
node --test scripts/installed-test-session.test.mjs scripts/installed-queue-proof.test.mjs scripts/installed-sable-proof.test.mjs
```

The English UI case reviews the 24 suggested mappings, changes and corrects an
explicit mapping in the public Profile JSON editor, exports that profile, and
reruns native transfer with it. The incorrect draft is never applied. Saving
the profile is separate from project Save. It checks preview invalidation and
paused midpoint playback, exports the unchanged canonical model during preview,
applies one additional clip, saves/reopens the project and discards the ambiguous
transfer. Project Save retains a snapshot rather than clearing authoring history;
the driver explicitly confirms replacement with its own saved project when that
warning appears. Independent inspection requires all original clips/materials/skin to
survive, the authored motion to match at every key/midpoint, and all five tail
bones to remain unresolved in the ambiguous mapping. A status label alone is
insufficient: the saved outputs, reviewed mappings and project bytes are checked.

HTML file pickers can belong to a WebView child PID. Every selected dialog must
be the unique common dialog on the exact owned job/desktop, even when its PID
differs from the root app. More-menu retries are limited to that reversible
disclosure and stop when the requested command appears; Save, Apply and picker
submission are never blindly retried.

An isolated focused-key route for one HTML mapping is qualified below; the
existing editable profile remains a separate correction route. Optional
`-PreviewHoldSeconds` (0–45) exposes a bounded `preview-ready.json` checkpoint
and `<output>/preview-release` continuation. It does not require or invoke a
capture provider. GenEye target resolution was unavailable for the observed
isolated checkpoint; no new pixels, attended preview review or active-desktop
fallback are claimed. These limits remain separate from native workflow and
independent saved-motion proof.

## Native profile contract and preservation

Current Windows source builds accept `--profile-dir <absolute directory>`.
Missing/relative/duplicate arguments or the equals form refuse before GUI startup.
A new/empty directory receives `rustsmf-profile.json` (schema
`rustsmf.profile.v1`). A marked profile can reopen; unknown metadata, linked
children, foreign session metadata and concurrent activation refuse. The OS file
lock releases with the process. This contract is Windows-only initially.

The profile owns `webview/` and `native/rustsmf-recovery/`. The latter is the
shared authority for native write, discover and read recovery commands. No flag
preserves existing native locations and WebView configuration. This option is
newer than the public preview. It changes no exporter, queue, pose or engine
contract and needs no sibling checkout or GenEye runtime.

Before UIA/picker/model actions, the test launcher requires a matching app PID,
schema and exact selected paths from `rustsmf-profile-session.json`. A binary
without support refuses before model intake. The parent preserves the three
known default recovery files before launch, then requires unchanged directory
existence, hashes, lengths and exact modification ticks after job release.
`-ProtectedRecoveryRoot` is only a regression sentinel override; independent
installed qualification refuses its use. Actual queue acceptance also requires
retained private autosave bytes matching its receipt.

## Final qualified case — 2026-10-30

Fresh installer SHA-256:
`284e44fb22c36b8458643db924463dd29d5301606eb70dea5a0cf1beabfe4a81`.
Its installed executable:
`fccee3478f3afb11bf6140c3666702e93a59ddcfece5f3b044de3fd94aba2ac0`.
It was silently installed to this run's `install-profile/` with `/S /NS /UPDATE`
and an explicit `/D`. Existing task installation B remained intact; two exact
installer registration keys were backed up and restored with byte-equal exports.
No shortcuts, automatic app launch, runtime download or public release occurred.
The installation receipt inventories the executable, uninstaller and resources.

Original Signal Robot fixture SHA-256:
`749527c997ac44e34a5e4d45e7860df5a9db5eb0977e4957cfb6b82a84acf9c7`.
The native queue case and independent proof pass: five joints, ten primitives,
Wave/Turn clips and 12,960 world-skin samples, maximum difference zero at 1e-5.
Native failure/retry, dirty/live/captured state, A bytes/time, native profile
attestation and default recovery preservation pass. Actual autosave generations
exist only in the task profile for this run. The separate default picker/cancel
regression also passes with unchanged default recovery and zero owned processes.

[Native execution](D:/Compact_Evidence/RustSMF/runs/installed-native-queue-20261030/profile-qualified-queue/receipt.json),
[independent output proof](D:/Compact_Evidence/RustSMF/runs/installed-native-queue-20261030/profile-qualified-queue/independent.json),
[picker regression](D:/Compact_Evidence/RustSMF/runs/installed-native-queue-20261030/profile-qualified-picker/receipt.json),
[installer/resource identity](D:/Compact_Evidence/RustSMF/runs/installed-native-queue-20261030/native-profile-install.json),
[current source manifest](D:/Compact_Evidence/RustSMF/runs/installed-native-queue-20261030/profile-source.json).

### Earlier native recovery impact

Earlier `final-queue/` and preceding model runs used installer B
`2688ecb8cf5093be700b8101149f94f160e388c0b10ad21ab85c9b581aaa7f13` with only a
WebView profile. Native autosave still used the default AppData recovery folder;
those runs overwrote/rotated its three recovery generations. They establish
functional UI/output evidence only, not native data isolation. Launches stopped
when this was discovered. Current generations and hashes were preserved in
`recovery-preserved-after-discovery/` and `recovery-impact.json` under this run.
No authentic pre-test snapshot is known, so restoration of pre-test contents
cannot be claimed and no guessed restoration was attempted. The new safe proofs
establish preservation from the discovery checkpoint, not reversal of that impact.

Earlier readiness/pattern/overwrite and playing-reference failures remain retained.
The final case pauses and resets the input rather than loosening tolerances.
Sable retarget/animal assistance and candidate reconciliation are recorded below.
Previous app/standalone/consumer epochs remain separate; this focused
installer renewal does not renew their whole historical matrices. Producer
candidate generation stays stopped. No commit or push is included here.

AI-edited: 2026-10-30 | agent=Codex/root | task=native-profile | change=qualify opt-in native isolation and retain earlier shared recovery impact explicitly

Local renewal verification: `npm.cmd --prefix source run verify` passes: 739 frontend units, dependency guard/refusal controls, lint, typechecks, production-any policy, build/chunk limits and 14 Rust gate steps (including 19 Tauri tests). Serialization uses one Cargo build job, incremental disabled and offline dependencies. This is a current checkout verification and fresh installer proof; it does not repeat the historical source-only isolated/browser/visual matrices.

## Owned closeout resources

Application jobs and handles are released. The qualified installer/executable,
source snapshots, private recovery, discovered shared-recovery copies and useful
failed evidence remain retained by `installed-native-queue-20261030` for review.
No service remains running. Publication verification uses a source-only staged
candidate; its declared npm dependencies and pinned wasm-bindgen tool are reused
explicitly, without another application checkout. Generated WASM comes from
that candidate's Rust source. This is a focused candidate check, separate from
the historical full standalone matrix.

Automatic approval review rejected scoped removal of `debug/`,
`release/.fingerprint/`, `release/build/` and `release/deps/` beneath
`D:/Codex_Builds/RustSMF-native-profile-20261030/` as `blocked by policy` before
execution. About 4.43 GiB logical remains inactive, with no deletion or bypass.
[Exact cleanup inventory and disposition](D:/Compact_Evidence/RustSMF/runs/installed-native-queue-20261030/publication/cleanup.json).
The retained installer and evidence are outside this cleanup scope. The helper's
remote commit confirmation is retained in the same run's publication receipt.

AI-edited: 2026-10-30 | agent=Codex/root | task=native-profile-closeout | change=account owned proof and policy-blocked cache cleanup explicitly

## Isolated dropdown and capture diagnostics — 2026-11-02

The retained native-profile executable `fccee3478f3afb11bf6140c3666702e93a59ddcfece5f3b044de3fd94aba2ac0` ran the Sable fixture on the task-owned non-input desktop. UIA expanded `Map FrontUpper_L` but exposed no option descendants; its apparently writable ValuePattern did not change the selected value. A subsequent bounded test reacquired the exact owned combo after re-render, focused it on the isolated desktop, checked `HasKeyboardFocus`, and posted Down key pairs to the owned renderer. The displayed selection advanced from `Auto: ForeUpper_L` through `Root` to `ForeUpper_L`; preview invalidated. Re-analysis succeeded and the native exported reviewed profile independently contains `FrontUpper_L` mapped to `ForeUpper_L` (SHA-256 `4cebd6b95fe23791ebbf9da5336bc3a05294a72645912b2f8a16abded21609ac`). This establishes the exercised dropdown route, not arbitrary mappings. The worker intentionally stopped after the export, so its overall diagnostic receipt says failed; its selected mapping and cleanup are separately observed. Input-desktop monitoring reported no owned pickers or desktop change, protected recovery was unchanged, and the job had zero active processes after cleanup.

The [dropdown receipt](D:/Compact_Evidence/RustSMF/runs/installed-dropdown-verified-20261102/session-2/receipt.json), `dropdown-selection.txt`, exported profile and task-owned diagnostic harness remain together. Its first attempt encountered a stale UIA element; the second reacquired it before focus. Earlier expansion/ValuePattern receipts remain in the `installed-dropdown-20261102` run.

For a distinct capture hypothesis, the qualified GenEye 0.5.1 executable ran from the same isolated desktop at the paused preview checkpoint using `capture --compositor-pid`. Target resolution reached Windows Graphics Capture, which failed to start with `0x80070057`; no image or visual acceptance resulted. The [capture receipt](D:/Compact_Evidence/RustSMF/runs/installed-isolated-capture-20261102/session/receipt.json) and `capture-diagnostic.txt` retain the result. The surrounding Sable session passed and released its job. No display capture or active-desktop picker fallback was used. A working isolated capture route remains open.

The subsequent supervised-route attempt used GenEye's supported `supervise --hwnd` on the active desktop, targeting the app HWND reported and owned by a new isolated Sable checkpoint. The process and executable identity matched the run receipt. GenEye exited 1 with `capture_scope_denied: source identity unavailable: window is missing, hidden or minimized`; it created no supervision file and captured no pixels. The [supervisor record](D:/Compact_Evidence/RustSMF/runs/installed-supervisor-bound-20261102/session/supervisor-owner.json) and stderr retain the refusal. An earlier attempt to infer the root HWND across desktops stopped on owner mismatch before starting a supervisor. The Sable session subsequently passed, with no input-desktop picker or desktop change, unchanged protected recovery, zero owned job processes and closed desktop/job handles. The supervisor PID exited. A visible supervised source or compatible isolated capture environment is still needed.

AI-edited: 2026-11-02 | agent=Codex/root | task=installed-preview-diagnostics | change=record isolated dropdown selection proof and compositor failure

<a id="export-cleanup-recheck-candidate-2026-11-02"></a>
## Export-cleanup follow-up candidate — 2026-11-02

Selected installer SHA-256:
`ea27cd5d54beb35f9df81dd429b38afad40c69d53676174f9e3a138a18dcdd88`;
installed executable SHA-256:
`c2f76eb3df38d780294ef64a211f9e85ff0780f03859e2181a51027639c9596f`.
Its native queue failure/retry and independent output proof pass, including
12,960 world-skin samples at zero difference, completed-output preservation,
unchanged default recovery and released owned resources. Registration exports
were restored byte-for-byte. Package-closeout source inventories, exact commands,
counts and the later test-README delta are in
[HISTORY](HISTORY.md#export-cleanup-recheck-2026-11-02) and the
[run summary](D:/Compact_Evidence/RustSMF/runs/export-cleanup-recheck-20261102/summary.json).
The later attended observation above has its own three-clip fixture identity;
it does not relabel the previous Sable or full installed matrices.

<a id="export-cleanup-candidate-2026-11-02"></a>
## Export-cleanup candidate — 2026-11-02

Built from the worktree based on `f099e37ed1d0c855412d67766507359b4fe029d6`,
the installer SHA-256 is
`ddd352930781de5e2a3e7d34aab948cab0db66f2e4ad0513146f43b8ac44cb18`; installed
executable SHA-256 is
`98e3f9a2abcc8c00af227dbc3fd5eaf2c0e9bc8f2806ef16763e0a87606d3264`.
`QueueWriteRetry` passes on the new isolated installation with actual staged
write failure/retry, unchanged A and default recovery, preserved dirty refusal,
independent outputs and zero-process cleanup. Sable and the historical matrix
retain earlier source identities. The public preview is unchanged; installed
visual review remains open. [Package, source and proof records](HISTORY.md#export-cleanup-lifecycle-2026-11-02).

AI-edited: 2026-11-02 | agent=Codex/root | task=export-cleanup | change=qualify focused installed queue behavior on the local cleanup package and retain visual gate

## Qualified Sable workflows — 2026-11-01

The native-profile installer and executable identified above are reused exactly.
All 532 product inputs and all seven installed files match their recorded hashes;
five bundled resources/notices and the uninstaller also match installed A.
This batch changes test tooling and records only. The earlier full standalone
matrix and queue proof keep their own source epochs.

Original Sable SHA-256:
`d3d5ad87506fe90c7eaf22e3a767924c4c7d6239cff51648361d88f2ad2d1f49`.
Generated input manifest SHA-256:
`9c5d607576c99c1b1b9e64a1bdd395ef44dccd4cc66290f6e8968984e8230db1`.
The native case passes 24 suggested/reviewed mappings, explicit Profile JSON
correction, paused midpoint preview, canonical preview isolation, Apply,
Save/reopen and unresolved ambiguous-tail discard. The independent parser
preserves four original clips plus the transferred clip across project and GLB
outputs. It compares 61 times and 635,925 world-skin points, with maximum
difference 0.0000013486628225260908 m under the unchanged 0.00002 limit.

[Native execution](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/qualified-8/receipt.json),
[independent proof](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/qualified-8/independent.json),
[default picker regression](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/default-picker/receipt.json)
and [final tested tool sources](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/tool-source-final.json)
are retained. All 15 control/proof tests pass. Every owned job reaches zero
processes and releases its handles/desktop; canonical recovery remains unchanged.
Private profiles and outputs remain owned evidence, with no retained service.
Earlier unsuccessful attempts retain their own failure and cleanup records.

The [candidate summary](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/summary.json)
reconciles accepted workflows, exact source/resources, checks and retention.
At that epoch GenEye could not resolve the isolated preview target, so new native pixels and
attended review were not claimed. Quiet HTML dropdown selection was also
unverified; the existing Profile JSON correction route was observed. The later
focused dropdown test above qualifies one selection; capture remains open. Both apps
and their proofs remain separate. This verified batch is saved through the
guarded main helper; no public release replacement or private producer
generation is included.

AI-edited: 2026-11-01 | agent=Codex/root | task=installed-sable-workflows | change=record native Sable transfer, independent motion and exact candidate limits

<!-- AI-edited: 2026-11-08 | agent=Codex/root | task=installed-attended-observation | change=record completed selected visual criterion and remaining scope -->
