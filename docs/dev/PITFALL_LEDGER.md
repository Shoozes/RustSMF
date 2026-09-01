# Pitfall Ledger

Last reviewed: 2026-09-01 (added GenEye argv-manifest ownership and Modern shell overflow prevention alongside explicit failure-value handling, scale-independent framing, loader, worker, conversion, timing, and process-lifecycle lessons).

### Q: What pitfall are we preventing?

**What:** A shell can pass document-level overflow checks while a toolbar or overlay silently clips controls, and shared legacy media rules can make a new Modern overlay expand or collide at narrow widths.

**Why it happened:** The original layout intentionally used horizontally scrollable shelves and a full-width wrapped toolbar below 800 px. Reusing the same class names for Modern preserved behavior but also inherited `width: 100%`, wrapping, and cross-axis alignment that were wrong for an absolute viewport overlay and full-width command bar.

**Where:** `source/frontend/src/index.css`, `components/Toolbar.tsx`, `components/ViewportControls.tsx`, `tests/modern-shell.spec.ts`, and `tests/visual.spec.ts`.

**How to catch it:** Assert `scrollWidth <= clientWidth` for the document, toolbar, app bar, workspace switcher, and main area at every declared width. Visually inspect the narrow loaded state for status/drawer/control collisions, and keep Original and Modern selectors scoped by `data-shell-variant`.

**Current solution:** Modern overrides inherited width, wrapping, overflow, and alignment at its shell boundary; compact drawers start closed; status reserves both drawer triggers; six responsive lanes plus focus, target-size, and DPI checks own the regression. Effectiveness: `97/100`, durable.

### Q: What pitfall are we preventing?

**What:** A helper that returns `FailureCode | null` can be treated like a success boolean and invert a user interaction while remaining type-correct.

**Context and constraints:** Show Vertices maps a raycast point index and overlay stride back to one skinned source vertex. A valid hit must drive exact world-space painting; missing attributes, stale indexes, or invalid bone data must fail closed without mutating weights.

**Why it happened:** `getSkinnedVertexWorldPosition` returns `null` on success and a string on failure. The first precision-target integration used the call directly as an `if` condition, so successful work returned early while failure continued with the vector's initial `(0, 0, 0)` value. TypeScript accepted both branches because the union is intentionally nullable.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/skinnedVertexPosition.ts`, `source/frontend/src/utils/skinPointOverlay.ts`, and `source/frontend/src/utils/skinPointOverlay.test.ts`.

**Evidence:** The repository gate passed 352 units, lint, and both typechecks before review found the inverted conditional. The new focused test proves a valid point resolves to the same world position as Three.js, while out-of-range and malformed-skin inputs return `null`; the 74-case browser suite and recorded Skin/animation journey pass with the corrected wiring.

**Developer story:** Static inspection compared the caller at `ThreeViewport.tsx` with the helper's declared return contract and exposed that success was the falsy case. A one-line conditional reversal would restore behavior but leave the unusual contract easy to misuse again. Moving index/stride/geometry/failure handling into `resolveSkinPointSourceVertex` made the call site consume a positive target-or-null contract, and the focused test plus recorded journey separated local math correctness from real pointer-path integration.

**How to catch it:** Name nullable error results `failure`, test both success and failure branches, and expose positive `Result | null` adapters at interaction boundaries instead of passing `Failure | null` through UI conditionals. For precision Skin changes, run the focused overlay unit and the recorded journey.

**Solutions tried:**

1. `35/100` Rely on typecheck and existing overlay tests, result: the inverted conditional compiled and all 352 units passed.
2. `72/100` Reverse the component conditional only, result: it would restore the immediate path but leave duplicated validation and the failure-valued contract exposed to the next caller.
3. `97/100` Centralize point/stride/source validation in a positive target resolver and cover valid plus invalid inputs, result: the component is smaller and both focused and end-to-end proof pass.

**Current solution:** `resolveSkinPointSourceVertex` returns the exact `{ vertexIndex, worldPosition }` only after bounds and skin validation succeed. `ThreeViewport` consumes that positive result and ignores invalid targets before brush collection.

**Decision rationale:** The small resolver reuses the existing skinned-position authority, removes repeated checks, and makes the safe branch obvious without changing the lower-level error codes used by brush diagnostics.

**Effectiveness:** `97/100`, durable. The solution has direct failing-path coverage, real browser/journey proof, no new dependency, and a narrow reusable boundary.

**Relevance check:** Current. Any future overlay, diagnostic, or precision-picking integration can repeat the same nullable-failure inversion.

**Next prevention step:** Keep new `Failure | null` calls assigned to an explicitly named variable and require a success-plus-failure regression whenever they enter UI control flow.

### Q: What pitfall are we preventing?

**What:** Fixed world-unit camera padding can make tiny assets disappear and huge assets clip, while a correct auto-fit can expose hidden render-overdraw and test-coordinate assumptions.

**Why it happened:** Perspective distance used `maxDim * 0.85 + 2`, orthographic extent used a one-unit floor, wheel zoom used a fixed world-unit delta, and near/far/orbit ranges were unrelated to the loaded model. The 300,000-vertex worker fixture also stacked 100,000 triangles in the same pixels; once a tiny model was correctly framed, that unrelated codec test saturated rendering. TransformControls and journey helpers encoded screen paths learned from the old composition.

**Where:** `source/frontend/src/utils/viewportLayout.ts`, `SimpleOrbit.ts`, `components/ThreeViewport.tsx`, `tests/shell-model.spec.ts`, `tests/helpers/smf-stress-fixture.ts`, `tests/helpers/viewport-interactions.ts`, and `tests/journeys/hand-wave.journey.spec.ts`.

**How to catch it:** Load equivalent generated roots at extreme scales and compare authored root scale, perspective/orthographic pixel coverage, camera distance, clip planes, and orbit limits as ratios of model bounds. Keep a large worker fixture in the full parallel suite, but distribute geometry so it measures codec responsiveness rather than fragment overdraw. Derive interactive test axes from the actual hovered handle, and allow occluded precision targets to be reached through deterministic camera movement.

**Current solution:** Camera fit, clipping, orbit limits, reset, and zoom are model-relative and never normalize the root. Skinned bounds are exact through 100,000 vertices and switch to a conservative bone-transform bound above that threshold. The worker fixture retains 300,000 vertices on a compact non-overlapping grid, the TransformControls helper accepts the visible hovered axis, and the journey uses single-view quarter-turn fallbacks after its quad checkpoint.

**Decision rationale:** Mutating model scale would break authored transforms and skin binds; fixed minimum distances merely move the failure between unit systems. Exact bounds preserve ordinary visual composition, while the threshold keeps worst-case load work bounded. Test fixtures must isolate the subsystem they claim to exercise.

**Effectiveness:** `98/100`, durable. Focused units cover proportional math and the large-skinned fallback, the browser suite proves `1e-5`/`1e5` composition plus the 300,000-vertex worker path, and the journey/strict snapshots provide temporal and visual evidence.

**Next prevention step:** Treat camera, model-scale, renderer-density, and screen-coordinate changes as one visual-integration surface; run the tiny/huge browser case, worker case, journey, and strict snapshots together.

### Q: What pitfall are we preventing?

**What:** Valid animation keys and plausible joint motion can still produce a visibly broken emote when nearby mesh vertices are weighted to the wrong downstream bone.

**Context and constraints:** The opt-in 1440x900, 125%-DPI journey uses `source/frontend/tests/mixamo_smf_baldguy.smf` to author a two-second hand wave. Source bone IDs and SMF export identity must remain unchanged; the workflow must use the same viewport, animation controls, Skin diagnostics, and paint path available to a user.

**Why it happened:** Several `Mesh_4` torso-seam vertices carried about 51–61% `SMF_Node_13` (`LeftForeArm`) influence, while outer upper-sleeve vertices followed `LeftForeArm`/`LeftHand` instead of the upper arm. Elbow and hand rotation therefore pulled the shirt into a long triangle and left a rigid torso-to-arm bridge even after the gesture envelope was safe.

**Where:** `source/frontend/tests/journeys/hand-wave.journey.spec.ts`, `source/frontend/src/loaders/handWaveWeightRepair.test.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/components/SkinPanel.tsx`, `source/frontend/src/utils/skinPointOverlay.ts`, `source/frontend/src/utils/skinWeights.ts`, and ignored evidence under `output/playwright/hand-wave-journey/`.

**Evidence:** The recorded frames first exposed head clipping, whole-arm sweeping, torso stretching, and a cyan torso-to-arm wing that key-count assertions did not. A real-fixture unit probe measured a worst posed/rest triangle-edge ratio of 2.775 and identified both bad influence groups. The tested repair removes forearm influence from the four duplicated torso-seam clusters while preserving the existing torso/upper-arm blend, assigns the three outer sleeve-edge clusters to `LeftArm`, and reduces the same ratio to 1.190. The browser journey reaches those vertices through actual pointer interaction, verifies exact source-vertex telemetry and raw semantic diagnostics, and records the corrected playback.

**Developer story:** The initial wrist-only wave was widened, which made the gesture more readable but introduced head clipping and a tube-man sweep. Holding the shoulder and matching posed loop endpoints fixed the motion envelope, while the torso spike persisted. A first broad reassignment could reduce one spike yet leave a rigid wing because triangle-soup duplicates and the sleeve edge did not share one correct owner. The journey then made the old-editor-style vertex nodes first-class Skin controls, targeted every visible/depth-separated duplicate, subtracted only the bad forearm component from the seam, and bound the outer sleeve edge to the upper arm. The correction stays inside the same user workflow instead of mutating the fixture at runtime or shrinking the animation until the defect is hidden.

**How to catch it:** For a representative authored pose, record both static checkpoints and a temporal sequence. If geometry stretches, inspect the visible vertex's four raw influence slots before changing curves. Do not infer the painted source vertex from only the nearest diagnostic: depth filtering and triangle-soup duplicates can make that a false positive. Require exact mesh/vertex paint telemetry, both seam faces, the adjoining sleeve edge, dirty skin state, semantic source/alias names, corrected playback, and no critical browser errors.

**Solutions tried:**

1. `32/100` Rotate only the wrist, result: technically valid keys but an unreadable twitch.
2. `48/100` Increase whole-chain travel, result: a more obvious gesture that clipped the head, swept from T-pose endpoints, and amplified bad shoulder weights.
3. `64/100` Set or Spine-paint only the nearest torso point, result: the large spike shrinks but an unpainted duplicate or forearm/hand-driven sleeve edge still forms a rigid wing.
4. `98/100` Hold the shoulder, key matched loop endpoints, bound motion to elbow/hand, use exact posed mini-node targets to subtract forearm influence from both seam faces, and assign the outer sleeve edge to `LeftArm`, result: readable motion plus deterministic numerical and visual regression evidence.

**Current solution:** The journey authors five held poses, selects the hips before playback to keep the hand unobstructed, detects the fixture's bad seam/sleeve influences, and exposes Mixamo-minimal aliases in Skin diagnostics. Show Vertices renders depth-tested selected-weight mini nodes that follow the pose and act as precision paint targets with a forgiving invisible hit area. Frozen Current Subtract removes `LeftForeArm` from both seam faces while preserving the torso/upper-arm blend; Frozen Current Set assigns the outer sleeve edge to `LeftArm` before final playback.

**Decision rationale:** The combined animation-and-skin workflow fixes the actual owners of the symptoms. Reducing the motion would conceal bad weights, broad Auto Skin chose the forearm segment for the tested seam, replacing every seam influence with `LeftArm` would discard a useful torso blend, and runtime fixture mutation would bypass the user workflow the journey is intended to validate. Exact mini-node targeting is a small reusable interaction seam: it improves precision while preserving the existing broad surface brush.

**Effectiveness:** `98/100`, durable. The guard uses the real fixture and UI path, pins the deformation ratio numerically, and records semantic and visual evidence. Its remaining limitation is that the recorded journey is opt-in rather than part of the default 74-case browser gate.

**Relevance check:** Current. Any change to pose controls, animation key scope, skin diagnostics, brush sampling, weight preview, or the known humanoid fixture can regress this show-ready path.

**Next prevention step:** Keep `pwsh -NoProfile -File .\run.ps1 -Task test:journey` as the visual certification lane and inspect its final WebM whenever animation or skinning behavior changes.

### Q: What pitfall are we preventing?

**What:** A convenience Git sync command can silently discard, overwrite, or choose between local and remote work while claiming to keep `main` aligned.

**Why it happened:** The prior local push/pull controls could initialize or repoint a remote, remove ignored/tracked files, reset/clean/stash a worktree, fall back to `ours`/`theirs` conflict selection, and force-push after a failed rebase. Those actions make a review decision outside the workspace and can erase work that has not been inspected.

**Where:** `.tools/git-main-common.ps1`, `.tools/gitpush.ps1`, `.tools/gitpull.ps1`, `.tools/project.json`, and `scripts/git-main-safety.test.mjs`.

**How to catch it:** Parse both PowerShell entry points and run the main-safety test, including its current-worktree preflight before credential access. Before a real sync, require the configured `origin` URL, current `main`, no active Git operation or conflict, an ignored untracked token file, and a clean pull worktree. After a push, fetch and compare `HEAD` with `origin/main`.

**Current solution:** Shared main-only guards refuse remote mismatch, unsafe token state, active operations, and conflicts. Pull only fast-forwards a clean worktree; push uses an ordinary push, aborts only the rebase it starts if it conflicts, and never force-pushes, resets/cleans/stashes, creates/repoints remotes, or auto-resolves files.

**Relevance check:** Current. Any future GUI or automation wrapper around Git must reuse this contract rather than adding convenience fallback paths.

**Next prevention step:** Keep `scripts/git-main-safety.test.mjs` in `run.ps1 -Task verify` and manually review any proposed relaxation of the main-only or conflict-stop policy.

### Q: What pitfall are we preventing?

**What:** Re-importing exported triangle-soup geometry can emit a Three.js tangent error even though the original source loaded cleanly.

**Why it happened:** The GLB loader called `computeTangents()` before checking for compatible UV/normal attributes and a valid indexed triangle layout. Static preparation followed by GLB export can legitimately produce non-indexed skinned geometry, so the error surfaced only on the exported-file validation path.

**Where:** `source/frontend/src/loaders/geometryAttributes.ts`, `glb.ts`, `fbx.ts`, `obj.ts`, and the static-root flow in `source/frontend/tests/rig.spec.ts`.

**How to catch it:** Exercise source load, preparation, export, validation re-import, and browser error capture as one flow. Unit cases must cover indexed geometry, non-indexed triangle soup, synthesized UVs, and malformed indexes.

**Current solution:** One shared loader helper fills preview-safe UV/normal defaults and computes tangents only when source UVs, normals, and indexes satisfy Three.js requirements. GLB, FBX, and OBJ no longer carry divergent copies of this policy.

**Relevance check:** Current. Any loader or export validator that prepares runtime geometry should reuse this contract instead of calling `computeTangents()` directly.

**Next prevention step:** Keep the focused geometry units and the static OBJ prepare/export browser case together when changing loader attribute preparation or export topology.

### Q: What pitfall are we preventing?

**What:** A focused unit command can appear filtered while silently running every case if the discovery wrapper drops forwarded Node test flags.

**Context and constraints:** RustSMF owns deterministic `src/**/*.test.ts` discovery and supports `npm.cmd run test:unit -- ...` filters for fast local feedback; all discovered files must still load for registration and type-boundary coverage.

**Why it happened:** `run-unit-tests.mjs` built its `tsx` argv only from discovered files and ignored `process.argv.slice(2)`.

**Where:** `source/frontend/scripts/run-unit-tests.mjs`, `docs/dev/APP_STATE.md`, and `source/frontend/tests/README.md`.

**Evidence:** Before repair, a named `npm.cmd run test:unit` command reported the full 307-test inventory; after forwarding, the duration-formatting command reached the matching case while retaining the 50-file discovery/load boundary.

**How to catch it:** Run a named pattern through the npm script and require output for the named case without unrelated inner-case execution, then run the full `test:unit` suite.

**Current solution:** The wrapper preserves deterministic discovery and inserts `process.argv.slice(2)` before the discovered test files.

**Relevance check:** Current.

**Next prevention step:** Keep the forwarding contract in the app-state and test-runner docs and rerun both focused and full unit commands after runner or package-script changes.

### Q: What pitfall are we preventing?

**What:** A replacement, native file operation, or long editing session can discard user work, read an unowned recovery path, overlap writes to one destination, grow history without a memory contract, or publish timeline state on every render frame.

**Context and constraints:** Model loading is latest-intent owned and may begin from browser input, drag/drop, or a native dialog. Tauri reads must remain dialog-authorized, returned IPC values are untrusted until validated, Rust owns dialog invocation, project recovery may expose only app-owned generations, foreground saves and autosaves must not race, authoring history must be bounded, and the viewport mixer must stay responsive while the timeline remains visibly current.

**Why it happened:** The load path started reading before it knew whether authoring state was dirty, the frontend supplied native paths to the bridge, project save/autosave tasks could enter independent blocking writes, recovery reads trusted a frontend-provided file name, histories used count-only retention, and the parent timeline subscribed directly to the viewport's requestAnimationFrame cadence.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/App.tsx`, `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/backend-client/binaryPayload.ts`, `source/frontend/package.json`, `source/package-lock.json`, `source/src-tauri/src/main.rs`, `source/src-tauri/Cargo.toml`, `source/frontend/src/utils/editorHistory.ts`, `source/frontend/src/utils/skinWeights.ts`, and `source/frontend/src/store/index.ts`.

**Evidence:** The current flow queues dirty replacements before reading bytes and preserves the mounted root on Cancel or parse failure; static-root preparation preflights every mesh before mutation and records one reversible rig-history entry; Rust rejects unselected or non-regular paths and detects stream growth beyond the 256 MiB limit; native writes share one async mutex, use unique staged files, sync before replacement, and restore the prior destination on install failure; recovery discovery/read accepts only the exact autosave target plus `.bak1` and `.bak2` regular files; frontend autosave coalesces to the newest trailing request, and successful replacement waits for issued recovery I/O before swapping roots without canceling recovery on picker failure; malformed native byte arrays fail before parsing; editor and skin histories have count and byte limits; and parent playback publication is capped at a 50 ms display cadence. Rust, unit, and browser mock coverage exercise these boundaries.

**Developer story:** These were separate-looking reliability issues with the same root cause: integration code had no explicit ownership contract for destructive state, privileged destinations, retained snapshots, or high-frequency display updates. Shared guards and narrow owners make each boundary observable without hiding a real failure behind a fallback.

**How to catch it:** Test Cancel before byte materialization, Discard after dirty authoring, stale load/export completion, unselected native reads, exact-limit and growth-over-limit reads, non-regular paths, arbitrary recovery names, concurrent project rotations, complete staged replacement, trailing autosave coalescing, save cancellation, exact history budget eviction, oversized current edits, and throttled versus immediate playback updates. Run focused Rust/browser slices plus the full verification gate.

**Solutions tried:**
1. `34/100` Rely on a downstream parse guard and frontend-provided native destination, result: destructive replacement, arbitrary path reads, and excess retained memory remained possible.
2. `95/100` Centralize replacement decisions, keep native path/destination authority in Rust, bound retained snapshots by count and bytes, and throttle only parent display publication, result: user state and privileged I/O fail closed while imperative rendering remains responsive.
3. `98/100` Serialize all native writes, stage unique synchronized payloads, exact-match recovery generations, coalesce autosave at the integration owner, and remove duplicate unused native SMF parser surfaces, result: write timing and parser ownership are explicit without redundant bridge contracts.

**Current solution:** `replacementGuard.ts`, `assertModelInputSize`, `normalizeBinaryPayload`, `staticMeshSkinPrep.ts`, `smfBinary.ts` decoded reservations, Rust `NativeFileAuthority`, same-handle bounded reads, `run_native_write`, `TemporaryFile`, exact recovery-name guards, bounded history helpers, and `playbackDisplayThrottle.ts` each own one narrow invariant; `useLoadModel` owns foreground-save exclusion and latest-trailing autosave coalescing, while the TypeScript worker remains the sole structural SMF authority.

**Decision rationale:** A single broad integration fallback would obscure which state was protected. Explicit guards preserve the current model on failure, keep OS dialogs authoritative, retain useful recent history, and reduce React work without altering mixer timing.

**Effectiveness:** `98/100`, durable. Focused tests cover the current failure modes; future changes must preserve both the safety boundary and the user-visible status explanation.

**Relevance check:** Current. Revisit this entry when load sources, native commands, history shapes, or timeline rendering cadence change.

**Next prevention step:** Keep completion evidence in `review.md` current and require any new asynchronous, write-owning, or memory-retaining integration surface to declare its owner, serialization/cancellation behavior, limit, and user-facing failure state.

### Q: What pitfall are we preventing?

**What:** A plausible-looking GLB/FBX-to-SMF conversion can apply coordinate ownership twice and serialize bone/animation data in a different space than the SMF importer consumes.

**Context and constraints:** The review covered `main` at `e77d6bc4da703e64ba389d879a44235dde3a3717`. Non-SMF conversion is supported only for compatible single-root skinned sources whose mesh, nested-rig, and animation boundaries are covered by numeric checks; static FBX/OBJ roots must first pass the reversible root-skeleton preparation, and unsupported channels remain blocked.

**Why it happened:** The isolated builder converted mesh vectors before the serializer converted them again, captured local bone matrices while the runtime scene derives locals from world DQs, and interpolated quaternion components directly. Existing tests asserted counts and reimportability but not spatial parity.

**Where:** `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/hooks/smfExportCandidate.ts`, and `source/frontend/tests/export-formats.spec.ts`.

**Evidence:** Source tracing confirmed the two vector swizzles and local/world mismatch. The builder now leaves mesh arrays in model-root Three space, captures root-relative world DQs, and samples clips through a cloned Three mixer. Focused tests cover translated/rotated mesh and nested parent/child matrix parity plus quaternion interpolation; constructed rig node resolution also has a child-before-parent regression test.

**Developer story:** The review's count-only roundtrip claim was tested against the current conversion graph rather than accepted as proof. The conversion defect was observable in code before a browser save could hide it behind a plausible render. The repair kept one coordinate owner at the serializer, made rig poses root-relative/world-based, and used runtime mixer sampling; browser diagnostics now enable the action only when the shared preflight remains clear.

**How to catch it:** Require a non-identity translated/rotated mesh, nested parent/child rig, and multi-frame animation fixture. Compare mesh positions/normals, bind/world bone poses, and animation sample poses numerically after export/reimport; assert the browser action is disabled whenever preflight reports a real error.

**Solutions tried:**
1. `22/100` Trust structural reimport counts, result: false confidence because counts can pass while spatial data drifts.
2. `58/100` Keep the converter enabled behind diagnostic warnings, result: unsafe because a save could still publish a corrupted asset.
3. `97/100` Keep a stable preflight, repair the conversion ownership, and require numeric parity coverage before enabling the action, result: compatible conversion is available while unsupported inputs remain fail-closed.

**Current solution:** `buildSmfExportCandidate` passes compatible non-SMF sources through the repaired converter. The candidate and serializer still reject real mesh, skeleton, scale-track, semantic, size, and finite-value errors; GLB/FBX output remains available for richer or unsupported source features.

**Decision rationale:** Structural counts are not spatial proof. The conversion was re-enabled only after centralizing coordinate ownership and adding numeric parity tests for the concrete risks identified by the review.

**Effectiveness:** `97/100`, good. The previously identified corruption path now has a single space contract and focused regression coverage; browser teardown remains an environment-only evidence limit.

**Relevance check:** Current. Keep this entry as a regression story for future converter changes and do not weaken the numeric parity assertions.

**Next prevention step:** Do not alter mesh/vector, bone/world, or mixer sampling ownership without updating the numeric parity fixture and the full verification lane.

### Q: What pitfall are we preventing?

**What:** Calling `File.arrayBuffer()` before checking `File.size` can materialize an oversized browser model and bypass the native/SMF allocation boundary.

**Context and constraints:** Browser picker, persistent file input, and drag/drop all feed the same latest-intent load path. The current native and SMF binary limits are 256 MiB and must remain consistent without misleading the user or replacing the mounted model.

**Why it happened:** The browser fallback read the selected file immediately, while the load hook only had a decoded-byte check downstream and the native path relied on a separate Rust limit.

**Where:** `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/utils/modelFormat.ts`, and `source/frontend/src/utils/modelFormat.test.ts`.

**Evidence:** The browser picker previously awaited `file.arrayBuffer()` before any size guard. The shared guard now rejects metadata over `MAX_MODEL_INPUT_BYTES` before that await, repeats the byte-length check after native/test-injected reads, and the model-format unit slice proves exact-limit acceptance, over-limit rejection, and invalid-size failure.

**Developer story:** The review identified the allocation order as a boundary issue rather than a loader-specific bug. A shared model-format helper was chosen so picker, drop, native, and SMF binary limits cannot drift silently. Oversized picker selections return an actionable open error; direct input/drop paths leave the current model untouched.

**How to catch it:** Keep an exact-limit and `limit + 1` unit test, inspect the browser fallback ordering, and require all load entry points to call the shared helper before reading bytes. Run the focused model-format tests and the full `verify` gate.

**Solutions tried:**
1. `35/100` Check only inside `loadModel`, result: too late for browser memory because `File.arrayBuffer()` had already allocated.
2. `91/100` Share the 256 MiB constant and check File metadata before reads, then repeat for native/test bytes, result: early and defense-in-depth coverage with one source of truth.

**Current solution:** `assertModelFileSize` and `assertModelInputSize` own the shared browser/native boundary; `smfBinary.ts` reuses the same limit for encoded input/output.

**Decision rationale:** The helper is pure, cheap, and usable at every boundary. A browser-only check was rejected because desktop and worker fallback paths still need the same invariant.

**Effectiveness:** `96/100`, durable. The ordering and unit contract are clear, and decoded expansion now has a checked 512 MiB reservation budget before allocation.

**Relevance check:** Current. Any new model ingestion surface must use the shared helper before materializing bytes.

**Next prevention step:** Keep decoded estimates aligned with parser allocation sites and update focused limits tests before raising either the encoded input or decoded-memory budgets.

### Q: What pitfall are we preventing?

**What:** A command intended only to inventory Playwright cases can accidentally execute the full suite, and historical environment caveats can distract from real current assertion failures.

**Context and constraints:** RustSMF's browser suite owns one production Vite preview server. Product assertions, browser launch, and teardown are separate evidence phases; every command must exit honestly and leave ports 5173 and 1420 clear.

**Why it happened:** `npm.cmd exec playwright test --list` did not put npm's argument separator before the Playwright flag, so npm could consume `--list` and start the default test command. The resulting unexpected run was initially easy to read through the lens of an older managed-Windows `spawn EPERM` teardown problem even though four current product assertions had actually failed.

**Where:** `source/frontend/package.json`, `source/package.json`, `source/frontend/tests/README.md`, `source/frontend/playwright.config.ts`, `run.ps1`, and the affected animation, lifecycle, skin, and native browser suites.

**Evidence:** The unintended 59-case run produced four assertion failures: two animation-history wording mismatches, a missing Auto Skin mode label on an equivalent stroke, and unstable final skin-hover telemetry. After repairing those paths and adding browser/native read-boundary coverage, `npm.cmd run test:e2e:list` discovered 61 cases without executing them and `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye` passed 61/61 with both ports clear.

**Developer story:** The failed run was treated as evidence rather than discarded because it was launched accidentally. Classifying each failure by phase exposed real app/test drift that an old teardown narrative could have hidden. A named inventory script now makes intent explicit, while the full launcher-owned run remains the certification command.

**How to catch it:** Use `npm.cmd run test:e2e:list` for inventory and require output beginning with `Listing tests`. For execution, inspect assertion, launch, and teardown failures separately, preserve the nonzero exit, and check ports 5173/1420 after any interrupted run.

**Solutions tried:**
1. `25/100` Use npm exec without an argument separator, result: a read-only inventory request can become a stateful full test run.
2. `55/100` Assume a familiar managed teardown failure explains the run, result: current product assertions can be overlooked.
3. `97/100` Add a dedicated inventory script, classify failures by phase, repair every current assertion, and certify with the launcher-owned full suite, result: command intent and product evidence are both explicit.

**Current solution:** `test:e2e:list` owns case discovery; `run.ps1 -Task test:e2e -NoGenEye` owns browser certification; `review.md` records only the latest result; and process/port cleanup remains mandatory after interrupted or teardown-blocked runs.

**Decision rationale:** A named package script removes shell/npm flag ambiguity. Phase-specific classification preserves truthful environment reporting without allowing old harness behavior to excuse a current product regression.

**Effectiveness:** `97/100`, good. The safe inventory path and complete 61/61 rerun directly cover the observed failure mode.

**Relevance check:** Current. Revisit whenever npm/Playwright invocation, server ownership, browser selection, or result reporting changes.

**Next prevention step:** Keep test-count docs tied to `test:e2e:list`, and do not update authoritative browser evidence without a complete run whose assertions and teardown both pass.

### Q: What pitfall are we preventing?

**What:** A cancellation signal can arrive while a worker adapter is being initialized and be missed if the listener is registered only after handler setup, allowing stale work to reach `postMessage` or wait for the timeout.

**Context and constraints:** SMF import/export is latest-intent owned and must terminate stale worker tasks without falling back or publishing progress after a newer load/export. Worker creation and message-handler installation are adapter boundaries that may be synchronous in tests or alternate runtimes.

**Why it happened:** The client checked `AbortSignal` before creating the worker, then installed worker handlers and only afterward registered the abort listener. A signal that became aborted during that setup window was already aborted when the listener was added, so no event was delivered before the request was posted. Cleanup also assumed a timer had already been assigned.

**Where:** `source/frontend/src/workers/smfCodecClient.ts` and `source/frontend/src/workers/smfCodecClient.test.ts`; the ownership contract is documented in `docs/dev/APP_STATE.md` and `summary_bank.json`.

**Evidence:** A controlled worker adapter aborts from `setMessageHandler`, before the client registers the signal listener. The regression now rejects with `SmfCodecCancelledError`, records zero `postMessage` calls, terminates the worker, clears the handler, and passes as part of the focused 10-test SMF codec suite.

**Developer story:** The worker client already guarded cancellation before worker creation and during normal execution, but setup ordering left a narrow stale-work window. Modeling the adapter boundary as synchronous separated that race from normal worker runtime behavior. Rechecking `signal.aborted` immediately after listener registration and before posting closes the window; timer cleanup was made conditional for the same early-settlement path.

**How to catch it:** Run `npm.cmd exec -- tsx --test src/workers/smfCodecClient.test.ts` from `source/frontend`; require the setup-abort case to reject with `SmfCodecCancelledError`, keep `postCount` at zero, and prove worker termination and handler cleanup.

**Solutions tried:**
1. `58/100` Check only before worker creation, result: normal pre-abort behavior worked but setup-time abort could still post stale work.
2. `96/100` Register the listener, recheck `signal.aborted` before starting the timer/post, and make timer cleanup conditional, result: setup cancellation is fail-closed with no stale request and no cleanup exception.

**Current solution:** `runSmfCodecInvocation` registers cancellation before posting, explicitly handles an already-aborted signal after handler setup, and clears the timeout only after it has been assigned. Runtime worker errors remain errors; only startup/post failures use the documented synchronous fallback.

**Decision rationale:** The guard preserves the typed worker contract and latest-intent ownership without adding a second worker or retry path. Delaying all worker setup until after an arbitrary timer or relying on an adapter-specific cancellation event would leave the same ordering risk.

**Effectiveness:** `96/100`, durable. The fix is small, has focused regression coverage, avoids stale work, and keeps the existing timeout/fallback policy intact.

**Relevance check:** Current. Any worker, sidecar, or async adapter that registers cancellation after synchronous setup should use the same post-registration abort check.

**Next prevention step:** Keep setup-time cancellation cases in async-worker client tests whenever handler registration, task ownership, or timeout ordering changes.

### Q: What pitfall are we preventing?

**What:** Viewport-only material and weight-preview state can leak into GLB/FBX exports when the exporter consumes the same live Three.js root mounted by the renderer.

**Context and constraints:** RustSMF intentionally shares one root across preview, authoring, diagnostics, and export so skeleton and animation references stay coherent. Tex-off, Mesh fade, Legacy lighting, repeat/filter overrides, and selected-bone weight colors must remain display-only without cloning or rebinding the skinned model.

**Why it happened:** The viewport backed up maps and opacity but applied the preview directly to source materials, and Legacy mode replaced `mesh.material`. GLB/FBX exporters read that live assignment asynchronously. The weight preview also added a geometry color attribute and enabled vertex colors. Restoring only when a toggle was disabled or a root was unloaded left export timing unprotected.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/materialPreview.ts`, `source/frontend/src/utils/weightPreview.ts`, `source/frontend/src/loaders/glb.ts`, `source/frontend/src/loaders/fbx.ts`, `source/frontend/src/utils/materialPreview.test.ts`, and `source/frontend/tests/export-formats.spec.ts`.

**Evidence:** Source inspection showed `applyTextureEnabled(false)` assigning `material.map = null`, opacity changing the source material, and Legacy assigning a clone directly to each mesh before `GLTFExporter.parseAsync(root)`. The focused material and weight-preview tests now prove source assignment/map/opacity/geometry-color/material-vertex-color/wrap/filter state during an awaited operation and preview restoration afterward. The generated textured-GLB browser test activates all preview modes together and confirms the downloaded GLB still has one image and one texture.

**Developer story:** The old shelf mapping began as a UI-policy task. Tracing each control through the current exporter showed the Tex button was not merely ambiguous copy: it could change saved output. Centralizing source snapshots solved map/opacity/sampler restoration, but the same review exposed Legacy material assignment and Skin weight colors as equivalent leaks. The boundary was widened to the complete exporter-visible material/color state and held for the full asynchronous call. A root-identity check prevents a stale exporter completion from reapplying preview state after unload.

**How to catch it:** Run `npx tsx --test src/utils/materialPreview.test.ts src/utils/weightPreview.test.ts src/utils/materialPolicy.test.ts src/utils/textureCompat.test.ts`, then `npx playwright test tests/export-formats.spec.ts --grep "generated skinned GLB with material layout warnings" --workers=1` from `source/frontend`. Require image/texture records in the downloaded GLB while every preview override remains active, and require weight-preview disable to restore the source material vertex-color mode.

**Solutions tried:**
1. `28/100` Keep per-control backups and restore only on toggle/unload, result: normal preview switching worked but export could observe the modified live root.
2. `78/100` Restore maps, opacity, samplers, and mesh assignments around export, result: material previews were isolated but Skin weight colors remained exporter-visible.
3. `97/100` Use one root-scoped async source boundary covering assignments, material/texture state, geometry colors, and root replacement, result: unit and real browser download proofs pass while the live preview is restored.

**Current solution:** `materialPreview.ts` captures source-owned state once per mounted root. GLB and FBX export restore it for the whole awaited exporter operation and reapply the captured preview only when that root remains registered. `weightPreview.ts` separately snapshots the original geometry color attribute and every material's `vertexColors` mode, so disabling the selected-bone heat map cannot erase source display state. Texture diagnostics also read registered source materials instead of the current display assignment.

**Decision rationale:** A source boundary preserves the single-root skeleton/animation ownership model and applies uniformly to current and future preview controls. Cloning the whole skinned root was rejected because it would split live bone/edit references; documenting controls as “preview” without an export guard would not enforce the contract.

**Effectiveness:** `97/100`, durable. The fix is modular, exporter-wide, handles async completion and root replacement, and is proved by both state-level units and a textured downloaded asset.

**Relevance check:** Current. Any new Display material, geometry overlay, exporter, or worker boundary can reintroduce the leak if it bypasses this source-state contract.

**Next prevention step:** Require every future exporter-visible preview to register its source state with the same boundary and extend the downloaded-asset smoke when a new material channel is added.

### Q: What pitfall are we preventing?

**What:** SMF skin influences can be silently rebound to different bones when deform-order indices are mistaken for full rig-node IDs.

**Context and constraints:** SMF rig arrays include `isBone=0` head/dummy nodes, while mesh skin payloads index only deform bones. RustSMF's runtime skeleton also contains deform bones only. Export/reimport must preserve exact influence identity without structural heuristics.

**Why it happened:** `exportSMFToBuffer` inherited an old converter map from runtime bone order to full node index. The current importer and runtime correctly kept stored skin indices in deform order, so exporting a real head-node fixture shifted every influence after a dummy node. Roundtrip diagnostics compared geometry and pose but not skin payloads, producing a false pass.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/hooks/poseEdits.test.ts`, `source/frontend/src/loaders/smfDiagnostics.test.ts`, and `source/frontend/tests/mixamo_smf_baldguy.smf`.

**Evidence:** The new real-fixture preservation assertion failed with original indices such as `16,19,14,15` reimporting as `25,31,23,24`; the offset varied with intervening head nodes. After removing the node-ID remap, the focused 68-test SMF/Rig slice passed, including exact skin arrays and candidate-vs-reimport diagnostics.

**Developer story:** A node/head/skin/animation identity test was added for the SMF Rig parity done condition. Node and animation assertions passed, but skin arrays diverged while the existing diagnostic still reported success. Comparing the current loader with the owned legacy packer separated stored deform order from runtime full-node remapping. The serializer was corrected at the format boundary and the diagnostic gained explicit skin-index and 8-bit weight checks.

**How to catch it:** Run `npx tsx --test src/hooks/poseEdits.test.ts src/loaders/smfDiagnostics.test.ts` from `source/frontend`; require `SMF_ROUNDTRIP_SKINNING_OK`, zero skin-index changes, and exact real-fixture skin arrays after reimport.

**Solutions tried:**
1. `15/100` Accept the prior roundtrip report, result: false pass because skin identity was not compared.
2. `35/100` Preserve the full-node remap from the old GLB converter, result: incompatible with the current deform-only runtime and real SMF payload.
3. `98/100` Keep SMF skin payloads in deform order and make diagnostics fail on index/weight drift, result: exact real-fixture identity plus user-visible regression detection.

**Current solution:** Export writes in-memory deform-order skin indices unchanged. Roundtrip reports expose changed-index count and maximum weight delta, with weights allowed only normal 8-bit quantization tolerance.

**Decision rationale:** The checked-in real SMF fixture, current importer, and deform-only skeleton agree on one contract. Reintroducing full-node IDs or remapping on import would add unnecessary dual representations and risk runtime skinning.

**Effectiveness:** `98/100`, durable. The fix is localized to the serializer, directly proved on a head-node asset, and guarded by both exact and diagnostic tests.

**Relevance check:** Current. Any SMF serializer, head-node, skeleton-order, or skin-edit change crosses this boundary.

**Next prevention step:** Keep skin payload checks in every structured SMF roundtrip and require a head-node fixture before changing node-list or skin-index code.

### Q: What pitfall are we preventing?

**What:** A child SMF pose can export in the wrong space, and a reset button can destroy its bind offset by treating local zero as bind pose.

**Context and constraints:** SMF stores rig/world dual quaternions, runtime Three bones use local transforms, and non-deform head nodes are skipped in the runtime hierarchy. Reset must affect one selected deform bone, remain undoable, and preserve parent/head/skin/animation identity.

**Why it happened:** `applyPoseEditsToSmf` read `bone.matrix`, which is local to the effective deform parent, while the SMF rig record expects world/rig space. The old reset path set position and rotation to zero, which only matches a bind transform by accident and is wrong for most child bones.

**Where:** `source/frontend/src/hooks/poseEdits.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/Inspector.tsx`, and their focused tests.

**Evidence:** A synthetic root/head/child fixture proves the correct edited DQ matches `matrixWorld` and differs from the local matrix. The reset unit poses a parent and child under a transformed scene root, then proves only the child returns to its inverse-bind-derived local transform. The real-SMF browser flow proves dirty, reset, undo, redo, and roundtrip states.

**Developer story:** Source-mapping showed SMF has no writable name metadata and legacy detach is structural, leaving reset as the only safe candidate. Inspecting the existing reset revealed zeroing, and adding a skipped-head child export test exposed local-space serialization. The implementation derived bind world matrices from skeleton inverses, converted them to the selected bone's local space, and changed pose export to rig-space world matrices.

**How to catch it:** Run `npx tsx --test src/hooks/poseEdits.test.ts src/utils/rigEdits.test.ts` and the Playwright test `SMF rig policy gates indexed edits and bind reset is reversible`.

**Solutions tried:**
1. `10/100` Set selected bone position/rotation to zero, result: destroys legitimate child bind offsets.
2. `30/100` Serialize the runtime local matrix, result: wrong SMF DQ for nested/effective-parent chains.
3. `97/100` Derive reset locals from inverse binds and serialize edited SMF DQs from `matrixWorld`, result: bounded single-bone reset and correct head-skipping export.

**Current solution:** `resetBoneToBindPose` validates the selected deform bone and inverse bind, reconstructs bind world/local transforms, and refreshes the skeleton. `applyPoseEditsToSmf` writes rig-space world DQs. Reset clears that bone's pose edit only after success and records one history transaction.

**Decision rationale:** Inverse binds and `matrixWorld` are the existing authoritative runtime evidence. Heuristic zeroing or parent-index reconstruction at the UI layer was rejected because both duplicate loader math and fail under transformed roots/head skips.

**Effectiveness:** `97/100`, durable. Pure, real-fixture, and browser proofs cover space conversion, history, identity, and roundtrip behavior.

**Relevance check:** Current. Any bind-reset, pose-export, effective-parent, or skeleton-inverse change can reintroduce it.

**Next prevention step:** Keep matrix-space assertions explicit in pose tests; never label zeroing as reset or serialize an SMF rig DQ without proving its expected space.

### Q: What pitfall are we preventing?

**What:** A Three.js TransformControls controller can appear attached in app state while its visible/pickable gizmo is absent, and a decorative endpoint line can steal pointer ownership from a real gizmo handle.

**Context and constraints:** RustSMF uses Three.js r182, one shared canvas, explicit Rig/Animate history ownership, quad/ortho pane cameras, and a separate old-editor-style endpoint interaction. A drag must mutate exactly one history domain without orbit, endpoint, or selection side effects.

**Why it happened:** Modern `TransformControls` is a `Controls` object, not an `Object3D`; its public `getHelper()` root must be added to the scene. The previous cast-and-add path was swallowed as a supposedly benign Three-instance skew. Separately, endpoint raycasts included the visual connector line, and Three.js line raycasting uses a broad world-space threshold that overlapped gizmo pickers.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/boneHighlight.ts`, `source/frontend/src/utils/rigEdits.ts`, `source/frontend/src/components/RigPanel.tsx`, and `source/frontend/tests/rig.spec.ts`.

**Evidence:** The first real-handle smoke reached `data-transform-axis="X"` but stayed `data-transform-dragging="false"` while `data-endpoint-drag="active"`. Mounting `getHelper()` made the gizmo visible; restricting line hits alone still produced endpoint/gizmo ambiguity. The final focused run passed both the real TransformControls ownership test and the single/quad endpoint test sequentially, the six-test visual slice passed with the explicit six-button Rig tool row, and the complete browser suite passed 42/42.

**Developer story:** Inspection of the installed r182 source showed `getHelper()` is the documented scene object. After mounting it, a real drag revealed endpoint precedence. Axis-only priority fixed the gizmo but broke endpoint coverage. Inspecting endpoint geometry and the failure screenshot identified the connector line and overlapping controls as the turning point. The final design separated Select/gizmo, Endpoint, and IK tool ownership and limited the one-camera gizmo to single perspective view.

**How to catch it:** Run `npm run test:e2e -- --grep "endpoint drag works in rig mode|real TransformControls handle" --workers=1` from `source/frontend`, then run `npm run test:e2e -- tests/visual.spec.ts --workers=1`. Assert helper-mounted, axis, dragging, source, phase, and owner telemetry instead of accepting attach state alone.

**Solutions tried:**
1. `20/100` Cast `TransformControls` to `Object3D` and ignore `scene.add` failures, result: controller state existed but the public helper contract was violated.
2. `62/100` Let any hovered gizmo axis outrank endpoint fallback, result: real gizmo drag passed but legitimate endpoint drags became ambiguous.
3. `97/100` Mount `getHelper()`, make connector lines non-owning, expose an explicit Endpoint tool, project real picker geometry for tests, and detach the perspective-camera gizmo in quad/ortho, result: both interaction paths and visual coverage pass without cross-domain dirty state.

**Current solution:** Rig Select and Animate own the mounted TransformControls helper in single perspective view, Endpoint owns only marked cyan sphere meshes, IK owns its labeled target, Skin owns painting with the gizmo detached, and quad/ortho use their pane-aware explicit tools. Real picker geometry supplies stable browser drag coordinates. Endpoint pointer-cancel restores its pre-drag pose snapshot instead of silently committing the interrupted transaction.

**Decision rationale:** Explicit tools match the product's ownership model and remain stable as handle sizes change. Pixel-distance priority or broad fallback raycasts were rejected because they make behavior camera-, scale-, and DPR-dependent.

**Effectiveness:** `97/100`, durable. It uses public Three.js APIs, removes a swallowed failure, adds direct browser proof for Rig pose versus Animate key ownership, preserves endpoint coverage, and prevents unsupported multi-camera gizmo interaction.

**Relevance check:** Current. Any Three.js upgrade, gizmo-camera refactor, new handle geometry, or pointer routing change can reintroduce this class.

**Next prevention step:** Keep the real-handle, endpoint, and Skin paint tests together whenever TransformControls lifecycle, endpoint geometry, viewport cameras, or authoring ownership changes.

### Q: What pitfall are we preventing?

**What:** Odd head motion can be misdiagnosed as broken IK, and endpoint dragging or TransformControls can be mislabeled as IK even though those paths directly edit one bone. The old demos showed the head behavior before SMF-to-GLB recovery, and RustSMF did not have an IK solver before this slice.

**Why it happened:** A head is downstream of neck/spine rotations, so moving an ancestor correctly moves the head. Separately, the historical SMF bug treated serialized rig/world poses as local deltas and could resolve skipped non-deform head nodes against the wrong parent. Playback ownership can also reapply an animation pose after a manual edit. These are different failure classes and need different evidence.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/utils/rigIk.ts`, `source/frontend/src/hooks/useLoadModel.ts`, and the owned Mixamo SMF/old-editor screenshots.

**How to catch it:** First pause playback and identify the selected bone plus pointer owner. `rig-endpoint-drag` and TransformControls are direct edits; only `rig-ik-drag` is chain solving. Compare the unposed real SMF against the old positive-control render, then use the IK unit suite for chain behavior and the real-SMF IK smoke for cancel/history/export behavior.

**Solutions tried:**
1. `20/100` Attribute any head movement during a viewport drag to IK, result: impossible historically because no solver existed and it hid the stored-world-pose defect.
2. `94/100` Fix effective-deform-parent world-to-local conversion and retain a real animated-bounds regression, result: the recovered SMF/GLB rig remains coherent.
3. `96/100` Add a separately labeled, bounded CCD Rig IK tool with joint/pole constraints, explicit `rig-ik-drag` telemetry, whole-chain cancel/undo, and SMF/GLB export proof, result: direct edits and IK now have distinct observable contracts.

**Current solution:** Treat head motion as an ancestry/animation/format diagnosis until `rig-ik-drag` proves the IK path. The SMF loader derives locals from serialized world poses through effective deform parents; the Rig IK tool rotates a validated ancestor chain without changing local bone lengths and records one pose transaction.

**Effectiveness:** `96/100`, durable. Pure tests cover reach, constraints, stale chains, invalid targets, and length invariants; real-SMF browser coverage proves Escape cancel, atomic undo/redo, SMF roundtrip, validated GLB export, and reviewed target/pose visuals.

**Relevance check:** Current. Future keyed IK, mixer ownership, head-node metadata editing, or solver changes can blur these boundaries again.

**Next prevention step:** If keyed IK is added, require an explicit bake-to-animation-key contract and add a head/neck chain fixture before enabling it in Animate mode.

### Q: What pitfall are we preventing?

**What:** Quad-mode UI can display `data-viewport-layout="quad"` while pointer hit-testing still uses stale single-view viewport specs, so immediate ortho-pane clicks no-op or route as perspective.

**Why it happened:** The canvas layout prop updated during React render, but `viewportRef` was refreshed in a normal effect. Under parallel Playwright load, the Rig Add child smoke clicked after the DOM attribute changed but before the effect updated hit specs.

**Where:** `source/frontend/src/components/ThreeViewport.tsx` and the generated-skinned Rig Add child flow in `source/frontend/tests/export-formats.spec.ts`.

**How to catch it:** Run the related browser slice with default workers: `npx playwright test tests/export-formats.spec.ts tests/shell-model.spec.ts tests/rig.spec.ts tests/skin.spec.ts tests/animation.spec.ts -g "generated skinned GLB load and SMF/GLB export path|viewport layout toggle works in single/quad modes|endpoint drag works in rig mode across single and quad layouts|skin paint updates edit state and exports SMF|animation keyframe authoring updates selected-bone clips and SMF checks"`.

**Solutions tried:**
1. `65/100` Make Rig Add child own ortho placement before bone selection, result: focused generated-skinned smoke passed alone but still failed under the related parallel smoke slice.
2. `93/100` Refresh viewport specs with `useLayoutEffect` for layout/camera changes, result: the parallel related smoke slice passed.

**Current solution:** Layout-critical viewport specs are updated in a layout effect before users/tests can interact with the rendered quad state; Rig Add child also records placement result telemetry.

**Effectiveness:** `93/100`, durable. The exact single-pass-green/parallel-red failure was reproduced, then the related parallel smoke slice passed.

**Relevance check:** Current. Any future change to viewport layout, camera toggles, pane hit math, or pointer routing can reintroduce stale ref timing.

**Next prevention step:** Keep layout/pane smoke in the related slice whenever `ThreeViewport` layout timing or `viewportLayout.ts` contracts change.

### Q: What pitfall are we preventing?

**What:** SMF-source export and diagnostics can falsely fail or corrupt strict roundtrip checks when prebuilt non-bone/head nodes are treated as synthetic identities or when sign-equivalent DQs are compared component-for-component.

**Why it happened:** The exporter preserved SMF-sourced node ordering but still filled `isBone=0` head nodes with identity rig/frame DQs. Separately, `compareSmfRoundtrip` compared raw DQ components even though a dual quaternion and its full negation represent the same pose.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/loaders/smfDiagnostics.test.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`, `docs/references/old-src/datafiles/SMF/spider_TEST.smf`.

**How to catch it:** Run `npm --workspace frontend run test:unit -- smfDiagnostics`; the real-fixture diagnostic test exports and reimports `mixamo_smf_baldguy.smf` plus `spider_TEST.smf` and expects strict structured roundtrip status `passed`.

**Solutions tried:**
1. `45/100` Compare raw DQ components and identity-fill head nodes, result: geometry stayed exact but strict pose diagnostics reported large false or real export-induced deltas.
2. `94/100` Preserve source rig/frame DQs for any node with source data, and compare DQs in the equivalent sign hemisphere, result: importable real fixtures pass strict diagnostics with regression coverage.

**Current solution:** `exportSMFToBuffer` writes preserved source DQs for prebuilt head nodes instead of identity fallback, and `compareSmfRoundtrip` computes pose deltas using the smaller direct-vs-negated DQ distance while still reporting component deltas in the chosen equivalent hemisphere.

**Effectiveness:** `94/100`, durable. It is verified by focused unit coverage over both a head-node old-source fixture and a sign-flipping Mixamo SMF fixture, and it protects a core export cockpit route.

**Relevance check:** Current. SMF-source fidelity and structured diagnostics remain active app surfaces, and future rig/export edits can easily reintroduce identity head-node fallback or raw DQ comparisons.

**Next prevention step:** Keep real import/export/reimport diagnostic fixtures in the unit gate whenever SMF node-list, animation frame, or DQ comparison code changes.

### Q: What pitfall are we preventing?

**What:** Context docs can move while README, run scripts, agent instructions, and `summary_bank.json` keep pointing at deleted or nonexistent planning paths.

**Why it happened:** The backlog moved from `docs/TODO.md` to `docs/dev/TODO.md`, and old local agent/tool instructions still referenced `plan.md`, but there was no automated summary-bank path guard to catch stale explicit paths.

**Where:** `README.md`, `run.ps1`, `docs/dev/APP_STATE.md`, `source/frontend/tests/README.md`, `.agents/*`, `.tools/project.json`, `summary_bank.json`, `scripts/context-bank-lib.mjs`, `scripts/verify-context-bank.mjs`, and `scripts/generate-context.mjs`.

**How to catch it:** Run `rg -n "docs/TODO\.md|plan\.md"` for current-path drift and `pwsh -File run.ps1 -Task context` for context-bank schema, path, fanout, size, duplicate, and generation validation.

**Solutions tried:**
1. `55/100` Move the TODO file without a verifier, result: current docs and context groups could drift.
2. `97/100` Add docs indexes/policy, redirect active references to `docs/dev/TODO.md`, update local agent/tool guidance to durable docs, replace the host-dependent Python generator scripts with one portable Node library plus verifier/generator tests, and wire them into `context` and `verify`, result: stale paths and malformed or over-broad groups fail locally.

**Current solution:** `docs/dev/TODO.md` is the active backlog; `docs/dev/APP_STATE.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json` are the durable state/context surfaces. `run.ps1 -Task context` runs the focused verifier and generator tests, and `run.ps1 -Task verify` includes that gate before frontend/Rust checks.

**Effectiveness:** `97/100`, durable. It converts docs/path/schema/fanout drift into an executable cross-platform check, proves generated output behavior, and keeps historical references separated from active links.

**Relevance check:** Current. This repo intentionally keeps multiple docs and local skills, so path drift is likely during future consolidation.

**Next prevention step:** Keep active docs under `docs/dev/`; if a doc moves, update `summary_bank.json` in the same change and run the verifier.

### Q: What pitfall are we preventing?

**What:** A GenEye health check or successful browser fallback can make an e2e run look GenEye-assisted without producing RustSMF Playwright evidence.

**Why it happened:** A standalone `GenEye smoke` proves only the GenEye repo. Later, RustSMF's free-form `-PlaywrightTestCommand` also fell behind GenEye's hardened compatibility gate; the guarded Playwright fallback stayed green, but no GenEye artifact or temporal evidence was produced.

**Where:** `run.ps1`, `source/frontend/geneye-playwright.json`, `source/frontend/geneye-journey.json`, `source/frontend/scripts/run-playwright-geneye.mjs`, `source/frontend/tests/README.md`, and GenEye `docs/PLAYWRIGHT.md`.

**How to catch it:** Require the GenEye summary to report `project_tests.status=passed`, exit zero, and `execution.boundary=argv_manifest`; do not treat fallback output alone as GenEye proof. For journeys, also require one ingested source video, a temporal verdict, current checkpoint count, and completed cleanup. Product test failures must still exit nonzero.

**Solutions tried:**
1. `55/100` Run GenEye smoke before direct Playwright, result: GenEye health was checked but no RustSMF subagent evidence was produced.
2. `72/100` Pass RustSMF's shell command to GenEye, result: project evidence worked until the external compatibility boundary was hardened.
3. `98/100` Use project-owned argv manifests and a local pinned-CLI entry, result: default and journey evidence run with `shell=false` while the independent fallback remains available.

**Current solution:** `run.ps1` resolves GenEye, then uses separate checked manifests for the default browser gate and recorded journey. The pinned local entry resolves the workspace-owned Playwright CLI without a shell. `-NoGenEye` or `RUSTSMF_NO_GENEYE=1` forces direct Playwright; missing/pre-project GenEye failures fall back, while project-test failures remain authoritative.

**Effectiveness:** `98/100`, durable. Both manifests produced passing argv-bound summaries, the journey ingested one video, and the browser-only lane remains independent.

**Relevance check:** Current. RustSMF is the active external consumer for proving GenEye's browser-app testing workflow.

**Next prevention step:** After any GenEye wrapper or RustSMF e2e command change, run both the GenEye-backed e2e path and the browser-only fallback, then update docs if evidence paths or command names change.

### Q: What pitfall are we preventing?

**What:** Running separate Playwright commands in parallel can create a false failure because each command tries to start its own strict preview server on port 5173.

**Why it happened:** The repo's Playwright config intentionally uses `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`. Launching two independent `npx playwright test ...` processes at once makes the second preview process fail with `Port 5173 is already in use`, even when the app and tests are healthy.

**Where:** `source/frontend/playwright.config.ts`, local verification command usage, and the domain-owned specs under `source/frontend/tests/`.

**How to catch it:** If a Playwright run fails before tests execute with a Vite preview port error, run `Get-NetTCPConnection -LocalPort 5173 -State Listen` and rerun the affected specs as one Playwright command or sequential commands.

**Solutions tried:**
1. `35/100` Run smoke and visual specs as separate shell commands in parallel, result: the visual spec failed before starting because the smoke command owned the strict preview server.
2. `91/100` Rerun the visual spec after the first Playwright command exited and confirmed port 5173 was clear, result: all visual tests passed.

**Current solution:** Parallelize independent file reads, typechecks, unit tests, and builds where safe, but run Playwright web-server specs through one command or sequentially unless the config is changed to allocate distinct ports.

**Effectiveness:** `91/100`, durable. The failure mode is simple, verified by the exact port error and passing rerun, and it preserves the product decision to test against production preview.

**Relevance check:** Current. The e2e and visual specs intentionally use a strict preview server to avoid Vite dev/HMR instability.

**Next prevention step:** If broader Playwright sharding is needed, add explicit per-worker/per-command ports before parallelizing independent `npx playwright test` invocations.

### Q: What pitfall are we preventing?

**What:** React hooks called at module scope can make the built app boot to a blank page while lint, typecheck, unit tests, and Vite build still pass.

**Why it happened:** A Tauri client cache used `useRef` outside `useLoadModel()`. React hook dispatchers are only valid during component or custom-hook render, so the production app failed at import time with `TypeError: Cannot read properties of null (reading 'useRef')`.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`, caught by `pwsh -File run.ps1 -Task test:e2e -NoGenEye` and confirmed with a direct Playwright probe against Vite preview.

**How to catch it:** Run browser e2e after hook/cache refactors. If every spec fails before `status-text` appears and page errors mention `useRef`, inspect for `use*` calls outside React functions. Grep: `rg -n "const .* = use[A-Z]|let .* = use[A-Z]" source/frontend/src`.

**Solutions tried:**
1. `45/100` Add Vite `resolve.dedupe` for React/React DOM, result: useful hardening but did not fix the crash because the root cause was invalid hook placement.
2. `94/100` Replace the module-scope `useRef` cache with a plain module variable `cachedTauriClient`, result: app boot smoke passed and full browser e2e returned to 22/22.

**Current solution:** Module-level caches use plain variables or functions. React `useRef`, `useState`, `useMemo`, `useEffect`, and `useCallback` stay inside components or custom hooks.

**Effectiveness:** `94/100`, durable. The failing full e2e was reproduced, the smallest boot smoke passed after the fix, and the full browser plus GenEye-backed e2e suites passed.

**Relevance check:** Current. Future timing/cache cleanup around `useLoadModel` and Tauri lazy imports can repeat this mistake.

**Next prevention step:** Add a small static grep/check if this recurs, or include module-scope hook search in integrity passes that touch hook files.

### Q: What pitfall are we preventing?

**What:** SMF models can parse successfully with no console errors while the visible mesh is torn apart, and a GLB export can be saved without proving that its rig and animation structure reload intact.

**Context and constraints:** The old GameMaker example is a positive control for the owned Mixamo SMF. RustSMF must preserve SMF v11 node ordering and world-pose serialization, skip non-deform head/dummy nodes when deriving Three locals, retain all named clips, and fail before save instead of producing a plausible but unverified recovery artifact.

**Why it happened:** The Three loader once treated SMF rig DQs as local bone transforms even though the file stores bind and animation node poses in rig/world space. Those poses must be converted relative to the nearest effective deform parent, not blindly relative to a skipped head node. Render geometry also used raw byte weights whose sums can be below 1, while the old dual-quaternion shader normalized blended DQs. The GLB save path then trusted exporter completion without reparsing and comparing the produced file.

**Where:** `source/frontend/src/loaders/smf.ts`, `smfRig.ts`, `coord.test.ts`, `glb.ts`, `glb.test.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/mixamo_smf_baldguy.smf`, and old-source reference screenshots.

**Evidence:** The same SMF renders correctly in the old platformer. A deliberately wrong local-delta interpretation expanded the real animated bounds from about `29.717` to `96.16`, while the corrected effective-parent path remains below the `2x` bound. A fresh recovery export reloads with 24 deform bones and 12 clips; the GameMaker artifact SHA-256 is `A35D5DCB8474A5C16E184613512D3948DDB00D9B682C25D5D69500AEE7305B5B`.

**Developer story:** Parser success and a narrow synthetic hierarchy initially looked sufficient, but the real animated model exposed a false green. Reading the old writer and loader together established that file frames are rig/world poses even though the old runtime derives local deltas internally. The converter retained effective-deform-parent derivation and real animated-bounds coverage; the export path now reparses bytes and compares finite bindings plus bone, mesh, clip, name, and track structure before opening the save dialog.

**How to catch it:** Run `npm --workspace frontend run test:unit`; the synthetic head-node test pins effective-parent locals, the real Walk test bounds animated skinning, and `glb.test.ts` proves verified export success plus missing-clip and non-finite rejection. Also load the SMF and exported GLB visually before promoting a recovery artifact.

**Solutions tried:**
1. `45/100` Rely on parser success and screenshot byte-size checks, result: torn meshes still counted as rendered.
2. `10/100` Treat serialized frames as already-local deltas, result: the focused assumption looked plausible but the real animated model tore apart.
3. `94/100` Build Three bones from SMF world bind matrices, derive animation locals against effective deform parents, normalize render-side weights, and add real CPU skinning regressions, result: the sample renders coherently and the false-local path fails.
4. `97/100` Reparse every generic/explicit GLB export before save and require finite targets plus matching rig/animation structure, result: malformed or structurally lossy output is blocked at the app boundary.

**Current solution:** `buildThreeScene` derives local transforms from stored world DQs through effective deform parents, uses world inverse binds, and normalizes skin weights without changing imported SMF data. `validateExportedGLB` reparses generated bytes, rejects non-finite or missing animation targets, compares bone/skinned-mesh/clip/name/track counts, disposes the temporary scene, and blocks save on mismatch.

**Decision rationale:** The real fixture is required because a synthetic hierarchy alone did not expose pose explosion. Post-export validation is intentionally structural and finite-value based so it catches broken files without imposing asset-specific motion limits on every user model.

**Effectiveness:** `97/100`, durable. It combines source-contract, real-animation, post-export reparse, browser-flow, and positive-control evidence while keeping asset-specific bounds out of the generic validator.

**Relevance check:** Current. This is a core model-load path and can regress when SMF rig/animation conversion changes.

**Next prevention step:** Record converter version/hash alongside promoted recovery assets and keep one reviewed SMF-to-GLB pixel comparison when conversion math changes.

### Q: What pitfall are we preventing?

**What:** Optional strict visual snapshots can preserve a stale broken render after the actual loader has been fixed, and generated Playwright reports can dirty the repo after every run if tracked.

**Why it happened:** Default e2e uses tolerant screenshot byte-size checks for WebGL stability, so stale committed strict baselines were not exercised by normal `verify`. Separately, `playwright-report/index.html` and `test-results/.last-run.json` were tracked despite ignore rules.

**Where:** `source/frontend/tests/shell-model.spec.ts-snapshots/`, `source/frontend/tests/export-formats.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `source/frontend/package.json`, `source/package.json`, `run.ps1`, `source/frontend/playwright-report/`, and `source/frontend/test-results/`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:visual-strict` after SMF renderer, camera, skeleton, or visual snapshot changes; inspect the resulting PNGs; run `git status --short` after e2e and confirm reports/results do not appear as tracked modifications.

**Solutions tried:**
1. `45/100` Rely on tolerant screenshot byte-size checks, result: old torn SMF snapshots stayed committed while default tests passed.
2. `93/100` Add explicit strict visual check/update tasks, refresh coherent SMF load/export baselines, and untrack generated Playwright report files, result: visual baselines are intentional and e2e diagnostics no longer churn source.

**Current solution:** Use `test:visual-strict` for opt-in SMF baseline enforcement and `test:visual-update` only for intentional baseline refreshes. `playwright-report/` and `test-results/` remain ignored and untracked.

**Effectiveness:** `93/100`, durable. It gives visual baseline maintenance a named command without making default e2e brittle.

**Relevance check:** Current. SMF visual fidelity and future quad/bone-overlay work will keep changing renderer output.

**Next prevention step:** Add tighter semantic visual heuristics once quad/ortho view or large bone handles are implemented, so default e2e can catch obvious coherence failures without exact pixel matching.

### Q: What pitfall are we preventing?

**What:** Work can remain stranded on temp/review branches or auto-stashes, then docs can make the wrong source of truth look authoritative.

**Why it happened:** Execute-plan refs contained old-src docs/screenshots/proof artifacts and source review fixes, but the newer old-src GameMaker `.gml`/`.yy`/`SMF.yyp` state lived in `stash@{0}` from an auto-stash before pull. A branch-only audit made docs claim GML/YY hash verification against the execute-plan tip even though that branch did not contain the recovered GML work.

**Where:** remote `origin/execute-plan/*` refs, `stash@{0}`, `AGENTS.md`, `docs/references/old-src/*`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/*`.

**How to catch it:** Run `git branch --all --verbose --no-abbrev`, inspect `git log main..branch`, diff branch-only files, and also run `git stash list` plus `git stash show --name-status` before deleting branches or stash entries. Confirm needed work is present on local `main`.

**Solutions tried:**
1. `55/100` Leave branch work as branch-only context, result: main missed old-src screenshots/docs and export-path review fixes.
2. `70/100` Reconcile branch-only artifacts and fixes onto local `main` while assuming old-src GML/YY lived in the execute-plan tip, result: docs preserved screenshots but misidentified the backing source for the GameMaker source edits.
3. `96/100` Keep execute-plan docs/screenshots/proof artifacts and `options/reddit` metadata, restore tracked old-src `.gml`/`.yy`/`SMF.yyp` paths from `stash@{0}`, apply whitespace-only cleanup where needed before commit, document push semantics in `AGENTS.md`, keep generated reports/test-results out of source, and confirm the old-src GameMaker project manually after recovery, result: temp branches and the auto-stash each have a clear role and the recovered GML was user-tested.

**Current solution:** Work locally on `main`; Codex work should reflect `main` in progress and be reviewed in-place with the user, not through a default PR branch workflow. Temp branches are scratch/review only; explicit `push to git` means push/sync `main` only unless the user names another branch. Do not drop `stash@{0}` until the recovered old-src `.gml`/`.yy`/`SMF.yyp` state is committed or separately archived, and account for expected execute-plan-only metadata or whitespace-only cleanup if comparing against the stash.

**Effectiveness:** `96/100`, durable once committed. The workflow rule is documented, branch cleanup can be validated with git diffs, stash cleanup now has an explicit guard, and the restored old-src GameMaker state was manually verified by loading/testing it.

**Relevance check:** Current. The repo had execute-plan refs and an auto-stash with different useful old-src work.

**Next prevention step:** After verification, delete local temp branches only once their unique work is represented on `main`; do not delete remote branches or stash entries without an explicit cleanup request and a current diff check.

### Q: What pitfall are we preventing?

**What:** JSX text nodes do not interpolate `${}` template syntax — wrapping in `{}` is required.

**Why it happened:** The clip duration in the Inspector was written as `(${(c.duration || 0).toFixed(2)}s)` inside a JSX text node. In JSX, `${}` outside of a JS expression block `{}` is rendered as literal characters, not as a template expression.

**Where:** `source/frontend/src/components/Inspector.tsx` clip list item label.

**How to catch it:** Typecheck does not flag this (it is valid JSX text), lint does not flag it, and unit tests did not cover the rendered clip label string. Manual visual inspection or a targeted Playwright assertion on the clip item text would catch it.

**Solutions tried:**
1. `92/100` Changed JSX text `(${...}s)` to a JSX expression `({(c.duration || 0).toFixed(2)}s)`, result: clip label now shows the real duration value like `walk (1.23s)`.

**Current solution:** All dynamic values in JSX are inside `{}` expression blocks.

**Effectiveness:** `92/100`, durable. The fix is minimal and the root cause is a JavaScript/JSX syntax distinction that is easy to repeat.

**Relevance check:** Current. Any JSX-heavy component can repeat this mistake.

**Next prevention step:** When writing JSX with dynamic text mixed with static text, always wrap computed parts in `{}`. Consider a Playwright assertion for at least one clip item label format to catch future regressions.

### Q: What pitfall are we preventing?

**What:** Narrow toolbar layouts can make mode tabs partially unreachable or visually inert while broader viewport continuity checks still pass.

**Why it happened:** The mode tablist used fixed-width inline-flex tabs inside a wrapping toolbar. At constrained widths, the tab group could overflow instead of becoming a predictable interaction row, and pre-load layout switching was documented as model-gated but not enforced by the toolbar controls.

**Where:** `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/App.tsx`, `source/frontend/src/index.css`, and `source/frontend/tests/shell-model.spec.ts`.

**How to catch it:** Run the constrained-width smoke path that sets the viewport to 360px, loads the SMF fixture, clicks Model/Rig/Skin/Animate/Export tabs without forced clicks, and verifies selected-bone plus scrub continuity. Also assert no-model layout buttons are disabled and the canvas remains single-layout.

**Solutions tried:**
1. `65/100` Rely on normal/medium viewport mode continuity checks, result: narrow overflows could remain hidden.
2. `93/100` Put mode tabs on a full-width scrollable row under 800px, disable layout switching until a model exists, force no-model layout back to single, and add the constrained-width smoke test, result: mode changes are deterministic at 360px and the documented no-model layout contract is executable.

**Current solution:** Toolbar mode tabs use a constrained scroll row on small screens; `Toolbar` receives `hasModel` to gate layout buttons; `App` resets no-model layout to single; smoke tests cover pre-load layout lock and post-load narrow mode switching.

**Effectiveness:** `93/100`, durable. The behavior is verified through a real browser at the problematic width and keeps state continuity assertions tied to actual clicks.

**Relevance check:** Current. Toolbar, workspace panel, and viewport layout changes remain active product surfaces.

**Next prevention step:** Keep constrained-width e2e coverage with any toolbar, workspace mode, or layout-control refactor.

### Q: What pitfall are we preventing?

**What:** PowerShell test wrappers can report success even when npm/Playwright fails.

**Why it happened:** PowerShell functions return everything written to the success stream. `Invoke-FrontendNpm` emitted npm output plus a boolean, so `if (-not (Invoke-FrontendNpm ...))` evaluated the non-empty output array as truthy even when `$LASTEXITCODE` was nonzero.

**Where:** `run.ps1` `Invoke-FrontendNpm` and `test:e2e`; caught when full Playwright initially failed but `pwsh -File run.ps1 -Task test:e2e` returned exit code 0.

**How to catch it:** Run a known-failing npm script through the wrapper and inspect the process exit code, not just console text. Keep helper output on the host stream and store `$LASTEXITCODE` before returning a boolean.

**Solutions tried:**
1. `42/100` Return `$LASTEXITCODE -eq 0` after invoking npm directly, result: npm output leaked into the function return and masked failures.
2. `92/100` Pipe npm output to `Write-Host`, capture `$LASTEXITCODE`, and make `test:e2e` exit on false, result: wrapper status now matches direct Playwright status.

**Current solution:** `Invoke-FrontendNpm` writes command output to host and returns only a boolean; `test:e2e` exits nonzero when the helper returns false.

**Effectiveness:** `92/100`, durable. The wrapper now propagates pass/fail correctly for npm tasks that use it.

**Relevance check:** Current. Future run-script helpers can repeat this PowerShell success-stream mistake.

**Next prevention step:** When adding wrapper helpers around native commands, test at least one failing path and inspect the shell exit code.

### Q: What pitfall are we preventing?

**What:** Progress docs can claim a gate, fixture, or coverage path exists after planned work, while the repo does not actually contain the file or script.

**Why it happened:** Long pass-history sections were appended over time, and later reviews trusted those claims instead of checking referenced files, scripts, and test execution.

**Where:** `docs/TODO.md`, `docs/dev/APP_STATE.md`, `summary_bank.json`, `source/frontend/package.json`, missing `source/frontend/tsconfig.test.json`, missing `source/frontend/tests/native.spec.ts`, and previously absent default skinned non-SMF fixture coverage.

**How to catch it:** For every documented gate or fixture, run `rg` for the referenced file/script, run the command directly, and confirm skipped tests are intentional backlog items rather than completed coverage.

**Solutions tried:**
1. `45/100` Keep appending pass recaps, result: important coverage claims became hard to verify and some were stale.
2. `90/100` Add missing `typecheck:test`, `tsconfig.test.json`, direct Node types, and `native.spec.ts`; then rewrite TODO/APP_STATE into current state plus active backlog, result: docs matched runnable gates and remaining fixture work became explicit.
3. `95/100` Add generated self-authored skinned GLB fixture coverage and remove the sample-dependent FBX skip, result: default e2e now covers non-SMF skinned load, guarded SMF export, and GLB export without external asset assumptions.

**Current solution:** `run.ps1 -Task verify` runs app and test typechecks; `tests/native.spec.ts` covers mocked Tauri open/read/save/cancel; `tests/helpers/skinned-glb-fixture.ts` provides default non-SMF skinned fixture coverage.

**Effectiveness:** `95/100`, durable. The fix adds executable gates, removes duplicated progress logs, and closes the default skinned fixture skip with generated self-authored data.

**Relevance check:** Current. Integrity passes and feature docs will continue to reference gates and fixtures.

**Next prevention step:** Before marking coverage complete, require file existence checks or generated-fixture source checks plus a fresh command result in TODO or APP_STATE.

### Q: What pitfall are we preventing?

**What:** TypeScript/TSX app code can drift while `npm run lint` and Vite build both report success.

**Context and constraints:** RustSMF is TypeScript-heavy, Vite transpiles without owning full type analysis, and the verification gate must catch both semantic type drift and lint-only React lifecycle hazards without relying on a reviewer to inspect ESLint resolution manually.

**Why it happened:** The ESLint flat config intentionally ignores `*.ts` and `*.tsx`, and Vite transpiles TypeScript without full typechecking. That allowed ambiguous barrel exports, stale typed-array contracts, missing type imports, and obsolete Three.js material props to remain hidden.

**Where:** `source/frontend/eslint.config.js`, `source/frontend/scripts/check-eslint-coverage.mjs`, `source/frontend/package.json`, `source/package.json`, `run.ps1`, and all production/test TypeScript.

**Evidence:** The prior flat config explicitly ignored `*.ts`/`*.tsx`; therefore a clean lint result examined no application TypeScript. Enabling TypeScript and React Hooks linting exposed stale viewport closures that typecheck/build accepted. `check-eslint-coverage.mjs` now resolves representative App, loader, and Playwright files and fails if they are ignored or required rules are disabled.

**Developer story:** Earlier integrity work correctly added separate app/test typechecks, but preserved the assumption that lint was also useful for TypeScript. Inspecting the resolved flat config disproved that assumption. Re-enabling the files surfaced actual event-time state bugs, and a dedicated coverage probe was added so simply reintroducing a broad ignore cannot turn the gate green again.

**How to catch it:** From `source`, run `npm run check:lint-coverage`, `npm run lint`, `npm run typecheck`, and `npm run typecheck:test`, or run `pwsh -File run.ps1 -Task verify`.

**Solutions tried:**
1. `55/100` Rely on Vite build and current lint, result: runtime build passed but static type drift stayed hidden.
2. `88/100` Add app `tsc --noEmit` to package and verify, result: caught and fixed source contract drift without adding new dependencies.
3. `94/100` Add separate test-source typecheck with Node/Playwright types, result: caught unsafe test buffers and implicit helper types, then made `verify` cover app and test contracts.
4. `98/100` Lint all TypeScript with official TypeScript/React Hooks rules and independently verify resolved rule coverage, result: stale closures were fixed and ignored-file false success now fails closed.

**Current solution:** `source/frontend/package.json` has app/test typechecks plus `check:lint-coverage`; the flat config covers source and tests; `source/package.json` verify runs the coverage probe before lint, typechecks, build, and tests.

**Decision rationale:** Typecheck and lint protect different failure classes, so keeping both won over treating either as a substitute. The small resolved-config probe was preferred over trusting a successful lint exit code.

**Effectiveness:** `98/100`, durable. It catches type, lint, hook-dependency, and ignored-config regressions with low deterministic cost.

**Relevance check:** Current. The app is TypeScript-heavy and future loader/viewport changes can regress contracts without this check.

**Next prevention step:** Keep representative source/test targets in the coverage probe when lint ownership or directory layout changes.

### Q: What pitfall are we preventing?

**What:** Native save dialog cancellation can be reported as a successful export.

**Why it happened:** `saveFile` returned `void`, so callers could not distinguish a completed write/download from a Tauri save dialog cancel.

**Where:** `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts`.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:e2e`; the native IPC mock covers open, save, write, cancel, and status behavior.

**Solutions tried:**
1. `52/100` Treat no returned file path as a silent no-op, result: export handler still showed success.
2. `93/100` Make `saveFile` return `boolean` and assert cancel status through the native IPC mock, result: canceled exports show `Export canceled.` and no write is recorded.

**Current solution:** `saveFile` returns `false` for native save cancel and `true` for native write/browser download; export handlers branch on that result.

**Effectiveness:** `93/100`, durable. The behavior is user-visible, covered by e2e, and keeps the API contract clear.

**Relevance check:** Current. Native save/export is core desktop behavior and easy to regress during export-path changes.

**Next prevention step:** Keep native dialog tests in `source/frontend/tests/native.spec.ts` whenever save/open behavior changes.

### Q: What pitfall are we preventing?

**What:** Invalid SMF edge cases can produce opaque parser failures, NaN dual-quaternion transforms, or invalid animation timing during export.

**Why it happened:** `BinaryReader` relied on raw `DataView` range errors, `dqNormalize` divided by a zero/invalid rotation length, and animation export normalized keyframe time by duration without guarding zero-duration clips.

**Where:** `source/frontend/src/loaders/smfBinary.ts`, `source/frontend/src/loaders/coord.ts`, `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/coord.test.ts`.

**How to catch it:** Run `npm --workspace frontend run test:unit` or `pwsh -File run.ps1 -Task verify`; unit tests cover truncated SMF input, zero/invalid DQ normalization, and zero-duration animation export.

**Solutions tried:**
1. `58/100` Let low-level `DataView` and float math fail naturally, result: failures were hard to interpret and could serialize NaN/Infinity.
2. `90/100` Add bounded reads and safe normalized animation time, result: parser failures and zero-duration animation export became finite and actionable.
3. `94/100` Add `dqNormalize` identity fallback for zero/NaN/Infinity rotation parts plus invalid-DQ unit coverage, result: DQ export math cannot serialize non-finite values from malformed rotation parts.

**Current solution:** Binary reads throw `Unexpected end of SMF binary...`; invalid DQs normalize to identity; zero-duration animations write normalized time `0`.

**Effectiveness:** `94/100`, durable for malformed input and partial conversion work. It does not prove future non-SMF-to-SMF animation fidelity by itself.

**Relevance check:** Current. Exact GLB/FBX-to-SMF work will stress DQ construction and animation timing.

**Next prevention step:** Keep malformed-input and invalid-DQ unit tests close to any new SMF rig/animation serialization helper.

### Q: What pitfall are we preventing?

**What:** Non-SMF save-as-SMF can silently lose fidelity if static meshes, mismatched skeletons, duplicate bone names, object-level tracks, morph tracks, material data, or scale animation are accepted as if they were fully representable in the current SMF DQ path.

**Why it happened:** The earlier removed GLB-to-SMF helper attempted rough DQ construction without fixture-backed animation proof, and SMF stores rig/animation as DQs without a scale channel.

**Where:** `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/components/Toolbar.tsx`.

**How to catch it:** Run `npm --workspace frontend run test:unit` or `pwsh -File run.ps1 -Task verify`; converter tests assert skeletal animation roundtrip and rejection of scale animation or unprepared static roots.

**Solutions tried:**
1. `35/100` Keep the old approximate helper, result: misleading incomplete conversion path with empty animation frames.
2. `74/100` Remove the helper and keep GLB as the only non-SMF export, result: safe but missing save-as-SMF for valid skinned cases.
3. `92/100` Add a guarded Three skinned-source converter with fixture-backed DQ roundtrip and explicit rejection of unsupported cases, result: verified SMF export for compatible GLB/FBX runtime roots without pretending all source fidelity is covered.

**Current solution:** `Export SMF` uses `buildImportedSmfFromThree` only for skinned roots with one shared named skeleton and supported bone position/quaternion tracks; unsupported cases show a clear status and should use GLB export.

**Effectiveness:** `92/100`, durable. It covers the intended animation path and prevents silent scale/static conversion loss, while leaving texture/material fidelity to GLB.

**Relevance check:** Current. This is now a user-visible export path and should guide any future expansion of SMF conversion.

**Next prevention step:** Add real-file skinned GLB/FBX fixtures if converter support expands to materials, morphs, multiple skeletons, or scale-aware formats.

### Q: What pitfall are we preventing?
**What:** Module moves/refactors (e.g. extracting BinaryReader/Writer + bytes util to smfBinary.ts) can leave duplicate code behind in the original files + consumers, plus the new file stays untracked, while docs claim "deduped".

**Why it happened:** The integrity pass added smfBinary.ts and updated some notes, but smf.ts retained its local copies of the classes + bytes fn; useLoadModel and tauri kept their buffer copies; barrel was not updated to expose the util; no follow-up grep or consumer audit + `git add` for the moved file.

**Where:** loaders/smf.ts (full dupe classes), hooks/useLoadModel.ts + backend-client/tauri.ts (bytes copy), loaders/index.ts, the untracked smfBinary.ts, docs/TODO/APP_STATE/summary_bank over-claims.

**How to catch it:** After any cross-file move/extract: 1) grep -r for the fn/class name in src (should appear only in new home + imports), 2) run full `npm run typecheck && npm run lint`, 3) `git status` (new file must be intentional), 4) update barrel if the util is meant for sharing, 5) re-verify. Independent full review greps + file reads caught it.

**Solutions tried:**
1. 40/100 Assume the pass "took care of wiring", result: latent dupes + doc/code drift.
2. 95/100 Full discovery grep + read of all buffer sites + consumers + barrel + status, plus immediate replace + tests, result: single source of truth, improved bounds active everywhere, doc claims corrected same pass.

**Current solution:** `smfBinary.ts` is the single owner; consumers and the loader barrel import it, duplicate implementations are removed, and `subsystem__smf_format_and_fidelity` routes the durable context. No open TODO remains for this completed extraction.

**Effectiveness:** 95/100, durable for this class of refactor. Prevents silent fidelity or error-handling drift (old check vs ensure impls).

**Relevance check:** Current (and future P2 splits of smf/ThreeViewport will re-apply same discipline).

**Next prevention step:** Consider a small CONTRIBUTING or AGENTS note, or pre-commit grep guard for known helper names. Use monolith-modularization skill explicitly on >400 line files before extract.

### Q: What pitfall are we preventing?

**What:** SMF flat node lists + explicit `isBone=0` head dummies can either produce crossed editor bones or hang the loader when a skipped head node self-parents.
**Why it happened:** The original hierarchy path created `THREE.Bone` for every node and attached by direct parent index. The first head-skip fix added effective-parent walking, but root head dummies in real SMF files can parent to themselves; without a visited set, the walk never terminated. Once that was fixed, inverse bind matrices still needed fresh world matrices before `Skeleton.calculateInverses()`, and animation tracks for skipped head nodes emitted missing-target warnings because those dummies are not scene objects.
**Where:** `source/frontend/src/loaders/smf.ts` (old bone loop + threeBones + attach + skel ctor + remap + name gen), `source/frontend/src/loaders/smfRig.ts` (export only), poseEdits regex, ThreeViewport (helper on root + findBoneByName on skel), Inspector (getRoot + recursive children filter), coord.test golden fixture (heads present but only export/roundtrip tested), mixamo sample (14 heads, 24 deform, skins 0-22 seq).
**How to catch it:** Load `source/frontend/tests/mixamo_smf_baldguy.smf` through the UI and assert the loading overlay clears; run the root-head unit regression plus the real bind-pose skinning test; watch Playwright console output for `THREE.PropertyBinding: No target node found` head-track warnings.
**Solutions tried:**
1. Direct attach + mixed skel (original), result: skin ok by compensation, editor broken for any head-using rig.
2. Effective ancestor walk without cycle detection (2026-06-15), result: crossed bones fixed but root-head self-parent files could spin forever.
3. `96/100` Add `findEffectiveBoneParentIndex` with visited-set cycle guard, reuse it for hierarchy and animation local-parent resolution, update root world matrices before inverse binds, and skip non-scene head animation tracks; result: real SMF load completes, bind-pose test passes, and smoke test has no head-track warnings.
**Current solution:** Dedicated builder in `smfRig`; called from `buildThreeScene`; only `isBone=1` nodes enter the skeleton and scene hierarchy; effective parents skip heads with cycle protection; names are prefixed for readability + regex safety; userData carries original indices; animation clips target only scene bones.
**Effectiveness:** `96/100`, durable. It is verified by the real `.smf` fixture, root-head regression, bind-pose skinning invariant, Playwright SMF load, native IPC mock, and full `verify`.
**Relevance check:** Current. Any future SMF rig changes (more head synth, glb->smf heads) or editor viz work will touch this.
**Next prevention step:** Keep root-head/self-parent and real-sample load tests near any SMF hierarchy change; before changing bone parent logic, rerun targeted units plus `npm --workspace frontend run test:e2e -- tests/shell-model.spec.ts -g "can load a real SMF sample"`.

### Q: What pitfall are we preventing?

**What:** Project launchers can look healthy while not actually starting the app for the default user path.

**Why it happened:** `run.ps1` defaulted to help text, `run.bat` assumed `pwsh` was available, and the Tauri path could depend on a globally installed CLI instead of the repo-local npm dependency.

**Where:** `run.ps1`, `run.bat`, `README.md`, `source/frontend/package.json`.

**How to catch it:** Run the exact user-facing commands with no extra task arguments: `.\run.bat` and `pwsh -File run.ps1`. Confirm the numbered menu appears, then choose option `2`; also run `pwsh -File run.ps1 -Task run` and confirm Vite plus the Tauri desktop process launch.

**Solutions tried:**
1. `55/100` Keep launch instructions as explicit tasks only, result: documented commands worked but the user-facing default failed the "run this project" expectation.
2. `94/100` Make no-arg `run.ps1` start desktop dev, make `run.bat` fall back to Windows PowerShell, and invoke the local npm Tauri CLI, result: default launchers ran the app without global CLI assumptions.
3. `96/100` Restore a numbered no-argument menu while keeping the stable `run` task and repo-local npm CLI path, result: interactive users get a discoverable launcher and scripts retain a deterministic direct command.

**Current solution:** `run.ps1` and `run.bat` default to the numbered menu; option `2` and `-Task run` launch Tauri dev. `run.bat` uses `pwsh` when present and `powershell` otherwise, and Tauri commands route through local npm scripts.

**Effectiveness:** `96/100`, durable for local Windows launch. It still depends on repo dependencies being installed.

**Relevance check:** Current. Launcher behavior is the first user-visible health check.

**Next prevention step:** After changing run scripts or package scripts, verify both default menus and the direct `-Task run` route, not only `-Task verify`.

### Q: What pitfall are we preventing?

**What:** Vite dev-server HMR websocket failures can masquerade as Playwright app regressions.

**Why it happened:** After the Vite 8 upgrade, the dev server could emit `ws error: RangeError: Max payload size exceeded` during parallel WebGL/file-flow tests. Affected pages reloaded to initial state, so assertions failed even though the built app behavior was valid.

**Where:** `source/frontend/playwright.config.ts`, `source/frontend/tests/README.md`, `run.ps1 -Task test:e2e`.

**How to catch it:** Run the full e2e suite after dependency or server changes. Look for websocket max-payload errors, status text resetting to the initial viewport-ready state, and failures clustered after file-load flows.

**Solutions tried:**
1. `45/100` Cap Playwright workers while still using `vite dev`, result: failures persisted.
2. `50/100` Disable Vite HMR while still using `vite dev`, result: failures persisted.
3. `93/100` Build first and serve tests with `vite preview`, result: full e2e passed and later generated skinned GLB coverage removed the old FBX/skinned fixture skip.

**Current solution:** Playwright webServer runs `npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`, does not reuse an existing server, and caps local workers at 4.

**Effectiveness:** `93/100`, durable for current e2e coverage. It adds a build step to e2e runtime but removes dev-server HMR noise from product-flow tests.

**Relevance check:** Current. Any future Vite/Playwright server change should retest the full suite.

**Next prevention step:** Keep e2e on production preview unless a replacement passes the full suite and does not reintroduce websocket/page-reset symptoms.

### Q: What pitfall are we preventing?

**What:** Node/DOM polyfills for canvas 2d (used by SMF texture decode in import + extracted canvas-sprite label makers) can be partial or mutually clobbering after modularity extracts, causing silent test failures or typecheck breaks only on full gate runs.

**Why it happened:** makeBoneLabel (and future 2d viz) + importSMF both execute document.createElement('canvas').getContext('2d') + assign/use fill*/scale/textBaseline/createImageData; tests mutated global document in install + per-it overrides without full coverage of props/methods or restore, and no types on mock fns.

**Where:** `source/frontend/src/loaders/coord.test.ts` (polyfills + label its), `source/frontend/src/utils/boneLabels.ts` (and any future 2d canvas code), coord.test imports of the makers + SMF sample load it.

**How to catch it:** Run `npm --workspace frontend run typecheck:test` + `npm --workspace frontend run test:unit` (or targeted name pattern for labels/hierarchy) + full `pwsh -File run.ps1 -Task verify` after any canvas-using util extract or change; inspect for "createImageData is not a function" or TS7006 implicit in mocks.

**Solutions tried:**
1. `60/100` Minimal imageData-only global + ad-hoc override per label it (no restore, incomplete styles/scale/textBaseline), result: later tests (SMF texture) or type gates broke after bone labels extract.
2. `95/100` Single rich shared install mock (imageData + fillRect/fillText/scale + textBaseline + writable styles + explicit param types); capture its patch temporarily + restore in finally; base always capable, verified slice + type, result: gates green and resilient to order.

**Current solution:** installImageTestPolyfill now always emits capable 2d ctx stub; label capture its use non-destructive override + restore; any new 2d canvas helper must add to this shared mock and run the unit/type slice.

**Effectiveness:** `95/100`, durable for test-only canvas paths. Prevents latent breakage when 2d features (labels, future overlays) are extracted or polished.

**Relevance check:** Current. Modularity extracts + canvas for labels/glyphs + SMF tex will recur for viz work or quad.

**Next prevention step:** When adding canvas 2d code (or new utils/ tests touching document.createElement canvas), extend the shared polyfill first, add explicit types to mock fns, and include a "labels-or-2d" + "real-smf-sample" test slice in PR verification. Document the polyfill contract in the test file header.

### Q: What pitfall are we preventing?

**What:** Verification scripts can pass while an expected production chunk split is missing.

**Why it happened:** `check-entry-chunks.mjs` printed a warning and exited 0 when `three-vendor` was absent, and also skipped with a success exit when `dist` could not be read.

**Where:** `source/frontend/scripts/check-entry-chunks.mjs`, `run.ps1 -Task verify`, `source/package.json` verify script.

**How to catch it:** Temporarily remove or rename the built `dist/index.html` or the Vite manual chunk config, then run `node scripts/check-entry-chunks.mjs` and verify the process exits nonzero.

**Solutions tried:**
1. `58/100` Warn but continue, result: humans could miss the warning and automated gates stayed green.
2. `92/100` Emit errors and `process.exit(1)` on missing split or missing dist, result: `verify` now fails closed.

**Current solution:** The chunk check exits 1 when the production build artifact cannot be inspected or the expected `three-vendor` split is absent.

**Effectiveness:** `92/100`, durable for this check. It intentionally treats a missing build as a verification failure.

**Relevance check:** Current. Three.js bundle splitting is a performance and startup integrity concern.

**Next prevention step:** Keep guard scripts fail-closed unless a skipped state is explicitly part of the command contract.

### Q: What pitfall are we preventing?

**What:** Independently guarded picker, file/drop, loader, and export awaits can each be locally fresh while still being globally stale, allowing an older result to replace or report over a newer user intent.

**Context and constraints:** Browser and Tauri flows share one mounted model and one status surface. Codec work may outlive the user action that started it, while a failed replacement must preserve the prior edited model and a save lock must always release.

**Why it happened:** Picker open and browser file reads used separate counters, so a delayed picker could call `loadModel` after a newer file/drop completed. Export had its own sequence but loads did not invalidate it, and the old implementation cleared the current model before a replacement parsed successfully. Simply invalidating export in `finally` would also have skipped lock release.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/src/workers/smfCodecClient.ts`, `source/frontend/tests/lifecycle.spec.ts`, `source/frontend/tests/native.spec.ts`, and `source/frontend/tests/helpers/smoke-helpers.ts`.

**How to catch it:** Deterministically delay and succeed/fail picker open, browser `File.arrayBuffer`, desktop path reads, and native writes. Start a newer success or error before the older promise settles, then assert exact root UUID, selection, status/error, pose/skin/animation dirty state, write count, button recovery, and absence of stale completion text.

**Evidence:** Delayed browser/native matrices reproduce both completion orders. Worker units prove abort termination and cleared handlers; the bounded stress flow proves worker progress and terminal cleanup while the existing load/export ownership matrix remains green. The first full worker run also showed that changing in-progress copy from `Loading` to `Importing` let readiness assertions advance before model commit; keeping `Loading` as the stable operation state restored all affected Rig/IK flows.

**Developer story:** Focused file/drop tests originally suggested the sequence design was complete. Mapping every user entrypoint showed the counters were scoped to implementation branches rather than user intent. Cross-entrypoint tests reproduced the overwrite; export/load overlap then exposed the same ownership problem plus a lock-release hazard. Atomic replacement followed because a failed newer load should not destroy a valid edited model. Workerization then reused the same ownership token and added active aborts rather than creating a second lifecycle.

**Solutions tried:**
1. `70/100` Guard only inside `loadModel`, result: a late picker or read could enter `loadModel` last and receive a newer token.
2. `88/100` Use separate picker and file/drop counters, result: same-class races were blocked but cross-entrypoint races remained.
3. `98/100` Use one load-intent sequence across picker/input/drop/path/loader/worker, abort superseded codecs, invalidate export UI commits when a load begins, check freshness after each await, release the save lock independently, replace only after current parse success, and dispose stale parsed roots, result: delayed success/error and worker ownership matrices pass.

**Current solution:** `beginLoadRequest` advances the shared load sequence and export epoch and aborts the active codec. All load stages carry the same token; only a current successful parse calls `clearLoadedModel` and commits format/root/state. Worker results are rechecked before scene/save ownership, and import progress retains the stable user-visible `Loading` state until terminal commit. `withExportBusy` serializes diagnostic/model saves, passes a freshness predicate through exporter/validator/save awaits, suppresses stale UI commits, and always releases its owned lock.

**Decision rationale:** One user-intent token plus explicit resource cancellation is simpler and safer than composing independent branch counters or accepting stale results and filtering only status text.

**Effectiveness:** `98/100`, durable. Browser, native, and worker tests cover stale success/error orders, atomic replacement, dirty-state ownership, cancellation cleanup, cross-action single-flight, and export completion after newer loads.

**Relevance check:** Current. Every present async entrypoint, including SMF worker responses, joins the same ownership contract.

**Next prevention step:** Any new async lifecycle entrypoint must join the delayed success/error matrix before shipping.

### Q: What pitfall are we preventing?

**What:** Rogue Node.js / Vite dev servers (and intermediate tauri-cli parent processes) left listening on 5173 (or holding resources) after the cmd/pwsh launcher window is closed via its title-bar X button, or after the Tauri desktop app window is closed, or on hard Ctrl+C / parent kill. Subsequent launcher runs then hit "address in use" or leave stray node processes.

**Why it happened:** `tauri dev` (via beforeDevCommand in tauri.conf.json) spawns a long-lived child (`npm run dev` → Vite) that outlives the Tauri Rust process and the outer CLI in many Windows console-close scenarios; no process-group ownership, recursive tree kill, port/cmdline reaper on entry, or explicit child lifetime tie in the launcher (run.ps1 direct & npm or run.bat delegation). Tauri CLI child mgmt alone was insufficient for X-close of the visible pwsh or direct manual `tauri dev`.

**Where:** `source/src-tauri/tauri.conf.json` (beforeDevCommand), `source/frontend/scripts/start-vite-dev.mjs` (the managed wrapper), `run.ps1` (Stop-ProcessTree, Stop-DevServers sweeps, New-KillOnCloseJob, Start-Process + job assign + try/finally + trap + PowerShell.Exiting + Stop-StaleDevStack), `run.bat` (delegates), `source/frontend/package.json` + `source/package.json` (tauri:dev/dev scripts), runtime-data/*.log (prior sessions), `docs/dev/PITFALL_LEDGER.md` / `APP_STATE.md` / `TODO.md` / `summary_bank.json` (pre-fix references to launcher gaps).

**How to catch it:** Manual reproduction: `pwsh -File run.ps1` (or `run.bat`); load a model; X-close the cmd window or Tauri app; `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue` or `tasklist | findstr /i node`; confirm zero relevant node; re-launch and verify clean port + no "address in use". Automated: `pwsh -File run.ps1 -Task desktop-smoke` (or verify) + explicit post-run port sweep; extend native.spec or a harness test comment with simulated close + recheck. Watch runtime-data logs for prior "dev" lifecycle without clean exit.

**Solutions tried:**
1. `40/100` Rely on Tauri CLI's internal beforeDev child handling + OS console semantics, result: orphans survived cmd X-close and some tauri window closes; next launch often required manual taskkill.
2. `65/100` Add simple finally { Stop-Process ... } around & npm in run.ps1, result: helped Ctrl+C but not title-bar X (pwsh abrupt term) and not the full grandchild tree reliably.
3. `93/100` Multi-layer defense (Windows JobObject with KILL_ON_JOB_CLOSE assigned to owned Start-Process pwsh for the dev subtree + recursive Stop-ProcessTree via Win32_Process + three-sweep Stop-DevServers (exact 5173 node owners + cmdline 'vite|start-vite-dev|tauri') + Stop-Stale on every dev entry + trap + PowerShell.Exiting register + mjs wrapper for the tauri-close path (SIGTERM/'exit'/taskkill /T + parentPid poll + delay)), result: X-close, tauri-close, Ctrl+C, and re-launch all clean; redundant but low-cost and effective on primary Windows launcher path.

**Current solution:** The 3rd (layered) solution above. run.ps1 owns the long-running dev tasks via Start-Process + Job + finally/tree/stale; the mjs (now the beforeDevCommand) guarantees its direct Vite child is reaped on tauri CLI term (signals + poll + tree kill) and now has a unix fallback (`pkill`/`kill`) path when available. Entry sweep + port check makes re-launch robust. See `subsystem__dev_process_lifecycle` in `summary_bank.json` for the maintained path group and notes.

**Effectiveness:** `93/100`, durable. Verified by construction (checks: cargo/context/typecheck/verify all green post-change), manual X-close + re-launch scenarios (no rogue node, port free), and the prior orphan class being the exact motivator. Low runtime cost (scans only on dev entry or explicit close paths; poll is 1.8s win32-only in mjs).

**Relevance check:** Current. The canonical Windows launcher path plus direct-launch mjs fallback are the documented expectations; future cross-platform or direct-launch users are intentionally handled as reduced-coverage paths.

**Next prevention step:** Keep explicit reduced-coverage language for direct launches in run.ps1/help and `APP_STATE`/`docs/user`/README, and re-run manual close/re-launch checks when launcher scripts or wrapper logic changes.

### Q: What pitfall are we preventing?

**What:** A workspace continuity test can mistake an intentionally unmounted panel for lost shared state, or fail to observe a real reset while only checking the currently visible panel.

**Why it happened:** The Timeline owns the visible scrub label and is not rendered in Export, even though playback time remains in shared state and continues to drive the viewport. A transition assertion that waits for `time-display` in every mode tests panel presence rather than playback continuity.

**Where:** `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/tests/shell-model.spec.ts`, and `source/frontend/tests/native.spec.ts`.

**How to catch it:** Load a generated skinned GLB, create pose/skin/animation dirty state, pause and scrub, select an object and bone, then cycle every workspace through quad and single Ortho. Assert the same model-root UUID and playback value through viewport telemetry, while asserting mode-owned dirty controls only when their panels are mounted. Also change panels after a canceled native save before checking status and dirty state.

**Solutions tried:**
1. `55/100` Wait for the visible Timeline scrub label in every workspace, result: Export timed out because the Timeline is intentionally absent.
2. `95/100` Expose read-only model-root and playback telemetry on the persistent viewport canvas and keep panel-specific assertions scoped to mounted modes, result: the matrix distinguishes shared-state continuity from panel lifecycle without changing product state.

**Current solution:** `data-model-root-id` and `data-playback-time` expose the persistent viewport inputs. The browser matrix proves root, object/bone selection, scrub time, export status, three dirty domains, and exclusive Select/Endpoint/IK handles across modes/layouts; native cancel tests prove the same state after subsequent panel changes.

**Effectiveness:** `95/100`, durable. The evidence crosses the exact mount boundaries that previously made continuity ambiguous and retains negative no-model/stale-handle checks.

**Relevance check:** Current. Mode-owned panels will continue to mount and unmount as the workspace grows.

**Next prevention step:** When adding a workspace or moving state between components, assert continuity through the narrowest persistent owner and separately assert the new panel's mount contract.

### Q: What pitfall are we preventing?

**What:** Broad TypeScript assertions at external boundaries can make malformed Tauri/DOM/exporter values and Three.js API drift look valid, while recursive cleanup can dispose shared GPU resources repeatedly or omit skeleton-owned textures.

**Why it happened:** Production code accumulated local `as THREE.*`, double assertions, event casts, and unvalidated select/export results as library types evolved. The disposer treated each traversal occurrence as unique even when meshes shared geometry, materials, textures, or one skeleton.

**Where:** `source/frontend/src/backend-client/tauri.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/loaders/`, `source/frontend/src/store/index.ts`, `source/frontend/src/utils/threeTypeGuards.ts`, `source/frontend/src/utils/threeDisposal.ts`, and related focused tests.

**How to catch it:** Run `npm run check:production-any`, app/test typechecks, and search production source for `as unknown as`, `as THREE.`, `@ts-ignore`, and `@ts-expect-error`. Run `npx tsx --test src/store/index.test.ts src/utils/animationEdits.test.ts src/utils/skinWeights.test.ts src/utils/rigIk.test.ts src/utils/threeTypeGuards.test.ts src/utils/threeDisposal.test.ts src/loaders/glb.test.ts`.

**Solutions tried:**
1. `45/100` Trust component options and Three marker fields with inline assertions, result: concise code but no runtime rejection and fragile dependency-upgrade boundaries.
2. `80/100` Replace only production `any`, result: the automated gate passed while double assertions and broad library casts still hid assumptions.
3. `98/100` Validate unknown inputs with named predicates/adapters, use Three r182 public APIs and `instanceof` guards, validate worker messages, require binary exporter output at runtime, and deduplicate disposal by resource identity including skeletons, result: focused and full gates pass.

**Current solution:** The 3rd solution. Shared Three guards own traversal narrowing; Tauri/DOM/settings/export/worker values validate before mutation; export worker inputs are deep-owned before transfer; safe buffer copies avoid `SharedArrayBuffer` assertions; disposal uses a per-subtree identity set for geometry, skeleton, material, and texture resources.

**Effectiveness:** `98/100`, durable. Runtime guards fail closed, transfer ownership is explicit, the source scan is executable, and shared-resource ownership has a regression test.

**Relevance check:** Current. Three.js upgrades, new worker messages, exporter replacements, or new material channels can reintroduce boundary assumptions.

**Next prevention step:** Keep new external message/resource types behind named validators and the identity-deduplicating disposal adapter.

### Q: What pitfall are we preventing?

**What:** SMF export can make roundtrip diagnostics pass by mutating the source animation DQs that serve as the expected result.

**Context and constraints:** The same `ImportedSmf` data can back live editor state, diagnostics, a dedicated worker, or the explicit synchronous startup fallback. Serialization must be a read-only boundary, and diagnostics must compare semantic serialized poses rather than rely on exporter side effects.

**Why it happened:** `dqNormalize` defaults its destination to the input array. The animation serializer passed source frame DQs directly, so synchronous export normalized them in place before `compareSmfRoundtrip` ran. Worker export correctly cloned before transfer, which removed the side effect and exposed noncanonical-but-equivalent DQs as pose deltas.

**Where:** `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/smfDiagnostics.ts`, `source/frontend/src/workers/smfCodecClient.ts`, `source/frontend/src/workers/smfCodecClient.test.ts`, and `source/frontend/src/loaders/smfDiagnostics.test.ts`.

**Evidence:** The first full worker-backed Playwright run reported repeatable first/last-frame pose deltas of `0.292893` and `0.250000` in three roundtrip flows. The source-safe worker path failed while the former synchronous path passed because the latter changed its expected input. A fallback unit now supplies a non-unit DQ and proves the source frame is byte-for-byte unchanged; diagnostics units prove scaled-equivalent DQs compare as the same serialized pose. The seven affected browser flows and then all 53 flows passed after the fix.

**Developer story:** Worker transfer ownership was initially suspected because the failures appeared only after workerization. Comparing the cloned worker path to direct export showed the worker preserved data while the direct serializer did not. Tracing `buildDQForExport` reached the in-place default on `dqNormalize`; allocating a destination removed the mutation, then canonical normalization in diagnostics made the intended format comparison explicit instead of restoring the old side effect.

**How to catch it:** Run `npx tsx --test src/workers/smfCodecClient.test.ts src/loaders/smfDiagnostics.test.ts`, then the SMF roundtrip Playwright flows. Assert the original animation frame remains unchanged after startup fallback and scaled/sign-equivalent DQs produce zero semantic pose delta.

**Solutions tried:**
1. `25/100` Keep comparing after synchronous export, result: false confidence because serialization rewrote the expected value.
2. `68/100` Clone only for worker transfer, result: live worker state stayed safe but synchronous fallback still mutated input and diagnostics exposed unexplained deltas.
3. `98/100` Normalize into fresh serializer buffers and normalize copies for sign-aware diagnostic comparison, result: worker and fallback paths are immutable and both exact and scaled-equivalent pose regressions are detected correctly.

**Current solution:** Animation export calls `dqNormalize` with a fresh destination before negate/sign continuity. Roundtrip pose comparison canonicalizes copies of both DQs before direct-versus-negated component checks. Worker export still deep-clones before transfer, and fallback immutability is unit-tested.

**Decision rationale:** A read-only serializer plus semantic diagnostics preserves ownership across every execution mode. Reintroducing mutation or weakening pose checks would only hide the discrepancy.

**Effectiveness:** `98/100`, durable. Focused ownership/diagnostic tests and the complete browser suite cover both the root cause and user-visible roundtrip behavior.

**Relevance check:** Current. Every SMF export, roundtrip check, worker transfer, and startup fallback crosses this boundary.

**Next prevention step:** Treat all serializers as pure with respect to caller-owned buffers; add an immutability assertion whenever a new canonicalization step is introduced.

### Q: What pitfall are we preventing?

**What:** Indexed Three.js geometry can appear valid in the viewport but produce an invalid or incomplete SMF when conversion writes unique vertices while the SMF serializer emits only sequential triangle records.

**Context and constraints:** Runtime GLB and FBX meshes commonly reuse vertices through an index buffer. The SMF writer stores a flat triangle-soup vertex stream and does not serialize Three.js index metadata, so conversion must make the topology explicit before worker validation or save.

**Why it happened:** `threeToSmf` copied each geometry attribute at its unique-vertex count and built a separate triangle list from the index. The downstream SMF writer ignored that list, so an indexed quad reached export as four vertices instead of two complete triangles. The new nested worker request validator correctly rejected the malformed vertex count and exposed the pre-existing converter mismatch in seven browser flows.

**Where:** `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/loaders/threeToSmf.test.ts`, `source/frontend/src/workers/smfCodecProtocol.ts`, and `source/frontend/tests/export-formats.spec.ts`.

**Evidence:** A generated indexed quad with indices `[0, 1, 2, 0, 2, 3]` now converts to six position, normal, UV, tangent, skin-index, and skin-weight records and reimports successfully. Focused converter/worker tests, the seven initially affected browser cases, and then all 53 browser cases passed.

**Developer story:** Relaxing the worker guard would have restored the old silent corruption. Following the rejected payload back through the conversion boundary showed that the serializer's actual wire contract—not the in-memory triangle helper—was authoritative. Expanding every present attribute through one validated triangle vertex map fixed the topology once and kept optional arrays aligned.

**How to catch it:** Run `npx tsx --test src/loaders/threeToSmf.test.ts src/workers/smfCodecClient.test.ts`, then `npx playwright test tests/export-formats.spec.ts --workers=1`. Include an indexed mesh, reject incomplete triangles and out-of-range indices, and assert the reimported SMF vertex count is a multiple of three.

**Solutions tried:**
1. `20/100` Relax the worker's nested vertex-count validation, result: export would proceed while preserving the corrupt topology.
2. `55/100` Serialize the separate triangle list without changing vertex attributes, result: it would require a format change and leave attribute cardinalities ambiguous.
3. `98/100` Build one validated triangle vertex map and expand all required and optional attributes to flat triangle soup before diagnostics/serialization, result: indexed and non-indexed inputs share one explicit wire representation.

**Current solution:** `makeTriangleVertexMap` validates complete triangle groups and index bounds. Conversion expands every attribute through that map, fills absent optional attributes to the exported vertex count, emits sequential triangle metadata, and blocks incomplete position or four-component skin layouts.

**Decision rationale:** Normalizing at the Three-to-SMF boundary preserves the existing SMF file contract and gives diagnostics, worker validation, and serialization the same shape.

**Effectiveness:** `98/100`, durable. The regression is covered at the pure converter boundary and through browser download/reimport.

**Relevance check:** Current. Any new runtime importer or geometry preprocessing path may produce indexed buffers.

**Next prevention step:** Every new Three-to-SMF fixture should include at least one indexed mesh, and serializer changes must keep flat vertex and triangle metadata cardinalities in lockstep.

### Q: What pitfall are we preventing?

**What:** A valid repo-local npm installation can be shadowed by an inaccessible user-profile npm shim, causing launcher, Playwright web-server, or verification commands to fail before project code runs.

**Why it happened:** The managed Windows environment resolved the global `npm.cmd`, whose prefix helper attempted to read `C:\Users\jc816\AppData\Roaming\npm`. Node itself and its adjacent bundled `npm-cli.js` were available, but callers delegated resolution back to `PATH`.

**Where:** `run.ps1` and `source/frontend/playwright.config.ts`.

**Evidence:** Direct npm shim invocation failed at startup, while `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"` ran the same unit/type/build commands successfully. The launcher helper and Playwright server command now select the CLI adjacent to the active Node executable first.

**How to catch it:** Run `pwsh -File run.ps1 -Task test:unit`, `pwsh -File run.ps1 -Task verify`, and one Playwright command in a managed Windows sandbox where the roaming profile is unreadable. The commands must reach project scripts without depending on a global npm prefix.

**Solutions tried:**
1. `35/100` Keep calling `npm` from `PATH`, result: environment-specific shim startup failed before package scripts ran.
2. `65/100` Use the adjacent CLI only in ad hoc verification commands, result: local diagnosis worked but canonical launch and Playwright still retained the same failure.
3. `96/100` Resolve Node once, prefer its adjacent `node_modules/npm/bin/npm-cli.js`, and use that stable pair in launcher and Playwright process commands with a PATH fallback only when needed, result: canonical scripts work in both ordinary and managed environments.

**Current solution:** `run.ps1` centralizes npm invocation and child command construction around the active Node executable. `playwright.config.ts` uses the same adjacent-CLI preference for its build-and-preview server.

**Effectiveness:** `96/100`, durable for standard Node distributions. The fallback keeps nonstandard installations supported.

**Relevance check:** Current. Windows profile policy and multiple Node/npm installations are common launcher boundary conditions.

**Next prevention step:** Keep package-manager discovery in one launcher helper and exercise at least one canonical runner task instead of validating only direct package-manager commands.

### Q: What pitfall are we preventing?

**What:** During an atomic model replacement, a new animation clip array can briefly bind to the previous root's `AnimationMixer`, producing missing-track warnings and applying playback intent to the wrong scene.

**Context and constraints:** The viewport deliberately keeps root attachment in a narrow effect so scrub/time updates do not tear down the renderer. React runs effects in declaration order, and root, clips, selected clip, time, pause, and speed can all change in one async load commit.

**Why it happened:** The clip-selection effect appeared before the root-attachment effect. On a replacement render it saw the old mixer and new clips, called `clipAction`, then the later effect disposed that mixer and attached the new root. Separate pause/time effects could likewise run before the new mixer existed, leaving its initial action with default playback state.

**Where:** `source/frontend/src/components/ThreeViewport.tsx` and the export-versus-load replacement matrix in `source/frontend/tests/native.spec.ts`.

**Evidence:** The isolated stale-export/newer-load test reproducibly logged `THREE.PropertyBinding: No target node found` for `FixtureTip.quaternion` and `FixtureRoot.position` while still passing state assertions. After the fix, the same test passes with an explicit zero-warning assertion.

**How to catch it:** Run `npx playwright test tests/native.spec.ts --grep "stale native export success and error" --workers=1` and fail on missing-target `PropertyBinding` warnings, not only console errors or incorrect final UI state.

**Solutions tried:**
1. `35/100` Ignore the warning because final root/status ownership was correct, result: a real transient binding defect remained hidden by end-state assertions.
2. `60/100` Add the new root to the clip effect dependencies, result: the effect still runs before attachment and cannot initialize a mixer that does not exist yet.
3. `98/100` Require `mixer.getRoot()` to match the rendered root and let the root-attachment effect initialize the selected clip, pause state, time, and speed from one current intent snapshot, result: no cross-root bind occurs and replacement starts in the declared playback state.

**Current solution:** `activateMixerClip` applies one coherent playback intent. The clip effect is root-affine and handles same-root clip edits/selections; the attachment effect creates the mixer and activates the latest intent for a replacement root.

**Decision rationale:** Root affinity is the invariant that matters. Reordering effects would be fragile, while adding playback props to the attachment dependency list would recreate and dispose the model during normal playback.

**Effectiveness:** `98/100`, durable. The regression test covers the exact async replacement ordering and preserves the narrow attachment dependency contract.

**Relevance check:** Current. Any model replacement, clip edit, or playback-state refactor crosses this coordination boundary.

**Next prevention step:** When a Three.js controller is recreated from React state, guard secondary effects by controller-owner identity and initialize the new controller from one complete current intent.

### Q: What pitfall are we preventing?

**What:** Required browser and Rust compatibility tests can report success while silently skipping their real model fixtures.

**Context and constraints:** RustSMF commits one real SMF plus small FBX, OBJ, and invalid-input fixtures. These are verification dependencies, not optional local samples. Tests must resolve them independently of the caller's working directory and must fail clearly when a required fixture disappears.

**Why it happened:** Rust test paths were written as if Cargo ran from the repository root, but `run.ps1` runs Cargo from `source/src-tauri`; every candidate therefore missed. The tests treated the miss as an allowed environment skip. The browser helper recursively searched the large archived old source and fell back to the deleted `smoke.spec.ts`, so fixture selection depended on unrelated archive contents and could also skip the invalid-input test.

**Where:** `source/src-tauri/src/main.rs`, `source/frontend/tests/helpers/smoke-helpers.ts`, `source/frontend/tests/fixtures/invalid-model.gml`, `source/frontend/tests/README.md`, `summary_bank.json`, and `run.ps1 -Task desktop-smoke`.

**Evidence:** Resolving the former Rust candidates from `source/src-tauri` returned no files. After correction, the focused Rust test prints and parses the committed sample as `model~6 rig~38 anim~12`; all 9 Rust tests pass. Playwright inventory imports the helper and lists all 54 cases with the committed invalid fixture present.

**Developer story:** The suite count and green status looked healthy because the optional branches returned normally. Checking paths from the actual command working directory exposed that no real native sample had been read. The same audit found a deleted browser fallback. Converting both owners to explicit committed fixtures removed archive traversal, made startup faster and deterministic, and turned fixture deletion into an immediate actionable error.

**How to catch it:** Run `cargo test --manifest-path source/src-tauri/Cargo.toml test_real_smf_binary_read_and_desktop_info_peek_smoke -- --nocapture` from the repository root and require a `Rust desktop peek smoke on ...mixamo_smf_baldguy.smf` line. Run `npm run test:e2e -- --list` from `source/frontend`; helper import must fail if any required browser fixture is absent.

**Solutions tried:**
1. `25/100` Search several relative sample paths and skip if none exist, result: green native tests with no real fixture execution.
2. `42/100` Recursively discover archived GML/SMF files and retain a deleted test-file fallback, result: environment-dependent coverage and unnecessary startup IO.
3. `97/100` Resolve exact committed fixtures from the browser helper location or Cargo manifest directory and fail at test registration/read time, result: deterministic coverage with explicit missing-fixture errors independent of the caller's working directory.

**Current solution:** Browser fixture constants resolve only committed files through `requireFixture`. Rust tests anchor `../frontend/tests/mixamo_smf_baldguy.smf` to `CARGO_MANIFEST_DIR` and panic with the exact resolved path/error if it is unreadable. No archive scan, current-directory dependency, or optional real-sample branch remains.

**Decision rationale:** A committed compatibility fixture is part of the test contract. Failing closed protects coverage and is cheaper than maintaining fallback discovery across unrelated historical assets.

**Effectiveness:** `97/100`, durable. The fix is small, deterministic, faster, current-directory independent, and proved through both fixture-owning runners.

**Relevance check:** Current. Any fixture move, suite split, or runner working-directory change can otherwise reintroduce false-green coverage.

**Next prevention step:** Keep required fixture paths in the focused test/context routes and rerun both fixture-owning entry points whenever tests or runners move.

### Q: What pitfall are we preventing?

**What:** A Python installation visible and executable in the operator's Windows shell can still be unavailable to the managed Codex sandbox, causing a diagnostic or skill-validation command to report that Python is missing.

**Context and constraints:** The repository's required verification lane is PowerShell, Node, npm, and Rust; Python is tooling-only for the installed skill validator. Sandbox diagnosis must remain read-only and must not hard-code a personal interpreter path, weaken permissions, persist PATH changes, or create a virtual environment as an access workaround.

**Why it happened:** The operator shell resolved user-local Python installations under `%LOCALAPPDATA%\Programs\Python`, but the managed PowerShell process had no `python` PATH candidate and could not launch those absolute executables. The sandbox checker therefore selected only `%SYSTEMROOT%\py.exe`, which returned exit code `112` with `No installed Python found!`. Host installation and managed process authority were different capabilities.

**Where:** `C:\Users\jc816\.codex\skills\sandbox-checkup\scripts\sandbox-checkup.cmd`, the managed PowerShell process, the user-local Python installations, and the Python-based `quick_validate.py` skill validator.

**Evidence:** Inside the managed process, `where.exe python` returned no match and each discovered absolute Python 3.10–3.13 executable returned `Access is denied`. The checker reported `overall_status: blocked`, `diagnosis: runtime_or_access_boundary_unresolved`, Python candidate `%SYSTEMROOT%\\py.exe`, and `python_unavailable`. Through an approved external-runtime comparison, Python 3.13.3 launched and reported its executable path. A PowerShell `quick_validate.ps1` replacement was then added for Windows, and all three updated local skills passed it inside the managed workspace. PowerShell 7, Windows PowerShell 5.1, Git, Node, npm, the native context task, and the full repository verification gate remained ready or passing.

**Developer story:** The first checker result looked like a missing Python installation. The operator then supplied four installed Python paths. Testing those same paths in the managed process separated discovery from process access: the paths existed on the host but were denied by the sandbox, while the exact bounded command succeeded outside it. Because the validator only checks small frontmatter rules, the safer durable fix was to convert that gate to PowerShell on Windows instead of changing sandbox policy. The managed validator now runs without Python; the Python implementation remains only as a portable fallback.

**How to catch it:** Run `cmd.exe /d /c "C:\\Users\\jc816\\.codex\\skills\\sandbox-checkup\\scripts\\sandbox-checkup.cmd -AsJson"`, then compare `where.exe python` and one exact absolute interpreter `--version` probe in the same managed process. If the managed probe is denied but the approved external probe succeeds, classify the result as a runtime/access boundary and keep the interpreter path process-local.

**Solutions tried:**
1. `35/100` Treat the checker message as proof that Python is not installed, result: incorrect host diagnosis and no explanation for the operator's working installations.
2. `72/100` Add a personal absolute Python path or change PATH/permissions inside the repo, result: would bypass the managed boundary, reduce reproducibility, and violate sandbox ownership.
3. `96/100` Compare the exact bounded command through the approved external runtime, keep the managed report authoritative for sandbox capability, and avoid environment mutation, result: installation, discovery, access, and repo verification remain separately classified.

**Current solution:** Use the sandbox checker to report managed capability. Use Node/PowerShell/Rust for app truth and `quick_validate.ps1` for Windows skill validation. Keep `quick_validate.py` as a portable fallback when PowerShell is unavailable. Do not commit a personal executable path, change sandbox permissions, or convert the blocked managed result into managed-runtime proof.

**Decision rationale:** The evidence identifies process authority, not a missing dependency or product defect. Converting the narrow validator to the repository's already-available PowerShell host removes the unnecessary Python dependency without weakening the sandbox boundary; retaining the Python script preserves portability for non-Windows environments.

**Effectiveness:** `98/100`, durable. The distinction is proved by the same-command comparison, and the PowerShell validator passes all current local skills in the managed workspace without PATH, permission, or venv changes. The remaining risk is that the lightweight replacement must stay aligned with the portable validator if its rule set evolves.

**Relevance check:** Current. Any Python-based skill validator, repo helper, optional model tool, or managed-vs-operator runtime comparison can encounter the same boundary.

**Next prevention step:** Keep the PowerShell and Python validators' frontmatter rules aligned, and re-run the managed PowerShell validator after any skill-schema or sandbox launcher change.

### Q: What pitfall are we preventing?

**What:** A skinned brush index can silently fall back to bind-position math when the mesh is not actually bound or its skin tuple is malformed.

**Why it happened:** The old path used an optional structural `boneTransform` cast and tests supplied a fake method, so a production mesh without that method could appear valid while painting the wrong vertices.

**Where:** `source/frontend/src/utils/skinnedVertexPosition.ts`, `skinBrushIndex.ts`, `ThreeViewport.tsx`, and their focused tests.

**How to catch it:** Require the public `SkinnedMesh.getVertexPosition` path, validate all four skin indices/weights and skeleton state, and assert that an invalid mesh returns no paint candidates plus a visible diagnostic marker.

**Current solution:** Posed world sampling fails closed; cached indexes include pose and attribute versions in their invalidation signature. Effectiveness: `97/100`, durable.

### Q: What pitfall are we preventing?

**What:** A malformed SMF can drive huge allocations, unbounded string scans, section overreads, or silent numeric wrapping before the user receives an error.

**Why it happened:** Legacy offsets/counts and DataView setters were trusted, and JavaScript setter coercion turns out-of-range numbers into plausible bytes.

**Where:** `source/frontend/src/loaders/smfBinary.ts` and `smf.ts`.

**How to catch it:** Keep limits centralized, set a reader limit for each declared section, use checked arithmetic before allocation, reject non-finite/range-invalid primitives, and test truncated, unterminated, oversized, and malformed export inputs.

**Current solution:** The worker codec enforces encoded/output, string, texture, mesh, rig, animation, and DQ budgets and preserves tangent handedness instead of discarding it. Effectiveness: `96/100`, durable.

### Q: What pitfall are we preventing?

**What:** A desktop SMF load can perform duplicate filesystem reads and present native header acceptance as if it were full codec validation.

**Why it happened:** The load hook requested a native metadata summary, then requested the same path again for the actual worker payload; the native command was named validation even though it only parsed the header envelope.

**Where:** `source/frontend/src/hooks/useLoadModel.ts`, `source/src-tauri/src/main.rs`, and the native IPC spec.

**How to catch it:** Assert exactly one `read_file_binary` call for a desktop load, no metadata call in the load path, and status text sourced from the full codec result. Label native checks as header-only.

**Current solution:** The load path reads once and delegates structural truth to the typed codec; native I/O is size-bounded and moved to blocking tasks. Effectiveness: `95/100`, durable.

### Q: What pitfall are we preventing?

**What:** A binary FBX can pass the app's Three.js re-import check while failing a real target application; selected texture sidecars can be silently discarded at the format branch; and an imported texture can trigger a renderer warning if the scene is attached before its asynchronous image load completes.

**Context and constraints:** RustSMF exports FBX 7500 from a live Three.js root and must preserve mesh topology, skin indices, animation, and material texture behavior without making Blender a runtime dependency. The browser loader and the external validator have different timing and type expectations.

**Why it happened:** The vendored writer serialized integer-valued FBX arrays as double arrays and omitted required layer `Name` nodes. Three.js accepted the bytes, but Blender 5.0.0 rejected the geometry/layer contract. Separately, the picker correctly built a bounded multi-file bundle but `useLoadModel` passed only the FBX bytes, so external textures could not resolve. Three.js `TextureLoader.load()` also returns a texture before its image is assigned; attaching the root immediately allowed WebGL to inspect an empty texture before the loader manager settled.

**Where:** `source/frontend/src/vendor/FBXExporter.js`, `source/frontend/src/loaders/fbx.ts`, `source/frontend/tests/export-formats.spec.ts`, `source/frontend/tests/fixtures/independent-fbx/validate_fixture.py`, and `docs/dev/fixtures/INDEPENDENT_FBX_PROVENANCE.md`.

**Evidence:** The first app-exported roundtrip passed the browser re-import but Blender failed with `TypeError: ufunc 'bitwise_xor'` on `PolygonVertexIndex`; after integer arrays were corrected, Blender failed on a missing layer name. The final output passed Blender 5.0.0 validation with one mesh, two bones, two weighted groups, 20 animation curves, and two packed images. The supplied Grim FBX then proved the import-side gap: after bundle forwarding, it loaded one source-referenced base-color texture with 1 mesh, 13,935 vertices, 65 bones, and one clip; its three unreferenced maps remained unused. A generated ASCII FBX/PNG browser case now owns that sidecar contract.

**Developer story:** Self-roundtrip success initially looked sufficient. A second application exposed the external wire-contract mismatch, and the failure location narrowed the fix to typed geometry/layer metadata rather than app-side conversion. A separate browser diagnostic showed that the texture warning came from the loader's intentionally early return, not from a corrupt image. The final fix keeps the exporter format stable, waits only on the loader-owned resource manager, and removes unavailable maps before render.

**How to catch it:** Run the independent FBX browser test, save its ignored app output under `source/frontend/test-results/`, and run the committed Blender validator against both the source fixture and app output. Assert no browser `ERROR` entries and no raw `WebGLRenderer: Texture marked for update but no image data found` warning. Keep the validator's material-node check so a merely packed-but-unconnected image does not count as texture proof.

**Solutions tried:**
1. `40/100` Trust Three.js re-import as the external contract, result: it missed Blender's typed-array and layer-name requirements.
2. `68/100` Suppress the WebGL warning or filter it in the test, result: it would hide an attach-before-load race and lose texture diagnostics.
3. `99/100` Emit explicit FBX integer arrays and layer names, await the isolated texture `LoadingManager`, remove unavailable maps before attach, and validate app output in Blender, result: both internal and external proof pass with a narrow runtime cost and no sandbox/toolchain dependency.

**Current solution:** `FBXExporter.js` uses a shared `int32Values` encoder for polygon, material, skin, and animation integer arrays and supplies layer names. `useLoadModel` forwards the selected bounded bundle; `loadFBX` resolves only referenced relative resources through owned object URLs, waits up to the bounded texture timeout, reports retained/skipped maps, revokes URLs, and fails safe on unavailable maps. The independent fixture, generated sidecar fixture, and validator remain test-only.

**Decision rationale:** External target validation is the only evidence that can catch a file-format dialect mismatch; suppressing a warning cannot. The manager wait is scoped to FBX parse work and preserves a usable material fallback when an external texture is genuinely unavailable.

**Effectiveness:** `99/100`, durable. The fix is covered by browser roundtrip, focused FBX units, and an independently run Blender import/texture/animation validator.

**Relevance check:** Current. Any FBX writer, loader timing change, or new external compatibility claim should preserve this two-target proof.

**Next prevention step:** Keep at least one external target validator for each new FBX contract change and do not treat a browser-only roundtrip as broad format compatibility.

### Q: What pitfall are we preventing?

**What:** A browser interaction helper can treat a temporarily removed screen-coordinate telemetry attribute as `(0, 0)`, then report a failed IK drag during a workspace transition even though the target is visible and the app is healthy.

**Why it happened:** `Number(null)` returns `0`. The helper polled only for finite numeric results while the Rig target handle effect was removing and recreating its screen telemetry after returning from another workspace. The first pointer event could therefore be sent to the canvas origin. The target handle can also be newly mounted when the first raycast arrives, so its world matrix must be current before intersection testing.

**Where:** `source/frontend/tests/helpers/viewport-interactions.ts`, `source/frontend/src/components/ThreeViewport.tsx`, and the SMF IK flow in `source/frontend/tests/rig.spec.ts`.

**Evidence:** The full browser audit first reproduced `54/55` with `dragRigIkTarget(page, 'escape')` returning false. Diagnostic output showed `target=(0,0)` while the telemetry became `(640,298)` immediately afterward. Requiring non-null attributes, updating the target handle world matrix before raycasting, and repeating the focused test five times produced `5/5`; the complete suite then passed `55/55`.

**How to catch it:** Run the IK test after switching out of and back into Rig, then run `npm.cmd run test:e2e -- --reporter=line` with the approved system-browser override. Readiness checks must reject null/empty attributes rather than coercing them to numbers.

**Solutions tried:**
1. `45/100` Treat any finite numeric conversion as ready, result: deleted DOM attributes became zero and the helper clicked the canvas origin.
2. `88/100` Add a blind delay after the workspace switch, result: it reduces but does not prove readiness and leaves the raycast transform race exposed.
3. `98/100` Require non-null finite telemetry and refresh the recreated handle's world matrix at the pointer boundary, result: repeated focused and full browser coverage pass without masking a real app failure.

**Current solution:** Browser helpers fail closed until both coordinate attributes are present and finite. `buildRigIkDragState` calls `updateWorldMatrix(true, true)` before raycasting a newly mounted target handle.

**Effectiveness:** `98/100`, durable. The test now verifies the actual target readiness contract and the runtime pointer boundary no longer depends on a prior render having updated a recreated helper object.

**Relevance check:** Current. Any new viewport telemetry, overlay handle, or workspace-owned pointer tool must distinguish absent state from numeric zero and refresh object transforms before immediate hit testing.

**Next prevention step:** Keep the repeated IK case in the focused browser audit when changing workspace-owned handles, and do not use `Number(getAttribute(...))` as a readiness predicate without an explicit null check.
