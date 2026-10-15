# RustSMF

RustSMF is a local editor for SMF, GLB/GLTF, FBX, DAE/Collada and OBJ models, rigs, animation and skin weights. Your files stay on your machine.

[**Download for Windows x64**](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/RustSMF_0.2.1_x64-setup.exe) · [0.2.1 preview notes](https://github.com/Shoozes/RustSMF/releases/tag/v0.2.1-preview) · [Sample model](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb)

![Our test dummy in RustSMF Modern, with animation controls and Tools closed](docs/images/rustsmf-modern-overview.png)

*Our test dummy in Modern, with Walk selected. The quickstart below uses Signal Robot, the smaller sample included with the 0.2.1 preview.*

<a id="windows-preview"></a>

## Try it

1. Install the **0.2.1 Windows x64 preview** using the `.exe` above, then launch **RustSMF** from Start or its shortcut. GitHub's source-code ZIP and tar.gz downloads are for building the app yourself.
2. Download [Signal Robot](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb). Click **Open** (the folder icon) and select the downloaded `rustsmf-demo.glb`, or drop it into the viewport.
3. Choose **Animate** from the workspace chooser. Open **Tools**, select **Wave** or **Turn**, and press **Play** in the bottom timeline.
4. **Save Project** keeps an editable `.rsproj`. **Export** writes a model for another tool; the sample exports as GLB. **More** offers explicit export formats and offline **Help**.

Drag to orbit, right-drag to pan and scroll to zoom. The sample has five bones, three materials and two two-second clips, with no external files to find. See the [user guide](docs/user/README.md) for other models and editing controls.

Want another sample? [Sable, our original black cat](examples/black-cat/README.md),
includes Idle, Walk, Run and Sit, plus its editable Blender source. It is a
separate source sample; the Windows preview download still includes Signal Robot.

<details>
<summary>Windows requirements and download verification</summary>

This is an **unsigned preview**, tested on Windows 11 Home x64. WebView2 is required; the installer includes its bootstrapper, which may need internet access.

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

Supported geometry, skeletons and clips have automated round-trip coverage. GLB is the self-contained texture path. SMF cannot store scale animation; DAE export keeps external textures external. Duplicate GLB node names can change to keep animation bindings unambiguous. Unsupported structures and missing resources produce diagnostics; arbitrary third-party assets can exceed these supported contracts.

See the [user guide](docs/user/README.md) and [current format limits](docs/dev/APP_STATE.md#current-limits).

Current source builds can also open a ZIP containing these models and their
resources. Choose one model if several are included. The downloadable 0.2.1
preview still requires extracting ZIPs first.

## Run from source

Clone or unpack the source, then open PowerShell 7 in the repository root. Install the declared Node range (`^22.13.0 || >=24`), Rust and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/):

```powershell
rustup target add wasm32-unknown-unknown
pwsh -NoProfile -File .\run.ps1 -Task setup
pwsh -NoProfile -File .\run.ps1 -Task run
```

`run.ps1 -Task dev` opens the browser development shell. Source builds use Rust for native and browser-WASM retarget analysis; setup installs the matching WASM generator locally. The frontend uses React/TypeScript and Three.js; the desktop boundary uses Rust/Tauri.

After setup, build the NSIS installer with `pwsh -NoProfile -File .\run.ps1 -Task package:windows`. The command reports its path and SHA-256.

## Contribute and report problems

[Contributing](CONTRIBUTING.md) covers setup, local checks and a useful bug report. [Frontend evidence](source/frontend/tests/README.md#supported-feature-evidence-matrix) maps supported workflows to executable checks. Maintainer state, work records and verification history live in [developer docs](docs/dev/README.md).

## License

Project-owned code and the Signal Robot and Sable samples are [MIT licensed](LICENSE), copyright 2026 Shoozes. Third-party code, fixtures and reference assets retain their own terms. [Third-party notices](THIRD_PARTY_NOTICES.md) and [fixture provenance](source/frontend/tests/fixtures/PROVENANCE.md) describe that boundary; unidentified assets receive no new reuse grant.

AI-edited: 2026-10-15 | agent=Codex/root | model=unknown | effort=unknown | task=dummy-showcase | change=updated overview and preview caption
