# Quiet UIA control: implementation notes

This records the RustSMF installed-app control experiment so its useful pieces
can be evaluated for a future GenEye CLI/API capability. The current helper is
repository-local PowerShell, not a GenEye control API. GenEye supplies targeted
observation; `scripts/quiet-control.ps1` supplies narrowly checked UIA and
native-window actions. The tracked PowerShell helper records the earlier
experiment. The installed-session runner owns the current acceptance workflow.

## Choose the proof by outcome

| What and why | Who, where and when | How to prove it |
| --- | --- | --- |
| Exercise Open, queue failure or retry | The RustSMF maintainer runs the isolated probe on Windows against a selected installed binary and fresh profile. | Use native controls and exact filename readback. Verify actual output or write refusal independently. |
| Review model and paused preview pixels | Use GenEye on the exact app window when the task calls for installed visuals. | Capture the loaded, preview, applied and reopened states. Check resolved HWND/PID, quality and visible model region. |
| Review normal-speed playback | Use a bounded, attended Windows session with operator authorization when isolated capture cannot supply pixels. | Verify supervision and record the matching window target. Check decoded duration, frame count and crop occlusion. |

For the [November Sable run](../../HISTORY.md#installed-attended-observation-20261108),
an isolated capture returned `0x80070057`. In the later attended session, the
supervisor grant matched plain window capture. A compositor selector was
rejected for recording, while the same HWND with `--window-hwnd` worked.
Use compositor stills for paused states where supported and a short supervised
window recording for motion. Review the model region for occlusion. The
taskbar and supervisor badge were visible in the recording outside that region.

In two PowerShell sessions, resolve the owned HWND and use a new task run
directory for the grant and outputs. Here `$appHwnd` is the verified handle and
`$runDir` is the existing task directory.

```powershell
GenEye supervise --hwnd $appHwnd --session-file "$runDir/supervised.json" --seconds 120
```

In the recording shell, while the supervisor is active:

```powershell
$env:GENEYE_SUPERVISED_CAPTURE_SESSION = "$runDir/supervised.json"
try {
    GenEye record-smooth --window-hwnd $appHwnd --duration-ms 5000 --fps 30 `
        --out "$runDir/playback.mp4" --manifest "$runDir/playback-recording.json" `
        --ffmpeg (Get-Command ffmpeg).Source
    if ($LASTEXITCODE -ne 0) { throw 'GenEye recording failed' }
} finally {
    Remove-Item Env:GENEYE_SUPERVISED_CAPTURE_SESSION
}
```

Use a fresh recording shell so a prior grant is never overwritten. After
capture, let the bounded supervisor expire or use its visible stop control.
Keep the terminal owner receipt and verify job exit and default recovery
hashes and times. In the Sable case, baseline and preview exports matched,
and Apply and save/reopen preserved the selected paused time and motion.
Those comparisons complement the pixels. The commands were observed on GenEye
0.5.1; the 0.5.2 CLI help accepts the shown flags. A new visual session would
be needed to qualify 0.5.2 capture behavior.

## Why the helper exists

The installed Tauri window exposed mostly WebView containers through UIA. A
GenEye click report did not prove that a toolbar action occurred. Enumerating
child windows of the exact app HWND found one `Chrome_RenderWidgetHostHWND`.
UIA rooted at that child exposed named editor buttons, tabs and disclosures.
Windows common dialogs exposed their filename Edit and action Button as UIA
panes without usable Value or Invoke patterns, so the helper sends `WM_SETTEXT`
and `BM_CLICK` to those exact owned child HWNDs.

## How it was assembled

1. An owned run receipt records the app PID, executable path and UTC process
   creation time. Each helper call compares all three with the live process and
   checks the supplied app or dialog HWND belongs to that PID. Stale or
   titleless auxiliary handles are not guessed into a replacement.
2. The helper loads .NET `UIAutomationClient` and `UIAutomationTypes`, plus a
   small `user32.dll` P/Invoke for child enumeration, class names, owner PIDs
   and exact-window messages. It requires one renderer child for WebView
   actions and one matching native control for dialog actions.
3. WebView actions use the available UIA Invoke, SelectionItem, Toggle or
   ExpandCollapse pattern. A `Names` read lists matching semantic control
   names for discovery. The dialog path checks input existence or save-parent
   existence; save refuses an existing file unless an explicit reviewed
   overwrite flag is supplied.
4. GenEye capture and independent inspection of saved projects/GLBs determine
   whether an action worked. The helper's `sent` or `executed` JSON means only
   that an input API returned; it is not an acceptance result.

This route loaded and saved installed RustSMF projects, selected and canceled
ZIP inputs, retried queued exports, opened Help, and reopened a project in a
second clean profile without moving the physical pointer. See the
[dated acceptance record](../../STANDALONE_ACCEPTANCE.md) for exact evidence and
remaining cases.

## Boundary and extraction candidate

Minimizing the app did not isolate native file dialogs: they appeared on the
operator's active desktop. A quiet run must establish a verified isolated
desktop or session before opening another picker. An operator-closed dialog
does not establish a UIA failure. Do not switch to physical pointer input to
make a test pass.

A reusable GenEye control feature would need explicit owner identity, child-HWND
discovery, unique semantic targeting, capability reporting, action-result
observation and an isolated-session contract. It should keep capture and input
results distinct. The repository helper remains scoped to RustSMF's installed
acceptance until those controls and safety boundaries are independently proved
in GenEye. Feedback for that owner is in its local research inbox at
`C:/DevStuff/GenEye/docs/research-inbox/2026-10-26-1711-rustsmf-quiet-uia.md`.

<!-- AI-edited: 2026-10-26 | agent=Codex/root | task=quiet-uia-closeout | change=record implementation method and extraction boundary -->
