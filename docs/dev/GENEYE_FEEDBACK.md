# GenEye Feedback for RustSMF Integration

Date: 2026-06-19

## Durable Assessment

GenEye is useful for RustSMF as an advisory Playwright wrapper and evidence collector, not as the source of truth for pass/fail. RustSMF keeps project authority in `project_tests.status` and `project_tests.exit_code`; browser-only Playwright remains available through `-NoGenEye` or `RUSTSMF_NO_GENEYE=1`.

## Current Contract

- Discovery: `-GenEyeRoot`, `GENEYE_ROOT`, `GENEYE_RUN_BAT`, or known local fallback paths.
- Command surface: `pwsh -File run.ps1 -Task test:e2e`.
- Evidence path: ignored `runtime-data/geneye-playwright-runs/rustsmf-e2e-<timestamp>/`.
- Authoritative result: `project_tests` in GenEye report artifacts, mirrored by the RustSMF launcher trailer:
  - `run_path=...`
  - `project_tests.status=...`
  - `project_tests.exit_code=...`
- Fallback: if GenEye is unavailable or fails before project evidence exists, `run.ps1` runs browser-only Playwright. If project tests run and fail, the launcher exits nonzero.

## Why It Helps

- Provides one stable wrapper surface for artifact capture and later triage.
- Preserves RustSMF project authority instead of letting wrapper status mask app failures.
- Makes CI parsing easier now that `run.ps1` emits the one-line trailer.

## Upstream Feedback

- Keep advisory `-AllowGenEyeFailure` behavior for downstream projects that own their test gates.
- Preserve the stable trailer fields because they are enough for simple CI parsers.
- Consider adding an optional JSON-lines trailer with the same fields to reduce file post-processing.

## Repo References

- Launcher integration: `run.ps1`.
- Current command behavior: `docs/dev/APP_STATE.md`.
- Test coverage map: `source/frontend/tests/README.md`.
