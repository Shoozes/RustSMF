# RustSMF standalone acceptance

RustSMF is a complete product boundary: editor, formats, project persistence,
rig/skin/animation tools, local retarget/contact computation and packaging belong
here. Another first-party repository is never a prerequisite. Declared npm/Cargo
libraries and installed development toolchains remain ordinary prerequisites.

## Selected candidate

The current local package is the follow-up export-cleanup candidate built from
the local worktree based on `f099e37ed1d0c855412d67766507359b4fe029d6`. Its
installer SHA-256 is
`ea27cd5d54beb35f9df81dd429b38afad40c69d53676174f9e3a138a18dcdd88`; its
installed executable SHA-256 is
`c2f76eb3df38d780294ef64a211f9e85ff0780f03859e2181a51027639c9596f`. The source
manifest records 533 tracked product inputs and nine changed source files.
Its recorded package-closeout recheck matched 532/533 inputs; at that time the
only later change was the test
documentation in `source/frontend/tests/README.md`, which is absent from the
installed payload and was followed by passing focused tests and test typecheck.
All nine retained changed-source snapshots match their manifest. Installer,
installed files and queue proof are recorded under
`D:/Compact_Evidence/RustSMF/runs/export-cleanup-recheck-20261102/`. The
actual installed queue write-failure/retry and independent output proof pass.
This focused renewal does not repeat the broader installed workflows: Sable
remains bound to the 2026-11-01 candidate in
[HISTORY.md](HISTORY.md#installed-sable-workflows-20261101). One mapping route
is qualified; broader mapping selection is not claimed. The 2026-11-08
[attended visual observation](INSTALLED_TEST_SESSION.md#attended-observation-20261108)
passed on this executable with a newly bound three-clip Sable fixture. This
closes the selected observation criterion, not the full historical matrix or a
release decision. The public `0.2.1-preview`
remains separate and unchanged.

The full isolated matrix below retains its 2026-10-26 source epoch, starting at
`7a062c4` with reviewed standalone changes and committed as `7b66717`. Current
equivalence checks find 474 of 486 application inputs unchanged; the 12 changed
optional producer/native-profile paths have later proof. This comparison does
not renew that entire historical matrix.

| Acceptance | Current evidence boundary |
| --- | --- |
| Static dependency guard | Final isolated verify passed, including 17 guard regressions. The current 17 regressions and scan of 467 owned files pass again. Literal/static coverage only. |
| Predictable browser routing | Direct default and `-NoGenEye` agree; ambient/sibling controls and explicit integration failure controls pass. |
| Isolated build and verification | Source-only copy passed verify (723 frontend tests, 14 Rust checks), browser 212, journeys 13, strict visuals 3, retarget/transition native-WASM proof and desktop smoke. |
| Ordinary exporters | Generated native-contact CLI success/refusal and job cancellation passed in verify; retained consumer proof is not renewed. |
| Installed workflows | Earlier model/ZIP/project/Help/second-install evidence retains its original epoch. The current follow-up package passes installed queue write-failure/retry with independent output proof, default recovery unchanged, registration restored byte-for-byte and owned cleanup complete. Sable transfer/animal assistance remains bound to the 2026-11-01 candidate. One dropdown selection route is qualified. New attended pixels and playback cover the selected executable with the three-clip fixture; broader selection remains unclaimed. |
| Local package | The installer and all seven installed-file hashes are retained for the focused follow-up candidate. This does not renew other installed workflows or the full historical matrix. The bounded attended visual criterion passed; public release replacement remains a separate decision. |

The [2026-10-26 review record](HISTORY.md#standalone-review-20261026) binds
these results to exact source inventories and logs. Review found all inventory-v2
files unchanged except the separately recorded Summary Bank route correction;
that correction was present in the passing final verify. Subsequent record-only
edits do not renew application or consumer qualification.

## Reproduction and prerequisites

Use a RustSMF checkout, Node/npm matching the tracked engine requirement,
PowerShell 7, Git, stable Rust with the WASM target, Windows C++ build tools and
WebView2. The tracked lockfiles select npm/Cargo dependencies. Setup installs
pinned local wasm-bindgen and Binaryen tooling; Playwright supplies the test
browser. Record dependency acquisition separately, then enable Cargo/npm offline
operation for verification. Do not copy dependencies, compiled artifacts, private
maintainer helpers or motion assets from a development checkout.

The canonical lanes remain `verify`, `test:e2e`, `test:journey`,
`test:visual-strict`, `retarget:runtime-proof`, `desktop-smoke` and
`package:windows` through `run.ps1`; the workspace also owns
`npm --prefix source run transition:runtime-proof`. Runtime proofs compare native
Rust with actual browser WASM. Tests retain their existing acceptance thresholds.

Browser tests and journeys use direct project-owned Playwright. `-NoGenEye` is
compatible with that default. Only an explicit `-GenEyeRoot` requests enrichment;
missing or unsuccessful requested integrations report failure. Ambient `GENEYE_*`
and `GAIM_*` settings and nearby checkout-shaped folders do not choose test code.

The guard covers literal source imports, worker/resources, local npm/Cargo paths,
compiler aliases, Tauri packaging paths and shell script entrypoints, including
root launchers. It detects source links escaping the checkout. It is a static
guard: arbitrary computed paths, shell expressions and caller-selected locations
are outside its coverage. The isolated execution lanes complement that boundary.

The producer CLI reads the checkout's actual Git revision and dirty status; Git
is a developer CLI prerequisite. An unpacked archive is not assigned a fabricated
revision. The installed editor runs without Git, Node, Cargo or a source checkout;
Windows/WebView2 remain its host requirements.

## Installed acceptance

Use task-owned installation/output state. Preserve the operator's installation,
settings and recovery bytes. Actual OS-dialog evidence must cover model/ZIP Open
and cancel, missing/ambiguous selections, project Save/cancel/reopen, queue
destination/cancel/retry and preservation of completed outputs. Independently
parse saved projects and exports for animation, skin, mappings and materials.
Exercise ZIP, presets/queues, retargeting and bounded animal assistance with
Signal Robot, Sable or generated fixtures; test offline Help and reopening in a
second clean location. Confirm normal/failure/cancellation resource release.

The initial 2026-10-26 installed-A pass verified executable SHA-256
`2688ecb8cf5093be700b8101149f94f160e388c0b10ad21ab85c9b581aaa7f13`,
PID/HWND ownership, the real Open dialog, cancellation and single-model ZIP load.
GenEye captured the loaded Signal Robot with quality `ok` (frame SHA-256
`2320fe2b9af4a6ebb639a46175033ab813ef66aa72addd0ab564876aae4488d1`).
The native file picker accepted an exact-HWND filename field and Open button
message without moving the cursor. Its controls surfaced as UIA panes without
Invoke/Value patterns. The WebView toolbar exposed only container UIA nodes;
GenEye's background and foreground click reports did not open a dialog, so their
execution reports are not treated as workflow proof. A pointer fallback did open
the dialog but took the operator's cursor; the operator disallowed that route
for further quiet tests. A local WebView debugging launch was rejected by command
policy before execution. The owned process was stopped after exact PID, path and
start-time checks. No saved project or exported GLB was produced in that pass.

A later minimized launch from the same task-owned installation used a fresh
WebView2 profile and the renderer child `Chrome_RenderWidgetHostHWND`. Its UIA
tree exposed semantic buttons, tabs and disclosures; exact owned child HWND
messages operated native file dialogs. The pointer did not move, but the native
file dialogs appeared on the operator's active desktop despite the minimized
app. The installed app loaded Signal Robot and Sable
from single/ambiguous ZIPs, canceled the ambiguous choice without replacing
work, and reported missing-sidecar and malformed-ZIP errors. It saved and
reopened `signal-project.rsproj` (139,728 bytes), saved
`sable-after-refusals.rsproj` (3,150,386 bytes), and exported
`sable-direct-export.glb` (2,361,468 bytes). Independent project/GLB parsing
and sampled continuity passed for Sable's Idle, Run, Sit and Walk, including
animation, skin and material presence. The export queue saved its first GLB,
canceled a second destination, then retried only that incomplete item; the
first output hash stayed unchanged. The operator closed a later foreground
Save As dialog during a separate locked-output trial before a write was issued,
so that attempt did not verify write-failure handling. The later native-profile
case below does. Bundled Help opened and closed through UIA.

The same installer was silently installed to a second clean task-owned location
with a separate WebView2 profile. That installed app reopened the Sable project,
then saved a 3,150,386-byte project whose SHA-256 exactly matched the first
installation's `c4cc11c37d8bf71a71f65fdb16a859060343526269288f47225ea15c928d4398`.
Both exact owned application PIDs and the temporary output-lock helper exited.

The task-owned app/profile and output receipts are under
`D:/RustSMF-Standalone-20261026/`. Use the
[GenEye installed control skill](skills/geneye-installed-control/SKILL.md)
for current installed controls. At that stage, queue write-failure and Sable
retarget/animal assistance remained open; their later qualifications are below.
The installed Transfer tab was reached, but the Retarget clips picker was not
completed; operator dismissal of foreground dialogs cannot establish a UIA
failure. Establish a verified isolated desktop/session before any more native
picker actions. Recheck current process/HWND identity before each action and
verify owned process release at closeout. No CUA or cursor input.

## Isolated native queue and profile renewal — 2026-10-30

The [installed route](INSTALLED_TEST_SESSION.md#final-qualified-case--2026-10-30)
now binds the fresh native-profile installer, selected source and Signal Robot.
Open/cancel, exact filename/Open, actual native staged-write failure and retry,
dirty/live/captured state, A hash/time and independent 12,960 world-skin samples
pass. Native autosave reaches the private profile, and canonical default recovery
is unchanged after job/desktop/handle cleanup. Windows `--profile-dir` is opt-in;
no-flag product locations and both apps' standalone boundaries remain unchanged.
The dependency guard and source verify are separately recorded for this renewal;
no new source-only isolation/browser/journey/visual matrix is implied.

Earlier installer-B model runs touched the default native recovery generations:
WebView isolation was insufficient. Their functional evidence remains dated,
while the runbook records preserved current files and unknown pre-test contents.
The new safe epoch proves preservation from discovery onward, not restoration.
Sable retarget/animal assistance and candidate reconciliation follow below.
No public preview replacement or producer generation is included.

## Installed Sable and candidate reconciliation — 2026-11-01

The same installer/executable passes actual native Open, retarget, preview,
Apply and project Save/reopen using original Sable and generated compatible
motion. The installed UI reviews 24 animal mappings. A deliberately incorrect
draft mapping invalidates preview; the existing Profile JSON editor corrects it
before transfer. The wrong draft is never applied. Preview at the midpoint
leaves the canonical export unchanged. An ambiguous deform-tail name leaves all
five tail bones unresolved; discarding it preserves the committed model.

Independent accessor/skin/material/motion inspection preserves the original four
clips plus the transferred fifth clip through Save/reopen. All 635,925 sampled
world-skin points agree within the existing 0.00002 tolerance (maximum difference
0.00000135 m). Fifteen driver/proof tests and the fresh default picker regression
pass. Private native autosave exists, default recovery is unchanged and every
owned job/desktop/handle is released. Earlier unsuccessful driver attempts remain
failed evidence; they do not replace the qualified result.

[Native receipt](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/qualified-8/receipt.json),
[independent output inspection](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/qualified-8/independent.json),
[source/resource comparison](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/candidate-equivalence.json)
and the [local candidate record](D:/Compact_Evidence/RustSMF/runs/installed-sable-workflows-20261101/summary.json)
bind the results. No application build or full historical matrix was repeated.

GenEye could not resolve the isolated preview target, so this pass claims no new
native pixels or attended preview review. Quiet HTML mapping-dropdown selection
remains unverified; the public Profile JSON correction path is proven instead.
These limits and the earlier recovery incident remain visible for the separately
authorized release decision. Neither observation tooling nor another engine is
an application dependency. Private P7C generation remains stopped.

## Optional consumer qualification

Keep the working Gaim-compatible skeletal exporter and `gaim.*` schemas. Normal
acceptance proves bounded output, independent re-import, truthful provenance,
explicit refusals and failure/cancellation preservation using local fixtures and
RustSMF's own solver. Actual-engine receiving is separately requested integration
work and does not gate editor startup, normal verify, packaging or product closure.

Private P7C planted drift remains unresolved. Its recipes, 65-degree refusal,
root/pelvis constraints, engine v1, three Rust overlays and retained evidence stay
protected. A reproducible general tool defect can reopen source work through a
bounded local regression; unqualified private motion does not keep the editor open.

<!-- AI-edited: 2026-10-26 | agent=Codex/root | task=standalone-p7c-continuation | change=record partial installed proof and quiet control boundary -->

AI-edited: 2026-10-30 | agent=Codex/root | task=installed-isolated-picker | change=reconcile second-install evidence and distinguish verified picker isolation from pending native queue writes

AI-edited: 2026-10-30 | agent=Codex/root | task=installed-native-queue | change=bind actual native failure/retry and independent inspection to the selected installed epoch

AI-edited: 2026-10-30 | agent=Codex/root | task=native-profile | change=qualify opt-in native isolation and retain earlier shared recovery impact explicitly

AI-edited: 2026-11-01 | agent=Codex/root | task=installed-sable-workflows | change=bind functional Sable acceptance and candidate equivalence while retaining observation and historical proof limits

<!-- AI-edited: 2026-11-08 | agent=Codex/root | task=installed-attended-observation | change=record completed selected visual criterion and remaining scope -->
