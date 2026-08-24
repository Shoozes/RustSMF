# scripts

Repo-level helper scripts live here when they are not part of the frontend package, Tauri crate, or `.tools` agent harness.

Current command entry points:
- `run.ps1`: human-friendly setup, dev, verify, e2e, recorded journey, and desktop-smoke tasks.
- `context-bank-lib.mjs`: shared summary-bank parsing, path expansion, budget, and generation library.
- `verify-context-bank.mjs`: Node.js structure/path/budget guard used by `run.ps1 -Task context` and `verify`.
- `verify-project-integrity.mjs`: Node.js guard for durable-doc presence, TODO field contracts, research-note status, relative frontend imports, and Rust module declarations.
- `project-integrity.test.mjs`: regression coverage for the project-integrity guard.
- `generate-context.mjs`: bounded context manifest generator; `--out -` writes only to stdout.
- `context-bank.test.mjs`: validator and generator regressions.
- `.tools/*`: agent/context/git helper scripts.
- `source/frontend/scripts/*`: frontend lint-coverage, production-type, build-chunk, visual, and dev-lifecycle helpers.

