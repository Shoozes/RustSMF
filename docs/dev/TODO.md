# RustSMF TODO

Last reviewed: 2026-08-01

This file contains executable forward work only. Current behavior belongs in `APP_STATE.md`; completed work and command evidence belong in `review.md`; recurring hazards belong in `PITFALL_LEDGER.md`.

## Priority Order

### P2 — Add an independent skinned FBX compatibility fixture

**What:** Add one redistributable third-party or independently authored skinned FBX fixture with a texture and animation, plus import/export/reimport assertions.

**Why:** Current basic FBX support is strongly guarded but relies on a self-authored static parser fixture and generated GLB-to-FBX output. That proves internal consistency, not broad external FBX dialect compatibility.

**Where:**

- `source/frontend/tests/fixtures/`
- `source/frontend/src/loaders/fbx.test.ts`
- `source/frontend/tests/export-formats.spec.ts`
- fixture provenance/license documentation

**When:** Before broadening user-facing FBX claims beyond “basic” or diagnosing a real third-party skinned FBX failure.

**How and subtasks:**

1. Select or author a small fixture with explicit redistribution permission and record provenance.
2. Pin expected mesh, material/texture, skeleton, clip, and endpoint counts.
3. Test app import, binary export validation, app reimport, and at least one external target application.
4. Keep the asset out of default context packs; route only its test/provenance contract.

**Done when:** The committed fixture loads without console warnings/errors, representative skin/texture/animation structure survives export and app reimport, the target application opens the output, licensing is documented, and user docs describe only the compatibility actually proved.

**Verification:** Focused FBX units, `export-formats.spec.ts`, manual target-application evidence, build, and the full verification gate.
