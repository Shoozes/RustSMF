# RustSMF standalone acceptance

RustSMF is a complete product boundary: editor, formats, project persistence,
rig/skin/animation tools, local retarget/contact computation and packaging belong
here. Another first-party repository is never a prerequisite. Declared npm/Cargo
libraries and installed development toolchains remain ordinary prerequisites.

## Selected candidate

The 2026-10-26 candidate starts at `7a062c4` with the reviewed standalone changes.
The exact changed-source inventory, commands and hashes belong to the dated
HISTORY record and its compact receipt. No version bump, commit, publication or
replacement of the public `0.2.1-preview` is part of this batch.

| Acceptance | Current evidence boundary |
| --- | --- |
| Static dependency guard | Final isolated verify passed, including 17 guard regressions. Literal/static coverage only. |
| Predictable browser routing | Direct default and `-NoGenEye` agree; ambient/sibling controls and explicit integration failure controls pass. |
| Isolated build and verification | Source-only copy passed verify (723 frontend tests, 14 Rust checks), browser 212, journeys 13, strict visuals 3, retarget/transition native-WASM proof and desktop smoke. |
| Ordinary exporters | Generated native-contact CLI success/refusal and job cancellation passed in verify; retained consumer proof is not renewed. |
| Installed workflows | Installer A succeeded and five bundled resources match. Required native-dialog cases remain unobserved; API/mocks do not close them. |
| Local release candidate | Installer, checksums, notices, samples and startup guide exist locally. Second clean install/profile, workflow acceptance and final evidence closure remain open. |

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

Next bounded batch: establish the installed Signal Robot Open/cancel and project
Save/cancel/reopen path using GenEye observation plus documented commands. Check
fresh PID, creation time, executable and HWND before input; process-local control
gates must not change global GenEye policy. The previous minimized-window focus
failure is a control limitation, not an application failure or accepted workflow.
Do not assume the attempted normal-window relaunch succeeded. Independently
inspect the saved project/export for animation, skin and material continuity.
Retain before/after observations and verify owned process release. If this lane
cannot perform a required action, record the exact unsupported operation and
select a bounded GenEye capability fix before expanding the UI matrix. No CUA
fallback or claim that commands are better without measured completion evidence.

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

<!-- AI-edited: 2026-10-26 | agent=Codex/root | task=standalone | change=separated product and consumer acceptance -->
