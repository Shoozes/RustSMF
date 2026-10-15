# RustSMF App State

Last reviewed: 2026-10-14

## Retarget assistance on current source

Animate > Transfer now uses shared Rust API v1 for mapping/preflight (native Tauri on desktop, actual WASM in a browser worker). Mixamo, UE4 mannequin, Unity humanoid and Rigify deform naming include side/chain context and fingers. Explicit maps remain authoritative; ambiguity and numeric rigs require review. Mapping details holds overrides, diagnostics, profile drafts and portable export of the reviewed explicit map.

The complete existing TypeScript clip solver runs in a dedicated worker on both platforms. Source selection prepares a private preview; Apply commits once through animation history. Cancel/discard, input revisions, leaving Animate and disposal reject stale results. Closing Tools may retain preview. Project saves and exports continue to use canonical clips during preview; undo/redo and continued editing retain their owners. Public setup/dev/build generate locally pinned WASM bindings. Runtime failures are visible without synchronous fallback.

`RETARGET_ASSISTANCE.md` owns API, job and proof boundaries; TODO owns ordered followups. Final sequential verify, browser (160), journeys (11), strict visuals (3), native/actual-WASM parity (17 cases) and desktop smoke passed; HISTORY binds the implementation inputs and reviewed captures. The one image-guided black-cat trial and borrowed pose reference are registered in `ASSET_PROVENANCE.md`; raw media and model drafts stay ignored and ineligible for public distribution pending rights/asset acceptance. No custom rig creation, rig replacement or automatic skinning is added. App version, release and installer remain unchanged; installed Windows evidence retains its earlier source identity.

## 0.2.1 Windows preview

Application manifests/locks remain at 0.2.1; pose-contact remains 0.1.0. HISTORY and preview notes bind the completed installed-Windows checks to their source/artifacts, including restored recovery and removed test resources. Earlier evidence remains specific to its recorded source.

Modern keeps offline More > Help, short status and visible errors/recovery. Current source uses three task tabs in each Model, Rig, Skin and Animate drawer, named icon actions and secondary disclosures. Tab switching preserves drafts; arrow keys navigate and Escape returns focus. The Skin brush card hides while Tools is open; Scene retains a compact unsaved/export-block notice. Original keeps its presentation. These menus do not change the public installer.

Focused controls own their native keys: Space activates buttons/disclosures without toggling playback, and text fields retain R/S/T input without changing viewport tools. Viewer shortcuts remain available outside those controls; chronological undo/redo keeps its existing owner.

Render smoke checks decode actual canvas pixels and exclude overlapping HTML controls. Loaded-model preview checks disable grid, axes and rig helpers; encoded file size is no longer accepted as rendering evidence. A project-generated five-bone, two-clip GLB provides the redistributable quickstart and README screenshot. Its raw geometry, influences, materials and motion are independently inspected.

Project-owned source is MIT licensed, with locked dependency notices and separately documented fixture provenance. The installed license/notices and sample matched their source hashes. The public [0.2.1 preview](https://github.com/Shoozes/RustSMF/releases/tag/v0.2.1-preview) remains bound to source `05a32fe` and its identified installer. Preview verification and platform acceptance are tracked in TODO, HISTORY and the preview notes; real Windows UI observations remain distinct from browser tests and mocked IPC. The preview is unsigned; other-platform certification remains unverified.

Source after the published preview reports recovery autosave refusal with a Save Project action, clears that warning only after a current successful autosave, and preserves unrelated errors. Native Open rejects selections without exactly one model before asking to replace dirty work; native bundle replies require one validated byte payload per selected file. Load errors give a portable model/sidecar hint. These frontend fixes retain the existing formats and app version; the released installer keeps its original acceptance record.

The prior integrity batch, published as `1831bc9`, passed desktop smoke, packaging and ten installed Windows UI/cleanup checks on 2026-10-11. HISTORY binds its source/installer and exact recovery restoration. The newer task drawers have a separate frontend gate; these menus have no new installed-Windows acceptance claim.

RustSMF is a Tauri + React + Three.js desktop/web editor for loading, inspecting, posing, animating, skinning, and exporting SMF, GLB/GLTF, FBX, DAE/Collada, and OBJ models. This document owns current behavior, architecture boundaries, format limits, and the verification contract. Forward work belongs in `TODO.md`; dated command evidence belongs in `HISTORY.md` and the latest assessment in `review.md`; recurring failure analysis belongs in `PITFALL_LEDGER.md`.

Offline retarget profiles also support bounded endpoint pose envelopes and
explicit planted-contact anchor frames. Their shared contract is documented in
`HUMANOID_POSE_REVIEW.md`. Endpoint matching does not guarantee mid-clip support
or whole-mesh clearance. Bounded swing trajectories and descendant rotation
envelopes support offline stance handoffs without changing receiving-root travel.
Receiving checks are hash- and transition-specific, not blanket motion acceptance.
Caller-owned visual and transition conditions are tracked by fight-game-study
integration evidence, not RustSMF completion requirements; completed RustSMF
proof lives in `HISTORY.md`.

Caller-owned jobs: fight-game-study stores wolf mappings, selected clips, cast
endpoints and visual-acceptance decisions. RustSMF does not own those results.
A mechanism request must name the input/output contract and a bounded proving
fixture that does not require Fighter Lab metadata or a combat runtime.

## Product Contract

Frontend coverage is mapped to executable positive and protection/continuity
checks in `source/frontend/tests/README.md`. Eleven sequential stories cover
the core workflows and profile, Rig, IK/animation, Skin and Model/material
authoring. Modern supporting controls have larger targets and keyboard bone/
clip selection; Original retains its visual baseline. Rig history reconciles
metadata for created, renamed and deleted bones. FBX export converts working-
space colors to sRGB and preserves emissive intensity. Project/profile formats
and fidelity limits are unchanged; dated final proof belongs in `HISTORY.md`.

### Launch and model lifecycle

- `run.bat` / `run.ps1` own the Windows menu and installed development launch (`-Task run`). Cleanup targets only this checkout's normalized Node script paths, preserving unrelated servers. Setup propagates Rust failure; Vite resolves hoisted or frontend-local packages.
- File input, drop and native picking support SMF, GLB/GLTF, FBX, DAE/Collada and OBJ. A bounded bundle resolves selected relative buffers, images and MTL files. Missing, ambiguous, oversized or malformed resources fail before model replacement. Tracked external-GLTF fixtures prove exact sidecar hashes and contained relative URIs.
- All model inputs have a 256 MiB limit, checked before browser reads and again before parsing. Native byte payloads accept ArrayBuffer, Uint8Array or validated byte arrays. Rust opens authorized canonical regular files and bounds both reported and observed sizes against replacement/growth races. Selected bundles also retain a 256 MiB aggregate limit while reading, with each file constrained by the remaining observed byte budget. Unreadable selections report an Open error.
- A replacement requested while pose, animation, skin, rig, editor, or Outliner history is dirty opens an accessible Cancel/Discard decision. File bytes are not materialized until the decision is made; Cancel preserves the current root, selection, dirty flags, and status, while Discard permits one replacement. Parse failure or stale completion keeps the previous model mounted.
- Open, append, repair, export and save share latest-intent ownership. Transfer has a separate captured-authoring-revision job owner and is invalidated by target replacement. New operations reject stale UI completions and dispose stale resources; failures preserve the mounted model and dirty authoring state.
- SMF import/export uses a typed Web Worker with owned transferable buffers, nested payload validation, monotonic progress, cancellation, a 120-second timeout, and explicit termination. The client rechecks an abort signal after worker handlers are installed and before `postMessage`, so setup-time cancellation cannot publish or leave a task running. The codec bounds encoded input/output to 256 MiB, decoded allocation estimates to 512 MiB, section reads to declared offsets, strings to 4,095 bytes, and allocation-driving texture/mesh/rig/animation counts; non-finite numeric values and invalid byte ranges fail closed. Synchronous fallback is limited to worker construction or initial `postMessage` failure; runtime worker errors surface instead of repeating work on the UI thread.
- Foreground save operations are globally single-flight and freshness-checked. A foreground request reserves its turn and awaits an active autosave instead of requiring another click. Autosave keeps at most the newest trailing request while a write is active, so slow writes cannot overlap or lose the latest edit. A successful model replacement invalidates queued old-model work and waits for any issued autosave write before swapping roots; canceled or failed pickers leave recovery work intact. User cancellation is distinct from failure. Save Project writes a versioned `.rsproj` envelope containing a validated GLB snapshot plus bounded workspace state, and reopening preserves the supported source format, including DAE, for source-aware editing and export policy; all native writes share one async serialization owner, stage and sync complete bytes before replacement, preserve the prior destination on install failure, and rotate bounded project generations. Browser fallback uses local storage/download, and native recovery discovery/read accepts only the owned target plus `.bak1` and `.bak2` regular files.

### Viewport and themes

- The viewport owns one Three.js renderer, scene, animation mixer, requestAnimationFrame loop, resize observer, input listeners, model attachment, and resource disposal lifecycle.
- Hovering a pickable bone uses one viewport-owned high-contrast marker and camera-facing name badge, clears on pointer leave, and mirrors the active source ID in canvas telemetry/title text. Persistent bone-name tags are opt-in in Modern, strip common Mixamo rig prefixes for display, and size from the loaded model bounds instead of fixed world units. The exact known 24-bone SMF humanoid layout receives fail-closed Mixamo-minimal display aliases; unknown indexed rigs keep source names only, and aliases never rewrite export-owned IDs.
- Modern gives the model the full window beneath one compact command strip. Open, Save, Undo/Redo and Export use named icons; one workspace chooser replaces the five persistent tabs. Tools opens the single Scene/Properties drawer, closed by default at every size. Narrow layouts move Redo into More. Recovery, explicit exports, backend status and appearance remain in a compact More list. The empty view has a short drop/open hint and a Ready status. Skin uses four tool icons and a small Size/Strength strip; history stays in the common toolbar and Tools opens its detailed controls.
- The previous Calm Modern shell cut and the 2026-09-25 v0.2 productization pass are complete. Modern owns a Modern-only Lumen Alloy palette in `styles/themes/modern.css`: graphite surfaces, off-white text, and restrained brass accents with flat surfaces. Shared `index.css` owns layout and behavior, not theme palette values; Original palette selectors remain explicitly scoped in `styles/themes/original.css`. Three.js colors used for semantic rig state, selection, and diagnostics are semantic render colors rather than UI palette tokens.
- Modern defaults to a single perspective pane and shows the full Timeline only in Animate. Original SMF defaults to quad view before model load and after restoration. Layout controls remain disabled until a model is loaded.
- Quad view exposes Top, 3D, Front, and Side panes. Perspective and orthographic panes retain their own direction/zoom while sharing one world-space focus target. Right-dragging any pane moves that target for every view; reset refits the loaded model center, distance, clip planes, orbit limits, and orthographic extent from finite authored bounds without changing root scale or skin binds. Perspective wheel zoom is ratio-based, so tiny and huge assets receive equivalent navigation. Ordinary skinned meshes use exact posed bounds; very large skinned meshes use a conservative bone-transform bound above 100,000 vertices to keep load-time fitting bounded.
- Pane hit-testing uses CSS coordinates, half-open internal boundaries, inclusive outer edges, and remains stable with fractional/high-DPI layout values. Resize and display-change handling refreshes renderer pixel ratio from the current display and caps it at 2, keeping the CSS and backing dimensions aligned without unbounded GPU cost.
- Modern and Original SMF share one editor state. The persisted theme registry rejects stale values and treats storage failure as non-blocking. Modern viewport and grid colors use neutral graphite/brass values; the Original viewport background and camera-plane grid remain separately defined in `theme.ts`.
- Original SMF restores the compact old-editor frame: narrow Settings and Submodels shelves, two-row top strip, numbered red mode tabs, dense square controls, dark quad viewports, camera-aligned grids, legacy framing, and the Animation-only upper keyframe strip. The keyframe lane retains current scrub, insert, selection, drag, and playback behavior.
- The Submodels shelf renders bounded previews from source base-color maps, including raw SMF `DataTexture` pixels. Material color remains the fallback for untextured or unsupported sources.
- Narrow layouts keep the workspace chooser and viewport Display menu reachable without horizontal overflow or covered pane labels. Menus close on outside pointer input or Escape, and return focus on Escape. Display includes separate Rig fade and Hide rig/Show rig controls; hiding helpers sets their opacity to zero for shaded-mesh inspection and never changes source geometry, skin data, animation or export bytes. Rig-helper thickness and joint size derive from measured world-space bone spacing, with model-bounds fallback for degenerate links, so small-unit imports keep proportional overlays.

### Authoring workspaces

- Model/View: the Outliner derives groups and meshes from the mounted root, supports row and viewport selection, multi-select, bulk visibility actions, source texture thumbnails, viewport-only selection overlays, and chronological undo/redo. A single compatible non-SMF submodel can be renamed through a binding-safe, root-unique metadata action, moved earlier/later among eligible siblings without reparenting or disturbing non-Outliner children, duplicated/deleted when its subtree is static and unanimated, appended from a self-contained static asset, transformed, assigned a loaded material, have winding reversed, or receive safe normals/tangents preparation. Surface edits and append are guarded by source/skinned/animated checks and use the same history contract; an async append commits only if the primary model that started it is still mounted, otherwise the loaded subtree is disposed. Repair materials accepts one OBJ/MTL/JPEG-or-PNG reference bundle, requires a unique name/geometry match, assigns PBR base-color/normal/metallic-roughness maps, proves geometry/skin/rig/clip preservation, and commits as one undoable editor transaction. Ambiguous, stale, or partially loaded repair attempts fail without mutation and dispose every temporary material and texture. Source-SMF names/order and unsupported targets fail closed rather than breaking persistence or bindings. Geometry/UV/material/handedness diagnostics and rest-pose ghost/trail/onion overlays are read-only and excluded from export. GLB export/re-import preserves successful scene-object authoring.
- Rig: entering the workspace stops viewport animation evaluation and restores the underlying rest/base pose before rig tools take ownership; returning to Animate reactivates the selected clip at the controlled time. Validation covers skeleton presence, duplicate names, orphan/cyclic hierarchy, skin tuple shape, and invalid skin indices. Non-SMF rigs support rename, reparent, child creation, move, rotate, detach/connect, 90-degree spin, and deletion of unweighted non-root branches with full snapshot undo/redo. Static non-SMF roots (for example mesh-only FBX/OBJ) can use Prepare root skeleton to promote meshes into one shared root-bound SkinnedMesh set so child bones, weight painting, and compatible SMF conversion become available. Preparation preflights every mesh before mutation, rejects existing skinned geometry, allocates a collision-free root name, binds each transformed mesh in its own world space, records one reversible rig-history transaction, and participates in dirty replacement protection.
- SMF Rig policy is explicit: position/rotation pose edits and inverse-bind local reset are supported; compact quick-pose controls rotate the selected joint by positive or negative X, Y, or Z increments. Scale export, rename persistence, structural detach/connect, and mirror remain unavailable when the format cannot preserve them.
- Endpoint and bounded CCD IK are explicit Rig tools with exclusive pointer ownership, cancel restoration, and one history transaction per completed gesture. Rig metadata persists primary axis, lock, and pin state in standalone `.rig.json` files and project envelopes. Locked/pinned joints remain unchanged during solve; explicit Solve & bake IK keys creates one animation history transaction and honors clip locks. IK remains pose-only until that command is chosen; it does not silently create animation keys.
- Skin: the default Rest / Bind mode stops viewport animation evaluation and restores the underlying rest/base pose. Explicit Frozen Current evaluates the selected animation at the controlled time and pauses it; Live Animation honors playback. Modern enters a real Pick tool with Paint, Erase, and Smooth actions on a narrow canvas rail. Picking a viewport or Inspector bone immediately hands control to Paint; P/E/S/Q and bracket shortcuts keep the brush loop keyboard-reachable, and the brush strip owns friendly bone naming, size/strength and dirty state. Common history stays in the toolbar; Tools opens detailed Skin controls. Original SMF keeps the full legacy panel. The shared engine supports set/add/subtract/smooth/auto modes, vertex/triangle targets, bounded spatial candidate indexes, configurable Auto Skin algorithms, normalize, pointer cancel, undo/redo, and supported SMF export. Smooth averages current influences across the bounded brush region and blends each vertex toward that result using brush strength; unlike Auto, it does not recompute weights from bone distance and does not require a selected bone. Each stroke indexes the current skinned meshes once rather than traversing the scene for every candidate. Set mode separates Target weight (0–1) from brush flow and falloff; flow blends toward the target while Add/Subtract retain incremental behavior. Advanced reports raw four-slot influence diagnostics for the hovered vertex, including source-safe bone names, finite sums, unweighted vertices, invalid references, invalid weights, and stable issue codes. Paint sampling also offers Frozen Current and Live Animation: Frozen Current captures the evaluated bone matrices until the mode changes, while Live follows the mixer with a visible safety warning. Pose activation, frame updates, scrubbing, root attachment, and telemetry use the same workspace policy. The selected paint-pose mode and live-warning marker are mirrored in viewport telemetry and reapplied across Skin-mode transitions; imperative cleanup removes only transient brush state. Show Vertices exposes depth-tested, screen-space-stable mini nodes colored by the selected bone's current weight. In Skin mode, a visible mini node resolves through a validated point-to-source-vertex contract and becomes an exact paint target with a larger precision hit area; malformed or stale skin data is ignored instead of falling back to a world-origin brush. Normal surface brushing remains the fallback for broad strokes. The overlay follows posed skinned vertices, skips unchanged-pose resampling, and invalidates on pose, geometry, or skin-attribute changes.
- Skin weight preview uses a non-destructive Three.js vertex-color heat map for the selected bone and restores the original color attribute plus each material's prior `vertexColors` mode when disabled. The legacy four-slot shader and paint-transport references remain documented in `docs/dev/old_editor_source_map.md`; exact legacy texture modulation is not required for the current export-safe display path.
- Diagnostics and display: Export/Model diagnostics report finite per-mesh vertex, normal, tangent, UV, material, submodel, and world-handedness state plus WebGL shader capability notes. Rest-pose ghost, current-to-rest trails, and onion-skin overlays are viewport-owned disposable helpers; toggling them never changes source geometry, animation data, or export bytes.
- Animate: clip creation, rename/duplicate/delete/reorder, bounded duration set/extension, retime, finite trim with sampled boundary keys, loop/sample metadata, playback, scrub, Bone/Branch/Full Rig key insert/update/delete/move/copy/paste, marker drag, snap, interpolation metadata, locked-bone state, and undo/redo update the runtime clips and supported SMF export candidate. Named-bone FBX/DAE/GLB/GLTF clips can be retargeted through canonical/alias mapping and appended in one undoable transaction. A collapsed saved-profile surface also imports a complete v2 game-ready job or portable `rustsmf.retarget-profile.v1` document, validates and edits its JSON, exports through the existing save boundary, and reapplies explicit maps and clip options through the same retarget core. Standalone profiles never retain or open a source-model path; source files are selected when applying them, and the app-owned draft survives Animate-panel unmounts. Opaque numeric rigs otherwise fail closed rather than guessing. The shared retargeter samples unmapped helper ancestors into mapped world motion, transfers rest-relative limb direction changes, can use scoped absolute source directions for action peaks whose source and target idle limbs differ, anchor source/target reference clips, preserve target terminal or explicitly listed rotations across incompatible local axes, and apply a bounded trusted-peak recovery envelope. Optional natural-motion conditioning distributes torso motion by target segment length, solves target-length two-bone legs, locks calibrated sole points during declared contact frames, applies receiving-root travel, and bounds proportion-sensitive swing directions and minimum knee bend per named clip; contact weight fades those limits out at planted feet. Fixed-rate output retains float32 source-frame evaluation while clamping a partial terminal sample to the clip duration. Rig compatibility reports normalized mapped-segment ratios because correct side/axis mapping does not make different bone lengths, rest frames, or skin weights motion-equivalent. Editable duration fields use stable up-to-three-decimal display formatting, so floating-point representation noise is not shown without changing stored duration precision or edit semantics. Scope operations resolve from the selected hierarchy, use one animation-edit history transaction, union their timeline markers, and reject clipboard fingerprints or target scopes that do not match without mutation. Trim retains source keys in the inclusive range and samples both boundaries; authored keys are shifted by the trim start. Locked channels are immutable: scoped key edits, viewport keying, retime, and trim fail closed when they would rewrite a locked track, while lock/unlock itself is one history transaction. New clips can be created from the canonical load-time rest pose or the current local bone pose, including models that load with zero source clips; creation is one animation-workspace history transaction and emits position/quaternion keys for every named skeleton bone. New animation creation fails closed when the skeleton is missing, unnamed, or has duplicate bone names rather than emitting ambiguous tracks. The mixer clock remains imperative in the viewport; the parent timeline publishes a bounded 50 ms display cadence and flushes immediately for scrub/clip/pause commands.
- App-level Undo/Redo selects the newest editor, Skin, or Outliner transaction by shared chronology rather than the currently visible workspace.
- Editor history is capped at 100 entries and 64 MiB across undo/redo; skin history is capped at 50 entries and 32 MiB per direction. When an oldest entry is evicted, the status surface explains the bounded-history decision while the current edit remains applied.
- Workspace, layout, and camera-mode changes preserve the mounted model, selection, paused time, dirty state, export status, and exclusive Select/Endpoint/IK ownership.

### Calibrated motion diagnostics

Natural torso distribution isolates articulation from inherited pelvis motion
and preserves head counter-rotation. Direction limits handle upward and
antipodal directions.

Saved natural-motion profiles accept explicit `reachTransfer: "calibrated-bend"`.
This maps flexion through both reference bends using target segment lengths,
preventing distance-ratio saturation at full extension. Omission retains
`reference-ratio` behavior. Degenerate source reference bends fail calibration.
Frontend and CLI share this parser/solver. Profiles also support explicit
`replaceClips`, `extractRootMotionBone` and per-source `clipVisualTiming`.
Replacement retains reference inputs and untouched clips; the frontend clears
replaced overlays in one undoable transaction and rejects locked channels.
Optional positive finite `rootMotionScale` fixes the calibrated translation
multiplier when mappings change; omission retains automatic mapped-height scaling.
It conflicts with `scaleRootMotion: false`. Optional `directionAlignmentBones`
restricts direction constraints to named eligible target bones without disabling
rotation transfer on other mapped bones. Names must be unique and non-empty;
unknown/unconstrained bones, disabled alignment and conflicting direction-transfer
lists fail explicitly. The shared job/profile path owns both controls.
Natural profiles can retain animated leg twist/knee planes and declare per-clip
`grounding` (strideScale, rootHeightOffset, groundHeight). Shared pelvis correction
iterates across both contact constraints within the configured bound; residual
unreachable contacts remain explicit. Contact, cadence and appearance still need review.

The comparison manifest supports optional per-model `clipMap` role-to-source
names; receipts include the resolved name and still enforce equal durations.
Different idle poses are not automatically equivalent calibration references.
The game-led source probes and all local generated jobs remain outside tracked
application sources. Brawl rest-reference motion is selected; caller-owned Wolf
appearance and changing-speed contact acceptance remain outside RustSMF ownership
and are tracked only by the consumer's integration evidence.

Optional calibrated angular review reports or rejects final retarget output through
the shared profile/core contract. Its standalone embedded-GLB scanner and limits
are documented in [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md). Passing ranges
does not establish skin, contact or visual acceptance. Contact `positionMode: plane`
follows the horizontal trajectory at ground height; omitted mode locks a planted
point. Optional contact `orientationMode: animated-heading` levels the sole while
preserving foot yaw: a plant captures its entry heading and a plane follows it.
The default reference orientation remains unchanged. Degenerate heading extraction
retains the previous valid heading with reference fallback. Explicit visual-timing
landmarks map integer output frames to source phases before float32 source sampling;
direct-source and next-down output-key policies remain separate.
Contacts accept `blendInFrames`/`blendOutFrames` overrides of `blendFrames`.
Terminal planted `wrapToStart` reuses one same-foot opening pin with matching
orientation and full-weight endpoints, including declared root travel.
Opt-in `localReferenceCorrections` maps bone names to unit-quaternion `from`/`to`
pairs. A constant local offset preserves animated deltas before range review;
corrections to solved ankles or their ancestors fail closed. Defaults are unchanged.
Normalized jobs replay with `targetChainCurls: []` as an explicit no-op.
Per-clip `clipJointConstraints` optionally redistributes a named neck/head pair
within calibrated ranges before contact solving; residual head-orientation error
remains explicit. See HUMANOID_POSE_REVIEW.md for the bounded schema.

### Export and validation

- Source-aware Export preserves the high-fidelity SMF path for SMF sources and uses FBX for FBX sources. Explicit GLB, FBX, and SMF actions remain available where valid.
- SMF export preserves imported node/head structure, deform-order skin indices, finite normalized dual quaternions, normalized tangent handedness, position/rotation pose edits, supported animation edits/metadata, and dirty skin weights. Attribute shape, counts, times, strings, ranges, output size, section arithmetic, relational rig/animation/skin references, and finite numeric payloads are checked by the shared semantic validator before serialization; malformed data is rejected rather than wrapped.
- Non-SMF-to-SMF conversion uses one explicit boundary: mesh attributes are baked once into model-root Three space, the serializer owns the single Three-to-SMF vector conversion, bones are captured as root-relative world DQs, and clips are sampled through a Three mixer. The app-facing SMF action and roundtrip check remain enabled for compatible skinned GLB/FBX sources and prepared static FBX/OBJ roots; unprepared static roots, scale tracks, incomplete skin data, and malformed geometry remain blocked by diagnostics.
- GLB export reparses bytes and checks finite transforms/tracks and representative rig/clip preservation. Repeated cycles retain node topology and valid authored unit skin weights; malformed weights retain normalization. Matrix-only animated transforms fail closed.
- The local `game-ready` JSON CLI composes strict OBJ/MTL material repair, explicit rig mapping, optional clip retargeting and natural-motion conditioning, normalized rig-proportion reporting, PNG texture embedding (including packed metallic/roughness channels), final GLB re-import, embedded-image checks, requested 60 Hz STEP timing checks, and five finite deformation samples per clip. Its strict v2 parser rejects unknown fields, duplicate/input-overwriting paths, empty explicit clip selections, invalid contact/leg-limit ranges, natural-motion settings for unselected clips, unknown attachment roles, and unsafe generation/current-pointer layouts. React and CLI callers share one profile-to-retarget-options mapper instead of duplicating clip policy. Each regular input file is read from one handle in bounded chunks under the remaining aggregate budget. The command publishes one immutable, content-addressed generation containing `model.glb`, normalized `job.json`, resolved `mapping.json`, `report.json`, and a last-written hash manifest; a directory rename is the visibility boundary and an optional direct-child current pointer is replaced only afterward. Producer identity hashes the executable local dependency list and package manifests in addition to the Git revision/working-tree state, so a changed helper cannot silently retain an old generation identity. Resampling evaluates source frames at their float32 representation while requested output keys use float32 next-down timing for frame-indexed consumers. A global relative/absolute direction-transfer default can replace repetitive per-clip declarations, with clip overrides retained for exceptions. Caller-supplied attachment maps may be partial so small non-humanoid rigs do not need fabricated hand/foot roles, while explicitly supplied missing override names still fail closed. The neutral two-motion saved-job proof runs the actual CLI, re-imports the published GLB, checks sampled transforms/timing, raw skin values, decoded material content, and provenance, and preserves the prior generation and caller inputs for malformed mapping, missing clips, and interrupted publication. The same proof runs from a clean copied temporary Git tool workspace with no consumer-repository siblings; the production dependency guard rejects undeclared game/engine checkout references. No server, window automation, game-repository write, or remote publication is part of the command.
- The opt-in `rustsmf.game-ready-job.v3` contract preserves existing FBX/GLB materials without OBJ/MTL repair. GLB targets must be self-contained; FBX callers explicitly select bounded sidecars, which are resolved only when referenced by the model. Unsupported texture slots, unavailable images, removed FBX texture maps, incomplete mesh material assignments, or material/texture loss during GLB export fail closed. V2 strict-auto repair behavior and its normalized report remain intact. SIGINT/SIGTERM cancellation is honored between bounded input reads and before publication; once the atomic generation rename begins, it finishes, while earlier cancellation removes staging and preserves the current generation pointer.
- The CLI's Node Three runtime honors requested PNG/JPEG canvas MIME with matching payload signatures and rejects unsupported formats. Shared image preflight checks signature and dimensions before allocation, limiting each image to 8192 pixels per edge and 16,777,216 pixels (64 MiB decoded RGBA); aggregate decoded images and canvas pixel allocations each have a 256 MiB budget, and JPEG decoding is capped at 128 MiB. Embedded GLB validation decodes image payloads, verifies buffer and material texture references, and permits only up to three zero alignment bytes after PNG IEND.
- FBX import receives the selected resource bundle instead of discarding sidecars, resolves only source-referenced relative textures through the bounded URL registry, waits concurrently on loader-manager and image readiness under one bounded timeout, reports retained texture count, and revokes temporary URLs after readiness. Additional selected maps are not inferred into unreferenced material slots. GLB, FBX, and OBJ share one geometry-attribute preparation contract: missing preview UVs/normals are filled safely, while tangents are computed only for valid indexed triangles with compatible source UVs. Geometry still mounts for a lone FBX when embedded or external absolute textures cannot be resolved; unavailable maps are removed before render and reported as skipped. Export writes binary FBX 7500 through the vendored MIT `FBXExporter-threejs`, emits typed index/layer arrays, then reparses the bytes and checks representative mesh, skin, bone, clip, and animation endpoint structure before save.
- Display-only material, opacity, sampler, legacy-lighting, and weight-color previews are restored for the entire asynchronous GLB/FBX exporter call and reapplied only if the same root remains mounted.
- Export workspace copy states texture behavior per format. GLB is the preferred high-fidelity output for static models, materials/textures, morphs, object tracks, multiple skeletons, and scale animation.

## Architecture Ownership

| Owner | Responsibility |
| --- | --- |
| `src/App.tsx` | Workspace composition, theme/layout policy, shared UI chronology, and component wiring. |
| `src/components/Toolbar.tsx`, `ViewportControls.tsx` | Shared command semantics with separate Modern/Original chrome plus reusable viewport controls for the Modern overlay and Original toolbar. |
| `src/components/ModernSkinWorkspace.tsx`, `SkinPanel.tsx` | Modern direct-paint rail/context card and shared advanced/Original Skin controls. The simple surface uses friendly aliases; exact source identities and diagnostics remain in Advanced. |
| `src/hooks/useLoadModel.ts` | Load/export intent integration, editor state coordination, save serialization, and the stable app-facing contract. Animation actions are delegated to `src/utils/animationAuthoringController.ts`; lazy native-client ownership is delegated to `src/backend-client/lazyClient.ts`. |
| `src/backend-client/lazyClient.ts` | Shared in-flight lazy native-client initialization with rejection reset so overlapping app actions share one complete adapter and later actions can retry. |
| `src/hooks/useSmfCodecTask.ts` | SMF worker task lifecycle, progress, abort, timeout, and startup fallback. |
| `src/hooks/smfExportCandidate.ts` | One pure authority for pose, animation, metadata, and live-skin application before SMF export. |
| `src/components/ThreeViewport.tsx` | Renderer/mixer/root lifecycle and imperative viewport interaction ownership. Display/material mutation is delegated to `src/utils/viewportDisplayController.ts`. |
| `src/utils/viewportLayout.ts` | Finite model bounds, proportional fit/clipping/orbit policy, viewport specs, pane hit math, fixed-camera focus, and ortho pan conversion. |
| `src/utils/animationFrame.ts` | Shared pending-RAF cancellation guard used by the mount-owned viewport loop and resize callback. |
| `src/utils/themeViewportGrid.ts` | Theme grid construction, pane visibility, and disposal. |
| `src/utils/materialPreview.ts` | Source-versus-preview material boundary for async exporters. |
| `src/utils/modelAuthoring.ts` | ID-only Outliner metadata/order snapshots plus guarded non-SMF rename, same-parent reorder, static duplicate/delete policy, and current-root ownership for async static append. |
| `src/utils/modelSurfaceAuthoring.ts` | Guarded static append surface operations: transforms, named material assignment, winding reversal, and geometry-attribute preparation. |
| `src/utils/materialRepair.ts`, `glbContainer.ts`, `imagePayload.ts` | Strict reference-material matching, failure-safe resource preparation, and bounded MIME-aware embedded-GLB texture/timing checks. |
| `src/utils/rigMapping.ts`, `rigCompatibility.ts`, `animationRetarget.ts`, `naturalRetarget.ts` | Explicit rig mapping, normalized rest-proportion comparison, rest/reference-relative clip transfer, and pure target-length/contact/leg-limit policy. |
| `src/utils/retargetProfile.ts`, `retargetReference.ts`, `src/components/RetargetProfileControls.tsx` | Strict path-free profiles, local rotation calibration, and import/edit/export/reapply. |
| `src/utils/gameReadyJob.ts`, `gameReadyValidation.ts` | Pure v2 job-schema validation and sampled skin/rig/clip/deformation checks. |
| `src/utils/gameReadyGeneration.ts`, `scripts/game-ready-producer.ts` | Canonical producer/input binding, executable-dependency source identity, immutable generation publication, manifest hashing, and current-pointer replacement. |
| `scripts/game-ready-cli.ts`, `node-three-runtime.ts`, `bounded-file-read.ts`, `scripts/check-game-ready-dependencies.mjs`, `src/utils/gameReadyCli.test.ts` | Same-handle bounded local input, MIME-correct Node image/canvas behavior, end-to-end job composition, normalized mapping/report generation, neutral CLI proof, and the guard against undeclared game/engine checkout dependencies. |
| `src/utils/fittedRigTiming.ts`, `fittedRigVerification.ts`, `scripts/fit-rig-preview.ts` | Exact grid-plus-terminal timing, strict all-clip vertex equivalence, and hash-bound three-state comparison evidence. |
| `src/utils/modelResourceBundle.ts` | Bounded, normalized multi-file model resources, URI resolution, object-URL ownership, missing/ambiguous/traversal guards, and cleanup. |
| `src/utils/projectCodec.ts` | Versioned bounded `.rsproj` envelope encode/decode for GLB asset bytes and validated workspace state. |
| `src/utils/rigMetadata.ts` | Versioned per-bone axis/lock/pin metadata normalization and standalone/project serialization. |
| `src/utils/geometryDiagnostics.ts` | Read-only per-mesh geometry/material/handedness and shader-capability reports. |
| `src/utils/poseOverlay.ts` | Pure rest-skeleton, motion-trail, and onion-skin segment construction for viewport-only display. |
| `src/utils/weightPreview.ts` | Selected-bone weight-color preview with original geometry/material restoration and no export-material mutation. |
| `src/utils/viewportDisplayController.ts` | Viewport texture/opacity preview, legacy SMF lighting substitution, source assignment restoration, and display cleanup. |
| `src/utils/boneAliases.ts`, `boneLabels.ts`, `workspacePlayback.ts` | Fail-closed humanoid display aliases, model-relative optional 3D bone labels, and the Rig/rest-Skin and explicit frozen/live-Skin playback boundary; source bone names remain authoritative for selection, animation tracks, and export. |
| `src/utils/animationEdits.ts`, `rigEdits.ts`, `rigIk.ts`, `skinWeights.ts`, `skinDiagnostics.ts` | Pure authoring policy, transformations, and raw skin diagnostics with focused unit coverage; animation edits include scoped key operations, clipboard guards, finite boundary-sampled trim, locked-channel protection, and bounded duration/retime transforms; skin weights own regional smoothing, indexed branch lookup, and keyed history comparisons. |
| `src/utils/skinnedVertexPosition.ts`, `src/utils/skinBrushIndex.ts` | Shared world-position and spatial-index contracts for Live, Frozen Current, and Rest / Bind skin-paint sampling; malformed skin data fails closed before brush mutation. |
| `src/utils/animationAuthoringContext.ts` | Pure selected-bone and active-clip guards shared by animation authoring callbacks and focused tests. |
| `src/utils/animationCreation.ts` | Rest/current pose capture, bounded new-clip duration normalization, unique-bone validation, and complete position/quaternion track construction. |
| `src/utils/animationScope.ts` | Bone/Branch/Full Rig resolution and skeleton fingerprints for scoped key authoring and clipboard validation. |
| `src/utils/animationAuthoringController.ts` | Clip creation/CRUD, metadata, trim/retime, locked-bone policy, selected-bone key editing, snap, and animation-history action contract used by `useLoadModel`. |
| `src/utils/skinPointOverlay.ts` | Viewport-only sampled skin-point construction, validated point-to-source-vertex resolution, cached posed-vertex refresh/invalidation, and disposal; runtime source links stay outside serializable `userData`. |
| `src/utils/staticMeshSkinPrep.ts` | Reversible promotion of static meshes to one root-bound skeleton, including original skin-attribute restoration for undo/redo. |
| `src/loaders/geometryAttributes.ts` | Shared preview-safe UV/normal preparation and guarded indexed-tangent generation for GLB, FBX, and OBJ loaders. |
| `src/loaders/*` | SMF/GLB/FBX/DAE/OBJ parsing, conversion, diagnostics, coordinate/DQ math, and validated export. |
| `src/loaders/smfSemantics.ts` | Shared relational and finite-value validation for parsed, worker-fallback, and serialized `ImportedSmf` payloads. |
| `src/workers/*` | Runtime-validated SMF worker protocol, client, and worker entry. |
| `src/backend-client/tauri.ts`, `binaryPayload.ts` | Guarded native dialog/read/write adapters, strict native byte normalization, browser fallbacks, and one shared lazy-client initialization promise for concurrent callers. |
| `source/src-tauri/src/main.rs` | Tauri commands and native file ownership. Rust owns dialogs, authorized multi-file reads, selected-path authority, non-regular-path rejection, bounded byte payloads, globally serialized blocking writes, staged export replacement, rotating project generations, and the exact recovery-name allowlist. Full SMF structure remains owned by the TypeScript worker codec. |
| `source/frontend/tests/*` | Domain-owned browser suites and committed deterministic fixtures. |

`useLoadModel.ts` and `ThreeViewport.tsx` remain deliberate integration owners for load/export and renderer lifecycle. Animation actions and display/material mutations now have explicit leaf-controller contracts; future extractions still require independent inputs, tests, and one disposal owner.

## Verification

Primary commands from the repository root:

- `pwsh -NoProfile -File .\run.ps1 -Task context`
- `pwsh -NoProfile -File .\run.ps1 -Task verify`
- `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye`
- `pwsh -NoProfile -File .\run.ps1 -Task test:journey`
- `pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict`
- `pwsh -NoProfile -File .\run.ps1 -Task desktop-smoke`
- `pwsh -NoProfile -File .\run.ps1 -Task package:windows`
- `npm.cmd run verify` from `source` (application/workspace gate)
- `npm audit --omit=optional` from `source`
- `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` from `source/src-tauri`

`run.ps1 -Task context` and `run.ps1 -Task verify` also run the project-integrity guard, which checks durable-doc presence, explicit active TODO contracts, portable current-doc references, research-note review status, relative frontend imports/re-exports, Rust module declarations, `PL-001`–`PL-062` Guard file existence, Modern palette ownership, explicitly scoped Original selectors, and frontend/Cargo/Tauri version equality. The Modern CSS palette check applies to UI chrome. Semantic Three.js colors for selection, rig state, and diagnostic overlays remain role-specific render colors and are not palette tokens. The `source` workspace `npm.cmd run verify` owns the application checks, including lint coverage, ESLint, app/test typechecks, the production-`any` guard, the game-ready production dependency guard, production build, entry-chunk guards, frontend units, and Rust fmt/clippy/tests/check. The launcher adds context-bank, project-integrity, dev-process, and main-synchronization checks around that workspace gate. The entry-chunk guard requires the Tauri bridge to remain a dynamic browser import in addition to preserving Three.js and model-worker boundaries. Playwright runs against one production Vite preview server. Optional GenEye wrapping uses project-owned argv manifests and a pinned local CLI entry instead of shell command text; `-NoGenEye` remains the independent browser-only gate. The default browser gate excludes recorded journeys; `test:journey` runs eleven sequential stories across ten journey files, including the retained hand-wave capture. Strict screenshots are opt-in. `desktop-smoke` runs an unbundled Tauri build, all Rust tests, and native IPC browser coverage; actual Windows dialog evidence is recorded separately. `package:windows` builds the NSIS installer and prints its absolute path and SHA-256.

When the bundled Playwright Chromium executable is rejected by a managed Windows process boundary, set `RUSTSMF_PLAYWRIGHT_EXECUTABLE` to an approved existing absolute Chrome/Edge executable for that process only. The config validates the path and does not persist or weaken the app sandbox/CSP.

Private maintainer synchronization uses ignored local `.tools/gitpull.ps1` and `.tools/gitpush.ps1` after workspace review. The scripts require the configured `origin` and `main`, refuse active Git operations and unsafe token state, never create/rewrite remotes or force-sync, and verify final local/remote alignment after a normal push. A clean push may rebase reviewed local commits; any conflict is aborted for manual resolution. Public source excludes `.tools/`, `.agents/` and legacy Python inventory generators; setup, context generation and app verification use public scripts. The Git regression guards those exclusions and explicitly skips private helper checks when all helpers are absent.

For mixed worktrees, `gitpush.ps1 -StagedOnly` publishes a verified index constrained by explicit allowed paths and full expected base/tree IDs. It preserves unstaged owner work, requires the reviewed remote base, rejects unrelated outgoing commits, and supports retrying one exact candidate after push failure without rebasing or making another commit. [Selected publication](GIT_PUBLISH.md) owns the invocation and recovery contract.

The sandbox checkup is diagnostic rather than an app gate. A managed profile may report `python_unavailable`; Python is not required by the Node/PowerShell/Rust verification lane, and the Python Blender fixture scripts are an optional external compatibility check.

Verification ownership (dated counts and outcomes live in `HISTORY.md`):

- Frontend unit, browser, recorded-journey, fixture, helper, and visual ownership is centralized in `source/frontend/tests/README.md`. `source/frontend/scripts/run-unit-tests.mjs` remains deterministic and forwards focused Node test flags; `npm.cmd run test:e2e:list` is the browser discovery authority.
- Rust unit tests own native file/dialog/read/write/recovery boundaries. Browser tests own web/Tauri-adapter integration without substituting mocks for the actual Windows acceptance recorded in `HISTORY.md`.
- Context groups route focused feature, issue and workflow work; archived routes stay out of defaults. The default orientation has a measured 64 KiB budget under the 256 KiB generation ceiling, leaving route sizes and gate outcomes to HISTORY.md rather than duplicating them in current-state prose.

The latest review links the dated command results and any observed limitations in `HISTORY.md`. Browser, recorded-journey, and strict visual commands use the local browser process. If a managed launch reports `spawn EPERM`, record it as a harness failure rather than an app assertion result. Context generation honors configured skip directories for scans, globs, trees, and explicit routes, excludes generated `output/`, and rejects symlink ancestors and drive-relative paths.

## Current Limits

- GLB import makes duplicate node names unique for Three.js bindings. Legacy
  files with repeated non-joint wrapper names may therefore change those names
  on roundtrip even when topology, joint names, transforms and skin stay intact.
  Exact metadata-name identity is not guaranteed for ambiguous source names.

- Collada (`.dae`) is a supported single-file model input and export through the Three.js ColladaLoader plus the RustSMF DAE serializer. ZIP archives remain unsupported containers and must be extracted before selection. DAE round-trip validation covers visual-scene mesh counts, skin-controller presence, hierarchy and matrix animation clips; imports compute missing vertex normals so no-normal Collada meshes remain renderable. External texture files are resolved only from a selected bundle on import; the loader keeps those temporary URLs alive until image loads settle (bounded to two seconds), removes and reports unavailable maps, and avoids passing empty textures into project autosave. External texture files are not embedded on DAE export, so GLB remains the texture-fidelity path. Animation-only input still cannot prove source skin deformation. The 2026-09-20 supplied pair matched on Y-up/0.01m units, 28 animation channels and 76 timing samples; the with-skin file loaded as 33 bones, one 2.50s clip and 3,726 vertices, and its start/mid/end single plus quad review found no observed leg/torso deformation failure or self-clipping. This is source acceptance for RustSMF inspection only, not caller-owned game or retarget acceptance.

- SMF has no scale channel in the current dual-quaternion path. Scale edits block SMF export rather than being dropped.
- Animate's `quadratic` setting is explicitly metadata-only in the current runtime: SMF preserves the selected interpolation metadata while the live Three.js preview uses linear tracks. The Animate control labels this boundary so it cannot be mistaken for quadratic playback.
- SMF scene-object names and hierarchy order are source-owned by the imported payload. Model-workspace rename and reorder controls remain disabled for SMF and direct users to GLB, FBX, or OBJ for editable submodel authoring.
- Mixamo-minimal names are editing-only aliases for the exact recognized SMF humanoid layout. They do not rename source bones, retarget arbitrary rigs, or claim universal Mixamo compatibility.
- Retargeting preserves target proportions and skinning. Correct bone identity, axis correction, and clip timing therefore do not guarantee source-equivalent endpoints or silhouettes when source and target bone lengths, rest frames, or weights differ; the normalized compatibility report identifies that risk, while show-ready 1:1 claims require a fitted/rebound same-topology reference and same-frame visual/game proof.
- Opt-in per-clip bone-scale transfer preserves selected GLB deformation curves relative to source and target neutral scale. Its explicit axis/strength profile is required because a source forearm stretch can distort a different target's weighted arm. Unselected scale tracks remain discarded; configured tracks fail closed on missing bones/tracks or unsafe ratios. The report counts emitted scale tracks. Endpoint-envelope and pose-recovery combinations are not yet supported; SMF remains a scale-animation exclusion.
- Static model authoring is limited to non-SMF, unskinned, unanimated targets. Append accepts self-contained static assets and records one asset-level transaction; transforms, material assignment, winding, and geometry preparation are guarded and undoable. Skinned, animated, SMF source-owned, multi-MTL, and externally dependent append targets fail closed with status diagnostics.
- Legacy same-texture merging is a diagnostic-only policy. The current app has no separate undoable atlas/material-reuse mutation path, so the retired shelf action reports candidates without implying UV or material ownership changes.
- Non-SMF-to-SMF conversion does not preserve unprepared static roots, materials/textures in the SMF binary policy, morphs, object-level tracks, multiple skeletons, or scale animation. Prepared static FBX/OBJ roots become a supported single-root skinned contract; mesh transforms and nested deform-bone world poses are baked into that same boundary.
- `.gltf` import resolves selected relative `.bin` and image resources through the bounded browser/native bundle; remote, data-URI-at-resolution, traversal, duplicate/case-ambiguous, missing, and over-budget resources fail closed. A lone `.gltf` remains limited to self-contained assets.
- FBX import resolves only relative textures explicitly referenced by the source file and present in the selected bundle. Unreferenced base-color/metallic/normal/roughness files remain unused rather than being guessed into material slots; producer-specific skinning beyond Three.js's four retained influences per vertex remains an external compatibility limit.
- OBJ import supports one selected `.mtl` plus its authorized relative textures through the same bundle. Multiple MTL references, unresolved resources, remote paths, and unsafe paths fail closed; geometry-only OBJ remains supported.
- The freeform TransformControls gizmo remains single-perspective. Quad/ortho authoring uses pane-aware explicit Rig move/rotate/add-child/endpoint/IK tools; the freeform gizmo is intentionally not rebound across fixed cameras.
- Rig metadata and explicit keyed IK bake are implemented for the current runtime/project contract. Universal third-party rig interchange remains an evidence-gated limit.
- FBX compatibility is covered by self-authored/generated fixtures plus an independently authored Blender 5.0.0 skinned, textured, animated fixture. The app-exported roundtrip has been reopened and structurally validated by Blender 5.0.0; this does not claim universal third-party FBX compatibility.
- Actual Windows Open/Save cancellation, selected GLTF sidecars, edited model/project saves and reopening, failed destination handling, focus return, and recovery passed in a built Tauri instance. The dated platform/build evidence is in `HISTORY.md`; other operating systems and shell implementations remain unverified.
- Full process-tree cleanup is Windows-launcher owned. Direct Tauri/Vite and non-Windows launches have reduced lifecycle guarantees.

## Documentation and Context Ownership

[Developer Docs](README.md) owns durable-document routing and update rules.
The context bank routes files, not progress or backlog entries.

## Fitted-rig diagnostic boundary

Saved retarget profiles also support opt-in per-clip forearm/wrist axial
allocation through the shared CLI/frontend core. The isolated STEP post-pass
preserves hand-world pose and rejects incompatible scales, offsets, correction
policies and loop seams. It changes deformation allocation, not contact geometry.
The schema and limits live in [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md).
Natural contact profiles can additionally use bounded cumulative 60 Hz root
translation samples for offline nonlinear braking/acceleration compensation.
They retain ordinary STEP animation output; no runtime IK, actor movement or
automatic transition/whole-shoe clearance acceptance is implied.

The fitted-rig tools fit explicit bind mappings, preserve weighted influences and
source GLB bytes, and verify every requested clip on a 60 Hz grid plus terminal.
The hash-bound comparison viewer provides source/fitted/target Quad diagnostics
and equal-height or exact-game transforms. Neither numerical equivalence nor
diagnostic overlays establish fighter acceptance. [FITTED_RIG.md](FITTED_RIG.md)
owns command schemas, timing precision, limits and receipt controls; HISTORY owns
dated proof, and TODO owns acceptance. Private assets and game packages stay excluded.

## Portable Pose Contact Solver

`source/pose-contact` exposes the versioned, pure-Rust `rustsmf-pose-contact`
v0.1.0 crate and a verbatim-vendored v1 module. It corrects one evaluated
parent-first local-TRS humanoid pose for zero, one, or two caller-resolved sole
targets. The output is a complete local TRS pose plus calibrated hip/knee/ankle
world orientations, solved positions, and reach, clamp, residual, and ground
diagnostics. Two supplied limb subtrees must be independent. Re-evaluating from
each incoming pose makes interrupted blends ordinary inputs; no phase, anchor,
filesystem, or clock state is owned here.

The adapter resolves named chains to indices, supplies measured local segment
axes, hip bend pole, knee plane normal, ankle-local sole offsets, desired contact
weights/targets/orientations, ground plane, and a pelvis-translation bound. The
axis calibrations must agree with each evaluated direct hip/knee/ankle hierarchy.
Use the `pole × upper-axis` hip-plane sign and a knee-local plane normal aligned
with `(hip-to-knee) × (knee-to-ankle)`; these preserve bend direction and rest
roll. The solver intentionally rejects non-uniform local scales, invalid axes,
unsupported chains, and non-finite inputs. It does not author contact intervals,
root travel, action eligibility, persistence, or arbitrary anatomy.

The single `npm run verify:rust` gate checks formatting, Clippy, tests, and
native compilation for both `src-tauri` and `pose-contact`, plus pose-contact's
wasm32 target. `npm run transition:runtime-proof` separately rebuilds the native
and browser-WASM transition probes, compares their results, and prints a JSON
receipt bound to the Git revision, pose-contact source-tree hash, and both
artifact hashes. Cargo's artifact messages select the exact build outputs for
the comparison and final hashes, including custom target directories. Both
commands are required for transition release qualification.
See [POSE_CONTACT.md](POSE_CONTACT.md) for the v1 call,
vendoring receipt, calibration details, and compatibility boundary.

The sibling `transition_v1::bake_transition_v1` API bakes caller-conditioned
fixed-rig cycles into sampled local TRS transitions using that same solver.
Callers select fractional source frames, signed phase progression, sample timing,
and per-frame movement/support targets. It returns a complete input/provenance
receipt and solver diagnostics, conditioning airborne interpolation knees with
the existing solver and rejecting invalid source knees or exceeded correction
limits without partial output. [TRANSITION_BAKE.md](TRANSITION_BAKE.md) owns the
input contract, bounds, vendoring requirements, and native/browser WASM proof.

---
AI-edited: 2026-10-14T21:08:43-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=recorded completed retarget gate and draft limitations
