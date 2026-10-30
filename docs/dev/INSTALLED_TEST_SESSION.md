# Isolated installed picker probe

This test-only Windows route proves one installed Open/cancel sequence without
switching the operator's input desktop. It adds no application runtime dependency
and requires no GenEye checkout. It does not qualify native filename submission,
queue writes, retargeting, or animal assistance.

From PowerShell 7, supply an absolute installed executable, its independently
selected SHA-256, and a fresh task-owned output directory:

```powershell
pwsh -NoProfile -File scripts/installed-test-session.ps1 `
  -Executable '<installed rustsmf.exe>' `
  -ExpectedSha256 '<64 hexadecimal characters>' `
  -OutputRoot '<fresh absolute directory>' -ProbeSeconds 15
```

The Windows lane requires Windows PowerShell 5.1, the OS .NET Framework compiler
and UI Automation assemblies, and the selected installation's WebView2 runtime.
These are test prerequisites, not additional RustSMF runtime integrations.
No dependency installation or execution-policy change is performed.

The launcher creates a unique non-input Win32 desktop and a kill-on-close job.
It starts a suspended worker on that desktop, assigns it to the job, then resumes
it. The worker starts the hash-verified installed application with a fresh WebView
profile. Ambient browser arguments, executable overrides and debugger settings
are removed only from that worker's environment. Its dedicated non-window-owning
MTA thread queries UI Automation. Renderer children may have their own PID; every
target must belong to this exact job and desktop, with fresh HWND validation.
The application and renderer paths, creation times, session, HWNDs and profile
are recorded. No broad PID-name targeting is used.

After observing the renderer and enabled Open asset control, the worker invokes
Open, observes the owned native picker and posts IDCANCEL to that exact dialog
after checking its native Cancel button. It verifies that the picker disappears.
The parent samples the input desktop and owned picker windows every 50 ms while
the worker runs, and checks the input desktop again before release. This is
sampled observation, not an event-complete proof that no transient window could
ever exist between samples. No SwitchDesktop, physical input, foreground-window
takeover, CUA, registry change, or fallback to the input desktop is used.

Creating `<OutputRoot>/cancel` stops the owned job. Timeout, bootstrap/control
failure and cancellation retain a failed receipt. Cleanup terminates that job,
waits for zero active processes, closes its process/job/desktop handles, and
records cleanup separately without replacing the original failure. Profiles,
logs, native helper and worker copy remain test-owned evidence; this tool never
deletes them or an installation. Unknown or reused output roots are refused.

Run `node --test scripts/installed-test-session.test.mjs` for the guards, actual
rendererless failure/cleanup and cancellation lanes. The public `verify` task
includes them. Non-Windows hosts explicitly skip the three Windows tests; static
checks do not substitute for an installed picker result.

## Verified result and remaining boundary

The 2026-10-30 final probe passes on installer B's executable
`2688ecb8cf5093be700b8101149f94f160e388c0b10ad21ab85c9b581aaa7f13`.
Its source/package lineage remains the selected 2026-10-26 installed candidate,
not the current public preview or every subsequent producer source revision.
The receipt binds the current installed WebView2 renderer separately.
[Final receipt](D:/Compact_Evidence/RustSMF/runs/installed-isolated-picker-20261030/final-probe/receipt.json).
Four regression tests pass; job process count is zero and all handles release.

The subsequent queue-intake prototype did not load Signal Robot: the owned native
picker did not settle after filename/Open messages within 15 seconds, including
the bounded synchronous fallback. No export, obstruction, native write failure
or retry was reached. This is a test-control gap, not a demonstrated queue defect
or a reason to add GenEye as a product dependency. Do not repeat an unchanged
attempt or use the operator's desktop. First prove native filename submission
on an authorized isolated route, then continue the real failure/retry scenario.
The unqualified queue prototype is retained only with its failed evidence, not
installed as an executable public workflow.
[Failure receipt](D:/Compact_Evidence/RustSMF/runs/installed-isolated-picker-20261030/queue-bounded-send/receipt.json).

AI-created: 2026-10-30 | agent=Codex/root | task=installed-isolated-picker | change=document tested isolated picker boundary and unresolved native filename submission
