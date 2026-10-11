# RustSMF TODO

Last reviewed: 2026-10-11

Backlog status: 0.2.1 preview readiness is complete locally. The four v0.2 outcomes and the frontend coverage pass remain complete; their acceptance records stay below.

## 0.2.1 preview polish and sharing readiness

- What: Prepare a quiet Windows preview with MIT licensing, visible-model capture guards, offline Help, a redistributable demo and clear source/contribution docs.
- Why: Finish the sharing gaps identified after the completed frontend coverage pass.
- Where: Modern shell/status/Help, render-evidence tests, preview demo generator, first-party license/notices, manifests/locks/bundle resources and preview documentation.
- When: Completed locally on 2026-10-11 after the six automated gates and the actual installed Windows UI checks, recovery restoration and owned cleanup. Browser/mocked IPC and real UI observations remain separate.
- How: Preserve the flat Modern theme and Original strict baseline, decode actual canvas pixels with HTML chrome excluded, disclose technical success details, bundle notices/sample and verify the 0.2.1 candidate locally. Preserve existing recovery generations for the attended test.
- Done when: All six sequential gates pass on the final candidate; all six Modern sizes and DPI/input lanes are reviewed; Original remains unchanged; the actual installed app passes the attended checklist; original recovery data and task-owned resource disposition are verified; docs and routes contain accurate evidence.
- Verification: `verify`, `test:e2e -NoGenEye`, `test:journey -NoGenEye`, `test:visual-strict`, `desktop-smoke`, `package:windows`, plus the observed installed-app checklist in `docs/user/PREVIEW_0_2_1.md`. The separately authorized main publication uses an isolated staged candidate and `.tools/gitpush.ps1 -StagedOnly`; no public release/tag is included.

## Frontend coverage and Modern polish

- What: Prove every supported frontend capability with a feature-to-evidence matrix, strengthen the five core journeys, and add profile, rig, IK/animation, Skin, and Model/material continuity stories.
- Why: Establish semantic and persistence evidence beyond status messages and isolated controls.
- Where: Frontend domain specs, `tests/journeys/`, independent asset-evidence helpers, Modern styles, Inspector/Rig metadata integration, and current verification docs/routes.
- When: Completed 2026-10-08 after the final source gate and responsive review; the four completed v0.2 outcomes below remain closed.
- How: Use ordinary browser actions and independent exported-content assertions, fix reproduced defects, and simplify Modern within flat Lumen Alloy: one compact icon strip, a workspace chooser, tools closed by default, four Skin tool icons, two sliders and short contextual text. This follows the user's 2026-10-08 request to reduce text/buttons and replaces the previous two-row composition. Preserve Original and public project/profile formats.
- Done when: Every supported feature row has passing positive and applicable failure/history/persistence evidence; all ten journeys, verify, normal browser tests, and strict visuals pass on the final candidate; the required six sizes and DPI/input lanes are reviewed; Original baselines remain unchanged; docs/routes and owned-process cleanup are current.
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
