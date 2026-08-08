# RustSMF Docs

This folder is intentionally flat at the top level. Use the narrowest durable doc for the job instead of adding new progress logs.

## Main Docs

- `docs/dev/APP_STATE.md`: current product, architecture, limits, and last verified commands.
- `docs/dev/TODO.md`: active executable backlog (paired what/why/where/when/how, subtasks, and done criteria).
- `docs/dev/HISTORY.md`: completed work and durable verification evidence.
- `docs/dev/review.md`: latest concise repo/app integrity snapshot and next-task direction.
- `docs/dev/PITFALL_LEDGER.md`: durable regression-prevention records in Q&A form.
- `docs/dev/README.md`: developer doc policy and verification map.
- `docs/user/README.md`: user-facing app behavior and format limits.
- `summary_bank.json`: focused context groups for agents and future reviews.

## Reference Material

- `docs/references/old-src/`: preserved GameMaker/GLBtoSMF source, screenshots, and samples used as compatibility references.
- `docs/research-inbox/`: raw or partially reviewed research notes before they are converted into state, TODOs, pitfalls, tests, or context groups.

## Policy

Do not add another dated pass recap unless it captures a durable decision. Put current behavior in app state, forward work in TODO, repeated hazards in the pitfall ledger, and file-group routing in `summary_bank.json`.
