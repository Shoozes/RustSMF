import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modernStatus } from './modernStatus';

test('Modern success status keeps the source name and discloses counts separately', () => {
  assert.equal(modernStatus('Loaded: sample.glb | bones: 4 | clips: 2 | verts: 240'), 'Loaded: sample.glb');
  assert.equal(modernStatus('Loaded FBX: sample.fbx | meshes: 2 | verts: 80'), 'Loaded FBX: sample.fbx');
  assert.equal(modernStatus('Three.js viewport ready (WebGL)'), 'Ready');
});

test('Modern status never hides errors, resource warnings, dirty work or fallback', () => {
  for (const status of [
    'Loaded FBX: sample.fbx | meshes: 2 | textures skipped: 1',
    'Loaded: sample.smf | bones: 24 | SMF codec: synchronous fallback',
    'Loaded FBX: sample.fbx | bones: 4 — unsupported texture map',
    'Exported GLB after FBX fallback: unsupported track',
    'Unsaved changes; choose Cancel or Discard.',
    'Load error: missing sidecar mesh.bin',
  ]) assert.equal(modernStatus(status), status);
});
