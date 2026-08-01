import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModelFileSize,
  assertModelInputSize,
  MAX_MODEL_INPUT_BYTES,
  ModelInputSizeError,
  SUPPORTED_MODEL_ACCEPT,
  detectModelFormat,
  getModelExtension,
  isSupportedModelFormat,
  supportedModelFormatsLabel,
} from './modelFormat';

describe('modelFormat', () => {
  it('detects supported model formats from local, Windows, and URL-like names', () => {
    assert.equal(detectModelFormat('hero.SMF'), 'smf');
    assert.equal(detectModelFormat('C:\\assets\\walk_cycle.FBX'), 'fbx');
    assert.equal(detectModelFormat('/tmp/rig.glb'), 'glb');
    assert.equal(detectModelFormat('scene.gltf?cache=123#mesh'), 'glb');
    assert.equal(detectModelFormat('prop.obj'), 'obj');
  });

  it('returns an empty format for unsupported or extensionless inputs', () => {
    assert.equal(detectModelFormat('README.md'), '');
    assert.equal(detectModelFormat('mesh'), '');
    assert.equal(detectModelFormat('.hiddenfile'), '');
    assert.equal(detectModelFormat(''), '');
    assert.equal(detectModelFormat(null), '');
  });

  it('normalizes extensions without guessing from directory names', () => {
    assert.equal(getModelExtension('C:\\smf.folder\\model'), '');
    assert.equal(getModelExtension('C:\\smf.folder\\model.obj'), '.obj');
    assert.equal(getModelExtension('archive.tar.gz'), '.gz');
  });

  it('keeps accept and label strings aligned with supported formats', () => {
    for (const ext of ['.smf', '.glb', '.gltf', '.fbx', '.obj']) {
      assert.ok(SUPPORTED_MODEL_ACCEPT.includes(ext));
      assert.ok(supportedModelFormatsLabel().includes(ext));
    }
    assert.equal(isSupportedModelFormat('bad.txt'), false);
    assert.equal(isSupportedModelFormat('ok.glb'), true);
  });

  it('rejects oversized model metadata before browser bytes are materialized', () => {
    assert.doesNotThrow(() => assertModelInputSize('within-limit.glb', MAX_MODEL_INPUT_BYTES));
    assert.doesNotThrow(() => assertModelFileSize({ name: 'within-limit.fbx', size: MAX_MODEL_INPUT_BYTES }));

    assert.throws(
      () => assertModelFileSize({ name: 'too-large.glb', size: MAX_MODEL_INPUT_BYTES + 1 }),
      (error: unknown) => error instanceof ModelInputSizeError
        && error.code === 'MODEL_INPUT_TOO_LARGE'
        && error.message.includes('too-large.glb'),
    );
    assert.throws(
      () => assertModelInputSize('unknown-size.obj', Number.NaN),
      (error: unknown) => error instanceof ModelInputSizeError,
    );
  });
});
