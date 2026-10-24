import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportGLB } from '../loaders/glb';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { runSkeletalExportJob, type SkeletalExportJobResult } from '../../scripts/skeletal-export-cli';
import { CONDITIONING_MODE, CONDITIONING_NLERP_MODE } from './skeletalConditioning';
import { parseSkeletalExportJobDocument, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY as policy } from './skeletalTwoKeyExportBoundary';
import type { SkeletalAssetDocument } from './skeletalExport';
import { disposeThreeObject } from './threeDisposal';

const quat = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle).toArray();
const spec = { clipId: 'gait', startTick: 43, maxRotationDegrees: 13,
  rotations: ['Leg', 'Knee', 'Foot'].map(joint => ({ joint, values: [quat(.53), quat(.54)] })) };
function job(root: string) {
  return { $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, input: { skinnedModel: path.join(root, 'source.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['gait'] },
    conditioning: { mode: CONDITIONING_NLERP_MODE as string, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'gait'],
      transitions: [{ idle: 'idle', gait: 'gait', phases: [0], durationTicks: 6 }], twoKeyRotationBake: spec },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
}

test('boundary policy is optional, v3 singular NLERP only and refuses present invalid values', () => {
  const base = job(path.join(os.tmpdir(), 'boundary-job')), enabled = { ...base, export: { ...base.export, twoKeyExportBoundary: policy } };
  const parsed = parseSkeletalExportJobDocument(enabled);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) assert.equal(parsed.export.twoKeyExportBoundary, policy);
  assert.equal('twoKeyExportBoundary' in parseSkeletalExportJobDocument(base).export, false);
  const { twoKeyRotationBake, ...none } = base.conditioning;
  const plural = { ...base, conditioning: { ...none, twoKeyRotationBakes: [twoKeyRotationBake] } };
  assert.doesNotThrow(() => parseSkeletalExportJobDocument(plural));
  for (const bad of [undefined, null, false, '', 'preserve.v0', { policy }]) assert.throws(() => parseSkeletalExportJobDocument({ ...enabled, export: { ...enabled.export, twoKeyExportBoundary: bad } }), /twoKeyExportBoundary/);
  for (const conditioning of [none, plural.conditioning, { ...base.conditioning, mode: CONDITIONING_MODE }]) assert.throws(() => parseSkeletalExportJobDocument({ ...enabled, conditioning }), /twoKey|NLERP/);
  for (const schema of ['rustsmf.skeletal-export-job.v1', 'rustsmf.skeletal-export-job.v2']) {
    const { clipIds, ...fields } = enabled.export;
    assert.throws(() => parseSkeletalExportJobDocument({ $schema: schema, input: base.input,
      export: { ...fields, rootJoint: 'Base', ...(schema.endsWith('v2') ? { clipIds } : {}) }, output: { generationRoot: base.output.generationRoot } }), /unsupported field/);
  }
});

function fixture() {
  const root = new THREE.Group(), bones = ['Base', 'Leg', 'Knee', 'Foot'].map(name => { const b = new THREE.Bone(); b.name = name; return b; });
  root.add(bones[0]); bones.slice(1).forEach((b, i) => { bones[i].add(b); b.position.y = 1; }); root.updateMatrixWorld(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)); geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh); mesh.bind(new THREE.Skeleton(bones));
  const times = Array.from({ length: 91 }, (_, tick) => Math.fround(tick / 60));
  const clips = [new THREE.AnimationClip('idle', times[90], [new THREE.VectorKeyframeTrack('Base.position', [0, times[90]], [.02, 0, 0, .02, 0, 0])]),
    new THREE.AnimationClip('gait', times[90], bones.slice(1).map(b => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, times.flatMap((_, tick) => quat(.01 * tick)))))];
  return { root, clips };
}

test('ordinary CLI binds boundary settings while preserving model, references, legacy and plural output', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-boundary-cli-')), model = fixture();
  try {
    await writeFile(path.join(root, 'source.glb'), await exportGLB(model.root, model.clips));
    const base = job(root), enabled = { ...base, export: { ...base.export, twoKeyExportBoundary: policy } }, jobPath = path.join(root, 'job.json');
    const { twoKeyRotationBake, ...none } = base.conditioning;
    const invoke = async (document: unknown) => { await writeFile(jobPath, JSON.stringify(document)); return spawnSync(process.execPath,
      ['--import', 'tsx', fileURLToPath(new URL('../../scripts/skeletal-export-cli.ts', import.meta.url)), '--job', jobPath],
      { cwd: path.resolve(fileURLToPath(new URL('../..', import.meta.url))), windowsHide: true, encoding: 'utf8', timeout: 30000 }); };
    const publish = async (document: unknown): Promise<SkeletalExportJobResult> => { const r = await invoke(document); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout) as SkeletalExportJobResult; };
    const legacy = await publish(base), fixed = await publish(enabled), repeated = await publish(enabled);
    assert.equal(fixed.id, repeated.id); assert.notEqual(fixed.settingsIdentitySha256, legacy.settingsIdentitySha256);
    assert.deepEqual(await readFile(fixed.conditioning!.model), await readFile(legacy.conditioning!.model));
    assert.deepEqual(await readFile(fixed.references), await readFile(legacy.references));
    const manifest = async (r: SkeletalExportJobResult) => JSON.parse(await readFile(r.manifest, 'utf8')) as { semantics: unknown };
    assert.deepEqual((await manifest(fixed)).semantics, (await manifest(legacy)).semantics);
    const plural = await publish({ ...base, conditioning: { ...none, twoKeyRotationBakes: [twoKeyRotationBake] } });
    for (const key of ['asset', 'mapping', 'references'] as const) assert.deepEqual(await readFile(plural[key]), await readFile(legacy[key]));
    const original = await publish({ ...base, conditioning: none });
    const asset = async (r: SkeletalExportJobResult) => JSON.parse(await readFile(r.asset, 'utf8')) as SkeletalAssetDocument;
    const a = (await asset(original)).clips[0], b = (await asset(legacy)).clips[0], c = (await asset(fixed)).clips[0]; let leaks = 0;
    for (let t = 0; t < a.tracks.length; t++) for (let tick = 0; tick <= 90; tick++) {
      if (tick === 43 || tick === 44) assert.deepEqual(c.tracks[t].keys[tick], b.tracks[t].keys[tick]);
      else { assert.deepEqual(c.tracks[t].keys[tick], a.tracks[t].keys[tick]); if (JSON.stringify(a.tracks[t].keys[tick]) !== JSON.stringify(b.tracks[t].keys[tick])) leaks++; }
    }
    assert.ok(leaks > 0, 'fixture must expose the emitted-key leak');
    const idle = await publish({ ...base, export: { ...base.export, clipIds: ['idle'] } });
    const idleFixed = await publish({ ...enabled, export: { ...enabled.export, clipIds: ['idle'] } });
    for (const key of ['asset', 'mapping', 'references'] as const) assert.deepEqual(await readFile(idle[key]), await readFile(idleFixed[key]));
    const generations = await readdir(base.output.generationRoot), conditioned = await readdir(base.output.conditioningRoot);
    for (const bad of [{ ...enabled, export: { ...enabled.export, twoKeyExportBoundary: 'invalid' } }, { ...enabled, conditioning: none },
      { ...enabled, conditioning: { ...none, twoKeyRotationBakes: [twoKeyRotationBake] } }, { ...enabled, conditioning: { ...base.conditioning, mode: CONDITIONING_MODE } }]) {
      const r = await invoke(bad); assert.notEqual(r.status, 0); assert.match(r.stderr, /twoKey|NLERP/);
      assert.deepEqual(await readdir(base.output.generationRoot), generations); assert.deepEqual(await readdir(base.output.conditioningRoot), conditioned);
    }
    await writeFile(jobPath, JSON.stringify(enabled)); const abort = new AbortController(); abort.abort(new Error('cancel boundary job'));
    await assert.rejects(runSkeletalExportJob(jobPath, abort.signal), /cancel boundary job/);
    assert.deepEqual(await readdir(base.output.generationRoot), generations); assert.deepEqual(await readdir(base.output.conditioningRoot), conditioned);
  } finally { disposeThreeObject(model.root); assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('rustsmf-boundary-cli-')); await rm(root, { recursive: true, force: true }); }
});
