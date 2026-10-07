# scripts

Repo-level helper scripts live here when they are not part of the frontend package, Tauri crate, or `.tools` agent harness.

Current command entry points:
- `run.ps1`: human-friendly setup, dev, verify, e2e, recorded journey, and desktop-smoke tasks; optional GenEye browser runs use checked argv manifests instead of shell command strings.
- `verify-rust.mjs`: the single Rust verification owner for the Tauri and pose-contact crates, including native checks and pose-contact wasm32; both public verification entrypoints delegate to it.
- `rust-verification.test.mjs`: command coverage, missing-crate and failure propagation, launcher routing, and fresh transition-build ordering regressions run as part of `npm run verify:rust`.
- `source/pose-contact/tests/transition-runtime-proof.mjs`, exposed as `npm run transition:runtime-proof`: builds both transition examples, selects Cargo-reported output paths, runs browser parity on those exact artifacts, and emits their source/artifact hashes.
- `context-bank-lib.mjs`: shared summary-bank parsing, path expansion, budget, and generation library.
- `verify-context-bank.mjs`: Node.js structure/path/budget guard used by `run.ps1 -Task context` and `verify`.
- `verify-project-integrity.mjs`: Node.js guard for readable UTF-8 durable docs, explicit empty or populated TODO contracts, portable current-doc references, research-note status, relative frontend imports that resolve to files, and Rust module declarations. Active tasks cannot retain the empty-backlog marker.
- `dev-process-ownership.ps1` and `dev-process-ownership.test.mjs`: exact normalized Node script ownership and a mixed-process cleanup regression; the test runs in `verify` without terminating real processes.
- `project-integrity.test.mjs`: regression coverage for the project-integrity guard and the workspace verification-script contract, including the game-ready dependency boundary.
- `generate-context.mjs`: bounded context manifest generator; `--out -` writes only to stdout.
- `context-bank.test.mjs`: validator and generator regressions.
- `.tools/*`: agent/context/git helper scripts.
- `source/frontend/scripts/*`: frontend lint-coverage, production-type, build-chunk, visual, GenEye Playwright entry, and dev-lifecycle helpers.

