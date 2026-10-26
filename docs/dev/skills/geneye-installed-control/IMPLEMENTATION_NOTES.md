# Quiet UIA control: implementation notes

This records the RustSMF installed-app control experiment so its useful pieces
can be evaluated for a future GenEye CLI/API capability. The current helper is
repository-local PowerShell, not a GenEye control API. GenEye supplies targeted
observation; `scripts/quiet-control.ps1` supplies narrowly checked UIA and
native-window actions.

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
