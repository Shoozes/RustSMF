# GitHub Copilot Instructions (Repository-Wide)

Follow AGENTS.md first. Use these as the default instruction set for suggestions and agent edits.

General:

- Do not use emojis in code or documentation.
- Keep comments simple and direct. Do not use decorative separators or ASCII art.
- Prefer dynamic/modular solutions over hard-coded logic where practical.
- Keep changes scoped to the request. Avoid refactors unless required for correctness or safety.
- Preserve existing style and conventions unless they are clearly broken.

Repo conventions:

- `source/frontend/` is the canonical TypeScript + React + Vite + Three.js application (use .tsx for React components, .ts for pure modules and loaders). The app must remain runnable standalone in the browser via Vite (File/Blob + download fallbacks) while Tauri provides the native desktop shell.
- `source/src-tauri/src/` owns Rust Tauri commands (native file dialogs, authorized binary model I/O, optional SMF peeks). The frontend invokes only the thin `@tauri-apps/api` bridge in `source/frontend/src/backend-client/`; Rust owns dialog and filesystem operations. The frontend dialog-plugin declaration is retained solely to match Tauri's build-time plugin contract.
- Three.js (Y-up, right-handed) + SMF (Z-up, left-handed per historical + GLBtoSMF reference) boundary code **must** live in or call `source/frontend/src/loaders/coord.ts` (or equivalent). Never hardcode swizzles or transforms outside it. See `docs/dev/APP_STATE.md`, `docs/dev/TODO.md`, and `docs/dev/PITFALL_LEDGER.md` for current format scope, known limits, and active work.
- All SMF/GLB/FBX import/export logic starts by adapting `docs/references/old-src/GLBtoSMF/` (importer.js, exporter.js, packer.js, unpacker.js, smf_dq_math.js, etc.). Port to TS modules under source/frontend/src/loaders/. Maintain roundtrip fidelity tests.
- Use `summary_bank.json` with `node scripts/verify-context-bank.mjs` or `pwsh -File run.ps1 -Task context` for focused context. `.tools/get-context.ps1` is an optional legacy helper; do not reference missing generators. Never load full old-src trees or node_modules in LLM sessions. Update summary_bank on structural changes (new loaders, UI panels, Rust commands).
- Python is optional tooling only: existing `.tools` utilities and the independent Blender FBX fixture scripts. App verification uses Node, PowerShell, and Rust so it remains runnable when Python is unavailable in a managed sandbox.
- Viewport, animation (AnimationMixer), skinned meshes, skeleton viz, timeline, outliner, and inspector live in the frontend. Rust side is for I/O safety and optional fast binary paths only.
- Tauri v2 config and entrypoint: source/src-tauri/tauri.conf.json + src/main.rs. Bundle only what the frontend build produces + minimal resources.

Context and debugging:

- Use summary_bank.json as the context keeper for features, subsystems, and issues. Run focused gen tools before broad reads.
- When debugging loaders, animation, or coordinate transforms, add/update an issue__ group in summary_bank.json with status, repro steps, sample paths (e.g. docs/references/old-src/datafiles/SMF/), and relevant source files.
- For any change touching rendering, skinning, animation sampling, or import/export, capture Playwright screenshots of the viewport (empty, loaded model, skeleton visible, mid-animation) and run roundtrip data checks against samples.

Visual/3D/UI changes:

- After any viewport, loader, timeline, or Three.js scene change: run the web dev or tauri-dev flow, exercise load + play + export, capture screenshots via Playwright (see source/frontend/tests/ and visual artifacts patterns from TulpaWeaver inspiration), and verify data fidelity (positions, bone parents, anim times, skin weights within epsilon).
- After frontend edits, run `pwsh -NoProfile -File .\run.ps1 -Task verify`, then `pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye` when browser behavior changed.
- For Rust/Tauri FS or parser changes: `cargo check` (in source/src-tauri) + desktop smoke + roundtrip on real .smf files.

SMF / Format specifics (critical):

- Binary is little-endian. Header = strZ version ("SMF_v12_by_Snidr_and_Bart" or v11) + 4 u32 offsets (TEXTURE/MODEL/RIG/ANIM).
- Vertex stride exactly 44 bytes. Dual quats (8 f32) are central for rig + anim; port and test the full dq math (create/negate/normalize/flip_sign/to-matrix + sign continuity).
- Known pitfalls from reference (document in pitfall-ledger): head/tail node insertion for hierarchy, bone index remap, winding reversal on export, scale stripping, prev-DQ tracking per node for animation, canvas texture extraction races, missing tangents/uvs/normals fallback.
- Always test roundtrips on samples in docs/references/old-src/datafiles/SMF/ and generated skinned GLB.

Use `summary_bank.json` for focused context before broad reads. Use `docs/dev/TODO.md` for active subtasks, `docs/dev/APP_STATE.md` for current behavior, and `docs/dev/PITFALL_LEDGER.md` for durable failure-mode context.
