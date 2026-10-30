# RustSMF standalone acceptance

RustSMF is a complete product boundary: editor, formats, project persistence,
rig/skin/animation tools, local retarget/contact computation and packaging belong
here. Another first-party repository is never a prerequisite. Declared npm/Cargo
libraries and installed development toolchains remain ordinary prerequisites.

## Selected candidate

The 2026-10-26 candidate starts at `7a062c4` with the reviewed standalone changes.
The exact changed-source inventory, commands and hashes belong to the dated
HISTORY record and its compact receipt. The candidate was committed locally as
`7b66717`; no public release replaced `0.2.1-preview`.

| Acceptance | Current evidence boundary |
| --- | --- |
| Static dependency guard | Final isolated verify passed, including 17 guard regressions. Literal/static coverage only. |
| Predictable browser routing | Direct default and `-NoGenEye` agree; ambient/sibling controls and explicit integration failure controls pass. |
| Isolated build and verification | Source-only copy passed verify (723 frontend tests, 14 Rust checks), browser 212, journeys 13, strict visuals 3, retarget/transition native-WASM proof and desktop smoke. |
| Ordinary exporters | Generated native-contact CLI success/refusal and job cancellation passed in verify; retained consumer proof is not renewed. |
| Installed workflows | Installer A and five bundled resources passed. Quiet UIA loaded Signal Robot and Sable, saved/reopened projects, refused malformed/missing ZIP resources, handled ambiguous ZIP choice/cancel, saved and retried queued GLBs, and opened bundled Help. Independent project/GLB continuity passed; installer B/profile B reopened the Sable project and saved identical bytes. Queue write failure and Sable retarget/animal assistance remain open. |
| Local release candidate | Installer, checksums, notices, samples and startup guide exist locally. Second clean installation/profile B and byte-identical project reopen/save are observed. Native write-failure/retry, Sable retarget/animal assistance and final evidence closure remain open. |

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
so write-failure handling remains unverified. Bundled Help opened and closed
through UIA.

The same installer was silently installed to a second clean task-owned location
with a separate WebView2 profile. That installed app reopened the Sable project,
then saved a 3,150,386-byte project whose SHA-256 exactly matched the first
installation's `c4cc11c37d8bf71a71f65fdb16a859060343526269288f47225ea15c928d4398`.
Both exact owned application PIDs and the temporary output-lock helper exited.

The task-owned app/profile and output receipts are under
`D:/RustSMF-Standalone-20261026/`. Use the
[GenEye installed control skill](skills/geneye-installed-control/SKILL.md)
for the remaining queue write-failure and Sable retarget/animal assistance cases.
The installed Transfer tab was reached, but the Retarget clips picker was not
completed; operator dismissal of foreground dialogs cannot establish a UIA
failure. Establish a verified isolated desktop/session before any more native
picker actions. Recheck current process/HWND identity before each action and
verify owned process release at closeout. No CUA or cursor input.

## Isolated picker progress — 2026-10-30

The [isolated picker route](INSTALLED_TEST_SESSION.md) now passes on the selected
installer B: renderer observation, real owned Open/cancel, unchanged sampled input
desktop and verified job/handle release. Four regression controls pass. This
renews only that test capability on the identified installed executable. A queue
prototype stopped at native filename/Open submission; no export write occurred.
The real queue write-failure/retry case and Sable workflows remain unverified.
No active-desktop retry, source-to-installer equivalence claim or public release
replacement is included. Exact evidence is linked in the route document.

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
