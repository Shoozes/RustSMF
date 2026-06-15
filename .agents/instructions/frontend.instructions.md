---
applyTo: "source/frontend/index.html,source/frontend/src/**/*.{ts,tsx,js,jsx},source/frontend/src/**/*.d.ts,source/frontend/vite.config.*"
---

# Frontend Instructions (TypeScript + React + Vite + Three.js + Tauri)

Stack and style:
- TypeScript + React (TSX for components) + Vite as the build/dev tool. Tailwind + PostCSS for styling (match TulpaWeaver patterns for clean UI).
- Three.js (core + addons) for all 3D: Scene, SkinnedMesh, Skeleton, AnimationMixer, GLTFLoader, (later) FBXLoader, OrbitControls or drei equivalents, BufferGeometry/BufferAttribute for imported data.
- Tauri v2 bridge via @tauri-apps/api (core invoke + plugins for dialog/fs). Keep a thin `source/frontend/src/backend-client/tauri.ts` layer with graceful fallback when not running under Tauri (browser File/Blob paths).
- Vite config must chunk large vendors (especially three) to keep initial loads reasonable. Include COOP/COEP headers if using workers or advanced three features.
- Keep the app independently runnable in browser (`vite` / `vite preview`) with drag-drop file + download for SMF/GLB. Tauri is the enhanced offline desktop shell.

Core boundaries and ownership:
- Frontend owns: viewport (one primary three canvas + RAF-driven mixer), loaders (SMF/GLB/FBX), exporters, coordinate transforms, scene graph (meshes + bones), animation clips/timeline/scrub/play, outliner, inspector, store (split slices for model / anim state / ui selection), UI panels/modals.
- Never put Three.js rendering, skinning, or animation sampling inside Rust/Tauri commands.
- All SMF <-> Three.js conversion (pos/nor/uv/tan/skin, DQ rig/anim, head/tail node handling, winding, scale strip, sign flips) **must** go through the tested loader helpers, especially `source/frontend/src/loaders/coord.ts` and `source/frontend/src/loaders/smf.ts`. Document the Y-up vs Z-up + handedness rule near conversion helpers.
- Start loader/exporter implementations by directly adapting (then cleaning + typing) the reference:
  - `docs/references/old-src/GLBtoSMF/importer.js` + `unpacker.js` + `ModelLoader.js` (GLB/SMF -> structured + three data)
  - `docs/references/old-src/GLBtoSMF/exporter.js` + `packer.js` (three -> SMF/GLB; note the known exporter limitations around bone connections/rotations)
  - `docs/references/old-src/GLBtoSMF/smf_dq_math.js` (DQ math + transforms — port in full)
- FBX import via three/examples/jsm/loaders/FBXLoader (post-process like GLB unpacker). Limited FBX export via the Shoozes/FBXExporter-threejs (or equivalent three-compatible exporter). Document scope limits early.
- State management: prefer small focused modules (store/model.ts, store/anim.ts, store/ui.ts) with a stable public hook (e.g. useModelStore). Split like TulpaWeaver examples.
- Components: Viewport.tsx (three setup + helpers), Timeline.tsx, Outliner.tsx, Inspector.tsx, ImportExportPanel.tsx, etc. Use modals for complex flows (export options, settings).
- Backend client: only thin async wrappers around tauri invoke or web equivalents. Example commands to support early: open_file, save_file, read_binary (Uint8Array friendly).

SMF / 3D specifics and pitfalls (must follow):
- Vertex format is 44 bytes fixed. `source/frontend/src/loaders/smfBinary.ts` owns bounded DataView readers/writers.
- Dual quats require exact negate on import, negate+normalize+flip_sign (with prev per-node tracking) on export for continuity — missing this is the #1 cause of animation pops.
- Hierarchy remapping, bone index remap (only isBone nodes?), head node insertion for non-connected cases, and world/local matrix decomposition are mandatory for correct rig + skinning. Test against reference GLBtoSMF output.
- Always provide fallbacks for missing normals/tangents/uvs (compute or default) exactly as the reference unpacker does.
- Embedded textures in SMF require canvas extraction to Image/RGBA consistently.
- After load: build SkinnedMesh + Skeleton + bind + AnimationClip (VectorKeyframeTrack + QuaternionKeyframeTrack). Drive via mixer in the viewport loop.
- Roundtrip fidelity is non-negotiable for this product: load sample .smf or GLB, export, re-import, compare vert positions/norms, bone count/parents/axes, anim duration/times/frames, skin weights (epsilon). Capture viewport screenshots at bind pose + mid-anim with skeleton helper visible.
- Add entries to pitfall-ledger (via the skill) for any fix that took >1 attempt or exposed a sign/coord/remap/winding bug.

Verification (run these after relevant changes):
- In source/frontend/: `npm run lint`, `npm run build`, `npm run test:unit` (if tests), `npm run test:e2e` (Playwright — exercise file load, viewport render, play/scrub, export; capture screenshots of key states).
- Run the full `.\run.ps1 -Task verify` (or manual equivalent) when available.
- For any 3D/visual change: launch web dev or tauri dev, load at least one real model from docs/references/old-src/datafiles/SMF/ or a generated skinned GLB, inspect skeleton + deformation, take before/after screenshots, assert no console errors and correct data roundtrip.
- Update `summary_bank.json` when adding loaders, panels, store slices, tests, or issue context. Update `docs/dev/TODO.md` for active work and `docs/dev/APP_STATE.md` when current behavior changes.
- Use the monolith-modularization skill proactively on any file > ~500 LOC that mixes concerns (e.g. huge loader + UI).

Browser vs Desktop:
- The Vite app is the source of truth and must work without Tauri (use feature detection or dynamic import for @tauri-apps/*).
- Tauri enhances with native dialogs, direct binary paths, better perf for very large assets, and packaging.

Use `docs/dev/APP_STATE.md`, `docs/dev/TODO.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json` for current behavior, active subtasks, failure modes, and focused context.
