import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startFitRigPreview } from '../../scripts/fit-rig-preview';

test('comparison serves only hash-bound inputs and executable viewer modules', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fit-rig-preview-'));
  let preview: Awaited<ReturnType<typeof startFitRigPreview>> | undefined;
  try {
    const bytes = new Uint8Array([1, 2, 3]), hash = createHash('sha256').update(bytes).digest('hex');
    const source = path.join(directory, 'source.glb'), template = path.join(directory, 'template.glb');
    for (const file of [source, template, path.join(directory, 'fitted.glb')]) await writeFile(file, bytes);
    await writeFile(path.join(directory, 'job.json'), JSON.stringify({ schema: 'rustsmf-fit-rig-v1', source, template,
      outputDirectory: directory, mapping: { a: 'b' }, clips: ['idle'] }));
    await writeFile(path.join(directory, 'report.json'), JSON.stringify({ schema: 'rustsmf-fit-rig-report-v1', status: 'passed',
      sourceSha256: hash, templateSha256: hash, outputSha256: hash }));
    preview = await startFitRigPreview(directory);
    for (const file of ['/comparison.js', '/three/build/three.module.js', '/three/build/three.core.js', '/three/examples/jsm/loaders/GLTFLoader.js']) {
      const response: Response = await fetch(preview.url + file);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /^application\/javascript/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); await response.arrayBuffer();
    }
    assert.equal((await fetch(preview.url + '/source.glb')).status, 200);
    assert.equal((await fetch(preview.url + '/job.json')).status, 404);
    assert.equal((await fetch(preview.url + '/source.glb', { method: 'POST' })).status, 404);
    assert.equal((await fetch(preview.url + '/three/not-allowed.js')).status, 404);
    await preview.close(); preview = undefined;
    await writeFile(source, 'changed');
    await assert.rejects(startFitRigPreview(directory), /input changed/);
  } finally { await preview?.close(); await rm(directory, { recursive: true, force: true }); }
});
