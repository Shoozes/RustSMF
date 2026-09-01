# Calm Modern UI Design QA

- Durable source visual: `docs/references/modern-ui/focused-studio-selected.png`
- Implementation owners: `source/frontend/src/App.tsx`, `source/frontend/src/components/Toolbar.tsx`, `source/frontend/src/components/ViewportControls.tsx`, `source/frontend/src/components/ModernSkinWorkspace.tsx`, and `source/frontend/src/index.css`
- Reference viewport: 1440 x 1024 CSS pixels
- Responsive evidence: 1920 x 1080, 1440 x 900 at 1.25 density, 1280 x 800, 1024 x 768, 800 x 900, and 390 x 844
- Density evidence: DPR 1, 1.25, and 2 canvas backing-size checks

## Current assessment

Modern keeps two short navigation rows, one supporting surface, a canvas-first center, restrained dark tokens, and viewport-local controls. Original SMF remains separately owned and retains its legacy geometry and strict baselines.

Skin extends the selected Calm composition with a bounded left tool rail and contextual floating card. The primary path exposes Pick, Paint, Erase, Smooth, brush size, strength, and history; exact source identifiers, diagnostics, pose sampling, auto-weight algorithms, and batch operations stay behind Advanced. Friendly display aliases never mutate export-owned names.

The shell and Skin workspace use the real Three.js scene, model, skeleton, grid, Phosphor icon set, editor state, and command semantics. Runtime screenshots and comparison boards remain reproducible review artifacts under ignored output rather than durable source assets.

## Comparison history

1. The first shell comparison preserved the reference hierarchy but inherited centered and full-width legacy layout rules in the Modern command and viewport overlays.
2. Modern-scoped sizing restored full command-bar width, bounded viewport controls, safe status clearance, and closed compact drawers without changing Original.
3. The first Skin hybrid exposed raw source IDs and let status/drop hints overlap its rail. Friendly aliases, rail-aware status clearance, and the contextual Advanced route corrected those issues.
4. The current Skin rail performs real direct painting operations; Smooth owns bounded regional weight averaging rather than masquerading as Auto weighting.

## Final assessment

No open P0, P1, or P2 fidelity, interaction, accessibility, or responsive issue remains in the reviewed Modern states. Current command and suite evidence lives in `docs/dev/review.md`; shipped behavior and limits live in `docs/dev/APP_STATE.md`.

Final result: passed
