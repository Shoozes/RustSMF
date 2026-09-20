import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProjectDocument,
  decodeProjectDocument,
  encodeProjectDocument,
  projectAssetBytes,
} from './projectCodec';
import { MODEL_SOURCE_FORMATS } from './modelFormat';

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

  it('round-trips every supported source format, including DAE', () => {
    for (const sourceFormat of MODEL_SOURCE_FORMATS) {
      const document = createProjectDocument({
        name: `${sourceFormat}-workspace`,
        assetBytes: new Uint8Array([1, 2, 3]),
        state: {
          selected: '',
          currentClipName: '',
          currentTime: 0,
          playbackSpeed: 1,
          isPlaying: false,
          sourceFormat,
        },
      });
      const decoded = decodeProjectDocument(encodeProjectDocument(document));
      assert.equal(decoded.state.sourceFormat, sourceFormat);
    }
  });

  it('fails closed for corrupt, unsupported, or non-finite project state', () => {
    assert.throws(() => decodeProjectDocument('{not json}'), /PROJECT_INVALID/);
    assert.throws(() => decodeProjectDocument(JSON.stringify({
      kind: 'rustsmf-project',
      schemaVersion: 99,
    })), /schema version/);
    assert.throws(() => decodeProjectDocument(JSON.stringify({
      kind: 'rustsmf-project',
      schemaVersion: 1,
      name: 'unsupported-format',
      asset: { format: 'glb', bytesBase64: 'AQ==' },
      state: {
        selected: '',
        currentClipName: '',
        currentTime: 0,
        playbackSpeed: 1,
        isPlaying: false,
        sourceFormat: 'usd',
      },
    })), /sourceFormat is unsupported/);
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
