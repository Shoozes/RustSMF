# ZIP bundle intake

Open or drop one ZIP by itself. One supported model opens directly; several
require an explicit choice. Cancel and Escape leave the current model and history
intact. The existing unsaved-replacement decision runs before expansion. Only a
successfully loaded candidate replaces work.

ZIP is an input container for SMF, GLB/GLTF, FBX, DAE and OBJ. Alternate model
members are excluded after selection; other files retain archive-relative paths
for the existing loaders. No files are extracted to disk. Project/profile/export
formats, Transfer source selection and static Append stay unchanged. This source
feature is newer than the published 0.2.1 installer.

## Bounds and compatibility

- Stored/deflated entries, UTF-8 names, empty directories, comments and data
  descriptors. Native raw-deflate streaming runs in a lazy browser/WebView worker.
- Empty directory markers may omit host attributes. Conflicting directory/file
  attributes and special files remain refused; progress counts ordinary files.
- At most 64 entries including directories, 256 MiB input and expanded aggregate,
  256 MiB per model, 64 MiB per other file. Empty deflated directories have a
  separate 64 KiB compressed bound.
- Central/local agreement, non-overlap, actual expansion sizes and CRC are
  checked. Unsafe/encoded/absolute/traversing paths, duplicate case-folded names,
  special files, nested archives, encryption, multipart ZIP, ZIP64 and unsupported
  compression methods are refused visibly.
- Resources stay inside the selected bundle. Archive FBX/DAE use strict resource
  resolution even with one member; existing texture fallback and format limits
  remain loader-owned. No inference of Tripo-specific material slots or rigging.

Record layouts follow the [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).
Unsupported runtime decompression fails with guidance; no synchronous fallback.

## Lifecycle and authority

Desktop uses existing Rust Open/read authorization and byte limits. Browser File
bytes are deferred to the worker. Success, failure, timeout (120 seconds including
native reading) and Cancel terminate the worker. Fresh native buffers transfer
ownership; other caller buffers are copied. An issued Rust read cannot be aborted;
Cancel rejects its result immediately and late bytes are ignored. Native archive
reads are serialized so repeated cancellation cannot accumulate reads. Model
choice has no timer. Timeout or worker failure also retires queued reads before
they can be issued. New loads/unmount abort the pending job/choice; existing
load guards dispose stale parsed scenes before they can replace current work.

`useModelArchive.ts` owns extraction/choice; `useLoadModel.ts` retains replacement,
loader dispatch, autosave coordination and model commit. The temporary dialog
uses existing theme tokens, keyboard focus wrapping, Escape and focus return.
There are no additional permanent toolbar or drawer controls.

## Proof owners

`modelArchive.test.ts` checks hostile/valid records, optional directory attributes,
file progress, sizes, CRC, paths and stream cancellation. `modelArchiveClient.test.ts` checks private buffers, native buffer
handoff, release, timeout/failure and stale completion. `archive-intake.spec.ts`
uses the actual browser worker, all six model extensions, generated sidecars,
explicit choice, sampled skin/animation continuity, project reopen, preserved
editing after failed/canceled replacement, mocked native cancellation/timeout/retry and
six viewport/DPI/input lanes. The independent ZIP writer is Three.js's existing
vendored fflate test utility. ZIPs are generated in memory from existing fixtures
and project-owned generators; borrowed donor assets and Tripo drafts are unused.

HISTORY and `output/zip-intake-20261015/receipt.json` own observed commands,
source identity and retained captures. Native adapter tests use mocked IPC;
this batch has no new installed Windows or OS-dialog acceptance claim.

<!--
AI-created: 2026-10-15T01:25:30-04:00 | agent=Codex/root | task=docs
AI-edited: 2026-10-15T03:32:39-04:00 | agent=Codex/root | task=docs | change=recorded ZIP review fixes and next export queue scope
-->
