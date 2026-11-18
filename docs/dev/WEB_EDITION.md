# RustSMF Web Edition

The Pages build serves the existing editor at `/RustSMF/`. It uses browser file
selection and downloads, including manual `.rsproj` save and reopen. A theme
preference can persist in browser settings. Project autosave and recovery are
disabled because the Shoozes Pages projects share one browser storage origin.

In current source, Classic keeps the project and export actions in its compact
toolbar at narrow and desktop widths. Help next to Undo and Redo explains
manual project downloads and links to the third-party notices. A keyboard
theme switch moves focus to Theme in Classic or More commands in Modern.
Open Asset starts the browser picker in the tap or key press. Model loading
begins after selection, so dismissing the picker leaves the editor ready.

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
isolation. Classic coverage checks toolbar reachability across widths and opens,
saves, and reopens a project at phone width. Touch tests exercise retry when
the picker delivers no selection in either layout. Web artifacts and notices are
under `source/frontend/dist-pages/`.

## Deploy

Select **GitHub Actions** as the Pages publishing source. Publish reviewed
changes to `main` through the [guarded helper](GIT_PUBLISH.md). In Actions,
open **Deploy RustSMF Web Edition** and run it from `main`. The workflow
builds from the locked dependencies and uploads the Pages output. Each
deployment is manual.

The repository allows only the workflow's pinned GitHub actions and the
pinned artifact uploader called by `upload-pages-artifact`. When updating
the pins, account for the uploader's dependency in the repository allowlist.

Run the same browser lane against the public deployment after the workflow
completes:

```powershell
$env:RUSTSMF_TEST_HOSTED_PAGES = '1'
npm --prefix source --workspace frontend run test:web -- --workers=1
```

Record the deployed commit, workflow run, and hosted smoke result before
advertising a first deployment. If a release needs a rollback, put the
reviewed repair or revert on `main` and dispatch the workflow again.

## First deployment

On 2026-11-17, [workflow run 44185157129](https://github.com/Shoozes/RustSMF/actions/runs/44185157129)
deployed `494f91a8aec7bd4b0ae4af0d82146a3b460c6b7d`. The three hosted Chromium
checks passed in a fresh browser. They exercised manual project and GLB
downloads and reimport, verified that project bytes stayed out of browser
storage, and ran the retarget worker using WebAssembly served under
`/RustSMF/`. The README capture shows the same Pages build running the
Classic layout with the first-party Signal Robot sample.

<!-- AI-edited: 2026-11-17 | agent=Codex/root | task=web-edition | change=document Pages build, browser persistence and deploy proof -->
<!-- AI-edited: 2026-11-17 | agent=Codex/root | task=web-edition-review | change=document Classic toolbar, Help, and browser coverage -->
<!-- AI-edited: 2026-11-18 | agent=Codex/root | task=web-mobile-open | change=document the touch picker retry contract -->
