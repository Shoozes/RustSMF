# Research Inbox

Use this folder for raw or partially reviewed notes only. Do not treat inbox notes as current product state until their claims are checked against the repo and moved into a durable doc, test, or context group.

## Review Status

Each active note should start with:

```markdown
## Review status

- Status: unreviewed | partially-ingested | blocked | ready-to-remove
- Reviewed on: YYYY-MM-DD
- Ingested into: APP_STATE | TODO | PITFALLS | tests | summary_bank | other
- Remaining: short reason
```

## Ingestion Rules

- Current behavior goes to `docs/dev/APP_STATE.md`.
- Forward work goes to `docs/dev/TODO.md` with what, why, where, and how.
- Repeated hazards go to `docs/dev/PITFALL_LEDGER.md`.
- File-group routing goes to `summary_bank.json`.
- Test or verifier claims should become executable checks where practical.

Remove fully ingested notes when the durable destination is clear and the source note has no remaining historical value. Move notes to `archived/` only when the raw context is useful for future review.
