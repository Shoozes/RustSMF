---
name: geneye-installed-control
description: Observe and exercise RustSMF's installed Windows app through GenEye CLI/API capture and exact-HWND native controls without taking over the operator's cursor or foreground window.
---

# GenEye installed control

Use this skill for RustSMF installed-product UI acceptance. The repository
prefers GenEye and app-native controls over general computer-use automation.

1. Read the current GenEye capture/control skill or CLI help for the available
   version. Resolve the installed process from its owned receipt, then verify
   PID, creation time, executable and exact HWND before input. A process can
   have auxiliary titleless windows; select the actual titled app or dialog.
2. Launch the task-owned app minimized when possible. Observe through GenEye's
   target-specific capture or structured CLI/API state. Check capture quality
   and target identity. A top-level Tauri HWND can expose only the WebView
   container; enumerate its owned child HWNDs and query the
   `Chrome_RenderWidgetHostHWND` with UIA to reach actual buttons. Prefer its
   Invoke pattern or app-native messages without focus. For common dialogs,
   locate the filename edit and action buttons by current UIA/native properties.
   Use `scripts/quiet-control.ps1` for exact owner-receipt checks and the
   verified renderer/dialog control actions. `DialogSave` rejects an existing
   output unless `-AllowExistingSave` is explicit for a reviewed overwrite test.
   A minimized Tauri app can still put native Open/Save dialogs on the operator's
   active desktop. Do not invoke any picker there during a quiet run. Establish
   a verified isolated desktop/session first, or leave its real-dialog case
   unverified. A dialog closed by the operator is not a UIA failure.
3. Keep tests quiet. Do not move the physical pointer or take the operator's
   foreground window. Do not use CUA for this workflow. If a WebView control
   exposes no quiet app-control route, leave that case unverified and record the
   gap. A reported input step is not proof that the app changed; observe its
   resulting state and inspect saved files independently.
4. Use concise result summaries. Preserve the source, installed profile,
   fixtures, retained evidence and unrelated work. Release only the exact owned
   process and temporary resources at the end of the run.

GenEye's UIA tree may expose a Windows common dialog's child controls as panes
without Invoke or Value patterns. An exact-HWND native message to a verified
owned Edit or Button is a quiet app-control fallback. Reject a stale handle or
PID mismatch rather than guessing a replacement.

[Implementation notes](IMPLEMENTATION_NOTES.md) record how this local UIA route
was built, its observed limits, and the possible GenEye extraction boundary.

<!-- AI-edited: 2026-10-26 | agent=Codex/root | task=standalone-quiet-control | change=route installed acceptance through quiet GenEye and exact-HWND controls -->
