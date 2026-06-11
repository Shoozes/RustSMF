# RustSMF App State (Developer)

## Current Architecture (post-harness + loaders phase)

**Major milestone achieved:** Real model loading (GLB + SMF), skinned rendering, AnimationMixer + functional timeline, GLB export, and native tauri bridge are live. Placeholder completely replaced when a model is opened.

### Loaders (new in this phase)
- `src/loaders/coord.ts`: Full port of smf_dq_math (transforms, all DQ ops with flip_sign continuity, Y-up/Z-up + handedness handling).
- `src/loaders/smf.ts`: BinaryReader + complete importSMF (v11/v12). `buildThreeScene()` produces real SkinnedMesh + Skeleton + AnimationClips using the coord utils + DQ→local quat/pos.
- `src/loaders/glb.ts`: Native GLTFLoader path + returns compatible {root, skeleton, clips, mixer} shape. (Structured unpack for perfect SMF roundtrip export is future work.)

### Viewport & Animation (App.tsx)
- Full three scene with live SkinnedMesh/Skeleton from either loader.
- SkeletonHelper automatically added for rig visualization.
- AnimationMixer driven by RAF.
- Timeline: Play/Pause, Reset, Scrub (immediate skin update), Speed selector, Clip selector.
- "Open Model" fully wired (browser file + Uint8Array or tauri native dialog path).
- "Export GLB" uses GLTFExporter and includes clips when present.
- "Ping Rust" demonstrates invoke.

### Known current limits (intentional, per plan)
- SMF export implemented (data-driven exportSMF in smf.ts with BinaryWriter/nodeList/DQ handling). Wired to Export button. Limitations from reference (head/tail anim connections) noted. Ready for roundtrips.
- Desktop binary read (read_file_binary + bridge) added for .smf path loads. Needs full desktop e2e smoke.
- No FBX support yet.
- No material/texture roundtrip for SMF export.
- Tests: Playwright config + smoke.spec.ts (shell + real SMF load via setInputFiles + screenshots), unit skeleton for coord/export. More visuals/roundtrips/error cases pending.
- Git: gitpush.ps1 reviewed (comprehensive auto-create/push/rebase logic). First repo created. Requires gt.txt token for future pushes.

## Current Implementation Highlights (loaders phase complete)
- **Frontend**: Vite + React + TS + Tailwind + Three.js. Fully functional viewport in App.tsx:
  - Real SkinnedMesh + Skeleton + SkeletonHelper from GLB (native GLTFLoader) or SMF (custom binary parser + build).
  - AnimationMixer + interactive timeline (play/pause/scrub/speed/clip select) driven in RAF.
  - Custom orbit, proper Y-up conversion via loaders/coord.ts (ports all DQ math + transforms).
  - "Open Model" live (tauri dialog or browser file input + Uint8Array). "Export GLB" with clips.
  - Improved loading state + error messages (integrity pass).
- **Loaders**: Modular, reusable (coord.ts for all transforms/DQ, smf.ts for binary + three construction, glb.ts for native).
- **Tauri**: Extended with `read_file_binary` command + bridge helper so desktop can now load real .smf files from path (fixes previous browser-only data limitation).
- **Bridge & parity**: Single frontend source. Browser works great for samples; desktop now has parity for binary reads + native open.

## Known Gaps (tracked in summary_bank current_gaps_and_issues)
- SMF export fidelity (import side done; exporter port + roundtrips pending — highest priority).
- FBX support.
- Comprehensive tests (loaders unit, e2e for load/play/export, visual regression on rigged anims).
- Edge cases: corrupt files, 0-length anims, very large models, multi-mesh, texture export roundtrip.
- App.tsx is becoming monolithic (loading + three + UI) — candidate for future modularization.

## Build / Run / Verify
- `cd source && npm install`
- Web: `npm run dev`
- Desktop: `npm run tauri:dev` (or run.ps1)
- Verify: `npm run verify` (now includes the new binary read path)
- Test real assets: open .smf from docs/references/old-src/datafiles/SMF/ or any skinned .glb.
- Git / first repo: repo created at https://github.com/Shoozes/RustSMF (via MCP). Use .tools/gitpush.ps1 (with valid gt.txt) or manual to push. Script handles init, oversized check, auto-create, sync.

See plan.md (session) and summary_bank.json for full context, quirks (DQ continuity, bone remap, coord handedness), and backlog.

All changes follow Safety / Courtesy / Show / Efficiency. 

**Integrity pass (this session)**: 
- Reviewed code, imports (clean), async (loadModel, openFile, export), tests (gaps filled with config + smoke + selectors + loading cues).
- Updated summary_bank (fixed outdated "pending" for export, added "git_and_github_bootstrap", "playwright_e2e_and_tests", refreshed gaps).
- Consolidated docs (APP_STATE, TODO).
- gitpush.ps1: reviewed – fully functional for first-repo creation + push (API create on 404, token handling, rebase/merge/force logic, oversized guard). Minor: requires fresh PAT with appropriate scopes.
- First GitHub repo created: https://github.com/Shoozes/RustSMF (private).
- No major broken imports/exports or stubs in core (SMF export complete, Playwright foundation added).
- Added/organized todos for remaining (FBX, full roundtrips, error UX, modularity).

Features connect for load/play/export + basic e2e testability + git bootstrap. Ready for push via gitpush.ps1 (provide token) or manual.
