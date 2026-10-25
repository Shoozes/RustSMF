# Bounded rotation-span authoring

NLERP job v3 may explicitly add `conditioning.rotationSpanBake` alongside the
existing singular or one–three disjoint two-key recipes. It requires the explicit
`export.twoKeyExportBoundary: "preserve-unselected-emitted-keys.v1"` policy.
The two-key selection owns its separate three-record cap; legacy jobs retain their behavior.

The span declares `clipId`, `startTick`, `maxRotationDegrees` and `rotations`.
Exactly three unique non-root joints must form an existing direct parent chain.
Each joint supplies the same 3–18 consecutive unit-quaternion `values`; the
derived end tick must be strictly inside the clip. The finite positive bound
cannot exceed 25 degrees and applies to actual stored float32 rotations, measured
against their pre-authoring values. Caller arrays remain immutable.

Only those rotation values and adjacent canonical chord tangents change.
Translations/scales, root, all other keys/channels/clips, skin and bind stay
binding. Shared-joint footprints may neither overlap nor adjoin existing bakes;
disjoint joint chains may share selected ticks, where the existing two-key
full-pose policy takes precedence. Terminal conflicts, malformed recipes,
noncanonical tracks, missing/ambiguous chains and out-of-bound stored values fail
before publication. Cancellation and
late failure leave input clip arrays unpublished and release mixer/asset owners.

The report remains within `rustsmf.skeletal-conditioning.v1`. Its `rotationSpanBake`
record carries policy `bounded-interior-rotation-span.v1`, complete tick coverage,
bound, and three corrections containing each tick's before/requested/after values
and measured stored correction. Original-source fidelity restores only the union
of explicitly authorized local rotations; every descendant and other transform
still passes the existing matrix guard.

Export validates all reports and restores all before-values together per channel.
Existing two-key selected ticks keep their prior full-pose behavior. Span ticks
copy only declared joint rotations from the reloaded authored GLB at nominal
`tick/60`; all other emitted components, keys and root samples use the restored
baseline. This protects nominal boundaries even when float32 stored times lie
on the other side. Source references independently sample the authored GLB at
the existing five phases, with unchanged tolerances and resource limits.
Packets without the selected clip receive no span context.

The measured White Wolf selection is right UpLeg/Leg/Foot at ticks 48–65,
54 rotations under 25 degrees, alongside right43/44 and left87/88. The
[integration contract](SKELETAL_EXPORT_BOUNDARY.md#right-swing-rotation-span-integration)
and HISTORY own source-bound qualification and remaining physical failures.
This API does not expose a runtime IK solver or change GaimEngine v1.

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-span-integration | change=specified explicit bounded authoring provenance and component-preserving export -->

<!-- AI-edited: 2026-10-24 | agent=Codex/root | task=p7c-span-review-cleanup | change=fixed shared ticks and selected proof renewal -->

<!-- AI-edited: 2026-10-25 | agent=Codex/root | task=p7c-drift-review-cleanup | change=aligned current plural cap with shared admission -->
