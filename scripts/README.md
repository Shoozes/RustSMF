# scripts

Repo-level helper scripts live here when they are not part of the frontend package, Tauri crate, or `.tools` agent harness.

Current command entry points:
- `run.ps1`: human-friendly setup, dev, verify, e2e, recorded journey, and desktop-smoke tasks; optional GenEye browser runs use checked argv manifests instead of shell command strings.
- `context-bank-lib.mjs`: shared summary-bank parsing, path expansion, budget, and generation library.
- `verify-context-bank.mjs`: Node.js structure/path/budget guard used by `run.ps1 -Task context` and `verify`.
- `verify-project-integrity.mjs`: Node.js guard for durable-doc presence, explicit empty or populated TODO contracts, portable current-doc references, research-note status, relative frontend imports that resolve to files, and Rust module declarations. Active tasks cannot retain the empty-backlog marker.
- `dev-process-ownership.ps1` and `dev-process-ownership.test.mjs`: exact normalized Node script ownership and a mixed-process cleanup regression; the test runs in `verify` without terminating real processes.
- `project-integrity.test.mjs`: regression coverage for the project-integrity guard.
- `generate-context.mjs`: bounded context manifest generator; `--out -` writes only to stdout.
- `context-bank.test.mjs`: validator and generator regressions.
- `.tools/*`: agent/context/git helper scripts.
- `source/frontend/scripts/*`: frontend lint-coverage, production-type, build-chunk, visual, GenEye Playwright entry, and dev-lifecycle helpers.

