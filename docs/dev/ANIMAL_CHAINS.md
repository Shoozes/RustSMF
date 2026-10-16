# Animal-chain assistance

Shared Rust API v1 suggests mappings for existing fore/hind limbs, tails and
paired wings. Desktop uses native preflight; browser analysis uses the same
crate's WASM in the existing worker. No solver, rig, profile or project format
is replaced. TypeScript remains the solver comparison/CLI reference.

## Review contract

Use Animate → Tools → Transfer. Choose source clips, inspect the preview and
open Mapping details for corrections. Export mapping saves explicit `manualMap`
fields in the existing profile. Apply is one history transaction; discard,
cancel, authoring invalidation, project persistence and queue exports retain
their existing owners. No additional top-level controls are introduced.

Names such as ForeUpper/FrontUpper, HindLower/RearShin, WingUpper/WingShoulder,
and Tail01/DEF-tail.001 identify families. Left/right prefixes and separated
suffixes identify sides. Recognizable Lower/Paw segments may inherit a named
ancestor's family/side through helper nodes. Unknown numeric bones still need
explicit maps. Unrelated descendants never inherit animal roles merely by count.

Within each family/side, nearest deform ancestry must form one unbranched chain
of at least two members. Segment roles must agree and advance toward the end;
numbered segments must be consecutive in ancestry order. Equal chain lengths
are necessary, never sufficient. Rest segments need nonzero lengths and valid
rotations/scales. Helper bones retain motion through the existing sampler but
are not direct automatic targets. Normalized/fuzzy matching cannot rescue a
refused animal chain or pair one with a humanoid limb.

Explicit mappings remain authoritative, including unusual reviewed choices.
Conflicting overrides suppress remaining automatic choices in that chain.
Missing/duplicate segments, branching, side/front-hind conflicts, invalid rest
frames and unequal chains produce `RIG_MAP_ANIMAL_CHAIN_UNRESOLVED`; review them
explicitly. Valid suggestions produce `RIG_MAP_ANIMAL_REVIEW` and need preview.
Existing normalized proportion diagnostics remain visible. Quadrupeds do not
use hip-to-head as an automatic up axis; review coordinates and reference poses.

## Evidence and limits

`examples/support/animal_fixtures.rs` supplies independent expected maps and
diagnostic requirements to native units and the runtime proof. Fixtures cover
all paired families, inherited context, helper/non-bone ancestry, aliases,
side/front-hind conflicts, missing/duplicate/reversed tails, explicit overrides,
numeric names, invalid rests and different proportions. Mutation controls must
detect altered anatomical endpoint ordering. The runtime command compares native
and actual browser WASM mappings/codes exactly and numbers at 1e-6 tolerance.

`animal-chain-continuity.journey.spec.ts` uses generated skinned geometry and
known 30-degree rotation keys through ordinary selectors/choosers. It checks
reviewed map export/import, correction, preview/discard, Apply, undo/redo,
project reopen and independently parsed queued GLB/re-import motion/influences.
Existing transfer tests retain cancellation, stale results, continued editing,
six viewports, DPR/fractional/coarse controls and Escape/focus evidence.

Run focused tests before the sequential verify, normal browser, journeys,
strict visuals, runtime proof and desktop smoke gate. HISTORY owns exact final
candidate results. Native Rust and mocked IPC are distinct from installed UI.

This is naming/ancestry assistance, not a general animal solver, anatomical
equivalence test or skin-deformation guarantee. Different segment counts need
explicit maps; no chain resampling, custom rig creation/replacement, automatic
skinning or animal IK is added. Sable alone proves no cross-animal compatibility.
Private models, drafts and borrowed references are not test inputs or samples.

AI-created: 2026-10-16 | agent=Codex/root | model=unknown | effort=unknown | task=animal-chain-assistance
