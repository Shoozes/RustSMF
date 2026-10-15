# Modern UI Design QA — v0.2 productization complete

## ZIP intake dialog

Open/drop keeps the existing editor composition. The temporary archive surface has a filename, progress/Cancel or one model selector and Open model; it uses flat theme tokens and no permanent new buttons. Six reviewed captures cover 1920x1080, 1440x900 at DPR 1.25, 1280x800, 1024x768, 800x900 at DPR 2 and 390x844 at DPR 2 with coarse pointers. Keyboard wrapping, explicit choice, Escape/focus return, overflow and 44px touch targets pass. These empty-scene captures establish picker layout, not model rendering. Existing strict references are unchanged.

## Retarget review — 2026-10-14

The integrity cleanup changes interpolation and routine evidence retention, with no layout/style changes. Existing reviewed six-size/DPI captures remain source-specific evidence for the unchanged controls; current strict results belong in HISTORY. Successful UI captures now require `RUSTSMF_CAPTURE_UI_REVIEW=1` and use the current test output owner. Required strict comparisons and hand-wave captures remain enabled.

The follow-on cubic authoring repair keeps the same controls and flat theme. Unsupported rotation cuts report existing-key/Retime guidance before mutation. Ordinary chooser, pointer and keyboard paths prove history and continued editing. All three current strict checks passed without baseline updates, including Original.

Current source keeps Animate > Transfer as one source action, compact progress/Cancel, and a private preview with Apply/Discard. Convention overrides, mapping rows, technical diagnostics and profile JSON live under Mapping details. Other workspaces and the flat graphite/off-white/brass palette retain their hierarchy. Pending work stays cancelable when Tools is closed; leaving Animate clears it. Preview uses the existing compact playback controls without the canonical authoring lane. Six reviewed sizes (1920×1080, 1440×900, 1280×800, 1024×768, 800×900 and 390×844), DPR 1/1.25/2, coarse targets, overflow, Escape and focus return passed. At narrow widths Tools overlays the model; closing it retains preview for viewing. All three strict checks passed with every committed reference unchanged. HISTORY binds the final source and captures; the public installer is unchanged.

## Task drawers — 2026-10-11

The user selected mockup 2, Task tabs, after three image-generated options based on real Animate/Skin captures. The implementation keeps flat Lumen Alloy surfaces and a model-first workspace. Only the active task is visible: Model has Objects/Surface/Details; Rig has Pose/Hierarchy/Setup; Skin has Brush/Weights/Display; Animate has Clips/Pose/Transfer.

Common actions use existing Phosphor symbols with accessible names and native tooltips. Arrow keys, Home and End navigate task tabs. Secondary pose steps, constraints, clip timing/order and brush settings use disclosures. New animation opens from its icon; tab switching keeps unfinished fields mounted. The Skin brush card appears when Tools is closed, avoiding duplicate sliders. Warnings and unsaved work remain visible. Original takes the existing unwrapped markup path; its stylesheet and committed reference are unchanged.

The final frontend gate passed verify, 139 browser checks, 11 journeys and three strict visuals. All committed strict references remain unchanged. Reviewed task/responsive/touch captures and keyboard/DPR observations are bound to the source receipt in HISTORY. These source changes do not replace the published Windows preview.

The subsequent integrity recheck reproduced hidden Skin state in Scene. The notice now sits above the drawer switcher, including at 390 px, with no duplicate brush sliders. Both repaired captures were reviewed. `workspace-tasks.spec.ts` makes tab keys, focus, draft continuity, keyboard picker cancellation and 44 px touch targets durable guards. The final gate passed verify (520 units), 144 browser checks, 11 journeys and three strict visuals; references are unchanged. HISTORY owns command/source evidence.

## 0.2.1 preview polish

The scene remains the dominant working surface: a small rectangular graphite command strip, restrained brass emphasis and no persistent technical shelf. Help appears only under More as a flat reading plane with keyboard focus wrapping, Escape dismissal and focus return. Successful load status keeps the filename; full counts are available on demand and warnings remain visible.

The curated overview uses the project-generated Signal Robot. `preview-readiness.spec.ts` checks actual shaded model pixels with grid, axes and rig helpers disabled at all six sizes, including fractional DPR. The helper excludes HTML chrome and rejects blank PNGs even when their encoded size exceeds the previous threshold. Empty-shell captures establish layout only. Existing strict references own the loaded editor states; Original's image is protected unchanged.

The focused six-size model/Help captures were reviewed for model visibility, readable text, control reachability, narrow wrapping and dismissal. The installed Windows preview was also observed through local UI automation on 2026-10-11, including geometry/clip motion, Help dismissal/focus, dialogs, sidecars and recovered editing. Final gate and native observations belong in HISTORY; builds, browser tests and mocked IPC remain separate lanes.

The previous Calm Modern shell cut and the v0.2 Lumen Alloy productization pass are complete. Modern has release-level responsive evidence; the Original SMF presentation remains a separately scoped, strict visual baseline.

- Previous Calm Modern reference: `docs/references/modern-ui/focused-studio-selected.png`
- Product overview capture: `docs/images/rustsmf-modern-overview.png`
- Implementation owners: `source/frontend/src/App.tsx`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ViewportControls.tsx`, `source/frontend/src/components/ModernSkinWorkspace.tsx`, `source/frontend/src/index.css`, and `source/frontend/src/styles/themes/modern.css`
- Viewport matrix: 1920x1080, 1440x900 at 1.25 device scale, 1280x800, 1024x768, 800x900, and 390x844 CSS pixels
- Canvas density checks: DPR 1, 1.25, and 2

## Product hierarchy

The 2026-10-08 simplification replaces the released two-row hierarchy with one compact command strip and one workspace chooser. File/history/export actions use named icons and tooltips. Camera, layout, and display stay in the viewport. Tools opens one Scene/Properties drawer; it starts closed at every size. Status remains a slim single line.

Skin exposes four icons and two brush sliders. Duplicate Paint/Erase and history buttons, the full-height rail, and the permanent shortcut/help paragraphs are removed. Common history stays in the toolbar; narrow Redo remains in More. Tools opens exact values, pose modes, auto-weighting and diagnostics. Dirty state and errors remain visible.

## Frontend polish — 2026-10-08

The working surface is a model viewer, with a quiet graphite command strip,
small rectangular controls and restrained brass selection. It has no hero,
subtitle, permanent technical shelves or decorative cards. Tests bound the
closed desktop strip to six visible buttons and 48 px maximum height; the five
workspace choices appear only while the chooser is open. Modern
supporting fields/actions now use 32 px desktop targets; coarse-pointer
controls and sliders retain the 44 px floor. Bone hierarchy and clip rows support keyboard
selection and visible focus. Grouped inputs fit the drawer width. Modern uses
one full-height drawer scroll instead of inheriting Original's compact panel
cap; profile validation appears above the JSON field. Expert
controls remain disclosed; the viewport stays the primary working surface.
Pointer checks verify that chooser menus remain above the drawer, and that
closing the drawer returns focus to the persistent Tools trigger.

`source/frontend/tests/modern-authoring-layout.spec.ts` adds selected Rig,
invalid-profile and Live Skin warning captures at all six sizes, including
1440x900 DPR 1.25. Final visual review and gate results are recorded in HISTORY.

## Lumen Alloy treatment

Modern owns graphite surfaces, off-white text, and restrained brass active states in `styles/themes/modern.css`. Surfaces remain flat: no gradients, glows, or large shadows. Shared `index.css` owns layout and behavior, while the theme stylesheets own their palette values. Three.js colors that communicate selection, rig status, or diagnostics remain semantic render colors rather than decorative UI palette tokens.

## Acceptance evidence

The v0.2 release gate completed in September. The 2026-10-08 frontend candidate passed verify (510 frontend units), 124 browser checks, eleven sequential stories and three strict visuals. The new layout was reviewed at all six sizes, including the fractional-DPI lane, selected tools, validation errors and Live Skin warnings. Keyboard navigation, drawer dismissal/focus return, DPR backing sizes and 44 x 44 px touch targets passed. Only the two intended Modern snapshots changed. Original remains byte-identical at SHA-256 `e5ee611a6b1b3fced0c152eacf42d4797fa084ab4f621476075297581a111846`.

The curated overview now shows the model with the tools closed. Modern's empty status is simply Ready. Browser and mocked IPC are this pass's acceptance lanes; real OS dialogs, packaging and version changes were excluded.

`source/frontend/tests/modern-shell.spec.ts` owns command visibility, one-drawer behavior, coarse-pointer target size, and DPR backing dimensions. `source/frontend/tests/visual.spec.ts` owns responsive shell, viewport controls, Modern/Original geometry, and strict screenshot evidence. `docs/dev/review.md` records suite outcomes; `docs/dev/HISTORY.md` records the final evidence entry.

---
AI-edited: 2026-10-15T01:48:27-04:00 | agent=Codex/root | model=unknown | effort=unknown | task=docs | change=recorded verified ZIP intake and lifecycle boundaries
