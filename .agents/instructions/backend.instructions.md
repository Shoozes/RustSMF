---
applyTo: "source/src-tauri/src/**/*.rs,source/backend/**/*.rs,scripts/**/*.py,*.py,*.pyw,.tools/*.py"
---

# Backend (Rust/Tauri) And Python Tooling Instructions

Role of Rust (Tauri side):
- `source/src-tauri/src/` (and any `source/backend/` crates) owns the native desktop shell: file dialogs (tauri-plugin-dialog), binary FS operations for model files (SMF/GLB/FBX), and optional high-fidelity SMF parser/serializer.
- Prefer small, focused #[tauri::command] functions that return Result<T, String> for easy JS bridging.
- Use byteorder / nom / binread-style or manual little-endian readers for SMF (see `docs/dev/APP_STATE.md`, `docs/dev/TODO.md`, `docs/dev/PITFALL_LEDGER.md`, and `docs/references/old-src/GLBtoSMF/importer.js` for current scope and exact header/chunk/44-byte-vertex/DQ layout). gltf crate is a candidate only when a concrete GLB validation path is adopted and verified.
- Always sanitize/validate user paths (no parent traversal, canonicalize on Windows UNC \\?\ handling — see TulpaWeaver src/main.rs example).
- Tauri commands are the bridge for native open/save; frontend owns all Three.js rendering, animation, and UI.

Role of Python:
- Optional and strictly limited to existing light `.tools/` utilities plus the independent Blender FBX fixture generator/validator. It is not an app-runtime dependency or a required verification runtime.
- Keep scripts dependency-light (pathlib, json, subprocess) and make the Node/PowerShell/Rust app gate independent of Python availability.
- Never use Python for runtime app logic or heavy processing.

Implementation rules:
- Explicit Path / PathBuf everywhere in Rust. Validate before any FS write or parse.
- For SMF: match the documented LE binary exactly (version strZ + 4 offsets, embedded RGBA textures, 44B verts, DQ[8] with negate/flip on boundaries, node parent/isBone/axis, per-frame anim DQs).
- Keep controller and context tools (project.json driven) usable before full Git/npm/cargo setup.
- Coordinate transforms and Three.js fidelity belong in the frontend (coord.ts + loaders); Rust can produce/consume the canonical SMF bytes or JSON representations for comparison.

Testing:
- Run `cargo check` (and cargo test if unit tests exist) in source/src-tauri/ after any Rust change.
- Run `.\run.ps1 -Task verify` after Python or fixture-tooling changes; run the exact external Blender command separately when the fixture lane is being validated.
- All verification must be deterministic and independent of secrets/network (no external model downloads here).
- After SMF parser work: roundtrip at least the samples under docs/references/old-src/datafiles/SMF/ and assert key data (vert count, bone parents, anim duration/times, skin weights) within epsilon. Log any sign-flip or remap issues to pitfall-ledger.
