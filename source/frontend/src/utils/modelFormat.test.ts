import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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
});
