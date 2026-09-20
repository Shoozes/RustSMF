# RustSMF Review Snapshot

Last reviewed: 2026-09-20

Current contracts
belong in [APP_STATE.md](APP_STATE.md), executable
acceptance conditions in [TODO.md](TODO.md), and dated proof in
[HISTORY.md](HISTORY.md).

## Current findings

- The context bank now validates 42 groups. The default orientation expands to
  52.4 KiB under its 56 KiB focused cap and the 256 KiB generation ceiling;
  DAE, store, and build-contract paths are routed through their owning groups.
- Relative frontend imports/re-exports, Rust module checks, lint, both
  typechecks, production-`any`, and the source marker scan pass. No production
  TODO/FIXME/unimplemented stub was found; the remaining `placeholder` match is
  a real input hint. This is not exhaustive runtime proof.
- The browser contract is green at 104/104 tests after correcting a stale DAE
  status assertion to match the generic `Loaded: <name>` load path. Existing
  GLB/FBX/DAE/OBJ round-trip, sidecar, replacement, and async-ownership checks
  remain covered.
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
  the default utility contract. The current full verify gate passes with 480
  frontend unit tests and 10 Rust tests.
- The project codec now validates `sourceFormat` against the shared model-format
  registry instead of a stale hand-maintained allowlist. DAE project snapshots
  therefore reopen with their source-aware editing/export state intact; a
  regression round-trips every supported source format.
- DAE is a supported browser import/export path with pre-save re-import
  validation and synthesized missing Collada normals; ZIP remains a container,
  not a model input. The user-supplied with-skin Mixamo DAE still lacks a
  trustworthy shaded silhouette because the rig helper dominates the view.
- The supplied DAE visual review and reusable humanoid action-range/skin review
  remain active evidence items. Game appearance and transition checks stay
  outside RustSMF completion criteria.

Completed implementation narratives are retained in HISTORY rather than repeated
here. [HUMANOID_POSE_REVIEW.md](HUMANOID_POSE_REVIEW.md) owns the angular-review
contract; private models and diagnostic output remain ignored.
