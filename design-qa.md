# Modern UI Design QA — v0.2 productization complete

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
