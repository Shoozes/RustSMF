# Modern UI Design QA — v0.2 productization complete

The previous Calm Modern shell cut and the v0.2 Lumen Alloy productization pass are complete. Modern has release-level responsive evidence; the Original SMF presentation remains a separately scoped, strict visual baseline.

- Previous Calm Modern reference: `docs/references/modern-ui/focused-studio-selected.png`
- Product overview capture: `docs/images/rustsmf-modern-overview.png`
- Implementation owners: `source/frontend/src/App.tsx`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ViewportControls.tsx`, `source/frontend/src/components/ModernSkinWorkspace.tsx`, `source/frontend/src/index.css`, and `source/frontend/src/styles/themes/modern.css`
- Viewport matrix: 1920x1080, 1440x900 at 1.25 device scale, 1280x800, 1024x768, 800x900, and 390x844 CSS pixels
- Canvas density checks: DPR 1, 1.25, and 2

## Product hierarchy

Modern keeps file and product commands on the first toolbar row and Model, Rig, Skin, Animate, and Export on the second. Camera, layout, and display controls stay inside the viewport. Scene and Properties share one contextual drawer; compact layouts start with it closed. Status uses a slim, single-line region.

Skin retains its bounded tool rail and contextual brush card. Pick, Paint, Erase, Smooth, brush size, strength, and history remain direct. Exact source identifiers, diagnostics, pose sampling, auto-weight algorithms, and batch operations stay behind Advanced.

## Lumen Alloy treatment

Modern owns graphite surfaces, off-white text, and restrained brass active states in `styles/themes/modern.css`. Surfaces remain flat: no gradients, glows, or large shadows. Shared `index.css` owns layout and behavior, while the theme stylesheets own their palette values. Three.js colors that communicate selection, rig status, or diagnostics remain semantic render colors rather than decorative UI palette tokens.

## Acceptance evidence

The browser, five sequential journey, strict visual, desktop smoke, and Windows packaging gates passed. Screenshots were reviewed at all six listed CSS viewports, including the 1440x900 DPR 1.25 case. Only the intended Modern loaded-SMF snapshot was updated. The Original strict screenshot is unchanged at SHA-256 `e5ee611a6b1b3fced0c152eacf42d4797fa084ab4f621476075297581a111846`.

`source/frontend/tests/modern-shell.spec.ts` owns command visibility, one-drawer behavior, coarse-pointer target size, and DPR backing dimensions. `source/frontend/tests/visual.spec.ts` owns responsive shell, viewport controls, Modern/Original geometry, and strict screenshot evidence. `docs/dev/review.md` records suite outcomes; `docs/dev/HISTORY.md` records the final evidence entry.
