# Export presets and queues

## Use

Choose Export, open Tools, then expand **Export queue**. Select GLB Runtime, FBX DCC, DAE Collada or SMF Legacy and use Add to capture the current authored model. Options holds a filename and Include all clips. Export queued processes captures in order. Modern keeps diagnostics and compatibility reports under **Format details**. The existing toolbar Export remains source-aware and keeps its existing fallback policy.

Each queued item retains its selected format and captured geometry, hierarchy, rig data, raw influences, source materials, textures and clips. UUID-addressed tracks bind to captured nodes. Later editing does not change that capture. Queued SMF uses imported SMF data when available. An unsupported explicit format is refused with its reason; no queue item changes format automatically. DAE accepts one named linear TRS clip and one solid material per mesh; texture/multi-clip loss is refused before capture. Presets reuse existing encoders and fidelity limits: GLB is the broadest path; FBX/DAE material and animation limits and SMF generated bone names, byte weights and scale restrictions still apply.

The queue belongs to this editor session; it is not saved in projects. Up to eight items and 128 MiB of estimated owned captures are allowed. Encoded results also respect the existing 256 MiB save limit. The estimate counts arrays, decoded image copies and scene metadata before cloning. Remove or Clear releases retained captures. Finished items retain only their small result rows.

## Ownership and cancellation

`exportQueue.ts` owns ordering, per-item results, cancellation, retry and lifetime. `exportSnapshot.ts` makes private scene/skin/material/image/clip copies or a private SMF candidate. `exportPreparation.ts` invokes existing encoders and round-trip validators. `useLoadModel.ts` connects them to the foreground save owner and latest trailing autosave. Capturing does not mutate history, dirty state or recovery.

The estimate counts arrays at their actual clone sites: shared source track/attribute arrays can produce several private copies, interleaved geometry retains its private sharing, and structured texture copies include the backing allocation. Instance matrices/colors/morph pixels and geometry metadata participate in ownership and cleanup. This is a retained-input estimate, not a process heap or peak encoder-memory measurement. Display settings changed during active source-material reads are retained and applied after the final reader exits.

Cancel stops pending items and aborts SMF worker preparation. Non-abortable encoders must settle before their private resources are released; their canceled results cannot issue a save. Model/resource replacement cancels queued work and invalidates active preparation. Retry incomplete uses the retained captures; remove and add again to capture new edits. Disposal suppresses late notifications and releases active resources after the operation settles.

Desktop destinations use the existing native save dialog for each item. Canceling a destination pauses the remaining queue. An already issued native dialog/write cannot be revoked; Cancel waits for its actual success, cancellation or failure, then stops. Browser results say **Download issued**, meaning the browser received a download request. Check the browser download list for completion or blocking; issuance does not prove a filesystem save. Retry includes failed/canceled items and never repeats successful writes or issued downloads.

## Evidence

- `src/utils/exportQueue.test.ts`: order, limits, copied presets, retry, destination cancellation, stale completion, disposal and issued-save results.
- `src/hooks/exportSnapshot.test.ts`: owned geometry, influences, bones/inverses, clips, metadata, source materials, textures, clone-allocation bounds, interleaving and instance morph cleanup.
- `src/utils/materialPreview.test.ts`: nested captures, overlapping saves, concurrent display changes and replaced registrations retain source state until their own final reader exits.
- `tests/export-queue.spec.ts`: ordinary chooser/pointer/keyboard controls, every preset, independent GLB accessor/instance-transform and sampled-motion checks after re-import, raw FBX/DAE structure, imported SMF fidelity, material/image captures, replacement, preparation cancellation, mocked native failures/retry/recovery and six-size/DPR/coarse/focus checks.

Browser downloads and mocked Tauri IPC retain their source-specific proof. The current-source packaged Windows candidate also passed installed WebView preparation cancellation and retry without issuing a save. Native destination saves/cancel and retry after a completed save remain unobserved. HISTORY and the compact receipt bind each lane to source/package. The public version/release is unchanged.

<!--
AI-created: 2026-10-15T04:24:55-04:00 | agent=Codex/root | task=docs
AI-edited: 2026-10-16 | agent=Codex/root | task=installed-api-acceptance | change=distinguished packaged preparation proof from native destination saves
-->
