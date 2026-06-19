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
    - `ThreeViewport` executes pointer hit + brush writes through `skinWeights` helpers with mode gating.
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
    - `Timeline` currently supports playback/scrub/clip list.
    - Animation edit data model + timeline keyframe editor not yet implemented; these scripts are source of truth for intended affordances.

- Risk notes to preserve:
  - old behavior supports clip operations (move, rename, duplicate, delete, copy/paste) while selecting keyframes by timeline proximity.
  - interpolation modes were explicit (`keyframe`, `linear`, `quadratic`); RustSMF currently only has run-time local interpolation from imported clips.

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
    - selection, visibility of bone hierarchy, and endpoint drag are implemented.
    - full rig editor mutation model (add/delete/reparent + validation + undo) remains to be implemented.

## 4) Global shell/settings parity

- `common_add_buttons.gml` is legacy source for editor controls:
  - Wireframe, texture, culling, repeat/filter, grid, shader, draw node indices, node perspective, rig opacity/thickness.
  - submodel list + hide/select/all + merge-by-texture actions.
  - autosave/undo/redo, file (save/save as/export SMF), and undo-stack semantics.
- Current implementation status in RustSMF:
  - Core workspace mode switches and a modern toolbar are implemented.
  - wireframe + grid/axes/bone label toggles are partially implemented.
  - texture/material/submodel visibility shelves are pending.

## 5) Integration rule for downstream TODO items

- Before adding any authoring mutation surface, align event flow with the above legacy behaviors:
  - selection prerequisite and state gating,
  - deterministic export boundaries,
  - explicit undo/redo or equivalent transactional safety,
  - status text and control disablement for impossible actions.
