# RustSMF TODO

Last reviewed: 2026-06-15 (docs flattened, `docs/dev/TODO.md` adopted as the backlog home, context-bank verifier added, local agent instructions redirected away from stale `plan.md`, and viewport `R` reset shortcut made context-aware).

## Current Focus

Keep the app show-ready and scalable: launchers start the desktop app by default, verification fails loudly, e2e uses production preview, strict visual baselines are maintained intentionally, and docs describe current state instead of pass history.

## Current Integrity Findings

- What: Backlog/docs moved from `docs/TODO.md` to `docs/dev/TODO.md`, but several references still pointed at the removed path.
  Why: Stale doc paths break context retrieval and make future agents trust the wrong source of truth.
  Where: `README.md`, `run.ps1`, `source/frontend/tests/README.md`, `docs/dev/APP_STATE.md`, `summary_bank.json`.
  How: Update all current references to `docs/dev/TODO.md`; keep historical pitfall mentions only when they describe the old failure.
  Done when: `python scripts/verify-context-bank.py` and `pwsh -File run.ps1 -Task verify` pass.

- What: `summary_bank.json` did not have an automated path guard.
  Why: Context groups can silently drift after doc moves or refactors.
  Where: `summary_bank.json`, `scripts/verify-context-bank.py`, `run.ps1`.
  How: Validate default groups, JSON shape, repo-relative paths, glob prefixes, and explicit file/directory existence; wire the check into `verify`.
  Done when: stale explicit paths fail verification.

- What: Repo-local agent instructions still pointed to a nonexistent `plan.md`.
  Why: Missing planning docs create context dead ends and duplicate policy pressure.
  Where: `.agents/copilot-instructions.md`, `.agents/instructions/*.md`, `.tools/project.json`, `.agents/skills/summary_bank_json/SKILL.md`.
  How: Redirect state/planning references to `docs/dev/APP_STATE.md`, `docs/dev/TODO.md`, `docs/dev/PITFALL_LEDGER.md`, and `summary_bank.json`; keep local skills lean and aligned with reusable global skills.
  Done when: `rg -n "plan\\.md|docs/TODO\\.md"` only finds intentional historical mentions.

- What: The viewport `R` reset shortcut could stay captured by TransformControls mode switching after a gizmo was created.
  Why: The control instance can outlive the active bone attachment, while the toolbar advertises `R reset`.
  Where: `source/frontend/src/components/ThreeViewport.tsx`.
  How: Let TransformControls mode keys take precedence only while a bone is actively attached; otherwise `R` resets the view.
  Done when: typecheck passes and the shortcut contract is documented as context-sensitive.

## Active Backlog

No P0/P1 integrity backlog is open after this pass.

1. Modern editor workspace design.
   What: Recreate the current software as a modern, flexible editor while preserving the old editor's strongest ergonomics: optional quad/ortho view, large clickable bone glyphs, numeric/name labels, endpoint handles, contextual mode tools, and clear skinning state.
   Why: The old GameMaker UI made rigging/skinning easier through split ortho panes and oversized bones, while the current React/Three app has a cleaner stack but weaker precision-edit affordances.
   Where: `source/frontend/src/components/ThreeViewport.tsx`, future viewport/workspace components, `source/frontend/src/components/Inspector.tsx`, `docs/references/old-src/screenshots/`.
   How: Design a workspace shell with `Model`, `Rig`, `Skin`, `Animate`, and `Export` modes; keep single perspective as default; add optional quad view for rig/skin precision; implement screen-space bone handles/labels before expanding authoring tools.

2. SMF compatibility boundary.
   What: Keep SMF import/export as backwards compatibility while making GLB/GLTF the preferred modern authoring/export format for features SMF cannot represent.
   Why: SMF lacks bone names, scale channels, materials, morphs, and some editor intent; hiding that would create fidelity loss.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/loaders/threeToSmf.ts`, `source/frontend/src/hooks/useLoadModel.ts`, docs and export UX copy.
   How: Keep explicit rejection/status messages for unsupported SMF conversions, expose format limits in UI/docs, and add compatibility tests only when expanding SMF behavior.

3. Async stale-result regression tests.
   What: Add focused coverage for overlapping browser file-input/drop read failures if load orchestration changes again.
   Why: Sequence guards cover success and error paths, but the stale read-error branch is not isolated by a dedicated hook test.
   Where: `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/native.spec.ts` or a future hook-level test harness.
   How: Mock two reads, resolve the newer one first, reject the older one last, and assert the older rejection does not set error/status.

4. Strict visual snapshot maintenance.
   What: Run strict SMF snapshot checks when renderer, camera framing, skeleton display, skinning visualization, or SMF loader math changes.
   Why: Tolerant byte-size screenshots prove rendering is nonblank but do not prove committed visual baselines still represent the intended product state.
   Where: `source/frontend/tests/smoke.spec.ts-snapshots/`, `source/frontend/scripts/run-strict-visuals.mjs`, `run.ps1`.
   How: Use `pwsh -File run.ps1 -Task test:visual-strict` for checks and `pwsh -File run.ps1 -Task test:visual-update` only when intentionally refreshing baselines.

5. Local skills and context governance.
   What: Keep repo-local skills focused on repo-specific workflows and rely on global skills for reusable integrity, summary-bank, pitfall, and skill-maintenance policy.
   Why: Duplicated skill guidance becomes stale quickly and can conflict with current Codex behavior.
   Where: `.agents/skills/*/SKILL.md`, `.agents/instructions/*.md`, `docs/dev/README.md`, `summary_bank.json`.
   How: Update repo skills only for SMF/RustSMF-specific conventions; generalize reusable patterns into global skills only when they apply across repos.

6. Optional OS-dialog automation.
   What: Add tauri-driver or equivalent only if a dialog-only bug appears, CI requires real native dialog coverage, or release validation needs an automated OS-dialog path.
   Why: Deterministic IPC mocks and Rust command tests currently cover native behavior without OS-dialog flake.
   Where: `run.ps1`, `source/frontend/tests/native.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Prototype outside required `verify`, require three clean local runs, then document prerequisites before promoting.

7. Constructed-rig disconnected metadata.
   What: Add disconnected head-node synthesis only if future non-SMF import data carries explicit disconnected-parent metadata.
   Why: Current parent indices alone cannot safely distinguish direct hierarchy from intended disconnected SMF head nodes.
   Where: `source/frontend/src/loaders/smfRig.ts`, `source/frontend/src/loaders/threeToSmf.ts`.
   How: Extend converter metadata and unit coverage before changing node-list output.

8. Modularity watch.
   What: Extract helpers only at clear, test-backed boundaries.
   Why: Current largest files are manageable; blind splits would reduce clarity.
   Where: `source/frontend/src/loaders/smf.ts`, `source/frontend/src/components/ThreeViewport.tsx`, `source/frontend/src/hooks/useLoadModel.ts`, `source/frontend/tests/smoke.spec.ts`, `source/src-tauri/src/main.rs`.
   How: Re-run line-count ranking before any split, preserve public imports/status strings/test IDs, update barrels and `summary_bank.json`, and grep for duplicate helpers.

## Known Intentional Limits

- `source/backend` is an intentionally empty boundary; current desktop-native work belongs in `source/src-tauri` until there is a concrete backend-service need.
- SMF export supports position/rotation pose edits. Scale edits are blocked because the current SMF DQ path has no scale channel.
- Non-SMF SMF export is guarded for compatible skinned GLB/FBX runtime roots with one shared named skeleton and position/quaternion bone tracks.
- Static roots, materials, morphs, object-level tracks, and scale animation should use GLB.
- FBX import support remains wired through Three's FBXLoader and UI accept/drop paths. Default full non-SMF skinned e2e coverage uses a generated skinned GLB to avoid depending on redistributable FBX assets.
- FBX export writes a GLB container through Three.js GLTFExporter; true FBX writing is not added without a concrete dependency decision.
- OBJ is load/preview parity for static assets; export should use GLB unless an OBJ writer requirement appears.

## Verification

- `python scripts/verify-context-bank.py`: summary-bank JSON/path guard.
- `pwsh -File run.ps1 -Task verify`: context-bank guard, lint, app typecheck, test typecheck, Vite build, chunk guard, unit tests, and cargo check.
- `pwsh -File run.ps1 -Task test:e2e`: Playwright browser smoke, visual confirmation, generated skinned GLB coverage, and native IPC tests served from production preview.
- `pwsh -File run.ps1 -Task test:visual-strict`: opt-in strict SMF screenshot baselines for key load/export visual states.
- `pwsh -File run.ps1 -Task desktop-smoke`: unbundled Tauri build, Rust native peek tests, and focused Playwright native IPC mock suite.

Last verified local results are kept in `docs/dev/APP_STATE.md`.
