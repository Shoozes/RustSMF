import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getTextureExportPolicies, LEGACY_SHELF_DECISIONS } from './materialPolicy';

describe('material export policy', () => {
  it('maps the primary action to the source-aware exporter', () => {
    assert.deepEqual(
      ['smf', 'fbx', 'glb', 'obj'].map((source) => getTextureExportPolicies(source)[0].format),
      ['SMF', 'FBX', 'GLB', 'GLB'],
    );
  });

  it('states texture behavior for explicit GLB, FBX, and SMF conversion', () => {
    for (const source of ['smf', 'fbx', 'glb', 'obj']) {
      const rows = getTextureExportPolicies(source);
      assert.equal(rows.find((row) => row.action === 'GLB')?.texturePolicy, 'embedded');
      assert.equal(rows.find((row) => row.action === 'FBX')?.texturePolicy, 'embedded');
      assert.equal(
        rows.find((row) => row.action === 'SMF')?.texturePolicy,
        source === 'smf' ? 'embedded' : 'omitted',
      );
    }
  });

  it('keeps every retired legacy action paired with a decision and reason', () => {
    assert.deepEqual(
      LEGACY_SHELF_DECISIONS.map((item) => item.action),
      ['Global snap', 'Merge same textures', 'Include textures'],
    );
    LEGACY_SHELF_DECISIONS.forEach((item) => {
      assert.ok(item.decision.length > 0);
      assert.ok(item.reason.length > 0);
    });
  });
});
