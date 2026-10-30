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
Sable retarget/animal assistance and final installed-candidate closure remain
open. Previous app/standalone/consumer epochs remain separate; this focused
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
