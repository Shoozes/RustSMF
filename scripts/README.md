# scripts

Repo-level helper scripts live here when they are not part of the frontend package, Tauri crate, or `.tools` agent harness.

Current command entry points:
- `run.ps1`: human-friendly setup, dev, verify, e2e, and desktop-smoke tasks.
- `.tools/*`: agent/context/git helper scripts.
- `source/frontend/scripts/check-entry-chunks.mjs`: frontend build chunk guard.

