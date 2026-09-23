# RustSMF Review Snapshot

Last reviewed: 2026-09-23

Current contracts
belong in [APP_STATE.md](APP_STATE.md), executable
acceptance conditions in [TODO.md](TODO.md), and dated proof in
[HISTORY.md](HISTORY.md).

## Current findings

- The context bank validates 42 groups with a 52.1 KiB default orientation under
  its 64 KiB focused cap and the 256 KiB generation ceiling. DAE/FBX image
  readiness and rig-helper tests route through focused feature/issue groups;
  large integration owners remain outside default context.
- Relative frontend imports/re-exports, Rust module checks, lint, both
  typechecks, production-`any`, and the source marker scan pass. No production
  TODO/FIXME/unimplemented stub was found; the remaining `placeholder` match is
  a real input hint. This is not exhaustive runtime proof.
- The RustSMF backlog is empty. The formerly listed caller-owned P1 acceptance
  gate was re-audited and retired as an external dependency: its attended
  source/receiving receipt is produced by fight-game-study, not this repository.
  The available hash-bound report remains preserved as evidence of the boundary,
  not as a substitute for that receipt.
- The browser contract is green at 105/105 tests after correcting a stale DAE
  status assertion to match the generic `Loaded: <name>` load path. Existing
  GLB/FBX/DAE/OBJ round-trip, sidecar, replacement, and async-ownership checks
  remain covered.
- A real DAE sidecar repro exposed premature object-URL revocation before
  Collada image loading completed, which caused the first project autosave to
  fail in GLTFExporter. DAE and FBX now share bounded image-readiness and
  unavailable-map cleanup; the same repro autosaved without an error. Rig-helper
  overlay scale now follows measured world-space bone spacing with model-bounds
  fallback for degenerate links.
- The neutral caller-owned game-ready workflow is now proven through the actual
  CLI: two named motions are mapped, material-repaired, published, re-imported,
  and checked for sampled timing/transforms, raw skin values, decoded material
  content, and provenance. Input hashes are captured before the first publish;
  malformed mapping, missing clip, and interrupted publication preserve the
  previous generation and caller inputs. The same test runs from a clean copied
  temporary Git tool workspace with no consumer-repository siblings. The receipt
  is emitted at the ignored `source/frontend/test-results/game-ready-neutral/receipt.json` path.
- `check:game-ready-dependencies` scans the game-ready production route and
  package manifests for fight-game-study/GaimEngine checkout references; it
  passes with no undeclared consumer dependency. Partial caller attachment maps
  are supported for non-humanoid rigs while strict all-role resolution remains
  the default utility contract. The current full verify gate passes with 488
  frontend unit tests and 10 Rust tests.
- The project codec now validates `sourceFormat` against the shared model-format
  registry instead of a stale hand-maintained allowlist. DAE project snapshots
  therefore reopen with their source-aware editing/export state intact; a
  regression round-trips every supported source format.
- DAE is a supported browser import/export path with pre-save re-import
  validation and synthesized missing Collada normals; ZIP remains a container,
  not a model input. The Display menu now includes a tested Hide rig control,
  allowing shaded-silhouette inspection without changing export state.
- The supplied pair is accepted for RustSMF source inspection: both DAE files
  loaded cleanly, the animation-only source remained geometry-free, the
  with-skin source showed 33 bones/one 2.50s clip/3,726 vertices, and single
  plus quad start/mid/end review showed no observed leg/torso deformation
  failure or self-clipping. Caller-owned all-frame/receiving proof remains
  external integration evidence, and game appearance and transition checks stay
  outside RustSMF completion criteria.
- The source workspace `npm run verify` now includes the same game-ready
  dependency guard as `run.ps1`; a project-integrity regression protects that
  entry-point parity. Lazy Tauri-client initialization shares one in-flight
  import and resets after an import failure, so overlapping app actions do not
  construct duplicate bridge wrappers or poison later retries.
- The Animate quadratic option is visibly metadata-only, the SMF Outliner
  source-owned boundary is disabled and explained, and retired same-texture
  merging is explicitly diagnostic-only with no UV/material mutation path.

Completed implementation narratives are retained in HISTORY rather than repeated
here. [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
contract; private models and diagnostic output remain ignored.
