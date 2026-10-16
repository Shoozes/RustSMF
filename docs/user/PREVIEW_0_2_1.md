# RustSMF 0.2.1 Windows preview

The [0.2.1 preview release](https://github.com/Shoozes/RustSMF/releases/tag/v0.2.1-preview) is available for Windows x64. It includes the verified installer, sample, offline notes, license and checksums.

## What changed

Modern keeps a compact command strip, a workspace chooser and Tools closed by default. More includes offline Help with essential controls, format limits, version/license and disclosed action details. Ordinary load messages show the source name; warnings and fallback reasons remain visible.

The preview includes the project-generated Signal Robot GLB and MIT licensing for project-owned code. Required third-party notices are installed with the application. Its README image and browser render checks require actual visible scene pixels.

## Install and try

1. [Download the installer](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/RustSMF_0.2.1_x64-setup.exe), install it, then launch **RustSMF**.
2. Download [Signal Robot](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/rustsmf-demo.glb). **Open** `rustsmf-demo.glb`.
3. Choose **Animate**, open **Tools**, select **Wave**, then **Play**.
4. Use **Save Project** to keep edits. Use **Export** to write a GLB.

**More → Help** works offline. Download the `.exe` to install; source archives
are for building the app.

This unsigned preview was checked on Windows 11 Home x64. WebView2 is required; its installer bootstrapper may need internet access. [SHA256SUMS.txt](https://github.com/Shoozes/RustSMF/releases/download/v0.2.1-preview/SHA256SUMS.txt) identifies the expected download hashes. The installed application also includes the sample under `examples` and third-party notices under `licenses`.

<details>
<summary>Build identity and verification record</summary>

## Verified local artifact

Installer: `RustSMF_0.2.1_x64-setup.exe` (Windows x64, unsigned).
SHA-256: `cfa9bbf7f14f80a4ec18a9561ab3c180d62b26e935b21148a2815e1c5f0188ab`.
The native-tested copy is retained locally at `output/preview-0.2.1/package/RustSMF_0.2.1_x64-setup.exe`. Fresh packaging output reports its own hash; compare payload identity before reusing native observations for another build.
Native-run implementation source SHA-256: `8f730726ebfa764754126cb0b8cfbe6542c233baffb2bf3c67d0baf36698940a`; base `0973968a3db7c5ac29d7830b4fce2cf8d7abc0a3`. Closeout documentation and Summary Bank notes are tracked separately; publication binds the exact staged tree in its local receipt.

The final sequential gate passed verify (514 frontend tests), 134 browser checks, 11 journeys, 3 strict visuals, desktop smoke (13 mocked IPC cases) and NSIS packaging. Exact commands, results and source/installer binding are in the local receipt and dated HISTORY.

## Acceptance record

The local receipt identifies source, runtime, commands, exit codes, installer filename/hash and owned-resource disposition. Browser and mocked IPC results are separate from the real installed-app UI observations. The Windows run used local UI automation, not a human checklist response. Pending or unrun checks are never counted as passed.

## Observed Windows checks — 2026-10-11

NSIS installed per-user into a test-owned directory with exit 0. The installed executable, notices and sample were identified by hash. Existing recovery generations were backed up; a newer copy found at resume was preserved separately.

1. **Passed:** launch, visible Signal Robot, Wave and Turn motion, version 0.2.1 in offline Help, Escape dismissal and visible focus return.
2. **Passed:** real Open and Save cancellation preserve the current model. Selecting GLTF, buffer and PNG together loads a textured four-vertex model with two bones and FixtureBend. Use ordinary folder/list selection for multiple files.
3. **Passed:** rename and pose the sample, save/reopen a project, restore selection/clip/playback/metadata, and continue editing. Independent GLB parsing verifies hierarchy, geometry, materials, raw normalized influences, clip durations/motion and the continued pose; re-import renders and animates.
4. **Passed:** malformed and missing-resource replacements retain the model. Windows rejects the test-owned read-only save destination before a Rust write; its bytes remain unchanged. Closing/relaunching and Recover restore the test autosave with texture/rig/animation, and authoring continues.
5. **Passed:** both app/WebView process trees exit, the owned installation and registration are removed, and all three original recovery files match backup bytes, lengths and precise UTC timestamps. The newer resume copy remains recoverable separately.

Compact observations, independent asset assertions and useful compositor captures are retained in ignored `output/preview-0.2.1/native-test/`; process and restoration identities are in `native-owner.json`. These observations apply to the identified Windows x64 package and bounded fixtures.

</details>

## Limits

This preview accepts the supported bounded workflows documented in the user guide. It does not certify arbitrary third-party assets, every FBX producer, other operating systems or game-specific acceptance. Existing SMF scale, DAE texture and ambiguous-name restrictions remain in effect.

<!--
AI-edited: 2026-10-16T16:31:34.045Z | agent=Codex/root | task=concise-user-copy | change=shortened instructions and kept metadata out of rendered guidance
-->
