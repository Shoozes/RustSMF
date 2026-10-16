# RustSMF

RustSMF is a local editor for SMF, GLB/GLTF, FBX, DAE/Collada and OBJ models, rigs and animation.

Paint weights and export in one app. No external 3D editor required.

[**Download for Windows x64**](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/RustSMF_0.2.1_x64-setup.exe) · [0.2.1 preview notes](https://github.com/Shoozes/RustSMF/releases/tag/v0.2.1-preview) · [Sample model](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb)

![Our test dummy in RustSMF Modern, with animation controls and Tools closed](docs/images/rustsmf-modern-overview.png)

*Our test dummy playing Walk. Quickstart uses Signal Robot.*

<a id="windows-preview"></a>

## Try it

1. Install the **Windows preview .exe**, then launch **RustSMF**.
2. Download [Signal Robot](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb). **Open** `rustsmf-demo.glb`.
3. Choose **Animate**, open **Tools**, select **Wave**, then **Play**.
4. Use **Save Project** for editable `.rsproj` files. Use **Export** for models.

Drag to orbit · Right-drag to pan · Scroll to zoom. [User guide](docs/user/README.md).

Try [Sable, our original black cat](examples/black-cat/README.md), a self-contained
GLB with Idle, Walk, Run and Sit. The Windows preview download still includes
Signal Robot.

[![Sable playing Walk, Run and Sit](docs/images/sable-motion.gif)](docs/images/sable-walk.webm)

WebM · [Walk](docs/images/sable-walk.webm) · [Run](docs/images/sable-run.webm) · [Sit](docs/images/sable-sit.webm) · 2.4 seconds each.

<details>
<summary>Windows requirements and download verification</summary>

This is an **unsigned preview**, tested on Windows 11 Home x64. WebView2 is required; the installer includes its bootstrapper, which may need internet access.

Download the `.exe` to install. GitHub's source ZIP and tar.gz are for developers.

Use [SHA256SUMS.txt](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/SHA256SUMS.txt) to check the downloaded file. For the default Downloads folder, PowerShell can calculate the installer hash:

```powershell
Get-FileHash "$env:USERPROFILE\Downloads\RustSMF_0.2.1_x64-setup.exe" -Algorithm SHA256
```

Compare the `Hash` value with the installer entry in `SHA256SUMS.txt`. The release also includes offline preview notes and the MIT license.

</details>

## Formats and practical limits

| Action | Formats |
| --- | --- |
| Open | SMF, GLB/GLTF, FBX, DAE/Collada, OBJ |
| Export | SMF, GLB, FBX, DAE |

- **GLB:** includes textures in one file. Duplicate node names may change to keep animation bindings clear.
- **SMF:** cannot store scale animation.
- **DAE:** keeps external texture files separate.

Missing resources and unsupported structures show an error.

See the [user guide](docs/user/README.md) and [current format limits](docs/dev/APP_STATE.md#current-limits).

Source builds open model ZIPs; choose a model if prompted. Extract ZIPs first
when using the 0.2.1 preview.

## Run from source

Clone or unpack the source, then open PowerShell 7 in the repository root. Install the declared Node range (`^22.13.0 || >=24`), Rust and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/):

```powershell
rustup target add wasm32-unknown-unknown
pwsh -NoProfile -File .\run.ps1 -Task setup
pwsh -NoProfile -File .\run.ps1 -Task run
```

`run.ps1 -Task dev` opens the browser app. Setup installs local WASM tooling.

After setup, build the NSIS installer with `pwsh -NoProfile -File .\run.ps1 -Task package:windows`. The command reports its path and SHA-256.

## Contribute and report problems

[Contributing](CONTRIBUTING.md) covers setup, local checks and a useful bug report. [Frontend evidence](source/frontend/tests/README.md#supported-feature-evidence-matrix) maps supported workflows to executable checks. Maintainer state, work records and verification history live in [developer docs](docs/dev/README.md).

## License

Project-owned code and the Signal Robot and Sable samples are [MIT licensed](LICENSE), copyright 2026 Shoozes. Third-party code, fixtures and reference assets retain their own terms. [Third-party notices](THIRD_PARTY_NOTICES.md) and [fixture provenance](source/frontend/tests/fixtures/PROVENANCE.md) describe that boundary; unidentified assets receive no new reuse grant.

<!--
AI-edited: 2026-10-15 | agent=Codex/root | model=unknown | effort=unknown | task=dummy-showcase | change=updated overview and preview caption
AI-edited: 2026-10-16T16:21:33.101Z | agent=Codex/root | model=unknown | effort=unknown | task=standalone-product-guidance | change=kept user workflows self-contained and routed optional sample authoring to developer notes
AI-edited: 2026-10-16T16:31:34.044Z | agent=Codex/root | model=unknown | effort=unknown | task=concise-user-copy | change=shortened instructions and kept metadata out of rendered guidance
-->
