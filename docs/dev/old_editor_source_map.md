# RustSMF: old-Editor parity source map (active reference)

This map tracks legacy GameMaker behavior that must be preserved while implementing parity in RustSMF.

Sources used:
- `docs/references/old-src/screenshots/README.md`
- `docs/references/old-src/scripts/skineditor_*`
- `docs/references/old-src/scripts/animeditor_*`
- `docs/references/old-src/scripts/rigeditor_*`
- `docs/references/old-src/scripts/common_add_buttons/common_add_buttons.gml`
- `docs/references/old-src/objects/oAnimEditSystem`
- `docs/references/old-src/SMF.yyp`

## 1) Skinning editor parity

- Mode and flow
  - Tab registration is wired by `common_add_buttons.gml` via `MODELING / RIGGING / SKINNING / ANIMATION` tab buttons.
  - Skinning mode actions are handled by:
    - `skineditor_add_buttons` (tool registration / tool state entry)
    - `skineditor_press_buttons` (button mapping: set/add/subtract/autoskin/normalize/single paint toggles)
    - `skineditor_select_points` (selection prep + buffer cache invalidation)
    - `skineditor_update_tri_ind_model` / `skineditor_clear_tri_ind_model` (triangle index helper lifecycle)
    - `skineditor_paint_vertices` (weight writes to 4-byte bone slots)
  - Paint tool semantics from legacy code:
    - Required selected node/bone before painting.
    - Set/Add/Subtract modes update selected bone and normalize up to 4 influence slots.
    - Autoskin path computes distance-to-bone and normal weighting, then normalizes to 255 weight sum.
  - Current implementation status in RustSMF:
    - `SkinPanel` provides mode/target/strength/radius controls.
    - Auto Skin and Auto Paint share implemented algorithm/options controls: segment inverse distance, segment distance + normals, nearest segment, nearest bone origin, closest two segments, selected branch, power, normal weighting, and max influences. Legacy algorithm ids normalize to the canonical names.
    - `ThreeViewport` executes pointer hit + brush writes through `skinWeights` helpers with mode gating, cached brush candidate indexing, projected-depth rejection, 50 fps drag throttling, and vertex/triangle brush targets.
    - Export and UI now preserve dirtied skin edits; legacy paint behavior without selected bone remains blocked.

- UI and status mappings
  - Legacy “skin paint only when bone selected” guidance from screenshot + scripts maps to:
    - `SkinPanel` copy text and disable states when no selected bone.
    - Brush hit marker/telemetry and mode cleanup in `ThreeViewport`.
    - Status reporting and blocked export messaging in `ExportPanel`.

## 2) Animation tab parity

- Mode and controls
  - `animeditor_press_buttons` is the legacy control dispatcher:
    - animation selection/rename/duplicate/reorder/delete (list interactions),
    - interpolation switch, loop, copy/paste keyframe,
    - add/insert/delete keyframe and frame-multiplier slider,
    - animation list CRUD (`NEWANIM`, `LOADANIM`, delete, duplicate).
  - `animeditor_modify_timeline` defines the timeline interaction model:
    - click-to-select keyframes near cursor,
    - click/drag moves time,
    - add blank/add from sample/insert/paste keyframe flows,
    - timeline sampling updates model sample pose.
  - `animeditor_draw_timeline` and helper scripts define keyframe rail visuals (`KEYFRAMEADDBLANK`, `KEYFRAMEINSERT`, etc.) with node-specific sample updates.
  - Current implementation status in RustSMF:
    - `Timeline` supports playback/scrub/clip list plus imported/authored keyframe markers, lane click-to-scrub, double-click selected-bone key insertion, and authored marker drag-to-time.
    - `AnimatePanel` and `useLoadModel` support selected-bone Insert/Update/Delete/Copy/Paste keyframe authoring for position/quaternion tracks, interpolation state, dirty tracking, runtime clip rebuild, toolbar/Ctrl+Z/Ctrl+Y undo-redo, and supported SMF export/check paths.
    - Remaining parity is clip-level polish: rename/duplicate/reorder/delete, loop metadata editing, frame/sample multiplier UI, snap modifiers, and broader clip CRUD.

- Risk notes to preserve:
  - old behavior supports clip operations (move, rename, duplicate, delete, copy/paste) while selecting keyframes by timeline proximity.
  - interpolation modes were explicit (`keyframe`, `linear`, `quadratic`); RustSMF currently exposes supported edit interpolation, but legacy clip-wide controls and frame multiplier behavior still need explicit mapping.

## 3) Rig editor parity

- Mode and controls
  - `rigeditor_press_buttons` and related rig helpers cover:
    - insert/delete/detach/lock/reparent/swap rig nodes,
    - basic rig transforms,
    - sub-rig add/delete,
    - global rig-level operations (`LOADRIG`, `CLEARRIG`).
  - Screenshot evidence (`smf_editor_rigging_tab.png`, `smf_editor_rigging_tab_add_bone.png`) shows:
    - node tool mode switching,
    - ortho-assisted bone add,
    - endpoint/selection-centric rigging flow.
  - Current implementation status in RustSMF:
    - Selection, hierarchy visibility, validation rows, endpoint drag, and non-SMF rename/reparent/create-child/move/delete are implemented.
    - Non-SMF rig edits validate cycles, self-parenting, root/weighted delete hazards, and retarget or clean animation/pose/skin state.
    - TransformControls and endpoint drags now emit typed viewport edit events into `useLoadModel`, so SMF-source position/rotation pose edits are export-tracked instead of remaining local Three mutations.
    - SMF scale mode is refused in the UI, and any recorded non-identity pose scale blocks SMF export/roundtrip because the DQ path has no scale channel.
    - SMF-source structural mutation remains deliberately blocked to preserve node-index, parent-index, `isBone`, head-node, skin-index, and DQ export fidelity. Rename is unavailable because SMF stores no persisted name field. Detach/connect is the legacy structural `isBone` plus skin-index rewrite, not a metadata alias. No mirror command exists in the owned Rig source and SMF has no left/right pairing metadata, so mirror is absent rather than heuristic.
    - SMF bind reset is implemented as an inverse-bind-derived selected-bone local transform restore. It does not zero local transforms, alter parents, or rewrite skin/animation identity.
    - Pose-level Undo/Redo is implemented for quick nudges, bind reset, TransformControls moves, and endpoint drags through a shared editor-history helper.
    - Non-SMF rig rename/reparent/create/move/delete Undo/Redo snapshots restore skeleton bones, parent links, inverse binds, skin indices, base clips, authored animation edits, pose edits, selected bone, and selected skin-paint state.
    - Viewport pointer ownership is now routed through a pure helper before mutation, so the explicit Rig Endpoint tool, Rig/Animate bone select, Skin paint gating, View-mode model/submodel selection, and Export read-only clicks have explicit owners; TransformControls keeps separate helper/axis/drag ownership telemetry.
    - View-mode model/submodel viewport picking now syncs with Outliner selection. The SMF metadata/reset decision, non-SMF rotate/spin helpers, and global shelf/material policy are complete; remaining mapped work is deeper rig/ortho tool modes.

## 4) Global shell/settings parity

- `common_add_buttons.gml` is legacy source for editor controls:
  - Wireframe, texture, culling, repeat/filter, grid, shader, draw node indices, node perspective, rig opacity/thickness.
  - submodel list + hide/select/all + merge-by-texture actions.
  - autosave/undo/redo, file (save/save as/export SMF), and undo-stack semantics.
  - Current implementation status in RustSMF:
  - Core workspace mode switches and a modern toolbar are implemented.
  - Wireframe, grid, axes, texture visibility, bone-index labels, perspective/ortho, rig opacity/thickness, model opacity, and display-only submodel visibility are implemented.
  - The `Legacy` display toggle now swaps in viewport-only SMF-lit material clones with diffuse/specular/rim behavior and restores original materials on disable so export material fidelity is not mutated.
  - The `Skin pts` display toggle now adds a viewport-only skinned vertex point overlay colored by selected-bone influence.
  - View-mode model/Outliner selection now adds viewport-only selected-object overlays inspired by the old `sh_selection` blue overlay behavior; overlays are display helpers only and rebuild on selection/visibility changes.
  - Shader/display reference files preserved for future display work:
    - `docs/references/old-src/shaders/sh_smf_animate/sh_smf_animate.vsh` and `.fsh`
    - `docs/references/old-src/shaders/sh_smf_static/sh_smf_static.vsh` and `.fsh`
    - `docs/references/old-src/shaders/sh_grid/sh_grid.vsh` and `.fsh`
    - `docs/references/old-src/shaders/sh_skinning_points/sh_skinning_points.vsh` and `.fsh`
    - `docs/references/old-src/shaders/sh_selection/sh_selection.vsh` and `.fsh`
  - Outliner bulk Select All, Clear, Hide selected, Hide unselected, and Show all are implemented as display-only visibility actions, and visibility mutations use toolbar/Ctrl+Z/Ctrl+Y undo-redo.
  - Global shelf/material policy is resolved: repeat wrapping and source/nearest/linear filtering are viewport-only previews; source samplers and material assignments are restored during export; Rig and Animate own separate snap units; include-textures behavior is format-owned and visible in Export; and merge-same-textures is a shared-texture preflight rather than the legacy destructive geometry merge. Culling remains owned by the modern viewport rather than this material policy.
  - Global undo/redo covers current pose, Rig, Animate, Skin, and Outliner mutators through ordered domain histories. `source/frontend/tests/README.md` owns the current mutator inventory; new authoring actions must join an undoable row or be explicitly classified as non-destructive.

## 5) Viewport click/drag interaction matrix

This matrix is the current parity decision point for old ray-sphere and ray-plane behaviors.

| Legacy behavior | Source evidence | Modern status | Follow-up |
| --- | --- | --- | --- |
| Rig/Animate node click selects nearest helper node by ray-sphere, then shader-buffer fallback. | `rigeditor_perform_actions.gml`, `animeditor_perform_actions.gml`, `rigeditor_select_node_from_rig.gml`. | Implemented for current helper picking: Rig/Animate clicks route through `viewportInteractionRouter.ts`, helper metadata, fallback distance picking, pane-role telemetry, and `data-viewport-picked-bone` smoke assertions. | Keep future rig-tool clicks on the same owner/picked-bone path before mutation. |
| Rig empty-click add bone projects onto ortho pane axes, not arbitrary perspective depth. | `rigeditor_perform_actions.gml` uses `mouseViewInd > 1`, `camTransform`, `mouseWorldPos[tx/ty]`, and snap-to-grid before `rig_add_node`. | Implemented for the first non-SMF tool slice: Rig has Select/Add child modes, Top/Front/Side clicks project a child under the selected parent, optional Rig Snap rounds placement, smoke covers create plus undo/redo, and SMF-source structural mutation stays blocked. | Reuse the same placement contract for future ortho movement tools; perspective empty-click remains selection-only unless a later camera-plane add mode is deliberately added. |
| Rig node move is an ortho-pane bind-pose operation with snap support and undo checkpoint. | `rigeditor_perform_actions.gml` gates `RIGMOVEAFTERPLACE`/`RIGMOVEBONE` behind `mouseViewInd > 1` and writes two pane axes. | Implemented for non-SMF selected bones as a Rig Move tool: Top/Front/Side drags move the selected bone through one history transaction, optional Rig Snap rounds positions, smoke covers undo/redo, and SMF-source structural mutation stays blocked. Endpoint drag remains a separate Select-mode pose edit path. | Reuse the Rig snap helper/settings shape for future animation movement. |
| Rig global move/scale/rotate are ortho-drag operations, while spin X/Y/Z are button operations. | `rigeditor_perform_actions.gml` handles `RIGMOVE`, `RIGSCALE`, `RIGROTATE` for non-perspective panes; `rigeditor_press_buttons.gml` handles `SPINRIGX/Y/Z` as `rig_transform(... -pi/2 ...)`. | Move and Rotate are implemented for non-SMF selected bones as Top/Front/Side drag tools with one undoable transaction; Spin X/Y/Z is exposed as non-SMF button transactions with smoke coverage for undo/redo, skin-index preservation, refreshed skeleton buffers, and invalid-request guards. Scale is not currently planned for SMF export fidelity. | Reuse the proven ortho drag transaction shape for future rig/animation movement; defer/avoid scale until export semantics are explicit. |
| Rig detach toggles `IsBone` and updates skeleton/skin-facing state. | `rigeditor_press_buttons.gml` `DETACHNODE` toggles `rig_node_get_bone` / `rig_node_set_bone` and calls `rigeditor_detach_node`. | Implemented for non-SMF hierarchy bones: Detach/Connect removes or restores a hierarchy bone from the deform `skeleton.bones` list, remaps skin indices, keeps detached nodes visible/selectable in Inspector/Rig trees, gates deform-only edits while detached, and smoke covers undo/redo membership restoration. | Keep SMF-source detach/connect blocked until a head-node-safe edit layer is designed and tested. |
| Animation move/drag node uses perspective camera-plane ray casts or ortho pane-axis projection, then writes the active keyframe on release. | `animeditor_perform_actions.gml` uses `cast_ray_plane` in perspective, `camTransform` axes in ortho, `undo_save`, locked-position update, and `anim_keyframe_set_from_sample` on mouse release. | Partially implemented. Animate-owned TransformControls and viewport selection can author selected-bone keys, but old IK move/drag node tools are not explicit. | Add future Animate move/drag tools through the animation edit layer only; require one transaction per drag and reuse snap settings. |
| Animation local/global rotate uses handle hit-testing, ray-plane loop math, and keyframe commit on release. | `animeditor_update_selecthandle_surface.gml`, `animeditor_mouseover_handle.gml`, and `animeditor_perform_actions.gml`. | Implemented through the mounted public TransformControls helper, owner-specific pose/key upsert, and a real picker-handle browser drag that proves Rig versus Animate history separation. | Keep TransformControls as the single-perspective freeform UI; use pane-aware explicit tools until a pane-camera gizmo contract is designed. |
| Skin paint mutates selected-bone weights only after a real selected point/vertex set, with set/add/subtract/autoskin normalization. | `skineditor_paint_vertices.gml`. | Implemented. RustSMF uses selected-bone gating, vertex/triangle brush targets, skinned-world candidate indexing, empty-miss no-op checks, Auto Paint/Auto Skin options, undo-redo, and dirty-state smoke proof. | Keep mutation tests requiring dirty-state transition, not brush telemetry alone, so equivalent-weight strokes do not count as successful mutation. |
| View/model selection is a modern replacement, not an old rig-node behavior. | Old editor used submodel list and selection overlays from global/common paths rather than the same rig-node ray path. | Implemented. View-mode `model-select` raycasts visible meshes into Outliner state and selected-object overlays. | Keep model selection separate from Rig/Animate bone selection in the router.

Policy for the next build slice:
- Selection may run in any pickable pane.
- Current endpoint drag remains perspective-pane proven until a deliberate ortho endpoint mode is designed.
- New rig/animation movement tools should follow the non-SMF-only ortho-pane Add child/Move/Rotate contract, with snap support where movement is involved and one undo-redo transaction per completed drag. Detach/connect and spin already have UI exposure, hierarchy visibility, and smoke-proven one-transaction history.
- New animation move/drag tools must write animation keys, never bind pose, and must commit one transaction on release.
- SMF-source structural mutation remains blocked under the explicit format-policy map. Existing-bone pose edits and local bind reset are the supported SMF Rig mutations; indexed rename/detach/mirror are not silently approximated.

## 6) Integration rule for downstream TODO items

- Before adding any authoring mutation surface, align event flow with the above legacy behaviors:
  - selection prerequisite and state gating,
  - deterministic export boundaries,
  - explicit undo/redo or equivalent transactional safety,
  - status text and control disablement for impossible actions.
