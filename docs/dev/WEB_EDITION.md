# RustSMF Web Edition

The Pages build serves the existing editor at `/RustSMF/`. It uses browser file
selection and downloads, including manual `.rsproj` save and reopen. A theme
preference can persist in browser settings. Project autosave and recovery are
disabled because the Shoozes Pages projects share one browser storage origin.

## Local build and proof

Use Node 24 and a Rust toolchain with the `wasm32-unknown-unknown` target.
The build installs the pinned wasm-bindgen CLI under the repository's output
directory when needed and uses the locked Binaryen dependency.

```powershell
npm --prefix source ci
rustup target add wasm32-unknown-unknown
npm --prefix source --workspace frontend run build:web
npm --prefix source --workspace frontend run test:web -- --workers=1
```

The browser runner builds once, serves the Pages output under `/RustSMF/`, and
closes its preview server at the end of the run. It exercises explicit
downloads and reimport, storage behavior, Classic launch and theme switching,
and actual retarget worker and WebAssembly delivery without cross-origin
isolation. Web artifacts and notices are under `source/frontend/dist-pages/`.

## Deploy

Select **GitHub Actions** as the Pages publishing source. Publish reviewed
changes to `main` through the [guarded helper](GIT_PUBLISH.md). In Actions,
open **Deploy RustSMF Web Edition** and run it from `main`. The workflow
builds from the locked dependencies and uploads the Pages output. Each
deployment is manual.

Run the same browser lane against the public deployment after the workflow
completes:

```powershell
$env:RUSTSMF_TEST_HOSTED_PAGES = '1'
npm --prefix source --workspace frontend run test:web -- --workers=1
```

Record the deployed commit, workflow run, and hosted smoke result before
advertising a first deployment. If a release needs a rollback, put the
reviewed repair or revert on `main` and dispatch the workflow again.

<!-- AI-edited: 2026-11-17 | agent=Codex/root | task=web-edition | change=document Pages build, browser persistence and deploy proof -->
