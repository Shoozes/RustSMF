# RustSMF Review Snapshot

Last reviewed: 2026-09-07

Complete. Current behavior and format limits belong in `APP_STATE.md`; completed work and exact command results belong in [HISTORY.md](HISTORY.md#2026-09-07---native-dialog-acceptance-and-save-coordination); forward work belongs in `TODO.md`.

## Findings resolved

- Skin previously forced Rest even when Frozen Current or Live Animation was selected. The shared workspace policy now activates the requested pose; the unchanged recorded repair journey passes with its original world-position bounds.
- Launcher cleanup previously selected unrelated Vite/Tauri processes by generic command text or port. It now matches this checkout's normalized Node script argument; non-dev tasks do not register dev-exit cleanup. Setup propagates Rust failure, and Vite resolution supports package hoisting.
- Context generation now applies configured exclusions to scanning, globs, trees, and explicit routes; runtime output and symlink/drive-relative escapes are rejected. TODO validation requires populated fields and consistent backlog status.
- Browserslist was updated from 4.28.2 to 4.28.9 with only its required data-package dependencies. The current audit reports zero vulnerabilities.
- Current docs now route to one dated command record instead of repeating completed progress and drifting test counts. Existing context groups own the fixes; defaults remain narrow.
- Real Windows dialog testing exposed a native CSP sidecar failure and foreground saves rejected during autosave. The shipped policy permits local blob resources and the actual IPC hostname; foreground saves reserve their turn and await active autosave. Focused regressions cover both boundaries.

## App and follow-up state

The reviewed source has no unresolved production TODO/FIXME/stub marker or broken relative import/export seam. Existing load, worker, authoring, recovery, and export behavior remains covered by local verification. Existing worker transfer and thumbnail contracts were retained after rechecking suspected issues.

`TODO.md` is empty after actual built-app Windows dialog acceptance completed every remaining condition. Other format/interchange limits remain explicit in `APP_STATE.md`; they become executable work when a concrete failing fixture or requested contract exists.
