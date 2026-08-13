## Coding Philosophy

Safety, courtesy, show, and efficiency, in that order.

Prefer dynamic and modular solutions over hard-coding.

Comments are direct and minimal. No decorative lines. No emojis in code or docs.

Prioritize correctness and readability over cleverness.

TypeScript React in the front
Rust in the backend/main source

## Git Workflow

Work locally on `main` only unless the user explicitly requests a different branch. Local Codex work should reflect `main` in progress, not a PR branch workflow.

Review happens in this workspace with the user before any push. Do not open PRs or prepare PR branches unless the user explicitly asks for that.

Do not push automatically. A push means the work is considered reviewed; the user may push manually, or explicitly request a push.

Temporary branches are acceptable only as local scratch/review surfaces. Before final handoff, gather needed work back onto local `main` and clean temporary local branches when they are no longer needed.

When the user explicitly requests `push to git` or runs an approved push script, treat that as push/sync from `main` only. Do not push temp branches unless the user explicitly names that branch.

Use `.tools/gitpush.ps1` and `.tools/gitpull.ps1` for project synchronization. They require the configured `origin` and `main`, stop on active Git operations, remote mismatches, dirty pull state, or conflicts, and never create or rewrite remotes, force-push, reset/clean, stash, or auto-resolve conflicts. The push path may rebase a clean reviewed local commit onto current `origin/main`; it aborts that rebase on conflict for manual review.
