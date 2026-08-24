import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProjectDocument,
  decodeProjectDocument,
  encodeProjectDocument,
  projectAssetBytes,
} from './projectCodec';

describe('project codec', () => {
  it('round-trips a bounded versioned project envelope', () => {
    const document = createProjectDocument({
      name: 'hero-workspace',
      assetBytes: new Uint8Array([0, 1, 2, 255]),
      state: {
        selected: 'Arm',
        currentClipName: 'Walk',
        currentTime: 0.75,
        playbackSpeed: 1.25,
        isPlaying: false,
        sourceFormat: 'glb',
      },
    });
    const decoded = decodeProjectDocument(encodeProjectDocument(document));
    assert.deepEqual(decoded.state, document.state);
    assert.deepEqual(projectAssetBytes(decoded), new Uint8Array([0, 1, 2, 255]));
  });

  it('fails closed for corrupt, unsupported, or non-finite project state', () => {
    assert.throws(() => decodeProjectDocument('{not json}'), /PROJECT_INVALID/);
    assert.throws(() => decodeProjectDocument(JSON.stringify({
      kind: 'rustsmf-project',
      schemaVersion: 99,
    })), /schema version/);
    assert.throws(() => createProjectDocument({
      name: 'bad',
      assetBytes: new Uint8Array([1]),
      state: {
        selected: '',
        currentClipName: '',
        currentTime: Number.NaN,
        playbackSpeed: 1,
        isPlaying: false,
        sourceFormat: 'glb',
      },
    }), /finite/);
  });
});
