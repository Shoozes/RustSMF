# Contributing to RustSMF

Keep changes focused on a supported model-editing workflow. Reproduce a problem with a small asset before changing import/export, persistence or rendering behavior. Preserve existing format limits and the Original theme's visual baseline.

## Setup

Use PowerShell 7, Node `^22.13.0 || >=24`, Rust and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/). From the repository root:

```powershell
rustup target add wasm32-unknown-unknown
pwsh -NoProfile -File .\run.ps1 -Task setup
pwsh -NoProfile -File .\run.ps1 -Task dev
```

`-Task run` starts the Tauri development application. Source builds need the WASM target for browser retarget analysis; setup installs the pinned generator locally. An installed preview needs no Node or Rust development setup.

## Local checks

Run checks sequentially because the browser suites share production build output:

```powershell
pwsh -NoProfile -File .\run.ps1 -Task verify
pwsh -NoProfile -File .\run.ps1 -Task test:e2e -NoGenEye
pwsh -NoProfile -File .\run.ps1 -Task test:journey -NoGenEye
pwsh -NoProfile -File .\run.ps1 -Task test:visual-strict
```

Retarget-core changes also need `-Task retarget:runtime-proof`; desktop changes need `-Task desktop-smoke`. Preview acceptance additionally needs `-Task package:windows` and the observed installed-app checks in [preview notes](docs/user/PREVIEW_0_2_1.md). Native IPC mocks do not prove real Windows dialogs or installer behavior. Review screenshots before changing Modern references; preserve Original references.

## Useful bug reports

Report the app version/source commit, Windows/browser version, asset format, shortest reproduction steps, expected result and actual result. Include the error text or a screenshot and a small redistributable asset when possible. State whether the problem occurs in the browser shell, installed desktop app or both. Remove personal paths and private assets from public reports.

Project/profile format changes need an explicit compatibility decision. Existing fixtures and focused domain tests should be reused; semantic export assertions must inspect geometry, skin, materials and actual motion rather than relying only on status messages.

## Licensing and maintainer workflow

Project-owned code is MIT licensed. Preserve third-party notices and record the provenance of new fixtures. Unidentified assets receive no new license grant.

`THIRD_PARTY_LICENSES.txt` preserves upstream notice bytes, including line endings and trailing spaces. Its exact path has a Git attributes exception; ordinary source whitespace checks remain active.

Maintainer ownership, work records, local-main Git safeguards and Summary Bank routes are described in [developer docs](docs/dev/README.md) and AGENTS.md. Local review and explicit scoped publication remain separate steps.
