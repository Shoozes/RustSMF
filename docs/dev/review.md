# RustSMF Review Snapshot

Last reviewed: 2026-09-13

The repository-wide integrity pass repaired the recent model-refactor boundaries and left one evidence-backed P1 retarget-fidelity task in `TODO.md`. Current behavior and limits belong in `APP_STATE.md`; completed work and exact command results belong in `HISTORY.md`.

## Findings resolved

- Extracted the game-ready job schema from its execution script. It now rejects duplicate/input-overwriting paths, empty explicit clip selections, unknown attachment roles, and invalid recovery/timing values through focused pure tests.
- Replaced parallel whole-file CLI materialization with same-handle chunked reads. Per-file limits, regular-file checks, and the remaining aggregate budget are enforced before later inputs are read.
- Fixed partial-frame retarget output so its terminal key cannot exceed clip duration, and added normalized mapped-rig segment reporting. The preserved Wolf candidate remains byte-stable, but gameplay rejection supersedes screenshot-only acceptance because axes and timing do not compensate for different proportions or skinning.
- Material preparation now disposes textures/materials acquired before a later load failure. Additive append, retarget, and repair operations join latest-intent ownership so stale completions cannot clear or overwrite a newer operation's status.
- Removed a static `App.tsx` import of the Tauri bridge that defeated lazy loading. The production manifest again emits it as a dynamic entry, and the entry-chunk guard now fails if that boundary regresses.
- Split the broad game-ready context route into focused material-repair, rig-retargeting, and CLI workflow groups. The bank has 34 valid groups, its default orientation remains 45.1 KiB, and generated/private assets remain excluded.

## App and follow-up state

The reviewed production source has no unresolved TODO/FIXME/stub marker or broken relative import/export seam. Browser coverage now proves material-repair apply/undo/redo and real JSON GLTF retarget import; focused units cover schema ambiguity, bounded reads, partial resource cleanup, retarget terminal timing, and proportion warnings. The closing gates passed 385 frontend units, 10 Rust tests, 89 browser cases, 3 strict visual cases, plus an unbundled Tauri release build and 13 native IPC cases; the dependency audit reports zero vulnerabilities.

`TODO.md` now owns one P1 three-state same-topology comparison. It is required before final fighter acceptance because the current pipeline preserves target proportions and weights; further clip-specific conditioning would otherwise risk hiding a rig-fit or receiving-runtime defect. Historical Windows-dialog acceptance remains complete and is not reopened.
