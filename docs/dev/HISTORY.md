# RustSMF History

This file is the canonical home for completed repo/app work and its durable verification record. Current behavior belongs in `APP_STATE.md`; active work belongs in `TODO.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

## 2026-09-23 — Rig-helper scale and DAE texture readiness

A real `Warrior Idle.dae` repro showed helper geometry covering most of the
viewport. Its root scale was 0.01 and average world-space bone spacing was
about 0.0011; the helper's fixed 0.1 world-unit minimum made transverse
geometry and joint markers much larger than the model. `ModernSkeletonHelper`
now sizes from measured world-space links and falls back to model bounds for
degenerate links. Its clickable metadata, scale-invariance, and bounds-fallback
tests now live beside the helper instead of inflating the SMF coordinate-loader
route.

The same DAE showed a project-autosave error because `ColladaLoader` starts
sidecar image loads asynchronously while `loadDAE` immediately released its
temporary resource URLs. Shared `textureImageReadiness.ts` now waits up to two
seconds for FBX/DAE image readiness and removes/reports unavailable maps before
mount or export. With the selected sidecar loaded, the repro mounted with 25
bones, one clip, and 3,330 vertices; its first autosave completed without the
GLTFExporter error. The browser had zero console errors and two warnings.

The current-state/user docs, external-resource pitfall, summary-bank routes,
and review snapshot were reconciled. The active backlog remains empty because
both repo-owned findings were implemented and verified; no new deferred work
was introduced.

Verification:

- `npx.cmd tsx --test src/utils/modernSkeletonHelper.test.ts src/utils/textureImageReadiness.test.ts src/loaders/dae.test.ts src/loaders/fbx.test.ts` from `source/frontend`: 13/13 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: project integrity 12/12, context-bank 9/9, 42 groups, 52.1 KiB default orientation, zero warnings.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 488/488 frontend unit tests, 10/10 Rust tests, lint, both typechecks, production/dependency guards, build/chunk checks, and repository safety gates.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: 105/105 Chromium tests passed.

## 2026-09-23 — App-state documentation and progress-log consolidation

The root README and architecture ownership map now list the supported DAE/
Collada loader alongside the other model formats. The pitfall ledger review date
now reflects the DAE/FBX image-readiness update. The review snapshot was reduced
to current findings and durable limits; detailed completed narratives remain in
this history. Four closely related 2026-09-21 interim progress sections were
consolidated into one final record, preserving their completed contracts,
external-evidence boundary, and final verification without repeating stage-by-
stage backlog and test snapshots.

The root README's supported-format overview is now covered by a project-
integrity regression that reads the source-format registry, so new formats
cannot be added without updating the user-facing list. The repository remains
free of production stubs, unresolved relative imports/re-exports, and unresolved
Rust modules. The measured context bank has 42 valid groups and a 52.2 KiB
default route; no route changes or additional physical module split were
warranted.

The follow-up backlog and inbox sweep found no active tasks or architect/
research drop-ins; `docs/research-inbox/` contains only its policy indexes. The
source scan found no production TODO/FIXME/unimplemented stubs or skipped tests;
Rust `expect()` calls are confined to the test module. Existing model-authoring
guards and user guidance already cover animated-target rename/duplicate/delete,
so no speculative feature or backlog item was added.

The animated-target rename restriction is a deliberate safety contract, not an
implementation stub: object track names cannot be retargeted safely without
keeping base clips, edited clips, playback, and undo/redo in sync. The rejection
now explains the binding risk, and the Outliner test covers both direct and
hierarchy-qualified targets such as `Body/Armor.position` in
`source/frontend/src/utils/modelAuthoring.ts` and
`source/frontend/src/utils/modelAuthoring.test.ts`.

Verification:

- `pwsh -NoProfile -File .\run.ps1 -Task context`: 13/13 project-integrity,
  9/9 context-bank tests, 42 groups, 52.2 KiB default, zero warnings.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: 13/13 project-integrity,
  9/9 context-bank, 2/2 main-sync, 2/2 process-ownership, 488/488 frontend,
  and 10/10 Rust tests; lint, both typechecks, production/dependency guards,
  build, entry-chunk, and Rust checks passed.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: 105/105
  Chromium tests passed in 56.5 seconds. Negative-path console diagnostics were
  asserted; Node also emitted non-blocking `DEP0205` and `NO_COLOR`/`FORCE_COLOR`
  runner warnings. After cleanup, ports 5173 and 1420 were clear and no process
  command line referenced this checkout.

## 2026-09-21 — Repository, deferred-contract, and acceptance closeout

The four repo-owned gaps identified during the same-day integrity and backlog
review are now closed. The source-workspace `verify` script includes the
game-ready dependency guard already enforced by `run.ps1`, with project-
integrity coverage locking the frontend script, workspace wrapper, and verify
composition. Lazy Tauri-client initialization shares one in-flight import and
clears rejected initialization so later calls can retry; direct tests cover
concurrent callers and retry.

The Animate quadratic option is explicitly metadata-only: SMF preserves the
setting while Three.js previews linearly, and the control explains the boundary.
SMF scene-object authoring controls are disabled with the source-owned reason;
the same-texture action is diagnostic-only and performs no UV or material
ownership mutation. Unit and browser coverage lock each contract.

Caller-owned humanoid skin/contact and receiving acceptance remains outside
RustSMF's completion boundary. The frozen review artifacts are hash-bound to
generation `50364735b61e4744bf486af660f9b60730dc746f642724af588d8171e681ea90`,
model `0c440cb5ca48f1546eaed133b2b066f5bfc6e70978050577db919950cde430a1`, and
profile `c58f2a04784e3e0e5eb35d5c6aaa1ddc16c101ca43321bcb2725c91bbadfea95`.
Their angular/source scope explicitly does not prove all-triangle/all-frame
self-intersection or receiving-game acceptance. Reopen only when fight-game-
study supplies an attended, hash-bound receipt identifying a reproducible
RustSMF defect, then add a bounded noncombat fixture and repository-owned test.

Evidence locations, all outside tracked application sources:

- `output/verification/review6-v8-body-review.md`
- `output/verification/review6-v8-body-range-report.json`
- `output/verification/review6-action-final-dispositions.json`
- `output/verification/review6-release-receipts.log` (capture log, not the
  missing attended receiving receipt)

RustSMF retains responsibility for the tested and reproducible tool behavior
and neutral fixtures. Fighter-specific appearance, pair spacing, and receiving
acceptance remain consumer-owned. The current TODO stays empty.

Verification for this final same-day state:

- `node scripts/verify-context-bank.mjs`: 42 groups, 53.5 KiB default
  orientation, zero warnings; `node --test scripts/context-bank.test.mjs`: 9/9.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: 12/12 project-integrity,
  9/9 context-bank, 2/2 main-sync, 2/2 process-ownership, 483/483 frontend,
  and 10/10 Rust tests; lint, typechecks, production guards, build/chunk, and
  Rust checks passed.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: 105/105
  Chromium tests passed; runner-owned ports were clear after cleanup.
- `npm.cmd ls --workspaces --all --depth=0` and
  `npm.cmd audit --omit=optional --audit-level=low`: passed; zero vulnerabilities.

## 2026-09-20 - Supplied Mixamo pair source-inspection closeout

Completed the optional RustSMF-side visual/source acceptance for the two
user-supplied Mixamo Collada archives without modifying either original. The
animation-only archive `Ready Idle.zip` has SHA-256
`FBA1DDF25CBC61133FC44E675DD655263B96298BB77A06C2E0C35069277AE7B2` and
remains geometry-free. The with-skin archive `Ready Idle (1).zip` has SHA-256
`DB2AEEDC0D41FEDB371FBE64C11082ACB35BB28D6D0B6B10002B854B0C60F071` and
loaded as 33 bones, one 2.50-second clip, and 3,726 vertices.

Both extracted DAEs matched on Y-up, 0.010000 meter units, 28 animation
channels, 76 timing samples per channel, and the same joint IDs. Their matrix
output samples had equal cardinality and stayed within 4.9e-5 maximum absolute
numeric difference. The browser review covered the with-skin idle at start,
midpoint, and endpoint in single perspective and quad Top/3D/Front/Side views;
with the new reversible Display > Hide rig control, the shaded silhouette was
readable and no leg/torso deformation failure or self-clipping was observed.
The animation-only DAE loaded cleanly with one clip, zero bones, and zero
meshes. Browser console errors were zero; the two remaining warnings were
Three.js GLTFExporter type/material advisories from the existing internal
snapshot path, not load failures.

The viewport now exposes `Hide rig`/`Show rig` separately from `Rig fade`, and
`shell-model.spec.ts` covers both state transitions and canvas opacity telemetry.
This closes the supplied-pair RustSMF inspection condition only; it does not
approve a caller-owned game, retarget, contact, or reusable humanoid skin job.

Verification:

- `npm.cmd run build`, `npm.cmd run typecheck`, and `npm.cmd run lint` passed
  from `source/frontend`.
- `npm.cmd run test:e2e -- tests/shell-model.spec.ts --reporter=line` passed
  12/12 Chromium tests.
- Manual Chromium review loaded both extracted DAEs, inspected the complete
  2.50-second loop at start/mid/end in single and quad layouts, and reported
  zero browser errors.
- XML parity check passed for axes, units, joint IDs, channel count, and timing
  arrays; source archive hashes were re-read before this entry.

## 2026-09-20 - Project source-format registry parity

The repository-wide integrity pass found that `.rsproj` decoding used a stale
hand-maintained source-format allowlist. DAE is a supported model format, but a
project saved from a DAE model failed closed when reopened. Project validation
now reuses `MODEL_SOURCE_FORMATS`, and the focused codec regression round-trips
every supported source format. The user guide and current-state contract now
document that source-aware editing/export state survives project reopen; the
existing project-recovery context route already owned all affected files, so no
new summary-bank group was needed.

Focused verification:

- `npm.cmd run test:unit -- --test-name-pattern "project codec"` passed: 88
  tests across 86 discovered frontend unit-test files, including the new
  all-format round-trip regression.
- `npm.cmd run typecheck:test` passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context` passed with 42 groups, 52.4
  KiB default orientation, zero warnings, and 11/11 project plus 9/9
  context-bank tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify` passed with 480/480 frontend
  unit tests, 10/10 Rust tests, lint, both typechecks, production-`any`, build
  and entry-chunk checks, project/context integrity, main-sync and
  process-ownership guards, and the game-ready dependency guard.
- `npm.cmd run test:e2e -- tests/export-formats.spec.ts --reporter=line` passed
  all 17 Chromium format/project-flow tests.

## 2026-09-19 - Neutral game-ready CLI proof and caller-ownership boundary

Completed SMF-01 with a small caller-owned noncombat fixture. The new
`source/frontend/src/utils/gameReadyCli.test.ts` creates source/target GLBs with
two named motions (`Idle`, `Reach`), a caller-supplied manual map and explicit
retarget settings including a scoped direction-transfer constraint, then invokes
the actual `scripts/game-ready-cli.ts` through the repository's hoisted `tsx`
runtime. It verifies the saved generation's resolved mapping, sampled motion,
material repair and decoded embedded texture, clip names/durations, exact skin
indices/weights, re-imported target bones/tracks, provenance and immutable
manifest. It also runs the copied tool from a clean temporary Git workspace
whose root contains no fight-game-study or GaimEngine checkout. The CLI now
permits partial logical attachment maps for non-humanoid rigs while the mapping
utility remains strict by default for complete humanoid resolution and rejects
missing explicitly supplied overrides.

The same proof exercises malformed mapping, missing source clip and an
interrupted publication. Each failure leaves the prior current pointer,
published generation and caller input hashes unchanged. The ignored receipt
contains the concrete generation/model hashes and is written to
`source/frontend/test-results/game-ready-neutral/receipt.json`.
The targeted `source/frontend/scripts/check-game-ready-dependencies.mjs` guard
rejects undeclared fight-game-study/GaimEngine checkout references from the
game-ready production route and package manifests; `run.ps1 -Task verify` owns
that guard.

Verification for this implementation:

- `npm.cmd run check:game-ready-dependencies` passed.
- `npm.cmd run typecheck:test` and `npm.cmd run typecheck` passed.
- `npm.cmd run test:unit -- --test-name-pattern "neutral saved job runs through the CLI|logical attachments"` passed from `source/frontend`: 86 files discovered, 88 tests passed.
- Existing publication, job-schema and validation tests remained green in the
  focused run. `pwsh -NoProfile -File .\run.ps1 -Task context` passed with 42
  groups, 52.3 KiB default orientation, zero warnings, and 11/11 project plus
  9/9 context-bank tests. `pwsh -NoProfile -File .\run.ps1 -Task verify` passed
  with 479/479 frontend unit tests, 10/10 Rust tests, lint, both typechecks,
  production build/chunk checks, project/context integrity, main-sync and
  process-ownership guards, and the game-ready dependency guard.

The caller-ownership TODO is complete and removed from `TODO.md`. The remaining
active items are the reusable humanoid action-range/skin review and optional
supplied DAE visual/source acceptance; neither is a RustSMF consumer-ownership
condition.

## 2026-09-19 - Repository integrity, context routing, and browser contract reconciliation

Reconciled the current documentation and context routes with the shipped DAE
path and the load/orchestration test ownership. The focused orientation route
was measured at 52.6 KiB, so its cap moved from 52 KiB to 56 KiB while staying
well below the 256 KiB generation ceiling. Added the DAE unit test, store test
and README, and Vite ambient type declaration to their owning context groups.
The user guide now lists `.dae` in the primary supported-open flow.

The full browser run exposed one stale assertion that expected an FBX-style
`Loaded DAE:` prefix even though DAE intentionally uses the shared generic
`Loaded: <name> | bones | clips | verts` status contract. The assertion now
checks the shared contract; no product status behavior changed.

Verification completed on the local working tree:

- `node scripts/verify-context-bank.mjs` passed (41 groups, 52.6 KiB default).
- `node --test scripts/context-bank.test.mjs` passed (9 tests).
- `node scripts/verify-project-integrity.mjs` passed (253 frontend source/test files and 11 durable docs checked).
- `node --test scripts/project-integrity.test.mjs`, `node --test scripts/dev-process-ownership.test.mjs`, and `node --test scripts/git-main-safety.test.mjs` passed (11, 2, and 2 tests).
- Frontend lint coverage, ESLint, both typechecks, production-`any`, build,
  entry-chunk check, and unit tests passed; the unit runner discovered 85 files
  and passed 476 tests.
- `npm.cmd run test:e2e -- --reporter=line` passed all 104 Chromium tests.
- `npm.cmd run verify:rust` passed formatting, Clippy, 10 Rust tests, and cargo
  check.

No broken relative imports/re-exports, unresolved Rust modules, production
stubs, or source TODO comments were found. The three existing backlog items stay
active because they require external asset, neutral-fixture, or caller-owned
evidence.

## 2026-09-15 - Collada DAE import/export

Added a first-class DAE/Collada path across browser/native file selection, format
detection, the model loader barrel, toolbar export commands, and the generic
source-aware export flow. Import uses Three.js `ColladaLoader` with the existing
bounded sidecar bundle resolver. Export writes a 1.4.1 Y_UP visual scene with
materials, triangle geometry, skin controllers, inverse bind matrices, hierarchy,
and matrix animation channels. Before save, exported bytes are parsed again and
mesh/clip counts are checked; duplicate joint names, non-triangle geometry, and
zero-influence vertices fail safely. DAE image maps are intentionally not embedded;
GLB remains the texture-fidelity export path, and ZIP archives remain containers.

Verification completed on the local working tree:

- `npm.cmd --prefix source/frontend run typecheck` passed.
- `npm.cmd --prefix source/frontend run test:unit -- --test-name-pattern "modelFormat"` passed (89 tests discovered, 89 passed).
- `npm.cmd --prefix source/frontend run build` passed.
- Focused Chromium export test passed: generated skinned GLB -> DAE download ->
  browser re-import, preserving 2 bones and 1 clip.
- Read-only Chromium checks passed for the supplied archives: animation-only
  `Ready Idle.zip` DAE loaded as geometry-free, and with-skin `Ready Idle (1).zip`
  DAE loaded with a non-zero skeleton and animation clips. Measured archive hashes
  remain `FBA1DDF25CBC61133FC44E675DD655263B96298BB77A06C2E0C35069277AE7B2` and
  `DB2AEEDC0D41FEDB371FBE64C11082ACB35BB28D6D0B6B10002B854B0C60F071`.

The supplied pair still needs full-loop visual/self-clipping acceptance before it
can be selected as a production retarget source; that remains active in `TODO.md`.

The supplied with-skin archive was also reviewed in the app with local storage
cleared, at start/middle/end scrub points, in quad orthographic layout, and with
wireframe/rig/mesh display controls exercised. The run passed the load gate
(`Ready Idle.dae`, 33 bones, 1 clip, 3,726 reported vertices), but the source
still renders as a dense helper-only view without a trustworthy shaded silhouette;
the left-leg and self-clipping questions therefore remain unresolved. This is
recorded as an external asset-visual blocker, not an import success claim.

The DAE loader now computes missing vertex normals and reports that normalization
in its load summary; the focused geometry-normal unit test passes.

## 2026-09-14 - Repository integrity and acceptance-doc reconciliation

### Follow-up integrity and bounded sequence review

The import checker incorrectly accepted an explicit `./leaf.js` when only
`leaf/index.ts` existed. Removed that directory fallback; a regression preserves
valid extensionless indexes and explicit JavaScript-to-TypeScript substitution.
The focused integrity suite passed 11 tests. PowerShell 7
`run.ps1 -Task verify` passed on the local working tree: 475 frontend tests,
10 Rust tests, lint, both typechecks, build, process/Git-helper safety and context
checks. Log: `output/verification/review6/integrity-followup-verify.log`.
The context bank passed 40 groups with a 51.9 KiB default route before doc edits;
existing issue/solver/workflow groups cover all changed owners, so no route or
budget expansion was needed. No production TODO/FIXME/unimplemented markers or
broken relative imports were found; Rust expect calls in the scan were tests.

All 37 admitted e76de8f3 target quarter frame sheets were inspected for coarse
sequence/skin continuity. `output/verification/review6/role-visual-dispositions.md`
records exact role ranges, media pattern and all 34 retained flag counts. No new
within-clip defect was established at sheet resolution; attack4–7 wrist/helmet
occlusion remains unresolved. This does not establish normal-speed perception,
complete source/side review or all-mesh collision clearance. Prior sole-center
cast failure remains historical; current corrected special owns that evidence.
The receiving owner separately confirmed startWalk0 and walk4 cast-entry seams;
exact mirrored packets are required before authoring their explicit handoffs.
Start/stop acceptance tracking is consolidated into the receiving-transition
task instead of repeating an outdated start-shortlist task.

At session close the receiving owner supplied
`C:/DevStuff/fight-game-study/.artifacts/fighter-authoring/wolf-natural/review6-v29-unbanked-cast-packet.json`.
Four canonical controlled cases cover startIdleToWalk0 (sourceTarget entry7,
sample0) and ordinary walk4 (no sourceTarget), each in both mirrored facings.
Entry speed is 24.000000953674316, entry displacement is
0.045584896291355245 and final cumulative travel is 0.31909428949660423 model
units. Separate observed live paths contain collision-dependent travel and must
not replace canonical cases for baking. The closing-session instruction arrived
before any bake or new script/profile was created: e76de8f3 remains unchanged,
and both cast banks remain open. The owned role-review browser and sheet server
were closed; no RustSMF publication was requested by this coordination.

### Ground-cast support and interruption evidence

The action inventory independently bound 37 roles/1,073 tracks across the
transferred baseline, recorded stop-bank asset and model160bf28. Existing target
front/side loops remain reusable. The private action-sequence packet adds27
full Brawl/target side-and-quarter comparisons,764 output frame identities and32
retained flags; idle/aerialLanding account for the other two. Secondary jab/tilt
timing uses actual STEP sample identities. Captures are not blanket visual or
self-collision acceptance.

Grounded special16 exposed a sole-center diagnostic error: the rear toe supported
the pose despite its center marker being high. Actual foot geometry nevertheless
showed front-foot lift and rear-toe penetration absent from native SpecialN support.
Optional interval-local point/descendant and fixed authored patch contacts now
preserve animated ankle orientation through the existing solver and shared saved
job/profile path. Point residuals and actual mesh clearance are reported separately.

The private cast-entry-v29 candidate changes only ordinary special and appends
castFromStagedReverse0; 50 other clips/2,165 tracks, raw mesh, weights, binds,
materials and timing are preserved. Model SHA-256:
`e76de8f3aa0026aea986e8ced3b8cd13e69dd5a616d5c977b6c0e6d942c9a618`.
Fullcast mesh minimum improves from -0.0304373 to -0.000376665 model units;
release16 actual foot minima are within4.6e-8 of ground. The 16-sample startup
matches staged-reverse0 and corrected special16, with mirrored exported endpoint,
support and fixed-length proof. No release/event timing or specialAir changes.

Seven left/two right authored patch points describe toe/heel/edge support, including
one reviewed heel-rim deformation bound for vertex3398's shin blending. The patch
is fixed across frames, not a per-frame mesh-minimum fit. The original1mm clearance
threshold was not widened. Full before/after side/quarter sequences and11 boundary/
release/recovery snapshots live under ignored output/playwright; the private bank
and action-sequence-review manifests own exact paths. Receiving-game and exhaustive
appearance acceptance remain separate from these producer results.

Verification: `run.ps1 -Task verify` passed475 frontend tests,10 Rust tests,
lint, production/test typechecks, build and context. The focused contact/profile/
endpoint suite passed57 tests; the new browser profile import/export/invalid-patch
test passed. Replaying the prior V26 job produced byte-identical160bf28. The
private cast-entry-v29 selection manifest seals57 references. Capture servers
and browsers were stopped; no publication or Git mutation was performed.

The subsequent four-family V26 slice appended exact interrupted-stop and band
change candidates to model71882f23. Final model SHA-256 is
`160bf28e2a44933dbaaddccb05776f082cf1eb702e414487c1e7b18f6d651fa2`.
Incoming interrupted poses are stopFromWalk7/frame9 and stopFromWalk9/frame10,
both reversed into walk16; ordinary changes are walk12 to walkSlow45 and
walkSlow4 to walk18. Saved jobs/profiles preserve the exact mirrored packet
travel, 16-sample timing and explicit sourceTarget metadata without idle-pose
substitution. No new production code was needed. The ignored
`output/verification/review6/four-transitions-v26/selection.json` binds jobs,
profiles, contacts, source packets, exported proof and48 visual receipts;
`DECISION.md` owns replay and scoped visual observations.
Two complete CLI builds replayed byte-identically at all four stages. All 1,858
prior tracks and raw asset surfaces are preserved, bone-length delta is zero,
both-facing entry/exit position errors are below2.88e-8/1.41e-8 model units,
and per-plant drift below8.89e-8. Worst mesh minimum Y is -0.000704677. All16
poses in each clip were inspected front/side in both facings without obvious
wide splits, inversion or new self-intersection in those views. High-foot
landing and the long slow-to-fast stride remain normal-speed judgment points.
Eight normal-speed videos and32 boundary images are supplied, not receiving
appearance selection. Four exported proofs and34 focused tests passed; earlier
unchanged production verification is retained rather than relabeled as rerun.

A subsequent bounded staged reverse design authored intermediate idle-based
poses at frame 6/yaw90 and frame 10/yaw25, with alternating left/right/left/right
plants and four swings inside the unchanged 16-sample V25 contract. Candidate
`71882f23cec8e773f8d65b3905b45f7c6369f3c442f27fe68fcb4227670ce7f0`
is a review candidate, not a receiving selection. Saved `intermediatePoses`
and repeated non-overlapping descendant swing envelopes now run through shared
profile/job/CLI/frontend behavior. The latter removes a reproduced 0.02243
model-unit toe penetration from the incomplete extra-step envelope.
The completed candidate preserves all 1,774 tracks and raw asset surfaces;
bone-length delta is zero, both-facing entry/exit position errors are below
2.59e-8/9.89e-9, and per-plant drift below 5.94e-8. Mesh minimum Y is -0.00023173.
CLI replay is byte-identical. All 16 front/side poses were inspected: the earlier
lateral split is absent, but the crouched mid-turn lunge and final two-frame
foot lift remain normal-speed judgment points. Recording and boundaries are
bound by `output/verification/review6/staged-reverse-v25/selection.json`;
`DECISION.md` owns replay and limitations. Full verify passed 472 frontend and
10 Rust tests; 34 focused tests and the browser intermediate/yaw apply/export/
undo test passed. Accepted eight-entry assets remain unchanged. No duration
alternative, engine change, publication or additional motion search was made.

The V25 reverse-start investigation added optional bounded endpoint
`rootYawDegrees` through the shared job/profile/CLI/frontend workflow. It
preserves the prior-facing whole pose in the newly faced actor without changing
child offsets. Twelve exact 16-sample two-stance recipes were probed; exported
span12/landing6 and span9/landing4 trials were rejected for a conspicuous lateral
split during the turn. Numerical support alone did not justify selection.
`output/verification/review6/reverse-start-v25/DECISION.md` owns the specific
constraint and replay; `selection.json` is explicitly a rejection receipt.
Accepted model8f6e9eee and its sealed bank are unchanged. Diagnostic7092cf34
preserves all1,774 tracks and raw asset surfaces; both facing entry/exit errors
are below 3.00e-8/9.89e-9 model units, with zero bone-length drift. Repeated CLI
export is byte-identical. Full verify passed470 frontend/10 Rust tests;
32 focused tests and the browser endpoint-yaw apply/export/undo test passed.
This does not prove every16-sample turn impossible; the tested two-stance
recipe needs a different turn/footfall design before visual admission.

The subsequent three-band start slice appended `startIdleToWalkSlow`,
`startIdleToWalkMiddle` and `startIdleToWalk` to selected stop bank 4df8d3f7.
Final GLB SHA-256 is
`8f6e9eeec1f862b35bae597ef7f5bf520229c92a76235be91426b088acd30118`.
`output/verification/review6/start-bank-v23/selection.json` binds saved jobs,
path-free profiles, exact receiving trajectories, exported proof and 18 visual
receipts. `DECISION.md` owns replay commands and the bounded shortlist decision.
Only idle0/speed0 same-facing starts at sticks 8/26/80 are covered. All have
16 STEP samples at 60 Hz; sample15/tick17 resumes walking16 at tick18.
The receiving owner confirmed a further root step on exit, so saved envelopes
use negative entry displacement and positive next-step exit displacement.

Two three-stage CLI builds produced byte-identical models at each stage. All
1,522 stop-bank tracks and raw geometry/weights/binds/materials/images/topology
are preserved; bone-length delta is zero. Maximum entry/exit position error is
below 2.57e-8/1.17e-7 model units, rotation below 6.40e-6 degrees; support height
and planted drift are below 5.57e-8/1.03e-7. Minimum mesh Y by slow/middle/fast
is -0.000225458/-0.000225453/-0.000285476. All 48 STEP poses were inspected
front/side without obvious leg inversion or self-intersection in these views.
Fast frames7–10 retain a long trailing stance and frames14–15 close into the
deep walking16 swing bend. Normal-speed recordings are supplied, not treated
as receiving acceptance. Focused endpoint/swing/natural/job tests passed 30,
exit 0; final exported proof passed all three. No production solver changed.

The receiving game owner subsequently reported bounded V23 stop-bank acceptance
for model4df8d3f7/packagec34c724a: 347 native/WASM/JS ticks, 160 mirrored target
samples, actual-Three planted drift below 5.46e-7m and 28-bone endpoint step
below 4.42e-7m; 13,148 attachment samples at 30/60/120/144 Hz; and a 1,312-frame
CPU fight ending in KO with exact Windows real-time replay. Original37 motion
event tables and existing collision rows were preserved. The reported raw mesh
ground diagnostic reaches -0.003404m; this is not universal collision clearance.
Evidence is owned by the receiving game's private `review6-v23-*` reports.
Broader starts, band changes, interruptions, paired contact and action-loop skin
acceptance remain open rather than being implied by the bounded stop result.

The subsequent V21 producer slice baked a five-entry stop bank for exact walk
phases 0/2/7/9/29 at speed 24, using independently supplied mirrored 16-sample
receiving trajectories including entry displacement. Final GLB SHA-256 is
`4df8d3f7414a7f90fc050947f4d18646310c09e86e74fad47ba20966bb33836c`.
`output/verification/review6/stop-bank-v21/bank.json` owns five saved reproducible
jobs/path-free profiles and clip names `stopFromWalk0/2/7/9/29`; `DECISION.md`
owns the bounded visual decision and replay commands. The existing natural-return
controls remain unchanged: 16 STEP samples, walk-phase entry with displacement
compensation, idle16 exit, 0.15 pelvis bound, +0.1 height and 8/6 endpoint spans.
No production solver, baseline action, admitted timing, mesh or weight changed.

Two five-stage CLI runs produced identical model bytes at every phase. Final-bank
proof preserves all 1,102 baseline tracks and raw geometry/weights/binds/materials/
images/topology, with zero bone-length drift. Worst entry error is below 8.10e-8
position and 2.47e-5 degrees; exit below 1.50e-8 and 1.71e-6 degrees. Full-weight
support height is below 5.98e-8 and planted drift below 1.07e-7. Minimum mesh Y by
phase is -0.000689572/-0.000386312/-0.000205403/-0.000216694/-0.000227592;
these are explicit nonzero ground residuals. Mid-stop knee bend remains 63.90–65.07
degrees. All 16 poses per clip were inspected in front/side contact sheets with
no obvious self-clipping observed; phases 0/2 have the largest early landing from
their inherited raised rear foot. Full-sequence fixed framing replaced initially
cropped captures. Normal-speed walk-entry/stop/idle videos and boundary images
are hash-bound by `selection.json`. Receiving-game admission and final appearance
acceptance remain separate. Focused endpoint/swing/natural/job tests passed 30
tests; exported bank proof passed all five cases. Owned browser/server closed.

The subsequent bounded action review completed all 34 worst-component
dispositions against baseline 0c440 and unchanged profile c58f2a04. The replayable
`output/verification/review6/action-final-dispositions.mjs` emits
`output/verification/review6-action-final-dispositions.json`: each row records
native fractional frame, calibrated axes/reference, source/target geometry,
individual skin observation, and front/quarter full/joint capture hashes.
Seven model identities and 18 captures are bound to the report. All 14
elbow/knee component cases retain native segment bend within 1e-5 degrees.
DamageN2 LeftHand12 retains source/target axial roll -138.14/-138.12 degrees;
the visible cuff remains continuous and the optional half-share stays unselected.
DownStandU10 and rebound1 source/target ankle-to-toe bend measurements are
146.89/132.10 and 156.94/146.56 degrees respectively: the source already contains
deep recovery flexion. No target-only over-bend correction was justified by these
observations. No asset, track, limit, locomotion or transition bake changed.

All flags remain visible. Static worst-frame observations do not prove complete
loop or all-triangle collision freedom; full-loop skin acceptance stays in TODO.
The last capture page has two labeled rows; unlabeled lower framebuffer remnants
are excluded from evidence. Focused pose-range, CLI, forearm-twist and retarget
timing tests passed 13 tests, exit 0, recorded in
`output/verification/review6-action-final-focused.log`. The generator rechecked
all model/profile/capture identities and inventory coverage, exit 0.

Reviewed the local main working tree at base
`9a5d017f6485e669b9cc0416a9859e5f07531ebc`, preserving existing changes.
Two new regression tests first failed with missing expected exceptions:
swing foot validation accepted arrays/objects through string coercion, and
endpoint baking accepted shared irregular timestamps while resampling at 60 Hz.
The shared parsers now reject these cases before output, and a third regression
proves valid next-down float32 schedules remain unchanged. No new solver,
dependency, calibration limit or asset change was introduced.

Consolidated review.md into findings rather than another implementation history.
App State now links the existing fitted-rig contract instead of repeating its
command/receipt detail. Split the broad motion TODO into independently verifiable
action/skin, braking and receiving-game acceptance tasks, each with what, why,
where, when, how, done-when and verification fields. The optional Mixamo derivative
remains separately gated. The current baseline inventory is 34 components across
17 roles, not just the earlier 33 action-only components; idle RightForeArm is
included. Hash-bound numerical evidence is
`output/verification/review6-action-final-axis.json` for model
`0c440cb5ca48f1546eaed133b2b066f5bfc6e70978050577db919950cde430a1`
and profile `c58f2a04784e3e0e5eb35d5c6aaa1ddc16c101ca43321bcb2725c91bbadfea95`.
This inventory does not close per-component skin acceptance.

Verification used Node v26.5.0 and PowerShell 7.6.6:

- Focused endpoint/swing/job/profile/retarget tests passed 38 tests after the two
  fixes; the additional next-down case is included in the full gate below.
- `pwsh -NoProfile -File ./run.ps1 -Task verify` exited 0: 468 frontend tests,
  10 Rust tests, lint, typechecks, production build and repository guards passed.
  Log: `output/verification/integrity-20260914-verify.log`.
- After documentation edits, `pwsh -NoProfile -File ./run.ps1 -Task context`
  exited 0: 40 groups, 51.9 KiB default, zero warnings, 10 project-integrity tests
  and nine context tests. The initial expanded backlog exceeded 52 KiB; removing
  duplicate App State prose restored the existing budget without widening it.
  Log: `output/verification/integrity-20260914-context.log`.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye` exited 0:
  all 102 Chromium browser tests passed in 54.4 seconds, including format
  roundtrip, replacement/async lifecycle and retarget/comparison coverage.
  Log: `output/verification/integrity-20260914-browser.log`.
- Final `git diff --check`, context route validation and project-integrity
  validation passed after the documentation reconciliation.

Production-marker scans found only an actual UI placeholder attribute, not an
unfinished implementation. Rust expect calls occur in tests; relative frontend
imports/re-exports and module guards pass. These checks are not exhaustive
skin, third-party format or platform acceptance. No publication was performed.

## 2026-09-14 - Endpoint and anchor integrity evidence

Receiving-game proof subsequently verified both initial stop trials through 520
native/WASM/JS ticks and exact GFP3 admission/fallback, but actual-game visual
review rejected both 3593c6e0 and e15d260c for sharply folded knees and crowded
legs. Passing pins did not close motion acceptance.

An existing-controls-only follow-up produced generation 7a9c729c / model 2f063469
(`output/verification/review6/runbrake-natural-return`). The job retains 16 travel
samples and the same stance handoff, raises the raw hip target by 0.1 within the
unchanged 0.15 correction bound, expands entry/exit envelopes to 8/6 samples,
reduces swing lift to 0.015 and lateral arc to 0.04. No engine API, role, travel,
fallback frame or production code changed in this follow-up. Maximum knee bend
over samples 4–12 falls to 64.38 degrees. Front/side inspected frames are materially
less compressed; actual-game visual acceptance remains pending.

Fresh exported-asset proof retains 1,102 carried tracks and raw structure exactly,
zero bone-length drift, endpoint position residual below 1.5e-8 and rotation below
3e-6 degrees, support height below 5.1e-8 and planted drift below 9.8e-8. Minimum
mesh Y is -0.000227592, explicitly retained rather than labeled zero penetration.
All 16 frames' joint/sole proof is in
`output/verification/review6-stop-natural-all-joints-feet.jsonl`; normal-speed
recording is `output/playwright/stop-natural-entry-front-side-normal.webm`.
Prior full code gates remain applicable; the follow-up changed only ignored jobs,
diagnostics and this evidence record.

Subsequent authorized stance-handoff work fixed partial-contact budget coupling:
the raw shared pelvis bound is no longer reduced merely by an incoming half-weight
foot while another foot is fully planted. Added shared, strictly parsed offline
swing trajectories, finite lift/lateral arcs, bounded travel timing, optional toe
descendant rotation envelopes and explicit swing reach diagnostics. Unit tests
cover bounded/malformed input, endpoint preservation, signed travel, profile
roundtrip, actual-core determinism and mixed contact weights. Final verify passed
465 frontend and 10 Rust tests plus build/type/lint/context gates; log:
`output/verification/review6-swing-final-verify.log`.
The final browser gate passed all 102 tests in one minute, exit zero; log:
`output/verification/review6-swing-final-browser.log`. Context validation passed
40 groups with zero warnings; the default pack is 51.7 KiB.

Left support 0–2 and right landing at 3 make the same 16-sample braking trajectory
feasible within the original 0.15 pelvis bound. No gameplay velocity, role or
event was changed. Contact shortlist 6a692f0b / model 3593c6e0 retains all 1,102
carried tracks and raw asset structure, with zero bone-length drift, sole drift
below 5.4e-8 and minimum mesh Y -0.000226788. Upright/lateral shortlist 9000e68e /
model e15d260c retains the same preservation, sole drift below 6.2e-8 and minimum
mesh Y -0.000229641. Both match walk29 entry and idle16 exit; swing reach residuals
are below 1e-15. Mesh minima are explicit residuals, not zero-penetration claims.

Normal-speed front/side entry-stop-idle recordings and exact-frame captures are
under `output/playwright/stop-entry-front-side-normal.webm` and
`output/playwright/stop-upright-entry-front-side-normal.webm`. All 16 frames' 28
joint poses and both soles, including airborne feet, are recorded in
`output/verification/review6-stop-contact-all-joints-feet.jsonl` and
`output/verification/review6-stop-upright-all-joints-feet.jsonl`. Static visual
review favors the upright variant's less crowded mid-stop knee silhouette, but
its high-knee settling and receiving-game playback remain unaccepted. Switchable
comparison controls preserve 6a as the visual baseline. The receiving-game owner
is testing the exact walk29/speed24/same-facing admission only.

Integrity closeout on local main at base `9a5d017f` passed
`pwsh -NoProfile -File ./run.ps1 -Task verify` (463 frontend tests, 10 Rust
tests, typechecks, lint, build and context gates) and
`pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye` (102 tests, 56.7s).
Final context validation checked 249 frontend source/test files and 11 durable
docs; all nine context tests passed. Commands exited zero. Logs:
`output/verification/review6-integrity-final.log`,
`output/verification/review6-integrity-browser.log` and
`output/verification/review6-integrity-context.log`. Added future-anchor signed
travel and invalid-interval regressions; the owned source preview PID was stopped.
Changes remain local and uncommitted; no publication was performed.

Added offline endpoint envelopes and explicit pre-contact anchor frames through
the shared job/profile/core path. The anchored stop diagnostic (generation
a2147615, model 2419f652) preserves all 1,102 carried tracks, raw asset structure
and bone lengths. Entry walk29 and exit idle16 positional residuals are below
2.18e-8 model units; angular residuals are below 3.42e-6 degrees.

The candidate is NOT accepted: its proof fails with maximum support height
0.061273, planted drift 0.243986 and minimum mesh height -0.085144 model units.
These are not baseline-scale shoe residuals and must not be hidden by widening
tolerances. Evidence: `output/verification/review6-runbrake-anchor-proof.jsonl`
(first line is the report; subsequent lines contain the failing assertion).
Matching endpoints does not establish a valid path between them. The existing
fighter acceptance item remains open; baseline 0c440 is unchanged.

Follow-up in-memory feasibility checks isolated the failure: left full-weight
support frames 3–11 exceed the 0.392777 model-unit maximum leg reach (segment
lengths 0.185030 and 0.208120 at five-degree minimum bend). At frame 11 the
corrected hip still requests 0.636762 reach. The incoming half-weight right
contact also halves the shared pelvis budget to 0.075. Existing diagnostics
correctly report nine clamped left samples and unreachable support. Penetrating
vertices belong to the swinging right shoe early and left shoe at frame 13.
Eight bounded parameter checks retain endpoints; increasing correction to 0.8
fixes sole drift but leaves mesh minima between -0.109393 and -0.069806.
No new asset was published. Evidence: `output/verification/review6-stop-feasibility.jsonl`.
An earlier stance handoff or revised settling/root path requires receiving-game
coordination; fixed sole points alone do not constrain swing-shoe geometry.

## 2026-09-14 - Sampled root travel and separate stop diagnostic

Implemented optional `naturalMotion.rootTravelSamples` through shared saved-job,
portable-profile and CLI/frontend validation. Cumulative source-clip-keyed
translations compensate displacement since contact entry, with zero-origin,
finite/bounded tuple, exact 60 Hz STEP coverage, constant-travel exclusion and
non-wrapping guards. Legacy omission preserves serialization; a matching constant
trajectory produces exact legacy animation values. Nonlinear deceleration,
invalid samples, interval offsets, profile roundtrip and actual core coverage
regressions pass. Full `run.ps1 -Task verify` passed: 459 frontend tests, 10 Rust
tests, context, lint/typechecks, production build and Rust gates; log:
`output/verification/review6-travel-verify.log`.
The independent browser gate passed all 101 tests in 54.9 seconds; log:
`output/verification/review6-travel-browser.log`. Final context checks pass.

Extracted native RunBrake through the existing pinned x86 Brawl path into fresh
ignored output. The adapter verified 63 bones with maximum native matrix error
1.47e-6. Source frames 1–23 were retimed to 16 output samples. The separate
stopDiagnostic asset (generation 7d9790b0, model 6d477eb5) matches recorded
intra-clip travel at ticks 481–496; the first 22.5000009537 game-unit movement
into sample zero is separately recorded as 0.04558489629 target model units.
Its 1,102 carried tracks and raw geometry/weights/binds/materials/images remain
exact; pre-existing duplicate non-joint name normalization remains documented.

This trial is NOT transition-ready. Planted sole-point height and drift are below
4.4e-8 model units, yet full skinned mesh minimum height reaches -0.05006. Entry
against walk pose 29, including first-tick translation, differs by up to 0.59644
model units and 120.69 degrees; terminal against actual fallback idle pose 16
differs by 0.17280 and 48.14 degrees. Idle pose 15 is also mismatched. Source
entry phase, per-bone differences, exact travel, contact rows and raw proof are
in `output/verification/review6-runbrake-proof.jsonl` and the saved ignored jobs.
Contact support cannot replace offline endpoint/whole-shoe clearance authoring.
The game owns the still-unselected transition contract; model 0c440, its roles,
events and turn/start schedule are unchanged.

## 2026-09-14 - Integrity reconciliation and opt-in wrist allocation

Completed the shared `clipForearmTwist` saved-job/profile path and added five
focused tests covering mirrored geometry, palm-world preservation, quaternion
antipodes/winding, transactional invalid-input rejection, strict profile parsing
and actual retarget integration. Invalid reference quaternions now fail closed.
The browser test covers incompatible-policy errors, profile export, application
and undo. No automatic clamping, range widening or collision correction is added.

The damageN2 frame-12 anatomical wrist twist is about -138.14 degrees natively
and -138.12 in Wolf; the saved-reference measurement is -146.90. Source fidelity
does not settle deformation quality. DamageHi2 frame 0 also concentrates source
wrist twist; specialAir frame 30 is primarily a swing concern and was not changed.
The fresh damageN2-only half-share candidate (generation 4b945907, model e9d4b943)
is private and not visually accepted. Its 25-frame proof preserves 1,073 unrelated
tracks exactly; maximum bone-position error is 2.71e-8 model units and non-forearm
world rotation error 8.88e-6 degrees. Raw geometry, weights, binds, textures,
materials and topology match. Nine existing duplicate non-joint wrapper names
are uniquified by import; exact metadata-name identity is not claimed. At frame
12, 396 forearm-influenced vertices change, at most 0.05775 model units; vertices
without that influence differ by at most 1.82e-8. This cannot separate fighters.
Evidence: `output/verification/review6-wrist-preservation.log` and
`output/verification/review6-wrist-basis-audit.jsonl`.

Fixed front/side/quad captures show the expected cuff/forearm surface change at
damageN2 frame 12 and adjacent frames, without a clear visual-quality preference.
Keep the half-share asset separate; do not promote it into the game's independent
contact candidate. The bounded inspection and limitations are recorded in
`output/verification/review6/wrist-visual-decision.md`; still frames do not accept
full-loop self-intersection or paired-fighter clearance.

Reconciled APP_STATE, review and TODO with the corrected comparison-seek evidence
and remaining skin/contact acceptance. Completed work remains here rather than
duplicated task lists. Added the wrist module/tests to the profile context route;
split natural-motion leaf solving from the over-budget retargeting route without
raising budgets. Context now has 39 groups, a 50.5 KiB default and zero warnings.

Verification on local main based on 9a5d017f (uncommitted working diff), Node
26.5.0 / PowerShell 7: `run.ps1 -Task verify` passed 456 frontend tests, 10 Rust
tests, lint, typechecks, build, Rust fmt/clippy/check and synchronization guards;
its initial aggregate exit was nonzero solely for the context route budget.
After the route split, `run.ps1 -Task context` passed, including document/TODO,
relative-import and Rust-module checks. The initial browser run passed 100 tests
and rejected the new fixture's missing rotation track; correcting that fixture
made all five saved-profile browser tests pass. Final lint and test typechecking
also pass. Logs: `output/verification/review6-integrity-latest-verify.log`,
`output/verification/review6-integrity-latest-context.log`, and
`output/verification/review6-wrist-browser-focused.log`. The final full
`run.ps1 -Task test:e2e -NoGenEye` passed all 101 browser tests in 54.0 seconds,
exit 0 (`output/verification/review6-integrity-final-browser.log`).
No secrets, publication, gameplay events or frozen assets changed.

## 2026-09-14 - Comparison terminal-frame seek repair

The receiving game found identical mesh pixels in tilt side-view frame 7/8
captures despite changed controls. Sampling the terminal frame had left Three's
LoopOnce action paused; subsequent explicit seeks updated the receipt but not
the pose. `applyPose` now resumes the action before setting mixer time. A decoded
canvas-pixel regression failed before the fix and passes afterward, including
terminal-to-earlier seeks in front, side and quad views. All seven comparison
browser tests, lint and test typechecking pass. Log:
`output/verification/review6-preview-seek-browser.log`.

Earlier `tilt-landmark-facing*` capture batches are superseded as visual proof.
The 52 corrected `tilt-seek-fixed-facing*` images retain the frozen 50364735
generation/model 0c440cb5. Frame 7/8 differences below the first 100 image rows
are verified in both views/facings, including 67,695 changed candidate-region
pixels for facing +1 side. Evidence:
`output/verification/review6-tilt-seek-fixed-pixels.jsonl`. Controls or requested
frame receipts alone are not proof that the displayed mesh reached that pose.
No retarget, gameplay event, frozen asset or publication changed in this repair;
live gameplay visual acceptance remains separate.

## 2026-09-13 - Repository integrity and GLB roundtrip identity

### Action calibration and authored weight preservation follow-up

Reviewed all 33 remaining action range groups against native Brawl, raw transfer
and conditioned output. Private per-group dispositions are retained in
`output/verification/review6-action-dispositions.json`; flags remain visible.
Mapped native hinge geometry explains the apparent elbow/knee axis flags; this
does not establish whole-mesh collision freedom. Native SpecialN/SpecialAirN
cast with LHandN, not RHandN, at output frame 16. The receiving game owns that
attachment correction and transition/facing acceptance.

Added optional shared job/profile `rootMotionScale` and
`directionAlignmentBones` calibration controls with strict validation. Mapping
the rebound toes can now preserve the prior root scale and alignment constraints
without adding ankle alignment. Rejected broader alignment experiments remain
private diagnostics. The final toe-only derivative (generation a8c98147, model
025a1e78) changes only two rebound toe quaternion tracks; all 1,100 other tracks,
including 116 locomotion tracks, remain exact. Front/side, both-facing frame
comparisons favor source forefoot articulation over the prior flattened toe;
continuous receiving-game visual acceptance remains a separate requirement.

Strict receiving caught 16 changed raw WEIGHTS_0 components (maximum 1.1642e-10)
from Three's unconditional load-time normalization. The loader now snapshots
authored weight accessors before mesh construction and restores valid unit-weight
attributes (finite components in [0,1], sum within 1e-6); malformed weights retain
Three's repair. Three-cycle regression coverage proves both paths. The regenerated
candidate has exact raw and loaded weights, geometry, binds, materials and embedded
textures. Saved normalized jobs replay to the same model SHA-256. Report-only
runtime UUIDs still vary between runs, so immutable generation IDs are not a
model determinism claim. Evidence lives in
`output/verification/review6-toe-only-{raw-weight-proof,preserved-proof}.json`
and `review6-preserved-replay{,-repeat}.log`.

Browser verification exposed a scale-fixture measurement race: the test paused
after hiding the playback controls. It now resets both animated fixtures to exact
frame zero before comparison. A one-pixel lower coverage-bound allowance accounts
for a fractional raster boundary; scale parity tolerances are unchanged. Three
consecutive focused runs pass. After the loader fix, `run.ps1 -Task verify`
passed 451 frontend tests, 10 Rust tests, lint, typechecks, build and Rust gates;
its context gate alone failed because the orientation pack exceeded 52 KiB.
Removed the redundant developer-doc index from default routing, without deleting
the document or raising the budget. `run.ps1 -Task context` then passed, exit 0.
`run.ps1 -Task test:e2e -NoGenEye` passed 99 browser tests in 59.9 seconds, exit 0.
Logs: `output/verification/review6-preserved-{verify,browser}.log` and
`output/verification/review6-final-context.log`. No commit or push was performed.
The receiving game independently reports a8c981/025a1e78 passing 1,733 grid/end
samples, 1,102 tracks and exact loaded geometry/skin/bind/material/image checks;
maximum bone-length error is 4.22e-8 and replacement weight error is zero.
Live fight acceptance remains with the game owner; no further pose changes are
part of this frozen handoff.

Confirmed repeated skinned GLB load/export growth: a four-node fixture became six
nodes in one pass. Reused the loaded scene envelope and Three's scene-export path
without reparenting source objects, removing the synthetic-root construction and
duplicated static/skinned return paths. Four repeated skinned and three static
cycles now retain topology, skin/inverse-bind data, animation and scene metadata.
Authored AuxScene/GLB_Root names are not flattening heuristics; transformed and
animated scene roots remain real nodes. Existing accumulated wrappers stay intact.

A matrix-only transform with stale TRS components was silently dropped when
exporting animation. The shared exporter now rejects that unsupported combination
with an actionable message; non-animated matrix export and ordinary root motion
remain covered. The initial regression and follow-up proof are retained in
`output/verification/integrity-wrapper-{before,after}.log` and
`integrity-root-matrix.log`. Eight focused GLB/project tests pass.

No production TODO/FIXME/stub marker was found in frontend/Rust source; inspected
Rust expect calls belong to tests. Autosave and FBX timing paths retain owned
cleanup and bounded waits. Relative frontend import/re-export and Rust module
checks pass. Current docs now describe the export boundary, history owns completed
work, and existing TODOs keep explicit what/why/where/when/how/done/verification.
Added a focused GLB identity context route, removing those files from the broad
export pack rather than increasing its budget. No asset, dependency, credential,
branch or remote changes are part of this local integrity pass.

Verification on PowerShell 7.6.6 / Node 26.5.0 / Rust 1.98.1, source 9a5d017 plus
the local reviewed diff: `run.ps1 -Task verify` passes 447 frontend tests, 10 Rust
tests, lint, app/test typechecks, build, fmt/clippy/check and repository guards.
`run.ps1 -Task test:e2e -NoGenEye` passes 99 browser tests in 53.7 seconds. Both
exit 0; logs: `output/verification/integrity-final-{verify,browser}.log`.
Context validation passes 38 groups, 51.9 KiB defaults, no warnings.

A private 10f3645b-model geometry-only diagnostic retains 61 nodes, 28 bones and
38 clips across three cycles. Geometry, inverse-bind and animation arrays remain
identical; Three's existing load-time skin-weight normalization produces at most
1.1642e-10 measured weight drift. Node has no canvas encoder, so this diagnostic
excludes texture/material proof; the full browser gate owns textured exports.
Receipt: `output/verification/integrity-actual-cycles.log`. No input model was
rewritten and no generated asset is tracked. Full fighter visual acceptance and
the optional supported-format Mixamo derivative remain the existing gated work.

## 2026-09-13 - Normalized saved-job replay follow-up

The receiving game reported that generated jobs could not replay: omitted
targetChainCurls normalized to an empty array, which the same parser rejected.
Explicit empty arrays now mean no curl corrections; malformed entries retain
their validation. Removed the frontend-only workaround that dropped empty curls.
The regression failed before the fix and 13 focused job/profile tests pass after.
The private b07ff5ba job re-parses identically and imports/roundtrips as a path-free
frontend profile. No input assets were modified. SHA-verified model 9d83294a
independently reproduces the reported tilt, downBounceD and downStandU range flags
at exact output frames. These require a separately reviewed synthesis design;
this replay repair does not clamp rotations or change detection thresholds.
Receipts: `output/verification/review6-replay-{before,after,candidate}.log`.
The full replay verification gate passed, exit 0 (440 frontend units and 10 Rust
tests), before the separately authorized neck/head synthesis slice below.
This follow-up is local-only and has no commit/push authorization.

The game owner then authorized per-clip neck/head redistribution under existing
calibrated limits. Added a bounded two-joint solver, strict shared job/profile
schema, pre-contact integration, correction/residual reports and mirrored,
antipodal, seam, impossible-intent and unrelated-track tests. Initial generation
8c88c0e / model 10d584d5 clears the re-imported tilt/downBounceD neck/head flags,
leaves downStandU unchanged, and retains the reported elbow/ankle flags. It is a
frozen comparison, not final acceptance. The game also reported repeated identity
ancestor wrappers across GLB passes; total node count alone does not prove a rig
change. Wrapper cleanup is outside this neck/head slice.

Final candidate generation 10f3645b / model 3b25eac1 preserves 38 clip identities,
all timestamps, 1,096 unrelated tracks exactly, and geometry/skin/inverse-bind
arrays. Exact-frame re-import comparison limits head-world drift to 0.000007041
degrees. Tilt retains only its two ankle-twist flags, downBounceD has none, and
downStandU retains its elbow/knee/ankle flags. Normalized-job/profile replay passes.
The 99-test browser gate passes (56.8 seconds, exit 0), including a generated
three-bone source rejected before synthesis and accepted/undoable afterward.
The first full gate passed 444 frontend and 10 Rust tests plus code checks;
two context packs exceeded budget after fixture growth. Removed duplicated
generic fixture loading from the archived combined browser and fitted-rig routes.
No route budget was raised. Receipts: `output/verification/review6-neck-` logs
for tests, verify, browser, preservation, final-reimport and final-candidate.
Final `run.ps1 -Task verify` passed, exit 0, with 444 frontend tests, 10 Rust
tests and all repository gates; receipt: `review6-neck-final-verify.log` in that
directory. Context validation reports 37 groups, 51.9 KiB default, zero warnings.
App/test/preview processes exited; Codex tooling and game-owned sessions remain.

## 2026-09-13 - Review6 timing, contact and reference closeout

Fixed exact output-frame mapping before float32 source evaluation. Regressions
exercise the real retargeter at the 62-frame/two-cycle boundary, nonuniform
landmark holds and adjacent STEP keys while preserving next-down output times.
Natural contacts now accept independent ramp overrides and explicit terminal
plant continuity into the same-foot opening pin. Tests cover root-relative
travel, loop position/orientation, malformed intervals and protected solved legs.
Optional local reference calibration preserves animated quaternion deltas rather
than freezing wrists or widening limits; strict profile import/export/reapply
uses the shared parser. Sparse quaternion arrays now fail validation.

Private slow-v1 failed its seam check (0.128 m). Slow-v2 generation d1cc48f6,
model cdb08091, passed 91 exact-frame receiver samples with zero unsupported or
penetrating samples; maximum endpoint displacement was 0.000125 m. The game
owner's 1x front/side playback confirmed improved frame-22 support with retained
swing, not full fighter acceptance. Jab-reference-v1 generation 5efc4a88, model
50a47e2a, passed 19 samples/17 joints with unchanged angular limits after measured
bind-to-idle wrist correction. These immutable outputs predate final producer
validation edits and remain diagnostic comparisons, not a final receiving recipe.
Middle/fast, other actions, coherent final metadata and moving-host acceptance
remain in TODO. No private model, job, screenshot or video is published.

Closeout proof on Windows/PowerShell 7, Node 26.5.0 and Rust 1.98.1, based on
5b120ae plus this reviewed source diff: 41 focused tests passed. The first
`run.ps1 -Task verify` passed 439 frontend tests, 10 Rust tests, lint, both
typechecks, production build, Rust fmt/clippy/check and integrity checks; only
the default context budget failed (52.4/52 KiB). Removed duplicated documentation
routing instead of raising the budget. `run.ps1 -Task context` then passed:
37 groups, 51.9 KiB default, zero warnings. Logs are under
`output/verification/review6-closeout-{focused,verify,context,browser}.log`.
The complete browser gate (`run.ps1 -Task test:e2e -NoGenEye`) passed all 98 tests
in 54.8 seconds, exit 0, including calibrated profile export/reapply/undo.
No RustSMF-owned app/test/preview PID remained afterward. Codex tool processes
and the game owner's independent frozen-artifact comparison session were preserved.
Final `run.ps1 -Task verify` passed, exit 0, after the context repair; receipt:
`output/verification/review6-closeout-final-verify.log`. Closing-session review
authorizes guarded main publication of application code, not fighter acceptance.

## 2026-09-13 — Ankle heading follow-up after d86718d

The game user's explicit feet/ankles review found an orientation conflict:
the jab pelvis turns about 86 degrees while the contact correction held both
feet at their neutral world headings. This produced about 99-degree ankle
twist/swing relative to calibration. Added opt-in contact animated-heading
orientation through the shared job/profile/core; defaults remain unchanged.
Mapped toes inherit the corrected foot, while planted contacts retain entry yaw.

Jab generation 0d7ba7bb / model 63543c3c has no ankle flags in 19 samples with
unchanged limits; the right wrist still flags. Four-locomotion generation
f055c36b / model ef3befba has no ankle flags and passes 234 planted samples
(maximum sole drift 1.024e-7 m). Front/side/bones-on game captures show the
specific ankle correction. Slow-walk support gaps, remaining damage/tilt ranges,
and full fight visual acceptance remain open; these are diagnostic candidates.

`pwsh -NoProfile -File ./run.ps1 -Task verify` passes 430 frontend units,
10 Rust tests and the repository gates. Three retarget-profile browser tests
pass after the build, sequentially. Focused tests cover mirrored/rotated heading,
quaternion antipodes, singular fallback, and plane-following versus planted
entry heading. Logs: output/verification/review5-ankle-{verify,browser,types,lint}.log.
Closing-session review authorizes this follow-up for guarded main publication.
Fresh focused natural-retarget, retarget-core and job-parser tests pass; the
unchanged code retains the full verification and three-browser proof above.
Receipt: `output/verification/ankle-closeout-tests.log`. No RustSMF-owned app,
preview or test processes remained at closeout; game process cleanup belongs to
the concurrently closing game task.

## 2026-09-13 - Integrity and source-format review

Closing-session review authorized publication of this verified application snapshot
on main using the guarded helper. Fighter visual/contact acceptance and Mixamo
conversion validation remain explicitly open; publication does not accept private
fighter assets. The unchanged code retains the 429-unit/98-browser evidence below.

Consolidated completed review narratives here and replaced the obsolete source-choice
backlog with selected-Brawl acceptance and optional Mixamo source validation. Brawl
rest-reference selection does not accept later candidates: the game owner reports
rejected leg appearance, unresolved ankle/torso angular flags and changing-speed
contact coverage. Its standalone scan of 38 clips flagged 36 clips/167 issue groups;
the source idle passed. These are game-owner diagnostics, not independently repeated
visual acceptance in this audit. Explicit clip replacement, visual phase landmarks,
shared-pelvis contacts, mapped toe correction and calibrated body-range review are
local implementation work; their reusable contract is in HUMANOID_POSE_REVIEW.md.

Inspected the supplied archives without extracting or changing them: Ready Idle.zip
contains one 410,525-byte DAE with 33 joints, 28 channels and no geometry/controllers;
Ready Idle (1).zip contains one 515,863-byte DAE with the same joint/channel counts,
one geometry and one skin controller. Both declare Y_UP. This confirms the
without/with-skin distinction, not playback or conversion fidelity. DAE and ZIP
are absent from supported model extensions; added an explicit format regression
and user guidance rather than claiming compatibility.

Fixed an invalid CP1252 apostrophe byte in APP_STATE.md and added a fatal UTF-8
durable-document check with malformed/valid Unicode regressions. Narrowed load/editor
context routing by removing store-specific tests/prose and removed the broad app-state
document from the external-resource issue pack; implementations and direct tests remain.
Added a focused pose-review route without private artifacts or higher generation caps.

Baseline verification at HEAD d99074a plus the existing dirty working tree:

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: application gates passed, including
  427 frontend units, 10 Rust tests, lint, both typechecks, build and Rust checks;
  overall nonzero because load/editor context expanded to 186.1 KiB over 186 KiB.
  Log: `output/verification/integrity-20260913.log`.
- Focused model-format regression passed. Follow-up context checks include the new
  encoding regression; final results are recorded below after code-owner handoff.

Final local gate after the code owner completed CLI identity/output hardening:

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0; 429 frontend units,
  10 Rust tests, 10 project-integrity tests, 9 context tests and both synchronization
  and process-ownership suites passed, along with lint/type/build/Rust checks.
  Log: `output/verification/integrity-final-20260913.log`.
- Context: 37 groups, 51.4 KiB default pack, zero warnings. New CLI tests exercise
  exit 0/1/2, raw/loaded identity ambiguity, external-resource refusal, existing-output
  preservation and deterministic terminal-inclusive reports.
- Runtime: Node v26.5.0, PowerShell 7.6.6, rustc 1.98.1 on Windows. Source identity
  remains d99074a plus local reviewed changes; no commit or push was requested.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye`: final exit 0,
  98/98 passed in 53.5 seconds. Log: `output/verification/integrity-browser-serial-20260913.log`.
  The first run passed 94/98; four initial tests could not mount the app and reported
  asset 404s while the two gates' production builds overlapped. Running browser tests
  after verify completed passed every case without code/assertion changes. The test
  contract now requires sequential gates sharing the same production output.
- Final context and diff checks passed. This is local application/integrity proof,
  not new native-dialog, private fighter visual or Collada conversion acceptance.

## 2026-09-13 - Review5 solver and comparison corrections

Corrected torso coordinate spaces and upward/antipodal direction limits. Actual
retarget regressions cover rigid/combined motion, rotated references, head
compensation and calibrated bend transfer. Existing jobs retain their defaults.
Comparison aliases preserve source names and duration checks. See APP_STATE.md
for the contracts.

Local verification: `npm run test:unit` passed 415 tests; the focused
`tests/rig-comparison.spec.ts` browser lane passed six tests. Production/test
typechecks, touched-file ESLint and `git diff --check` passed. Logs are in ignored
`output/verification/review5-*`. This records implementation proof, not Wolf
visual acceptance; old contacts still introduce prolonged extension. Work is
local and unpublished under the active game-led goal.

## 2026-09-13 - Portable retarget profiles and proportion-sensitive gait diagnosis

- Added a collapsed Saved retarget profile workflow to Animate. It imports complete v2 game-ready jobs or strict `rustsmf.retarget-profile.v1` JSON, strips source-model paths, preserves editable state across panel unmounts, exports through the existing save boundary, and applies explicit numeric maps, references, clip selection/naming, direction, preservation, natural-motion, timing, and recovery settings as one undoable animation transaction. React and CLI callers share `profileClipOptions` instead of duplicating that translation.
- Added target-length torso distribution, target-reference anatomical frames, two-bone leg solving, calibrated sole contacts, declared root travel, and per-clip target-pelvis leg-direction/minimum-swing-bend limits. Strict schema validation rejects unknown fields, invalid ranges, and contact/limit declarations for unselected clips. Reports retain requested/constrained leg angles, bend ranges, contact residuals, pelvis correction, clamping, and reachability.
- Diagnosed the remaining left-leg error as proportion-sensitive motion transfer rather than texture, side mapping, import, or export corruption. The earlier late-walk leg reached about -70.45 degrees sagittal in target-pelvis space. The conditioned frame 24 hip-to-foot vector became approximately `[-0.1106, -0.3052, -0.1577]`, removing the nearly horizontal pose while contact authority faded the limit out at planted feet.
- Extended the hash-bound three-state viewer with strict manifest mapping coverage, cyan mapped versus amber unmapped/target-only skeleton overlays, reversible mesh opacity, and a selected target joint's local axes plus parent-joint-child bend plane/normal. The receipt records the selected diagnostics. The compact Diagnostics disclosure keeps the existing animation light table primary.
- The final producer generation is `f8eed413a73ceffb71c964439ff83d77fe3f44943e88cb9417d5f59920f57f5b`; its model SHA-256 is `aa5a50b43f3ffa7a0e234198bbca7d1e9cc8921c030624228431fa441f4d867d` (2,294,080 bytes, 28 bones, 38 clips, 37 verified 60 Hz STEP roles, three embedded textures, zero external resource URIs). Producer identity now binds the executable local dependency list and package manifests so imported-helper changes cannot retain an older generation ID.
- The receiving game independently verified final-producer manifest/report/job/mapping integrity and byte equality with its selected corrected package, then passed structure, gait/contact limits, all 37 roles, 3,108 attachment samples, Windows/web, native/WebAssembly, actual Chrome, KO/reset/checkpoint, live animation, and 30/60/120/144 Hz presenter schedules. These technical results do not override art review: the operator rejected the full-loop video because the left leg still reads stiff and the motion is not show-ready. The rejected immutable candidate is preserved; Melee/Brawl skeleton-and-motion comparison is the active P1 rather than further unclassified clamping.
- Removed the owner-specific sole-calibration script from the publishable source tree and retained it only with ignored local evidence. Generated Playwright CLI/front-end output was likewise moved below ignored repo output. No production TODO/FIXME/stub marker or broken relative import/export seam was found.

### Verification

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0; 9/9 project-integrity, 9/9 context-bank, 2/2 main-sync, 2/2 process-ownership, 413/413 frontend unit, and 10/10 Rust tests passed; lint coverage, ESLint, app/test typechecks, production-`any`, production build, entry chunks, Rust fmt, clippy, and check passed.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye`: exit 0; 95/95 browser cases passed, including the saved-profile import/error/export/apply/undo flow and five strict comparison-viewer cases.
- `pwsh -NoProfile -File ./run.ps1 -Task context`: exit 0; 9/9 project-integrity and 9/9 context-bank tests passed; 36 groups, 49.3 KiB default orientation, zero warnings. `git diff --check` passed before publication review.
- Corrected visual evidence is retained under ignored `output/playwright/wolf-leg-limit/`; the immutable producer generation remains under ignored local verification output. Private source assets and receiving-game packages are not published by this repository.

## 2026-09-13 - Strict fitted motion and immutable game-ready generations

- Fitted-rig verification now requires exact requested clip identity and duration, samples an explicit 60 Hz regular grid plus terminal, and fails on incomplete coverage. It separates source float32-frame evaluation from fitted next-down-key evaluation and reports requested/completed/rejected samples with the worst clip, time, mesh, vertex, positions, and influences. Focused regressions cover terminal-only corruption, shortened and delayed clips, missing clips, and ordinary-grid displacement.
- The comparison viewer now refuses clip intersections and minimum-duration fallbacks, advances a remainder-preserving explicit-rate animation clock, and cleans up partial loads. Its three synchronized states support equal-height and exact nested game transforms; Quad orthographic shows top/quarter/front/side together. Every draw produces a clip/frame/time, model-hash, camera, and raw/applied-transform receipt. The minimal olive/cream layout keeps the animation light table primary and diagnostics behind compact disclosure.
- The game-ready v2 job publishes immutable content-addressed generations instead of independently replacing sibling files. Canonical producer/source identity and ordinal-role/NFC-name/input-hash sorting derive the generation ID. `model.glb`, normalized `job.json`, resolved `mapping.json`, and `report.json` are staged and fsynced before a last-written hash manifest and one directory rename; an optional direct-child current pointer changes only afterward. Competing publication, every staged-file failure point, manifest hashes, ordering, and prior-generation preservation have focused tests.
- One global relative/absolute direction-transfer setting now handles the common case without repetitive per-clip syntax; clip overrides remain for exceptions. The saved mapping distinguishes manual input from the exact resolved rig report, while legacy asset/report aliases continue to agree with the v2 artifact table.
- The private six-sequence fitted job completed 233/233 samples with no rejection and maximum world-space vertex error `6.091180994014376e-7`. Source and fitted Mario aligned in the strict viewer. Idle, walk, attack, special, jump, and damage Quad/exact-game checks showed coherent Wolf joint bends and no obvious sampled self-intersection; the longer-limb silhouette remains an operator art/gameplay decision.
- The unconditioned absolute-transfer v2 Wolf generation is `64567c3787ee56cc237b394010dc0c5719916f4cad45795cca0b22aba6d51a07`; its model SHA-256 is `bb550398fc80b2776956d007919ec3e6d5e413ddd4891416dcdb56229787f32e`. The receiving game reconstructed the ID, verified all artifact hashes and 37 role durations (38 clips present), and reproduced the prior 37-role pose/gameplay baseline exactly. A full two-fighter 37-role start/mid/end body comparison covered 3,108 joint samples with maximum position delta `1.71e-13` and basis delta `1.84e-7`; native CPU playback reached the same KO at tick 556. This proves packaging/runtime parity, not operator appearance acceptance. The immutable generation predates the final post-rename diagnostic and oversized-duration guards; because producer source identity includes the changed publisher source, a rebuild from the final working tree intentionally derives a new generation ID. The game retained the already validated generation rather than silently changing selection.

### Verification

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0; 9/9 project-integrity, 9/9 context-bank, 2/2 main-sync, 2/2 process-ownership, 401/401 frontend unit, and 10/10 Rust tests passed; lint, both typechecks, production-any, build, manifest/chunk, Rust fmt, clippy, and check passed.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye`: final exit 0; 94/94 browser cases passed, including 5/5 real-GLB strict-comparison cases. The first run reached 92/93 and exposed that the existing extreme-scale screenshot comparison allowed one image's pixel uncertainty while comparing two independently rasterized images. The focused case passed; summing both one-pixel units made the tolerance match its measurement model, and the full rerun passed. The added fifth comparison case proves an oversized finite clip is rejected before its frame schedule can allocate.
- `npm.cmd audit --omit=optional --audit-level=low` from `source`: exit 0; zero vulnerabilities. `pwsh -NoProfile -File ./run.ps1 -Task context` reports 35 groups, 47.5 KiB default orientation, and zero warnings. `git diff --check` passed.
- Hash-bound captures and receipts are under `output/playwright/wolf-motion-strict/`; the local machine-readable command receipt is `output/verification/strict-motion-closeout-20260913.json`. These generated/private paths remain ignored and outside the context bank.

## 2026-09-13 - Fitted-rig session closeout

The fitted-rig CLI, per-skin inverse-bind repair and three-model comparison viewer
pass the fresh `pwsh -NoProfile -File run.ps1 -Task verify` gate: 393 frontend
tests, 10 Rust tests, lint, both typechecks, build, context and repository guards;
exit 0. The receiving game's retained log is
`C:/DevStuff/fight-game-study/.artifacts/fighter-authoring/closeout-smf-verify.log`.
Actual 37-clip re-import and Chrome comparison evidence is recorded below.
Operator appearance acceptance remains open; no infrastructure blocker prevents
reusing the documented commands. Preview processes are stopped. Publication uses
the guarded `gitpush.ps1` helper on main; private model outputs remain local.

## 2026-09-13 - Repository integrity, bounded model input, and retarget evidence

- Extracted the pure `rustsmf.game-ready-job.v1` parser from the CLI execution owner. It rejects duplicate or input-overwriting paths, empty explicit clip selections, unknown attachment roles, and invalid timing/recovery values without requiring filesystem access.
- Replaced parallel whole-file CLI reads with sequential, same-handle bounded reads. Regular-file identity, per-file limits, file growth, duplicate paths, and the remaining aggregate budget now fail before later inputs are materialized.
- Closed failure and timing gaps: partial terminal retarget samples stay within clip duration; material repair disposes textures and materials acquired before a later texture failure; append, retarget, and repair operations share latest-intent leases so stale completion cannot overwrite newer UI state.
- Added normalized mapped-rig segment diagnostics to reports and compact manifests. The reproducible `426ac3aaa30d85f8bd4f2b5957237b0e7597039dc4272d4c158fdc6636615f92` Wolf candidate reports 14 comparable segments and 8 warnings at the 35% threshold, confirming that correct mapping and timing do not establish proportion- or skinning-equivalent motion.
- Restored the intended lazy native boundary by removing `App.tsx`'s static Tauri bridge import. The production-manifest check now proves that the bridge remains a dynamic entry and is absent from eager HTML imports.
- Split the broad game-ready context route into focused material-repair, rig-retargeting, and CLI workflow groups; consolidated detailed test ownership into the test README; updated current state, review, user guidance, pitfalls, and the executable P1 backlog; and corrected the earlier sampled-pose acceptance claim without changing the private source asset.

### Verification

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0; 9/9 project-integrity, 9/9 context-bank, 2/2 main-sync, 2/2 process-ownership, 385/385 frontend unit, and 10/10 Rust tests passed; lint, both typechecks, production-any, build, manifest/chunk, Rust fmt, clippy, and check passed.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye`: exit 0; 89/89 browser cases passed, including material repair apply/undo/redo and named-rig JSON GLTF retarget import. `pwsh -NoProfile -File ./run.ps1 -Task test:visual-strict`: exit 0; 3/3 strict visual cases passed without baseline changes.
- `pwsh -NoProfile -File ./run.ps1 -Task desktop-smoke`: exit 0; the unbundled Tauri release build, 10/10 Rust native-boundary tests, and 13/13 native IPC browser cases passed.
- The private game-ready job completed and reproduced the exact hash above; GLB load-back, embedded-resource, STEP-timing, deformation, and rig-compatibility checks passed. The FBX loader continued to disclose source vertices with more than four weights.
- `node scripts/verify-context-bank.mjs`: 34 groups, 45.1 KiB default orientation, zero warnings. `npm.cmd audit --omit=optional --audit-level=low`: zero vulnerabilities. `git diff --check` passed. Closing publication uses the repository's guarded direct-to-`main` helper; Git HEAD/origin identity is the synchronization record.
- The closing exact-path process inventory found no repository-owned dev server or built Tauri PID and no stale dev-stack state; no unrelated process was stopped.

## 2026-09-13 - Game-ready model repair and explicit animation retargeting

- Added a reusable strict model-refactor path for OBJ/MTL material repair, embedded-texture GLB output, explicit source-to-target rig mapping, per-clip retarget controls, deterministic validation reports, and load-back verification. The existing Outliner Repair and Animate Retarget drawers expose the workflow without adding a separate application shell.
- Diagnosed the supplied Mario attack collapse before retargeting: the untouched source GLB already folds into itself at its late attack frames when loaded directly, so that defect is in the private source animation rather than RustSMF GLB import or export. The private source was not modified.
- Corrected the opaque Mario side-chain mapping that had assigned positive-X limbs to target Right and negative-X limbs to target Left. Positive-X arm and leg chains now map to target Left, negative-X chains map to target Right, and the inferred orientation correction is consequently near identity instead of an approximately 180-degree yaw. This also removed the Wolf walk knee hyperextension without a clip-specific knee workaround.
- Made STEP source evaluation use the source file's float32 timestamps while preserving next-down output keys. This removes the one-frame-early pose transition. Added generic relative or absolute direction transfer with an optional bone scope; Wolf attack uses absolute direction only for the left upper arm and forearm so the strike travels forward from the target rig's arms-down idle. Its verified recovery schedule is peak frame 2, held through frame 3, and returned by frame 8.
- Retained the accepted texture orientation (`flipY` enabled) and avoided introducing normal smoothing. The final `output/game-ready/wolf/wolf.private-moveset.glb` is 1,949,424 bytes with SHA-256 `426ac3aaa30d85f8bd4f2b5957237b0e7597039dc4272d4c158fdc6636615f92`: 28 bones, 38 clips total, 37 retargeted STEP clips, 190 deformation samples, three embedded textures, and zero external URIs.
- Sampled all 37 retargeted roles at their midpoints in Quad orthographic view. Focused Quad and receiving-game Side/quarter checks initially showed no obvious self-clipping at attack frames 2, 3, 5, and 8, walk frame 8, `damageHi3` frame 15, and `rebound` frame 8. Subsequent actual gameplay review rejected the overall motion quality: normalized rig diagnostics showed material target/source segment-proportion differences, so the `426ac3...` output remains a preserved diagnostic candidate rather than an accepted asset. Same-topology fitted-rig comparison is tracked in `TODO.md`.

### Verification

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0; project, context, process, and main-sync guards passed; 378/378 frontend unit tests and 10/10 Rust tests passed; lint, both typechecks, production build/chunk checks, Rust fmt, clippy, and check passed.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye`: exit 0; 88/88 browser cases passed.
- The game-ready CLI completed the private Wolf job, wrote the GLB plus report, manifest, and game-ready metadata, and load-back validation confirmed the counts and self-contained resources above. The expected FBXLoader warning reports truncation of source vertices with more than four skin weights.
- Project-integrity, context-bank, context-bank tests, and `git diff --check` passed. No commit or push was made.

## 2026-09-07 - Session close review

- Reviewed the complete pending integrity/native-dialog change set locally on `main`. No open app blocker or active backlog item remains. The instrumented-session shutdown observation and external compatibility limits remain disclosed below and in `APP_STATE.md`.
- Reran `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0, including 360 frontend unit tests, 10 Rust tests, lint/type/build checks and repository guards. Log: `runtime-data/session-close-2026-09-07-verify.log`. The unchanged behavioral change set also passed the 87-case browser gate, 13-case native IPC suite, and actual Windows dialog journey recorded below.
- `npm.cmd --prefix source audit --omit=dev --audit-level=low` reported zero production dependency vulnerabilities. Final whitespace, current-doc, import/module, and context-bank checks passed.
- Closing process inventory found no remaining repository-owned app, WebView profile, or dev-server process. No unrelated process was stopped.
- Existing Git policy already permits the explicitly requested reviewed push directly to `main` through `.tools/gitpush.ps1`; no policy change or PR is needed. Local runtime evidence, test profiles, and credentials remain excluded from publication.

## 2026-09-07 - Native dialog acceptance and save coordination

Completed the final TODO's actual Windows-dialog done-when conditions. Testing used the built Tauri application, real Rust IPC and filesystem writes, Windows dialog controls scoped by process/handle, and Playwright attached to the test WebView2 through loopback CDP. No native IPC response was mocked in this journey. A separate application identifier and WebView profile isolated autosave and recovery from the normal app. The first exploratory instance acquired an independently opened FBX session and was preserved; acceptance continued in the clearly titled `RustSMF Native Acceptance Test` instance.

Two actual defects were fixed in their existing owners:

- `useLoadModel.ts` rejected foreground saves during background autosave. The foreground operation now reserves its single-flight ownership, waits for the active autosave, rechecks freshness, and continues. A browser regression starts a delayed autosave and proves one Export click completes with maximum concurrent writes of one. Removed the redundant autosaving flag.
- Native CSP blocked GLTF sidecar blob fetches and the WebView2 `http://ipc.localhost` transport. `tauri.conf.json` now permits those exact sources. The existing selected-sidecar browser test applies the shipped native connection policy before import, preventing mock-only coverage from hiding this boundary again.

### Actual dialog results

All three final acceptance commands exited 0: `node runtime-data/native-dialog-acceptance-final/journey.cjs dirty`, then `sidecars`, then `failure`.

| Journey | Observed result |
| --- | --- |
| Open committed SMF and edit animation | Loaded 24 bones, 12 clips, 132 vertices; inserted a key and verified dirty state. |
| Cancel native Open, asset Save, and project Save | Current model identity and animation dirty state remained intact; cancellation status was explicit. |
| Save and reopen model/project | Actual `.smf` and `.rsproj` files were written and reopened through OS dialogs; the project restored a 24-bone, 12-clip, 132-vertex snapshot. |
| Select GLTF plus buffer and texture | The real multi-select dialog loaded `scene.gltf`, `mesh.bin`, and `texture.png`; status confirmed both sidecars, 1,141 total bytes. |
| Failed project destination | A test-owned directory occupying `failed.rsproj.bak2` forced backup rotation failure. The app displayed the failing destination, retained the model and dirty edit, created no target project, and preserved the sentinel. |
| Recover after failure | Saving to a valid destination succeeded; Recover loaded an actual isolated autosave generation and subsequent workspace controls remained usable. |
| Focus and ownership | Foreground PID returned to the acceptance app after each journey. All controlled dialogs belonged to that PID; output and failure fixtures stayed under the owned run directory. |

Evidence: `runtime-data/native-dialog-acceptance-final/report.json` contains platform/build identity, source and saved-file hashes, and native dialog/focus records. The runnable local acceptance driver and scoped Windows-control adapter are retained beside it. Final app version: 0.1.0, Windows 11 Home 10.0.26100, PowerShell 7.6.5, Node 26.5.0, working tree based on `0b7efbc0c8af6dee25b5b6bfe76538969055a558`. The acceptance executable SHA-256 is `6F91ADFC12DD87C327E4268C625951CDAD5FB4BAB39DE1DD58D56AB4D53A333F`; final PID was 19216, main HWND 72682942. Only the test identifier/window title differed from the normal build configuration.

GenEye captured the real Save As dialog at HWND 70518396/PID 27312 during the earlier save pass, SHA-256 `893e0faff4be0846ca42cfb8a81d336f557d4439ed64007e64b73d4fb950ff05`, and the final recovered app at HWND 72682942/PID 19216, SHA-256 `cd2365eb9c147883294d8c967b4baaf39834957efd1f45f44ca115c836c3decf`. Both captures were exact-handle, usable quality, without fallback; total capture times were 329 ms and 380 ms. Images were inspected in the task; metadata is retained in `captures.json` beside the report.

Cleanup observation: the CDP-instrumented acceptance window and debug endpoint closed, but its process required an exact-PID stop after executable-path verification. A fresh instance of the same executable without debugging, PID 48712, exited normally on window close. The fresh normal-launch close passed; the cause of the instrumented-session shutdown delay was not established. Both dedicated acceptance/probe processes were cleaned up. Details are in `cleanup.json`.

### Local verification

- `pwsh -NoProfile -File ./run.ps1 -Task verify`: exit 0; 360 frontend unit tests, 10 Rust tests, context/project/process guards, lint, both typechecks, build and Rust checks passed. Log: `runtime-data/native-dialog-acceptance-final/verify.log`.
- `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye`: exit 0; 87/87 browser cases passed. Log: `runtime-data/native-dialog-acceptance-final/e2e.log`.
- The 13-case focused native IPC suite passed separately in `native-mocks.log`. Actual-dialog evidence above is additional to those mocks.
- `pwsh -NoProfile -File ./run.ps1 -Task desktop-smoke`: the sequential final run exited 0; normal unbundled release build, 10 Rust boundary tests, and 13 native IPC cases passed. Log: `runtime-data/native-dialog-acceptance-final/desktop-smoke.log`. This also restored the normal application identifier in the release build output.
- One `desktop-smoke` attempt built successfully and passed Rust tests but encountered an occupied preview port because the browser gate was running concurrently. Its evidence remains in `desktop-smoke-port-conflict.log`; verification commands using that port must run sequentially.

The active backlog is empty. This closes the recorded Windows acceptance scope; it does not claim universal external-format or other-OS compatibility. No commit or push was made.

## 2026-09-07 - Launcher ownership and context integrity

- Fixed a real Skin/animation integration regression: workspace policy forced Rest even after selecting Frozen Current or Live Animation. The policy now evaluates and pauses the selected clip/time for Frozen, permits Live playback, and preserves Rest as the default and Rig as a rest-pose workspace. Action activation, scrubbing, frame advancement, root attachment, and effective-pose telemetry share that policy.
- Added a regression that fails against the prior implementation, asserting actual bone transforms and action time through Rest/Frozen/Live/Rig transitions. Browser diagnostics now check effective pose as well as the selected option. The existing recorded wave/Skin repair journey passes without changing fixture positions, vertex IDs, or distance tolerances; its current correction/playback screenshots were inspected.
- Replaced launcher-wide port/name process sweeps with exact normalized Node script argument ownership. Quoted paths, slash/case differences, and npm's `.bin/../` paths resolve correctly; other repositories, filename suffixes, `--eval`, and unrelated later arguments confer no ownership. Dev-exit cleanup is limited to normalized dev tasks, including menu selections. Setup propagates Rust-check failure, and the Vite wrapper resolves either a hoisted or frontend-local package.
- Applied configured context exclusions to scanning, globs, trees, and explicit routes. Generated `output/` stays excluded, symlink ancestors and Windows drive-relative paths fail before reads, and context-test temporary directories are cleaned. TODO validation rejects empty fields and an empty-backlog marker alongside active tasks.
- Consolidated current README/review guidance around app state and this dated evidence record. Removed drifting test-count prose, corrected obsolete native SMF peek claims and a stale context-group reference, updated existing Skin/animation/process/context routes, and recorded regression prevention in the pitfall ledger. No new context group or speculative integration-owner split was needed.
- Updated Browserslist 4.28.2 to 4.28.9 and its five transitive dependencies after the audit reported [cache-growth](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) and [custom-statistics](https://github.com/advisories/GHSA-73wf-gq98-2v4g) advisories. Direct dependency manifests were unchanged; the post-update audit reports zero vulnerabilities.

### Verification

All closing commands below exited 0 on Windows, PowerShell 7.6.5, Node 26.5.0, and Cargo 1.91.0. Evidence applies to the local working tree based on `0b7efbc0c8af6dee25b5b6bfe76538969055a558`; no commit or push was made.

| Command | Result | Retained evidence |
| --- | --- | --- |
| `node --import tsx --test src/utils/workspacePlayback.test.ts` from `source/frontend` | New regression failed before the fix; 3/3 pass after it. | Final suite included in the verify log. |
| `pwsh -NoProfile -File ./run.ps1 -Task verify` | 9 project-integrity, 9 context-bank, 2 main-sync, 2 dev-process, 360 frontend unit tests across 62 files, and 10 Rust tests pass; lint, both typechecks, build/chunk/type guards, Rust fmt/clippy/check pass. | `runtime-data/integrity-2026-09-07-verify-final.log` |
| `pwsh -NoProfile -File ./run.ps1 -Task test:e2e -NoGenEye` | 86/86 cases in nine spec files pass, including the updated Skin effective-pose checks. | `runtime-data/integrity-2026-09-07-e2e-final.log` |
| `pwsh -NoProfile -File ./run.ps1 -Task test:journey -NoGenEye` | 1/1 passes with original precision invariants; 12 checkpoints and WebM regenerated. | `runtime-data/integrity-2026-09-07-journey-fixed.log` and `output/playwright/hand-wave-journey/` |
| `pwsh -NoProfile -File ./run.ps1 -Task test:visual-strict` | 3/3 pass; no committed baseline changed. | `runtime-data/integrity-2026-09-07-visual-final.log` |
| `pwsh -NoProfile -File ./run.ps1 -Task desktop-smoke` | Unbundled Tauri release build, 10/10 Rust tests, and 12/12 native IPC browser cases pass. | `runtime-data/integrity-2026-09-07-desktop.log` |
| `npm.cmd audit --omit=optional` from `source` | Zero vulnerabilities after the bounded lock update. | Local npm result. |
| `pwsh -NoProfile -File ./run.ps1 -Task context`; `git diff --check` | 31 groups, about 42.0 KiB default orientation, zero context warnings; no whitespace errors. | Local context and diff results. |

Current production-marker and relative import/export checks found no unresolved stubs or broken module seams. Node/Playwright emit the existing `DEP0205` and color-environment warnings; negative-path browser tests intentionally log rejected inputs.

### Remaining evidence boundary

The TODO now contains one gated real-native-dialog acceptance task with explicit scope and done-when conditions. This pass built the desktop app and exercised native contracts, but did not drive actual OS dialogs. Existing producer-specific format limits remain documented rather than recast as unfinished implementation.

## 2026-09-01 — Integrity guard, real Skin smoothing, and async append ownership

- Replaced Modern Skin's misleading Smooth-to-Auto alias with undoable regional weight averaging that works without a selected bone. The paint loop now indexes skinned meshes once per stroke, and selected-branch lookup avoids repeated skeleton scans.
- Guarded async static-model append by initiating-root identity so a model replacement during loading disposes the stale subtree instead of attaching it to detached state or recording invalid history.
- Consolidated undo/redo domain chronology behind one selector and added focused regressions for history ordering, append ownership, smoothing math, and branch collection.
- Strengthened project integrity so relative imports must resolve to files, current-facing docs cannot contain machine-local paths, and an empty backlog requires the explicit `Backlog status: empty` contract. Generated evidence now shares one ignored `output/` boundary, and the current review/design/backlog docs are portable and non-duplicative.
- Updated the existing project-integrity, model-authoring, load-orchestration, external-resource, and Skin context routes without creating redundant groups.

### Verification

- `run.ps1 -Task verify`: passed 359/359 frontend units across 62 files, 8/8 project-integrity tests, 7/7 context-bank tests, 2/2 main-sync safety tests, lint/type/build guards, and 10/10 Rust tests.
- `run.ps1 -Task test:e2e -NoGenEye`: passed 86/86 browser cases; focused Skin passed 7/7 and focused scale parity passed 1/1.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities. Context validation passed with 31 groups, 43.2 KiB default context, and zero warnings.

## 2026-09-01 — Rest-pose setup workspaces and bounded bone tags

- Stopped viewport animation evaluation in Rig and Skin and restored the pre-animation rest/base pose on entry; Animate reactivates the selected clip at the controlled time.
- Made Rest / Bind the default Skin paint sample, while preserving explicit Frozen Current and Live Animation options in Advanced.
- Removed forced Modern bone-name overlays from Rig and Skin. Optional labels now strip common Mixamo prefixes, use translucent compact tags without redundant axes, and derive world size from model bounds so meter-scale GLB and legacy-scale SMF rigs remain readable.
- Replaced stale Inspector playback guidance, added focused mixer/label unit coverage and Rig/Skin browser assertions, and captured current real-SMF Rig and Skin evidence in the in-app browser.

### Verification

- Focused workspace-playback and bone-label units: 64/64 selected/loaded cases passed across the deterministic 62-file discovery set; app typecheck and ESLint passed.
- Focused production browser cases passed 2/2: Rig rest-pose/label defaults and Skin Rest / Bind telemetry.
- In-app browser verification with `mixamo_smf_baldguy.smf` confirmed Rig and Skin rest-pose telemetry, labels off by default, and model-relative optional tags without the oversized billboard failure.

## 2026-09-01 — Direct-paint Modern Skin workspace

- Implemented the selected hybrid of the contextual floating brush menu and slim left tool rail. Modern Skin now opens without a persistent Properties panel, starts in Pick, selects bones directly in the viewport, and hands off to Paint; Paint, Erase, Smooth, brush size/strength, Undo/Redo, and P/E/S/Q/bracket shortcuts stay on the canvas.
- Kept every existing diagnostic and exact authoring command behind the focused Advanced drawer, preserved source-safe bone identities there, and limited the simple card to friendly fail-closed aliases. Original SMF retains its full legacy Skin panel and shared behavior.
- Added explicit Skin selection ownership to the viewport, aligned hover and click hit radii, removed redundant supporting-panel triggers from Skin, and added responsive/coarse-pointer styling, Advanced focus restoration, a canvas-first browser regression, updated journey/test helpers, current user/app state documentation, focused summary-bank routing, and a passed hybrid design comparison record.

### Verification

- Frontend app and test typechecks passed; ESLint passed; production build passed.
- Frontend units passed 353/353 across 61 files.
- In-app browser verification with the real SMF fixture proved Pick-to-Paint handoff, P/E/Q shortcuts, Advanced open/Escape/focus restoration, zero console errors, DPR 1.5 canvas backing dimensions, and zero document/body overflow at 1280 x 720.
- The full local `verify` gate passed, GenEye-wrapped browser coverage passed 86/86, and the final GenEye-wrapped journey passed 1/1 with 12 refreshed checkpoints and one current 5.6 MB WebM.

## 2026-09-01 — Skin journey and GenEye manifest integration

- Re-ran all six browser Skin flows and 39 focused skin/weight/diagnostic units, including pointer cancellation, Set flow/target/falloff, dirty/export ownership, exact mini-node mapping, weight-preview restoration, and the real SMF torso-wing deformation repair.
- Replaced the stale GenEye shell-command wrapper with checked `geneye.playwright.project_command.v1` manifests and a local pinned-CLI entry. Both the 85-case browser gate and recorded journey now run through `shell=false` argv ownership while `-NoGenEye` preserves the independent product gate.
- Regenerated the journey as one current Calm Modern UI WebM plus 12 checkpoints. The test removes its redundant raw video after securing the report attachment, and GenEye samples the single source instead of double-counting the same recording.

### Verification

- GenEye-wrapped `test:e2e`: passed 85/85 with `execution.boundary=argv_manifest` and completed cleanup.
- GenEye-wrapped `test:journey`: passed 1/1; deterministic temporal verdict `pass`, one 5.6 MB WebM, 12 checkpoints, and no detected temporal defect. The expected low-severity sparse-sampling caveat remains advisory.
- GenEye MCP comparison of the before/corrected Skin checkpoints: both captures `quality=ok`, `quality_disposition=usable`, 1800x1125; changed distance 10 exceeded threshold 8.
- Focused Skin units: passed 39/39.

## 2026-09-01 — Calm canvas-first Modern shell

- Implemented the selected focused-studio visual direction as a separate Modern shell while leaving Original SMF's legacy-parity structure intact. Modern now has a two-row command/workspace header, primary Open/Save/Undo/Redo/Export actions, a named More menu for lower-frequency operations, one Scene/Properties supporting panel, and canvas-overlay layout/camera/display controls.
- Removed persistent empty cockpit surfaces: the unloaded app shows one Open/drop task, compact screens start with drawers closed, and the full Timeline mounts only in Animate. Drawers trap focus, dismiss on Escape, restore their trigger, and remain mutually exclusive.
- Added display-change DPI refresh capped at 2, a shared `ViewportControls` component, Phosphor icons, six responsive overflow lanes, coarse-pointer target checks, DPR 1/1.25/2 backing-size coverage, and a dedicated Modern command/workspace reachability suite. Existing behavior-heavy browser suites run against Original so legacy contracts remain explicit rather than depending on hidden Modern menus.
- Preserved the selected reference under `docs/references/modern-ui/` and recorded same-frame wide/narrow visual QA in `design-qa.md` without turning runtime screenshots into source assets.

### Verification

- The complete 85-case browser suite, recorded hand-wave journey, three strict visual baselines, native desktop smoke lane, frontend/Rust verification gate, context-bank validation, and dependency audit passed.
- The authoritative closing commands are recorded in `docs/dev/review.md`.

## 2026-08-30 — Native I/O ownership and recovery integrity

- Replaced independent native write tasks with one async serialization owner that keeps blocking filesystem work off the async runtime. Export and project saves now use unique staged files, flush payloads before replacement, clean temporary paths, restore the prior destination on install failure, and avoid reporting a false failed save after a successful install whose obsolete-generation cleanup only warned.
- Restricted project recovery discovery and reads to the exact app-owned target, `.bak1`, and `.bak2` regular files. Arbitrary app-data siblings, suffix lookalikes, traversal names, directories, and symlink-shaped inputs fail closed before project bytes are returned.
- Coalesced autosave to the newest trailing request without overlapping foreground/native writes. A successful model replacement invalidates queued old-model work and waits for issued recovery I/O before swapping roots; canceled and failed pickers do not discard recovery work.
- Removed the unused Rust SMF parser module, six dead native peek/info commands, matching frontend bridge and Playwright simulation code, unused direct Rust serialization dependencies, and the unused frontend Tauri dialog package. The TypeScript worker remains the sole structural SMF authority, while Rust owns dialogs and bounded native I/O.
- Reconciled the launcher smoke wording, current app/test contracts, closed TODO, native I/O pitfall, and existing Tauri/project-recovery/SMF-resource context groups. The research inbox had no active architect or source-review drop-in, and no new summary-bank group was needed.

### Verification

- Focused delayed autosave/model-replacement browser regression: 1/1 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed across 188 frontend source/test files and 11 durable docs with 31 groups, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 353/353 frontend units across 61 files, lint/type/build/chunk checks, and 10/10 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 75/75 browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 10/10 Rust tests, and 12/12 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.

## 2026-08-29 — Precision Skin target contract and integrity closeout

- Found a type-correct return-contract inversion in the new mini-node precision path: `getSkinnedVertexWorldPosition` returns `null` on success and a failure code on error, but the component rejected the success case and could continue from an invalid result with an origin vector. Extracted `resolveSkinPointSourceVertex` as the single point-index/stride/source-position guard; valid hits now return the exact world-space source vertex and invalid skin data fails closed.
- Added focused success, out-of-range, and malformed-skin regression coverage. The real recorded journey then completed both torso-seam faces and the outer-sleeve repair through pointer interaction, proving that the helper is wired into the user path rather than only passing in isolation.
- Confirmed that the research inbox has no active architect or source-review drop-ins; no production TODO/FIXME/stub markers, unresolved relative frontend imports/re-exports, or unresolved Rust module declarations remain. Kept all 31 summary-bank groups focused and moved the Original-theme QA record beside its four durable comparison artifacts under `docs/references/theme-qa/`.
- Curtailed the current review snapshot and backlog closure so current behavior, completed evidence, recurring hazards, and forward work remain in their declared owners instead of repeating the full feature history.

### Verification

- Focused `skinPointOverlay` unit suite: 7/7 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 188 frontend source/test files, 11 durable docs, 31 groups, 41.0 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 353/353 frontend units across 61 files, lint/type/build/chunk checks, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 74/74 browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced 12 reviewed checkpoints plus the hand-wave WebM.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 without refreshing baselines.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri build, 15/15 Rust tests, and 11/11 native IPC browser cases.
- `npm audit --omit=optional` from `source`: found zero vulnerabilities.

## 2026-08-26 — Scale-independent framing and selected FBX texture bundles

- Replaced fixed-world camera padding and wheel increments with model-relative perspective distance, near/far clipping, orbit limits, orthographic extents, and ratio zoom. Tiny and huge authored roots keep their transforms and occupy comparable perspective/orthographic screen space. Ordinary skinned models retain exact posed bounds; meshes above 100,000 vertices use a conservative bone-transform bound so fitting cost does not scale with every skinned vertex.
- Added canvas scale telemetry and deterministic unit/browser coverage at root scales `1e-5` and `1e5`. The scale browser case verifies authored-transform preservation, proportional camera values, nonblank pixel coverage, and equivalent composition at both extremes.
- Fixed the FBX load branch to pass its selected `ModelResourceBundle` into `FBXLoader`. Referenced relative textures now resolve only from authorized selected sidecars, temporary object URLs are revoked after image readiness, retained texture count is reported, and unrelated maps are not guessed into slots. A generated ASCII FBX plus PNG owns the permanent regression.
- Validated the owner-local Grim FBX with all four supplied images: one mesh, 13,935 vertices, 65 bones, one clip, and the one source-referenced base-color map loaded with finite proportional framing in perspective, orthographic, and quad views. Three.js reported that the source contains vertices with more than four skin influences and retained four; the unreferenced metallic, normal, and roughness files correctly remained unattached.
- Removed a hidden performance coupling from the 300,000-vertex worker fixture by laying its triangles out on a compact grid instead of stacking 100,000 triangles in the same pixels. The worker test now measures codec responsiveness rather than pathological overdraw. TransformControls browser dragging now accepts the actual visible hovered axis, and the hand-wave journey uses deterministic single-view quarter turns when a precision paint target is occluded or too thin in quad view.
- Reviewed the intentional camera composition change, accepted the full-character framing that keeps head, feet, rig, and floor context visible, and refreshed only the two owned strict WebGL baselines.

### Verification

- Focused viewport units passed 17/17; focused FBX sidecar, tiny/huge framing, TransformControls, and 300,000-vertex worker browser cases passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 188 frontend source/test files, 11 durable docs, 31 groups, 39.8 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 352/352 frontend units across 61 files, lint/type/build/chunk checks, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 74/74 browser cases; the large worker case completed in 3.2 seconds in the full parallel run.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced the reviewed 12-checkpoint animation/weight-paint evidence plus `hand-wave-journey.webm`.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 after the two intentional full-character camera baselines were reviewed and refreshed.

## 2026-08-25 — Bone identification and multi-joint hand-wave journey

- Added a fail-closed display alias contract for the exact known 24-bone SMF humanoid. The Inspector and optional labels expose Mixamo-minimal equivalents such as `mixamorig:LeftArm`, while source IDs remain authoritative for selection, tracks, project state, and SMF export.
- Added a reusable dynamic 3D hover badge to the viewport, including source ID plus semantic alias, high-contrast camera-facing presentation, canvas telemetry/title fallback, selected-bone hover visibility, and pointer-leave cleanup under the viewport listener owner.
- Expanded quick pose rotation from Z-only to positive/negative X, Y, and Z controls. Pose-edit state, history equality, SMF candidate capture, status feedback, and focused tests now cover every rotation axis without changing the no-scale SMF policy.
- Reworked the recorded journey to hold the shoulder outside the head silhouette and alternate a bounded elbow-and-hand arc across five Branch-keyed times, including matching posed loop endpoints instead of T-pose transitions. It proves aliases and the hover badge, catches the fixture's forearm-weighted torso wing, and repairs both sides of the seam through the real Skin workflow: subtract stray `LeftForeArm` influence while preserving the torso/upper-arm blend, then Set the outer upper-sleeve edge to `LeftArm`. Show Vertices is now a first-class Skin control whose selected-weight-colored mini nodes follow the posed mesh and provide exact source-vertex targeting with a forgiving hit area; broad surface brushing remains available. The journey previews playback without an obscuring hand gizmo and emits 12 ordered screenshots plus WebM evidence. The reviewed output reads as a controlled, corrected wave rather than a wrist twitch, whole-arm tube-man sweep, stretched shirt triangle, or torso-to-arm wing.
- Narrowed context routing by adding aliases to viewport support, removing duplicated codec-task ownership from the load-editor pack, and extracting the journey-specific deformation proof from the coordinate suite into `handWaveWeightRepair.test.ts`; 31 groups remain within the existing 256 KiB ceiling and 39.8 KiB default orientation.

### Verification

- Focused app/test typechecks, pose/alias/label/listener unit registration, hover browser coverage, and the stale-copy browser regression all passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed across 187 frontend source/test files and 11 durable docs with 31 groups, 39.8 KiB default orientation, zero warnings, 7/7 context-bank tests, and 5/5 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 346/346 frontend units across 61 files, lint/type/build/chunk checks, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 browser cases after the improved workflow copy and its existing assertion were reconciled.
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced the reviewed 12-checkpoint animation/weight-paint evidence plus `hand-wave-journey.webm`.

## 2026-08-24 — Clean-checkout external GLTF fixture repair

- Committed the exact nine-byte `mesh.bin` sidecar required by `scene.gltf`, while preserving the global model/weight exclusion through one narrow ignore exception and marking the fixture as binary in Git attributes.
- Added a focused integrity suite that pins the binary length, ASCII payload, SHA-256 digest, required scene/mesh/texture files, and containment/existence of every relative external URI. The normal unit command is now available as `npm test`; no test generates or repairs the fixture at runtime.
- Routed the fixture contract through the existing external-model-resource context group and reconciled current-state, review, and test-contract documentation.

### Verification

- Focused external-GLTF fixture integrity tests: 2/2 passed.
- `npm test` from `source`: 343/343 frontend units passed across 59 files.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed the complete local repository gate, including 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 browser cases with the committed fixture.

## 2026-08-24 — Recorded hand-wave journey and animation workflow polish

- Added an opt-in headless Playwright journey that loads the committed SMF character, creates a two-second rest-pose clip, selects the visible right forearm through the indexed bone hierarchy, authors three alternating Z-rotation keys, previews the loop, and writes eight ordered screenshots plus a stable WebM under ignored output.
- The journey audits 1440x900 at 125% device scale and fails on document overflow, blocked or disabled controls, unavailable viewport bone picking, unchanged canvas poses, missing timeline keys, critical browser errors, or missing video evidence.
- Corrected the Animate workspace so its bone list and pose controls remain available, contained the wide toolbar internally, added symmetric `-Z rot`/`+Z rot` controls and clearer indexed-SMF/key-authoring guidance, and made pose nudges report the selected bone and resulting angle.
- The closing dependency audit identified two high-severity transitive advisories; the lockfile now resolves `brace-expansion` 5.0.9 and `nanoid` 3.3.18, and the declared audit reports zero vulnerabilities.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`: passed 1/1 and produced `output/playwright/hand-wave-journey/hand-wave-journey.webm` plus eight checkpoint PNGs.
- `npm audit --omit=optional` from `source`: passed with zero vulnerabilities after the bounded transitive lockfile update.

## 2026-08-24 — Resource bundles, project recovery, rig metadata, and authoring closure

- Added a bounded multi-file resource bundle for browser/drop/native model loading. GLTF external buffers/images and one OBJ MTL/texture bundle now resolve through normalized local names with traversal, remote/data, duplicate/case ambiguity, missing-resource, per-file, aggregate-size, stale-load, and object-URL cleanup guards. The committed external-GLTF fixture proves buffer and texture loading; missing sidecars preserve the mounted model.
- Added a versioned `.rsproj` project envelope that embeds a validated GLB snapshot and bounded workspace state, including playback selection and rig metadata. Native saves use rotating atomic generations with temp-file synchronization and restoration on failure; browser fallback uses local storage/download, and explicit recovery discovery/read rejects corrupt or unsupported input without replacing the mounted model.
- Added versioned per-bone rig metadata with standalone `.rig.json` save/load/clear, project embedding, primary-axis normalization, and lock/pin state. CCD IK skips locked/pinned joints, and explicit Solve & bake IK keys commits one animation history transaction while honoring clip locks.
- Added guarded static model surface authoring: self-contained append, transforms, named material assignment, winding reversal, and normals/tangents preparation. These actions use Outliner history and fail closed for SMF-owned, skinned, animated, or unsupported targets. Added read-only geometry/UV/material/handedness/shader diagnostics and disposable rest-pose ghost, motion-trail, and onion-skin overlays that do not alter export bytes.
- Extracted and tested the resource, project, rig metadata, diagnostics, pose-overlay, and surface-authoring seams; reconciled all durable docs, summary-bank feature/issue routes, stale TODO claims, and test ownership. The active backlog is now closed with evidence-gated external compatibility limits kept in `APP_STATE.md`.

### Verification

- Focused TypeScript checks: `npm run typecheck`, `npm run typecheck:test`, and 14 focused controller/surface tests passed.
- Frontend unit gate: 341/341 tests passed across 58 files.
- Native gate: `cargo fmt --all -- --check` and 15/15 Rust tests passed.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 30 groups, 36.2 KiB default orientation, zero warnings, 7/7 context-bank tests, and 4/4 project-integrity tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 341/341 frontend units across 58 files, lint/typecheck/build/chunk checks, Rust fmt/clippy/check, and 15/15 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 72/72 browser cases with approved local browser-process access; expected missing-resource/read-failure diagnostics remained within their asserted error paths.
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`: passed 2/2 committed visual snapshots without refreshing baselines.
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`: passed the unbundled Tauri release build, 15/15 Rust tests, and 11/11 native IPC browser cases.

## 2026-08-23 — Project-integrity gate, interrupted-orbit cleanup, and static model transactions

- Added a local project-integrity guard for durable-doc presence, executable TODO fields, research-inbox review status, relative frontend imports, and Rust module declarations. Its focused workflow is routed through `summary_bank.json` and runs before context and application verification.
- Hardened `SimpleOrbit` so touch cancellation, window blur, and disposal cannot leave a stale drag active; added a focused regression covering both interruption paths.
- Added guarded static-submodel duplicate/delete actions to Model. Explicit parent/index structural history restores exact placement, static duplicates own cloned geometry/material/texture resources, and bones, skinned subtrees, unsupported sources, and animation targets fail closed before mutation.
- Added unit and OBJ browser coverage for duplicate/delete guards, exact undo/redo, resource isolation, and GLB export persistence. Reconciled app state, user notes, test ownership, review evidence, TODO review date, and history; the remaining P2/P3 items stay active with duplicate/delete removed from the Model subtasks.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 28 groups, 40.5 KiB default orientation, zero warnings, 7/7 context-bank tests, and 4/4 project-integrity tests.
- `npm.cmd run test:unit -- --test-name-pattern "touch orbit|resets orbit"` from `source/frontend`: passed the focused 53-test registration slice, including both orbit interruption cases.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 326/326 frontend units across 52 files, Rust fmt/clippy/check, and 13/13 Rust tests.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: passed 67/67 browser cases; runner-owned ports 5173 and 1420 were clear after cleanup.

## 2026-08-20 — Native read race hardening and context-route cleanup

- Closed the native read size-of-check/size-of-use gap by opening the authorized canonical file once, rejecting non-regular paths, and bounding the observed stream to 256 MiB plus one sentinel byte before returning data.
- Tightened the Rust SMF envelope parser to reject pre-header, overlapping, undersized, and truncated section offsets before exposing desktop metadata.
- Removed the unused private frontend utility re-export barrel and its stale context-bank path; live code already imports each utility from its owning module.
- Reconciled `APP_STATE.md`, `TODO.md`, `summary_bank.json`, and this history entry with the new native boundary and route ownership.

### Verification

- Focused verification before the full gate: `cargo fmt --all -- --check`, `cargo test --all-targets` (13/13), frontend `test:unit` (323/323), and app/test typechecks all passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with context validation, main-safety checks, lint coverage, ESLint, app/test typechecks, the production-`any` guard, Vite build and entry-chunk checks, 323/323 frontend units across 52 files, Rust fmt/clippy/check, and 13/13 Rust tests.

## 2026-08-13 — Browser certification and safe main synchronization

- Completed the post-fix browser certification: the focused static-root preparation, guarded rename, and sibling reorder flows passed, then the full Playwright suite passed 66/66 with the approved local browser process. The earlier unprivileged `spawn EPERM` result is retained only as a managed-sandbox launch limitation, not a product test failure.
- Replaced unsafe, duplicated local push/pull automation with shared main-only guards. The controls now require the configured existing origin and `main`, reject active operations, unsafe token state, and mismatches, use a clean fast-forward pull and ordinary post-verified push, and stop for manual resolution instead of force-syncing or selecting conflict sides.
- Added `scripts/git-main-safety.test.mjs` to the root `verify` gate, updated the local Git-control labels, narrowed the overlapping context-bank route, and moved completed browser certification out of the active authoring backlog.

### Verification

- `node --test scripts/git-main-safety.test.mjs`: 2/2 passed, including current-worktree preflight before credential access.
- `pwsh -NoProfile -File .\run.ps1 -Task context`: passed with 27 groups, 39.3 KiB default orientation, zero warnings, and 7/7 context-bank tests.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with the main-safety test, lint/type/build/chunk/production-boundary checks, 323/323 frontend units across 52 files, and 10/10 Rust tests.
- `npm.cmd run test:e2e -- --reporter=line --workers=1`: passed 66/66 with approved local browser-process access.

## 2026-08-12 — Static-root export integrity, shared geometry preparation, and reversible model authoring

- Hardened static-root skin preparation with all-mesh preflight, fail-closed existing-skinned detection, collision-free root naming, and per-mesh world bind matrices. Transformed roots now deform from their actual placement, and a later invalid mesh cannot leave earlier geometry partially mutated.
- Replaced duplicated GLB/FBX/OBJ UV/normal/tangent setup with one tested geometry-attribute contract. Tangents are generated only for compatible source UV/normal data and valid indexed triangles, so non-indexed exported triangle soup no longer emits a Three.js error during validation re-import.
- Made FBX texture readiness waits concurrent under one bounded timeout and cleared the manager timer on early settlement.
- Added focused static-preparation and geometry tests plus a Rig browser flow for prepare/diagnose/roundtrip/export/undo/redo/replacement behavior. Updated non-SMF export wording to name prepared OBJ/FBX sources accurately.
- Added guarded single-selection rename for GLB/FBX/OBJ Outliner items. Rename shares the reversible name/visibility/selection snapshot and global history contract, blocks binding-unsafe, duplicate, animated-target, bone, and source-owned SMF names, and is proven through GLB export/re-import.
- Added guarded same-parent sibling reorder for non-SMF Outliner items. Its ID-only snapshot restores exact child order without retaining a cyclic Three scene graph, preserves interleaved rig/non-Outliner children, participates in global chronology, and is proven through GLB export/re-import.
- Added the inline rename and move-up/down workflows plus export-format browser registrations. Consolidated duplicated Node `FileReader` export-test setup into one helper and replaced coarse generated-GLB fixture caches with one option-keyed cache so texture/material/sibling variants cannot reuse incompatible bytes.
- Reconciled current app/user/test docs, removed stale suite totals from dated visual QA, retained only measurable forward work in TODO, recorded the recurring tangent hazard, and organized 26 context groups with separate model-material, model-authoring, and shared geometry-preparation routes.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 26 context groups at 38.8 KiB default orientation, lint/type/build/chunk/production-boundary checks, 323/323 frontend units across 52 files, and 10/10 Rust tests.
- Focused geometry/static-preparation/FBX and model-outliner/rename/reorder/GLB recovery commands passed with no failures; direct fixture generation produced distinct option variants; `npm.cmd run test:e2e:list` discovered 66 browser cases across eight specs.
- The static-root browser case exposed the pre-fix tangent error only at its final browser-error gate after all functional assertions. The post-fix browser rerun was denied by the local execution-approval usage limit; the repaired static-root and new rename/reorder cases remain explicitly certification-open rather than being reported as browser-green.

## 2026-08-09 — Integrity pass, context routing, and focused-unit runner

- Audited current docs, code and test import surfaces, production TODO/stub/any markers, async cleanup seams, context routes, and the active backlog. No broken imports/exports or production stubs were found.
- Repaired `run-unit-tests.mjs` so extra Node test flags are forwarded while deterministic test-file discovery is preserved; focused commands now provide truthful feedback instead of silently running every case.
- Added viewport-support and missing feature/test/state routes to `summary_bank.json`, corrected the OBJ loader comment to match `OBJLoader`'s static-only behavior, and kept the six active P2/P3 TODO contracts unchanged because none is complete.

### Verification

- `npm.cmd run verify` from `source`: passed with lint/typechecks, build/chunk guards, 307/307 frontend units across 50 files, Rust checks, and 10/10 Rust tests. Managed-environment Rust path-canonicalization warnings were nonfatal.
- `node scripts/verify-context-bank.mjs`: passed with 24 groups, 36.6 KiB default orientation, and zero warnings; `node --test scripts/context-bank.test.mjs`: 7/7 passed.
- `npm.cmd run test:unit -- --test-name-pattern "animation duration formatting"` from `source/frontend`: passed with the matching duration-formatting case while all 50 discovered files still loaded.
- `npm.cmd run test:e2e -- tests/animation.spec.ts tests/skin.spec.ts --reporter=line --workers=1` from `source/frontend`: the unprivileged sandbox attempt was blocked before test bodies by managed Chromium `browserType.launch: spawn EPERM`; the same bounded command with approved local process access passed 13/13.
- `npm.cmd run test:e2e -- --reporter=line --workers=1` from `source/frontend`: passed the complete 63-case browser inventory with approved local process access.

## 2026-08-09 — Animation display and Skin telemetry reconciliation

- Repaired the Animate duration fields so IEEE-754 display noise such as `0.30000000000000004` is shown as `0.3`; numeric duration normalization and edit semantics remain unchanged.
- Reconciled declarative and imperative Skin viewport telemetry: pose and live-warning markers are declared on the canvas, reapplied when pose or editor mode changes, and no longer removed by view-mode cleanup. Transient brush telemetry remains cleaned when leaving Skin.
- Added focused unit contracts for stable duration formatting and Skin telemetry transitions.

### Verification

- `npm.cmd run test:e2e -- tests/animation.spec.ts tests/skin.spec.ts --reporter=line --workers=1`: passed 13/13 focused browser cases.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with context validation, lint/typechecks, production build/chunk guards, 307/307 frontend units across 50 files, and 10/10 Rust tests.

## 2026-08-08 — Skin diagnostics and paint-pose safety

- Completed the P1 skin diagnostics slice: the Skin workspace now exposes raw four-slot influence details for hovered vertices, aggregate invalid-reference/weight/unweighted counts, stable issue codes, and an influence legend independent of export materials.
- Added real Rest / Bind, Frozen Current, and Live Animation brush sampling contracts. Frozen Current captures bone matrices until the mode changes; Live Animation follows the mixer and shows an explicit safety warning; viewport telemetry records the selected mode.
- Added pure diagnostics and pose-position/index tests plus a browser registration covering diagnostics and pose-mode telemetry. The active frontend inventory is 305 unit tests across 50 files and 63 browser cases across eight suites.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with context validation, lint/typechecks, production build/chunk guards, 305/305 frontend units, and 10/10 Rust tests.
- `npm.cmd run test:e2e:list`: discovered 63 browser cases. Runtime browser proof remains subject to the documented managed Chromium `spawn EPERM` launch boundary.

## 2026-08-08 — Animation trim and locked-channel safety

- Completed the P1 animation authoring slice: finite range trim samples both boundaries and shifts retained authored keys, while the Animate workspace exposes trim bounds and one-step workspace undo/redo.
- Added per-clip locked-bone state with source-SMF lock discovery, UI lock/unlock, scoped/viewport edit guards, retime/trim fail-closed protection, clip CRUD propagation, and SMF lock-list export preservation.
- Added pure transform, controller, export, and browser regression coverage. Current frontend inventory is 300 unit tests across 49 files; browser inventory is 62 cases across eight suites.

### Verification

- `npm.cmd run typecheck` from `source`: passed.
- `npm.cmd run test:unit` from `source`: passed with 300/300 tests across 49 files.
- The new `animation.spec.ts` trim/lock case is registered in the 62-case browser inventory; runtime proof remains subject to the existing managed Chromium `spawn EPERM` launch block recorded in `docs/dev/review.md`.

## 2026-08-08 — Static-root history safety and current-state reconciliation

- Repaired the static non-SMF root-preparation path so mesh promotion is reversible, preserves original skin attributes on undo, reapplies deterministically on redo, and participates in the dirty replacement guard.
- Added focused restore/reapply coverage, routed the static-root module through the Rig summary-bank group, and updated app/user/test state docs plus the model-authoring backlog with the remaining browser/export proof gap.
- Reconciled current verification inventory to 296 frontend unit tests across 49 files and retained the browser launch limitation as harness-blocked evidence rather than a product result.

### Verification

- `npm.cmd run verify` from `source`: passed with 296/296 frontend units, all lint/type/build/chunk/production-boundary checks, and 10/10 Rust tests.
- `node scripts/verify-context-bank.mjs` and `node --test scripts/context-bank.test.mjs`: passed with 23 groups and no warnings.
- `npm.cmd run test:e2e:list`: discovered 61 cases. Full browser execution was attempted with `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye` but was blocked before test bodies by managed `browserType.launch: spawn EPERM`; ports 5173/1420 were clear after the owner session was stopped.

## 2026-08-06 — Repo integrity, I/O boundaries, and browser regression repair

- Reconciled the app/user/test/controller docs with the current implementation, reduced the root README and review snapshot, removed completed prose from the active backlog, and added measurable sidecar-import and evidence-led modularization tasks.
- Reorganized `summary_bank.json` into 23 validated groups by adding the external-model-resources issue route, routing strict native payload validation through the Tauri subsystem, and replacing stale current-head progress notes with stable verification guidance.
- Centralized animation scope keyframe labels, restored Auto Skin algorithm context for equivalent strokes, and stabilized post-stroke hover telemetry. These changes repaired four product assertions found by a full browser audit.
- Made browser file-read failures visible instead of cancel-like, added strict native IPC byte normalization, added unit/native/lifecycle regressions, and removed doubled punctuation from load guidance.
- Added a safe browser inventory script and retained the tested lightweight utility barrel after test typechecking proved it was a contract surface rather than dead production syntax.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed with 292/292 frontend units across 48 files, 10/10 Rust tests, all lint/type/build/chunk/production-boundary checks, and 23 context groups at 36.7 KiB default orientation with zero warnings.
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`: 61/61 passed across eight browser suites.
- `npm.cmd run test:e2e:list`: discovered the same 61 cases without launching them.
- Focused animation/lifecycle/skin browser slice: 21/21 passed; malformed-native-payload browser case passed; ports 5173 and 1420 were clear after the complete run.

## 2026-08-03 — Scoped animation key authoring and hostile-name hardening

- Added Bone/Branch/Full Rig scope resolution from the selected hierarchy, one history transaction per scoped insert/update/delete/move, unioned timeline markers, and a guarded scope selector in Animate.
- Added skeleton fingerprints and source-scope metadata to the animation clipboard. Paste now rejects changed skeletons, mismatched scopes, and missing target bones without mutation.
- Hardened animation edit and clipboard maps with null-prototype records so valid user/model names such as `__proto__` cannot turn into prototype reads or writes. Pose construction also treats snapshot entries as own keys only.
- Added bulk helper, hostile-name, controller, and browser coverage for scoped edits and one-step undo.
- Added bounded clip duration set/extension as a first-class animation edit. Shortening below the latest authored/source key fails closed until trim semantics exist; duration changes share the animation-workspace history and export path.
- Added bounded clip retime as a first-class animation edit. Source tracks and authored keys scale together, relative playback time is preserved, and explicit shorter durations now survive SMF export.

### Verification

- `npm.cmd run test:unit`: 290/290 passed across 47 discovered unit-test files.
- `npm.cmd run typecheck`, `npm.cmd run typecheck:test`, and `npm.cmd run lint`: passed.
- The scoped and retime browser assertions reached their product flows without assertion failures; managed execution then reported only `browserContext.close: spawn EPERM`, so it is harness-blocked rather than browser-green evidence. Exact cleanup left ports 5173/1420 clear.

## 2026-08-03 — Animation validation and skin-overlay cadence

- Added a shared animation-skeleton validation boundary. New animation creation now fails closed for missing, empty, unnamed, or duplicate bone names instead of emitting ambiguous Three.js tracks; pose snapshots use own-key handling for hostile names such as `__proto__`.
- Made posed Skin pts refresh cache pose matrices and position/skin attribute versions, skip unchanged viewport ticks, reuse per-overlay scratch vectors, and batch skeleton updates across changed overlays. Display-only ownership and disposal remain unchanged.
- Added unit coverage for animation validation, hostile snapshot keys, duplicate-name controller status, and unchanged/changed overlay cadence. Added a browser regression for Skin Set target weight, flow, and falloff telemetry.

### Verification

- Focused `npm.cmd run test:unit -- --test-name-pattern "animation creation|animation authoring controller|skinPointOverlay"`: 279/279 discovered tests passed at that slice; the runner currently executes the full discovered set while applying the name filter to Node's test process.
- `npm.cmd run typecheck` and `npm.cmd run lint`: passed.
- The new browser case is included in the current 58-case discovery; managed browser execution remains subject to the documented `browserContext.close: spawn EPERM` teardown boundary.

## 2026-08-03 — Pose-based animation creation and skin authoring semantics

- Added a bounded Animate-panel flow for creating a named clip from either the canonical load-time Rest pose or the current local bone pose. It supports models with zero source clips, creates complete position/quaternion tracks for named skeleton bones, and records one reversible animation-workspace transaction.
- Separated Skin Set mode's Target weight from brush flow and falloff. Set blends toward the bounded target; Add/Subtract retain incremental behavior.
- Made the display-only Skin pts overlay follow posed skinned vertices during the viewport loop while keeping runtime source links outside serializable `userData`.
- Added focused unit coverage for pose capture/clip construction, controller history/metadata, explicit skin targets, and posed overlay refresh, plus a browser regression for create/undo/redo.
- Updated app-state, user, review, backlog, history, and summary-bank documentation to match the current feature contract and remaining old-editor parity work.

### Verification

- `npm.cmd run test:unit`: 275/275 passed across 46 discovered unit-test files.
- `npm.cmd run typecheck`, `npm.cmd run typecheck:test`, and `npm.cmd run lint`: passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed, including context validation, production build/chunk checks, frontend units, Rust fmt/clippy/check, and 10 Rust tests.
- The focused new pose-creation browser case reached all assertions with no product assertion failure, then hit managed `browserContext.close: spawn EPERM`; exact cleanup left no listener on ports 5173/1420. This remains harness-blocked evidence rather than a browser-green claim.
- `git diff --check`: passed.

## 2026-08-01 — Context budget and skill-route consolidation

- Raised the focused context-generation ceiling from 180 KiB to 256 KiB while keeping the 27.5 KiB default orientation narrow; the largest active route remains bounded by its own group cap.
- Routed the RustSMF summary-bank overlay through `workflow__context_bank` and added an explicit 96 KiB cap to the archived old-editor reference route.
- Removed repo-local `monolith-modularization` and `pitfall-ledger` copies because the global skills already own those workflows; retained only the project-specific `summary-bank-json` delta.

### Verification

- Context-bank validation, focused context tests, skill frontmatter validation, and the repository verification gate passed after the routing changes.

## 2026-08-01 — Guarded replacement, bounded history, and native I/O ownership

- Added a shared dirty predicate and accessible Cancel/Discard replacement dialog. Browser, drop, and native open paths defer byte materialization until discard is explicit; cancel, stale completion, parse failure, and native/browser errors retain the existing model and authoring state.
- Added a 512 MiB decoded SMF-memory estimate covering texture, mesh, rig, and animation allocations, with checked arithmetic and stable `SMF_DECODED_MEMORY_BUDGET_EXCEEDED` diagnostics.
- Moved native dialog ownership into Rust, authorized reads against dialog-selected canonical paths, removed the arbitrary native write-path command, and routed saves through a Rust-owned save dialog with the shared 256 MiB bound. The frontend now passes typed byte views instead of constructing an explicit number array.
- Aligned the Tauri Rust and frontend dialog-plugin declarations at 2.7.1 after the native smoke audit found the prior manifest-version drift; the frontend does not invoke the JS dialog API, but the declaration is required for Tauri's build contract.
- Added byte-aware editor and skin history limits with oldest-entry eviction, current-edit preservation, and status feedback. Editor history is capped at 64 MiB; skin history is capped at 32 MiB per direction.
- Kept mixer advancement imperative in the viewport and throttled parent timeline publication to a 50 ms display cadence, with immediate setters for scrub and playback intent changes.
- Repaired browser stress-fixture triangle metadata, made dirty-overlap tests explicitly confirm each replacement decision, and kept skin telemetry on the final collected hit so semantic validation and interaction probes remain deterministic.

### Verification

- `npm.cmd run test:unit`: 269/269 passed across 45 discovered unit-test files.
- Frontend app/test typechecks and ESLint passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed on the final tree, including context validation, build/chunk checks, 269 frontend tests, Rust fmt/clippy/check, and 10 Rust tests.
- Rust `cargo check --all-targets` and `cargo test`: 10/10 passed, including native path-authority coverage.
- `npm.cmd audit --omit=optional`: found 0 vulnerabilities.
- Current full browser run reached all 56 bodies with no product assertion failures; teardown reported only managed `browserContext.close: spawn EPERM`, and the preview listener was cleaned. Strict visual reached both bodies with the same teardown-only result.
- Current desktop smoke built the unbundled Tauri executable and passed all 10 Rust tests; its native IPC browser phase was stopped after managed teardown failed to complete, with no listener left behind.

## 2026-08-01 — Restored validated GLB/FBX-to-SMF conversion

- Repaired the non-SMF converter's space contract: mesh positions/normals/tangents are baked once into model-root Three space, the binary serializer owns the single Three-to-SMF conversion, and source-root transforms are removed exactly once.
- Captured bind and sampled bone poses as root-relative world dual quaternions so nested parent transforms survive SMF hierarchy reconstruction.
- Replaced direct quaternion-component interpolation with cloned Three animation-mixer sampling and stable frame-time collection.
- Restored compatible non-SMF SMF export and roundtrip actions while retaining diagnostic blocks for static roots, scale tracks, incomplete skin data, semantic failures, and unsupported structure.
- Added numeric parity tests for translated/rotated mesh transforms, nested bind matrices, mixer quaternion interpolation, and the app-facing conversion candidate.

### Verification

- Focused converter/candidate/coordinate slice: 58/58 passed.
- App and test typechecks passed.
- Targeted browser bodies reached the restored conversion assertions; managed Windows `browserContext.close: spawn EPERM` still blocked clean teardown, so no new browser-green claim is made.

## 2026-08-01 — Conversion safety gate and shared model boundaries

- Fail-closed the app-facing GLB/FBX-to-SMF candidate and SMF roundtrip action with `SMF_NON_SOURCE_CONVERSION_UNVERIFIED` after confirming the isolated converter did not yet prove coordinate, rig-space, or animation spatial parity.
- Kept the low-level Three-to-SMF builder available only for focused parity work and updated browser/unit contracts so source-SMF export remains enabled while non-SMF sources use GLB/FBX output.
- Added `smfSemantics.ts` as the shared finite/relational `ImportedSmf` validator for parser, worker fallback, and serializer boundaries; added checks for malformed mesh/skin references, rig cycles, animation times, DQ shape, and texture payloads.
- Fixed constructed SMF node-list parent resolution when a child precedes its parent, and added the regression test.
- Added one 256 MiB model-input limit shared by browser metadata, native/test-injected bytes, and SMF binary input/output; oversized browser files are rejected before `File.arrayBuffer()`.
- Reconciled app/user/test state docs, active TODO done-whens, summary-bank routing, and pitfall-ledger entries.

### Verification

- Focused conversion candidate/converter, semantic-validation, and model-input slice: 34/34 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context routing, lint, app/test typechecks, production-any/build/chunk gates, 259 frontend units across 43 files, and 9 Rust tests are green.
- The affected five-case browser slice reached all targeted test bodies, but managed `browserContext.close: spawn EPERM` occurred during teardown; no assertion failure was emitted and ports 5173/1420 were clear after exact test-process cleanup. The result is harness-blocked, not product-green browser evidence.

## 2026-08-01 — Lifecycle cleanup and skin-history indexing

- Made viewport RAF cleanup explicit for zero-valued handles and cleared both frame refs after cancellation.
- Coalesced and canceled browser file-picker focus timers, and canceled FBX texture wait timers as soon as texture loading settles.
- Replaced repeated linear skin-history snapshot searches with a shared mesh/vertex key index; added focused coverage for the indexing contract.

### Verification

- Focused skin unit slice: 21/21 passed; FBX loader slice: 6/6 passed; animation-frame slice: 2/2 passed.
- Frontend app and test typechecks passed; ESLint passed after the timer guard correction.
- Latest system-Chrome Playwright run reached all 55 test bodies but was blocked only by managed teardown `browserContext.close: spawn EPERM`; the earlier complete 55/55 run remains the authoritative browser result for this environment.

## 2026-08-01 — Worker setup cancellation and guidance alignment

- Hardened the SMF codec client against an abort arriving after worker handlers are installed but before the request is posted. The client now rechecks the signal, skips stale `postMessage` work, and safely clears an uninitialized timer during early cleanup.
- Added a focused regression test and updated the current-state/test-contract/context-bank docs. The repo-local modularization and pitfall skills now include the latest global workflow guidance without replacing the RustSMF-specific summary-bank rules.

### Verification

- Focused SMF codec client test: 10/10 passed.
- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context validation, lint, typechecks, build/chunk guards, 251 frontend units, and 9 Rust tests are green.

## 2026-08-01 — Weight-preview state restoration audit

- Fixed selected-bone weight preview cleanup so it restores the source color attribute and each material's prior `vertexColors` mode instead of forcing materials to `false`.
- Added focused unit coverage for existing source colors, models without source colors, and invalid selected-bone cleanup. The test runner now discovers 41 files and reports 250 passing frontend unit tests.
- Updated `APP_STATE.md`, the frontend test contract, the legacy shader parity map, the pitfall ledger, and `summary_bank.json` to keep the current behavior and source route explicit.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed; context, lint, typechecks, build/chunk guards, 250 frontend units, and 9 Rust tests are green.
- Focused weight-preview unit test: 3/3 passed.
- A focused four-case skin browser rerun reached its test bodies but was blocked during managed Chrome teardown by `browserContext.close: spawn EPERM`; the prior complete 55/55 browser run remains the authoritative browser result, and the stale server was cleaned up.

## 2026-08-01 — Follow-up browser and legacy-shader audit

- Corrected the Playwright executable override to use `use.launchOptions`, where Playwright actually consumes it; the managed Windows fallback now runs against an explicitly approved installed Chrome executable without changing app configuration.
- Added a served SVG favicon, reused the viewport IK drag helper in visual coverage, froze animated skin fixtures for deterministic brush sampling, and widened probe points to cover narrow quad-view geometry.
- Audited the old selected-bone weight shaders and recorded their four-slot/HSV behavior alongside the current export-safe vertex-color equivalent. The legacy shader paths remain reference material, not an untracked implementation stub.
- Fixed the workspace-transition IK readiness race: browser telemetry now rejects absent coordinates, and newly mounted target handles refresh their world matrix before raycasting. The focused IK case passed 5/5 repeated runs; the full browser suite passed 55/55.
- Completed the dependency audit with `npm.cmd audit --omit=optional`: 0 vulnerabilities reported.

## 2026-08-01 — Integrity and external FBX compatibility pass

- Replaced the hardcoded frontend unit-test list with deterministic recursive discovery.
- Hardened posed skin-brush sampling, invalid skin diagnostics, cache invalidation, viewport resize cancellation, animation snapshot/controller ownership, and latest-intent load/export timing.
- Added bounded SMF reader/writer sections, counts, strings, numeric/range checks, output preflight, native 256 MiB I/O limits, blocking-task adapters, UNC normalization, explicit CSP, and truthful native header-check wording.
- Added current-head browser regressions for skin cancellation/no-op edits, native export cancellation, indexed geometry, material policy, and independent FBX compatibility.
- Added an independently authored Blender 5.0.0 skinned, textured, animated FBX fixture with provenance and a repeatable external validator. The fixture is intentionally test-only and carries no third-party source asset.
- Corrected FBX export integer-array typing and layer metadata so the vendored binary writer is accepted by Blender as well as Three.js. FBX texture loading now waits on the loader-owned resource manager before attaching the scene and removes unavailable maps before render.
- Updated the local Codex skill pack, pitfall ledger, current-state docs, history, and context routing to remove stale paths and repeated progress prose.

### Verification

- `pwsh -NoProfile -File .\run.ps1 -Task verify`: passed after the final changes.
- `npm.cmd run test:e2e -- --reporter=line` with the process-local `RUSTSMF_PLAYWRIGHT_EXECUTABLE` override: 55/55 passed.
- `npm.cmd run test:visual-strict -- --reporter=line` with the same browser override: 2/2 passed.
- `npm.cmd run tauri:build:smoke`: optimized no-bundle Tauri release executable built successfully.
- Canonical `desktop-smoke`: release build, Rust tests, and native IPC browser coverage passed.
- Blender 5.0.0 validated both the committed independent fixture and the app-exported roundtrip: one mesh, two bones, weighted groups, animation curves, embedded material texture.
- `git diff --check`: passed.

## 2026-09-13 — fitted-rig utility closeout

Added explicit-map bind fitting, influence remapping, bounded world-motion baking
with pose restoration, and source-stream-preserving GLB export utilities. Five
focused tests cover mapped frame equivalence, restoration, source byte retention,
influence remapping and invalid maps. The complete private-model comparison and
public saved-job path remain active in TODO.md.

From source/frontend, all commands exited 0: `node --import tsx --test
src/utils/fittedRig.test.ts` (5 tests), `npm run typecheck`, `npm run
typecheck:test`, `npm run lint`, `npm run test:unit` (390 tests), and `npm run
build`. No frontend behavior changed, so this closeout did not repeat the
previously recorded browser/visual matrices.
`pwsh -NoProfile -File run.ps1 -Task context` also passed the repository
integrity and context contracts, including its nine regression tests.
The complete `pwsh -NoProfile -File run.ps1 -Task verify` gate then passed,
including Git/process safety checks, frontend boundaries, Rust formatting,
Clippy, all ten Rust tests and cargo check. All commands exited 0.

## 2026-09-13 — actual fitted export receiving

The first actual-model export exposed a shared-inverse-bind bug: Mario uses
distinct per-mesh skin bindings. Replacing those with one fitted inverse set
introduced up to 408.45 world units of vertex error despite matching bone
frames. Export now preserves each source skin's mapped inverse matrices;
the regression includes two skins sharing joints with different inverse binds.
Leaf nodes also omit empty children arrays and joint buffer views declare their
vertex-buffer target, satisfying GLB validation.

Re-imported original/fitted Mario comparison covers 960 vertices, 18 meshes and
all 37 clips at integer 60 Hz frames; maximum world-space vertex error is
6.091180994014376e-7. The separate private artifact and report are retained in
the receiving game's ignored authoring output, `fitted-motion-vmbV2y` under
`absolute-rig-25e2c5df-132f-4cd4-8b7c-67a0ef4aac5b`. GLB validator reports zero
errors, warnings and hints; unused preserved source accessors remain informational.
This proves sampled export equivalence, not wolf visual acceptance or a public
saved-job workflow. No input model was overwritten.

## 2026-09-13 — repeatable fitted-rig CLI

`npm.cmd run fit-rig -- --job <absolute job.json>` from source now owns the
repeatable fit/bake/export/re-import/vertex-comparison path. It uses bounded
embedded inputs, explicit clip and bone selection, fresh-only output, and writes
a hash-bound report after comparison succeeds. The existing game-ready command
shares its extracted Node Three.js runtime setup with this command.

Actual private receiving produced output SHA-256
`ca38ab66cbecce5f1fceab705b32120a1d335db53ec4d697244ecbf06082503f`:
28 bones, 18 mapped frames, 960 vertices and 37 clips, maximum sampled vertex
error 6.091180994014376e-7. The receiving game's diagnostic folder contains
`fit-rig-job.json`, `fit-rig-cli.log` and `cli-fitted-20260913/report.json`.
Repeating the exact command exits 1 with EEXIST and leaves the model hash unchanged.
Seven focused tests and all 392 unit tests pass; the comparison regression also
proves that a deliberate half-unit vertex displacement is detected and input
poses are restored. This closes command reproducibility, not visual acceptance.
The full local `pwsh -NoProfile -File run.ps1 -Task verify` gate passed, exit 0,
including 392 frontend tests, ten Rust tests, build, lint, typechecks, context,
Git/process safety, Clippy and formatting. The receiving game retains the log
as `.artifacts/fighter-authoring/fit-rig-cli-verify.txt`.

## 2026-09-13 — three-state comparison viewer

Implemented `fit-rig-preview`, a fixed-resource, hash-checked loopback viewer of
source, fitted source and template/target. It shares clip/frame, camera and bones
controls and half-speed playback. Route tests verify executable module MIME,
unknown-route/method rejection and stale-source refusal. Browser receiving in
Chrome covered all 37 available clips in the selector, explicit idle/jab/walk/
special/jump/damage frames from front/side views, frame 18 recovery, bones,
play/pause and 600-pixel narrow layout with no horizontal overflow or app error.
The first review fixed clipped models and float-rounded terminal-frame omission.

Captures under `D:/GaimEngine-build/wolf-visual-receiving-20260913/compare-*`
show identical original/fitted Mario poses. Wolf retains its longer limbs and
narrow hands, so silhouette differs despite transferred direction. The operator
was asked to accept that silhouette or request further stylization. No art
approval or final gameplay acceptance is inferred from the diagnostic view.

The full local verification run passed 393 frontend tests, ten Rust tests,
lint, both typechecks, build and code boundaries; its only failure was context
budget growth. Moving command detail into FITTED_RIG.md and separating the
workflow__fitted_rig route restored the existing orientation/retarget budgets.
The focused `run.ps1 -Task context` rerun passed. Chrome reported zero errors
and warnings. The owned browser and preview process were stopped after capture.
