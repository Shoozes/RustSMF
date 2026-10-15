# RustSMF TODO

Last reviewed: 2026-10-15

Backlog status: Export presets/queues are complete; original assets and animation packs are next. The reviewed ZIP directory fixes are preserved in this source batch. HISTORY owns completed proof.

## Export presets and queues

- What: Explicit GLB/FBX/DAE/SMF presets and a bounded session queue of captured authored models.
- Why: Avoid repeated setup and repeated successful writes.
- Where: [EXPORT_QUEUE.md](EXPORT_QUEUE.md), queue/snapshot/preparation owners, Export drawer and existing save owner; route `feature__export_queue`.
- When: Complete on 2026-10-15; guarded main publication is recorded by the publication receipt. Installer unchanged.
- How: Capture owned inputs/options at Add; serialize validation and destinations with latest trailing recovery. Keep source-aware Export, explicit refusal and truthful download/native results. Modern details stay disclosed.
- Done when: Count/byte bounds, order, cancellation, destination cancel, failure/retry, stale/disposal and source ownership preserve editable work; completed items never repeat; parsed geometry, influences and sampled motion pass through ordinary UI paths.
- Verification: 588 frontend units and 14 Rust checks; 192 browser tests, 11 journeys and 3 strict visuals pass sequentially on the final candidate. The focused set passes 32 units and 13 browser cases; eight reviewed captures cover six sizes, DPR and coarse/focus checks. Original references and initial ZIP fixes are unchanged. HISTORY and `output/export-queue-20261015/receipt.json` bind source/results. Installed Windows queue checks remain a future packaging lane.

## Cubic clip authoring integrity

- What: Preserve raw glTF cubic motion through Trim/Retime and shared sampling.
- Why: Reproduced boundary and tangent-timing errors changed motion.
- Where: Animation edit/controller owners and first-party cubic fixtures; `feature__animation_authoring`.
- When: Complete, published as `040feb3`.
- How: Preserve channels, locks, atomic history, project and export contracts; refuse unsupported cuts before mutation.
- Done when: Known samples survive editing/history/project/re-import; refused edits preserve work.
- Verification: 45 focused units, two browser flows and sequential verify (546 units; 14 Rust checks), browser (163), journeys (11), strict visuals (3) passed. HISTORY and `output/cubic-authoring-20261014/receipt.json` retain details. Cubic rotation cuts between keys remain unsupported.

## Retarget assistance and original asset workflow

- What: Complete one image-guided Tripo trial and a reusable global asset skill, then add shared Rust mapping/preflight and cancelable worker transfers with private preview and one undoable Apply.
- Why: Carry useful naming and review assistance into RustSMF without adding custom rig creation, rig replacement, automatic skinning or a crowded frontend.
- Where: `source/retarget-core`, Tauri commands, frontend job/snapshot/worker/preview owners, Animate Transfer, public WASM setup, focused tests and `RETARGET_ASSISTANCE.md` / `ASSET_PROVENANCE.md`.
- When: Completed on 2026-10-14 from source base `fc48c76`, then published to main as `ff43a13`. App version, installer and public release remain unchanged.
- How: Keep explicit maps authoritative, ambiguous/numeric rigs unresolved without review, preserve the full existing TypeScript solver in a worker, capture owned rest inputs and reject stale results. Keep media private and generation bounded to one image/one model at 100 credits.
- Done when: All four naming families and native/browser-WASM parity pass; advanced worker baking matches the reference; preview/cancel/discard/apply/history/project/export continuity pass through ordinary controls; six-size/DPI/input review and sequential verify, browser, journey, strict visual, runtime-proof and desktop-smoke gates pass on the final candidate; docs/routes and owned cleanup are complete.
- Verification: Final sequential verify (528 units; 14 Rust checks), browser suite (160), journeys (11), strict visuals (3), native/actual-WASM parity (17 cases) and desktop smoke (release build; 18 IPC checks) passed. Six-size/DPI/input review, skill validation, source identity and owned cleanup are recorded in HISTORY and `output/retarget-assistance-20261014/`. The cat remains a private repair draft; its Blender/rights acceptance belongs to followup 3.

### Ordered followups

| Order | Outcome | Done when |
| --- | --- | --- |
| 1 | ZIP bundle intake — published `da98cba` | Complete; local directory compatibility/progress review fixes are recorded in HISTORY. ZIP remains a container. |
| 2 | Export presets and queues — complete | Captured explicit formats, bounded ordered saves, cancellation/results and retry without repeated successes pass the frontend gate. |
| 3 | Original assets and animation packs | Finish CAT-TRIPO-001 in Blender, repair anatomy/tail/topology, verify pose/deformation and rights, author original Idle/Walk/Run/Sit, retain editable source and distribute a self-contained GLB. Borrowed Mesh2Motion media stays excluded. |
| 4 | Complete Rust solver migration | Every current option passes TypeScript-reference/native/WASM parity before replacing the worker solver. |
| 5 | Animal-chain assistance | Reviewed suggestions for existing quadruped, wing and tail rigs pass independent first-party fixtures; ambiguous cases require explicit mappings. |

## Task-drawer integrity recheck

- What: Keep Skin state visible in Scene and make task-tab observations durable regressions.
- Why: The review found hidden unsaved weights when Skin switched to Scene, plus task/draft/picker proof kept only in ignored probes.
- Where: Shared Modern Skin state, drawer integration, workspace-task browser checks and their routes.
- When: Completed locally on 2026-10-11 after read-only review/recheck of `1831bc9` plus the existing 42-file batch, focused repair and the final frontend gate.
- How: Place Skin state inside Scene, keep duplicate brush sliders hidden, and use ordinary tabs, keys and file selection. Preserve Original, formats, recovery data and existing work.
- Done when: Skin state stays visible at 1440 and 390 px; tabs, drafts, picker cancellation, focus and touch have repository tests; focused controls retain native Space/text keys and viewer shortcuts still work; four frontend gates, docs/routes and owned cleanup pass.
- Verification: Final isolated verify (520 units), browser suite (146), journeys (11) and strict visuals (3) passed. Keyboard fixes passed 24 repeated cases and 21 neighboring checks. The 46-file candidate, 39 frontend inputs, command results and cleanup are bound in `output/menu-publish-20261011/`. Original references and the public installer retain their identities; HISTORY owns final results.

## Modern task drawers

- What: Implement the selected Task tabs mockup for the busy Model, Rig, Skin and Animate menus.
- Why: Reduce always-visible text and buttons while keeping authoring actions discoverable.
- Where: Shared workspace tasks/actions, Modern drawer integration, four authoring panels, profile controls and their browser/journey paths.
- When: Completed locally on 2026-10-11 after the user's option 2 selection, responsive review and final frontend gate.
- How: Use three short labeled tabs per workspace, named icon tooltips, keyboard navigation and disclosed secondary controls. Keep drafts mounted across tabs, errors/unsaved work visible, and one drawer. Preserve Original and public formats.
- Done when: Ordinary UI paths reach all relocated actions; tab/draft/focus and six-size/DPI/touch review pass; existing frontend gates and Original strict reference pass; docs/routes and owned cleanup are current.
- Verification: Sequential verify (517 units), browser suite (139), journeys (11) and strict visuals (3) passed. Reviewed captures, source hashes and owned cleanup are in `output/menu-polish-20261011/` and HISTORY. Publication/packaging remain separate.

## Local Windows candidate acceptance

- What: Package the completed local frontend integrity fixes and check the installed candidate through real Windows dialogs.
- Why: Browser and mocked IPC evidence cannot establish the behavior of the newly built installed application.
- Where: The existing desktop/package commands, native Open/Save/project/recovery workflows, and ignored candidate evidence under `output/windows-integrity-20261011/`.
- When: Completed locally on 2026-10-11 after source-bound frontend proof, desktop smoke, packaging, installed-app checks and owned cleanup.
- How: Bind unchanged frontend proof to current source, build an identified installer, preserve current recovery generations, test only owned assets/destinations, then restore recovery and remove the owned installation/processes. Keep the existing public preview and tag unchanged.
- Done when: Desktop smoke and NSIS packaging pass; the installed candidate rejects ambiguous model selections before dirty replacement, preserves continued editing, loads valid sidecars, saves/reopens/exports and recovers editable work; recovery bytes/timestamps restore exactly; owned resources release; docs/routes distinguish this local candidate from the public installer.
- Verification: The eight changed runtime/test/launcher inputs matched the completed four frontend gates. `desktop-smoke` passed its release build, 11 Rust boundary tests and 17 IPC cases; `package:windows` passed. Ten installed Windows UI/cleanup cases and independent project/export/recovery checks passed. The identified unsigned candidate, reviewed captures and exact recovery/resource restoration are recorded in HISTORY. Guarded source publication follows `GIT_PUBLISH.md`; replacement release assets remain separately scoped.

## Local integrity cleanup after the public preview

- What: Surface refused recovery writes, require unambiguous native model selection and exact IPC bundle counts, preserve continued editing, and reconcile current docs with the public preview.
- Why: The read-only review/recheck at `9885311` found silent browser autosave refusal, native multiple-model acceptance, unchecked reply counts and stale source/release/render-test claims.
- Where: `useLoadModel.ts`, the Tauri adapter/binary payload owner, native/recovery specs, public launcher, current-state/review/test docs and focused Summary Bank routes.
- When: Completed locally on 2026-10-11 after focused checks and all four sequential frontend gates. The separately authorized source-publication closeout is recorded in HISTORY; the public Windows preview keeps its original package identity.
- How: Prove failures before repair, keep one payload per selected file, expose a Save Project action for refused recovery, clear only the autosave-owned error on a current retry, and use ordinary edits/history/save/retry checks with isolated browser storage and IPC faults.
- Done when: Refused saves preserve prior recovery bytes and live edits; manual save and storage retry succeed; invalid native selections perform no reads or replacement; missing/extra replies retain editable work and retry succeeds; broader verification passes, Original stays unchanged, docs/routes agree and owned processes release.
- Verification: Five focused payload units and 19 native/recovery checks passed; the complete local gate passed `verify` (517 units), normal browser tests (139), sequential journeys (11) and strict visuals (3). Exact source inputs, commands/results and cleanup are in `output/review-cleanup-20261011/` and HISTORY. New native-OS/package acceptance is not inferred from these mocks.

The local Windows candidate outcome above closes the package/native boundary
for these fixes. Distribution requires a separate reviewed scope; the existing
public installer keeps its accepted source/package identity.

## 0.2.1 preview polish and sharing readiness

- What: Prepare a quiet Windows preview with MIT licensing, visible-model capture guards, offline Help, a redistributable demo and clear source/contribution docs.
- Why: Finish the sharing gaps identified after the completed frontend coverage pass.
- Where: Modern shell/status/Help, render-evidence tests, preview demo generator, first-party license/notices, manifests/locks/bundle resources and preview documentation.
- When: Completed on 2026-10-11 after the six automated gates, actual installed Windows UI checks, recovery restoration and owned cleanup; the separately authorized preview is public at `v0.2.1-preview`, source `05a32fe`. Browser/mocked IPC and real UI observations remain separate.
- How: Preserve the flat Modern theme and Original strict baseline, decode actual canvas pixels with HTML chrome excluded, disclose technical success details, bundle notices/sample and verify the 0.2.1 candidate locally. Preserve existing recovery generations for the attended test.
- Done when: All six sequential gates pass on the final candidate; all six Modern sizes and DPI/input lanes are reviewed; Original remains unchanged; the actual installed app passes the attended checklist; original recovery data and task-owned resource disposition are verified; docs and routes contain accurate evidence.
- Verification: `verify`, `test:e2e -NoGenEye`, `test:journey -NoGenEye`, `test:visual-strict`, `desktop-smoke`, `package:windows`, plus the observed installed-app checklist in `docs/user/PREVIEW_0_2_1.md`. Published installer/source identity, notes and checksums remain in the preview record. Public main excludes private scaffolding; optional maintainer publication uses the ignored guarded helper.

## Frontend coverage and Modern polish

- What: Prove every supported frontend capability with a feature-to-evidence matrix, strengthen the five core journeys, and add profile, rig, IK/animation, Skin, and Model/material continuity stories.
- Why: Establish semantic and persistence evidence beyond status messages and isolated controls.
- Where: Frontend domain specs, `tests/journeys/`, independent asset-evidence helpers, Modern styles, Inspector/Rig metadata integration, and current verification docs/routes.
- When: Completed 2026-10-08 after the final source gate and responsive review; the four completed v0.2 outcomes below remain closed.
- How: Use ordinary browser actions and independent exported-content assertions, fix reproduced defects, and simplify Modern within flat Lumen Alloy: one compact icon strip, a workspace chooser, tools closed by default, four Skin tool icons, two sliders and short contextual text. This follows the user's 2026-10-08 request to reduce text/buttons and replaces the previous two-row composition. Preserve Original and public project/profile formats.
- Done when: Every supported feature row has passing positive and applicable failure/history/persistence evidence; eleven stories across ten journey files, verify, normal browser tests, and strict visuals pass on the final candidate; the required six sizes and DPI/input lanes are reviewed; Original baselines remain unchanged; docs/routes and owned-process cleanup are current.
- Verification: Sequential `verify`, `test:e2e -NoGenEye`, `test:journey -NoGenEye`, and `test:visual-strict`. Browser and mocked IPC are the acceptance lanes; real OS dialogs, packaging and version changes are excluded. Separately authorized publication binds and verifies the staged candidate through `.tools/gitpush.ps1 -StagedOnly`.

Fighter-specific acceptance remains caller-owned. Codec, rig, and export work
stay closed unless one of these journeys exposes a reproducible defect with a
bounded noncombat fixture.

## Modern visual refresh

- What: Complete the Modern Lumen Alloy palette and flat-surface refresh.
- Why: Move the completed Calm Modern shell into the v0.2 product presentation while retaining a separately owned Original SMF baseline.
- Where: `source/frontend/src/styles/themes/modern.css`, `source/frontend/src/index.css`, `source/frontend/src/styles/themes/original.css`, `source/frontend/src/theme.ts`, `source/frontend/tests/visual.spec.ts`, and `design-qa.md`.
- When: Completed 2026-09-25 after the responsive screenshot review and visual gates passed.
- How: Keep palette tokens in the Modern theme scope, use graphite and off-white neutrals with restrained brass accents, and use neutral viewport/grid colors without gradients, glows, or large shadows.
- Done when: Modern uses the scoped Lumen Alloy tokens, shared CSS owns no theme palette, Modern viewport/grid colors are neutral, the required viewport screenshots are reviewed, and Original strict snapshots remain unchanged.
- Verification: `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`, `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`, plus visual review at 1920x1080, 1440x900 at 1.25 DPR, 1280x800, 1024x768, 800x900, and 390x844.

## UI hierarchy

- What: Finish and guard the Modern command hierarchy and compact-shell reachability.
- Why: Keep common product commands direct while preserving camera/layout/display controls in the viewport and one contextual supporting drawer.
- Where: `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ViewportControls.tsx`, `source/frontend/src/App.tsx`, `source/frontend/src/styles/themes/modern.css`, `source/frontend/tests/modern-shell.spec.ts`, and `source/frontend/tests/visual.spec.ts`.
- When: Completed 2026-09-25 after command reachability and viewport checks passed.
- How: Keep file/product actions on the first row, Model/Rig/Skin/Animate/Export on the second, viewport-local camera/layout/display controls, one Scene/Properties drawer, and a slim status region.
- Done when: Primary and secondary commands are visible or reachable without clipping at every required viewport, the two rows retain the stated order, the single-drawer rule holds, and status stays within its slim region.
- Verification: `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`, including the `modern-shell.spec.ts` and six-viewport `visual.spec.ts` coverage.

## User journeys and regression guards

- What: Run five sequential product journeys and give all current Pitfall Ledger entries stable, resolvable guards.
- Why: Prove core editing, persistence, resource, and failure behavior as complete user tasks instead of isolated feature assertions.
- Where: `source/frontend/tests/journeys/`, `source/frontend/playwright.journey.config.ts`, `source/frontend/package.json`, `source/frontend/geneye-journey.json`, `docs/dev/PITFALL_LEDGER.md`, and `scripts/project-integrity-lib.mjs`.
- When: Completed 2026-09-25 after all five sequential journeys and integrity guards passed.
- How: Keep the targeted hand-wave journey; add SMF open/inspect/GLB export/re-import, edit/save/reopen/continue, sidecar readiness plus skinned-animation FBX roundtrip, and dirty-work preservation through missing-resource cancel/discard paths. Assign `PL-001`–`PL-062`, verify every exact `Guard:` file, and guard theme palette ownership, Original selector scope, and version sync in project integrity.
- Done when: All five stories run sequentially through `test:journey`, the focused hand-wave command still runs only that story, all 62 IDs and Guard files validate, and semantic Three.js status/rig colors are documented as non-palette exceptions.
- Verification: `pwsh -NoProfile -File .\run.ps1 -Task test:journey`, `npm.cmd run test:journey:hand-wave` from `source/frontend`, and `pwsh -NoProfile -File .\run.ps1 -Task context`.

## Windows release and LTS evidence

- What: Prepare the v0.2 Windows NSIS package and durable compatibility evidence.
- Why: Make the supported formats, fidelity limits, launch path, and shippable desktop artifact clear to users and maintainers.
- Where: `README.md`, `docs/images/rustsmf-modern-overview.png`, `run.ps1`, `source/src-tauri/tauri.conf.json`, `source/frontend/package.json`, `source/src-tauri/Cargo.toml`, `scripts/project-integrity-lib.mjs`, and `docs/dev/HISTORY.md`.
- When: Completed 2026-09-25 after the 0.2.0 acceptance, verification, package, and conditional branch-retirement checks passed.
- How: Enable the NSIS bundle, add `run.ps1 -Task package:windows`, capture the installer path and SHA-256, sync frontend/Cargo/Tauri versions to `0.2.0`, and re-run verification and packaging. Recheck all four selected origin refs immediately before retirement and delete them only if unique behavior is covered and no retention dependency exists.
- Done when: `verify`, normal browser tests, all five journeys, strict visuals, desktop smoke, and Windows packaging pass; the post-bump `0.2.0` verify/package pass; README and HISTORY identify the artifact and hash; and each selected remote ref is either retired under the stated condition or retained with a recorded reason.
- Verification: Sequentially run `verify`, `test:e2e -NoGenEye`, `test:journey`, `test:visual-strict`, `desktop-smoke`, and `package:windows`; then run `verify` and `package:windows` again after the version bump. Actual Windows OS-dialog checks remain separate from native IPC mocks.

---
AI-edited: 2026-10-15T10:01:50-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=closed export queue batch for guarded publication
