# Original SMF Theme Design QA

Evidence date: 2026-07-30

## Visual Truth

- Source: `docs/references/old-src/screenshots/smf_editor_model_loaded_bones-big-and-visible_ortho_and_main_view.png`
- Implementation: `docs/references/theme-qa/original-smf-theme-2026-07-30.jpg`
- Combined comparison: `docs/references/theme-qa/original-smf-theme-comparison-2026-07-30.jpg`
- Animation source: `docs/references/old-src/screenshots/smf_editor_animation_tab.png`
- Animation implementation: `docs/references/theme-qa/original-smf-animation-theme-2026-07-30.jpg`
- Focused keyframe comparison: `docs/references/theme-qa/original-smf-keyframe-strip-comparison-2026-07-30.jpg`
- Viewport and state: 1610x953, Original SMF, loaded `mixamo_smf_baldguy.smf`, Model workspace, quad layout, animation reset.

The source and implementation were placed together at their native 1610x953 sizes before the final visual judgment.

## Comparison History

### Baseline

- P1: the themed frame still used 216 px and 196 px side panels instead of the original narrow shelves.
- P1: the top strip was 49 px tall, the mode tabs stretched across the workspace, and the Animation timeline used the modern lower-panel position.
- P2: only one sparse horizontal floor grid rendered; the orthographic panes lacked their camera-aligned red-axis grids.
- P2: modern helper copy and wide Outliner metadata made the shelves feel unlike the dense original editor.

### First correction

- Restored a 136 px Settings/tool shelf, 128 px Submodels shelf, 80 px two-row top strip, and fixed 126 px numbered tabs.
- Returned the Animation timeline to the center top shelf.
- Added Top, Front, and Side grid planes and removed Original-only helper/Outliner excess.

### Final correction

- P2: the first grid pass ended too close to the model and the orthographic framing was too distant.
- Expanded the Original grid to 60 units with 60 divisions and set an Original-owned 1.2 orthographic camera zoom.

### Keyframe correction

- P1: the current compact timeline was in the correct top shelf but still used a modern playback row and a short, sparse marker lane.
- Restored the old source geometry: a 128 px tool inset, 16 px right inset, 28 px normalized ruler, and 32 px keyframe band.
- Reproduced the old draw order with a gray base, `keyframe count × sample multiplier` blue sample divisions, 10 px green keyframes, a red selected keyframe, and a blue playhead while playing. Rendered sample density is capped at 512 so unusually large clips remain legible and responsive.

### View and Submodels correction

- Original now resolves to quad view before a model loads and when the persisted theme is restored, instead of briefly or permanently falling back to Modern's single-view default.
- The fixed and perspective panes share one focus target, so right-drag panning stays spatially connected while each view retains its own direction and zoom.
- The Submodels boxes now show downsampled source base-color textures instead of the white material multiplier; untextured or unsupported maps keep the color fallback.

## Final QA

| Surface | Result |
| --- | --- |
| Frame geometry | Pass: tools 136 px, Submodels 128 px, top strip 80 px, center viewport contiguous between shelves. |
| Typography and controls | Pass: Arial/Tahoma stack, square 10 px controls, compact rows, fixed numbered tabs, red selected mode. |
| Viewports | Pass: charcoal quad view, visible pane dividers, full-pane dark grids, red center axes, legacy-scale orthographic framing. |
| View navigation | Pass: Original is quad before load, and orthographic/perspective right-drag pans update one shared focus target in both directions. |
| Submodels | Pass: six SMF submodels render colored source-texture thumbnails at legacy shelf scale; color remains the fallback. |
| Animation | Pass: timeline occupies the 60 px center top shelf only in Animation and does not move either side shelf. |
| Keyframe strip | Pass: source and implementation use the same 128/16 px horizontal insets, 28/32 px ruler/band split, 0-0.90 labels, sample-frame density, 10 px keys, and selected-key color/position. |
| Responsive fallback | Pass: 390x844 stacks viewport, tools, and Submodels with document width equal to viewport width. |
| Interaction states | Pass: Model, Skinning, and Animation switches retained the loaded root and correct theme/layout state. |
| Runtime diagnostics | Pass: no browser console warnings or errors during the final interaction pass. |

The current Export tab, current load/export actions, and browser window chrome remain intentionally different from the historical executable so the theme does not remove current functionality or imitate native OS chrome.

## Verification

- The visual captures and comparisons remain the dated 2026-07-30 evidence described above; the final source/implementation comparison had no open P0, P1, or P2 finding at that snapshot.
- Theme visual assertions remain owned by `source/frontend/tests/visual.spec.ts` and compile through the test TypeScript gate.
- Current suite totals and command evidence live only in `docs/dev/review.md`; current verification commands and policy live in `docs/dev/APP_STATE.md`.

final result: passed
