import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  parseSkeletalExportJobDocument,
  SKELETAL_EXPORT_JOB_SCHEMA,
  SKELETAL_EXPORT_JOB_V2_SCHEMA,
  SKELETAL_EXPORT_JOB_V3_SCHEMA,
  SKELETAL_EXPORT_JOB_V4_SCHEMA,
  SKELETAL_EXPORT_JOB_V5_SCHEMA,
  selectSkeletalExportClips,
} from './skeletalExportJob';
import { CONDITIONING_MODE, CONDITIONING_NLERP_MODE } from './skeletalConditioning';
import { HIP_Y_LOOP_ENDPOINT_POLICY } from './skeletalHipYLoopEndpoint';
import { COUPLED_BODY_HEIGHT_POLICY } from './skeletalCoupledBodyHeight';

test('v5 coupled route is opt-in, closed and leaves earlier jobs unchanged', () => {
  const root = path.join(os.tmpdir(), 'skeletal-coupled-job');
  const document = { $schema: SKELETAL_EXPORT_JOB_V5_SCHEMA,
    input: { skinnedModel: path.join(root, 'endpoint.glb'), conditioningReport: path.join(root, 'endpoint-report.json'), originalSkinnedModel: path.join(root, 'original.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60,
      rootMotion: 'separate-track', clipIds: ['walkSlow'], twoKeyExportBoundary: 'preserve-unselected-emitted-keys.v1' },
    coupledBodyHeight: { policy: COUPLED_BODY_HEIGHT_POLICY },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
  const parsed = parseSkeletalExportJobDocument(document);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V5_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V5_SCHEMA) assert.deepEqual(parsed.coupledBodyHeight, document.coupledBodyHeight);
  for (const invalid of [
    { ...document, coupledBodyHeight: { policy: 'other' } },
    { ...document, coupledBodyHeight: { policy: COUPLED_BODY_HEIGHT_POLICY, maxDrop: 1 } },
    { ...document, export: { ...document.export, twoKeyExportBoundary: 'other' } },
    { ...document, input: { ...document.input, originalSkinnedModel: document.input.skinnedModel } },
    { ...document, output: { ...document.output, currentPointer: path.join(root, 'generations/current.json') } },
  ]) assert.throws(() => parseSkeletalExportJobDocument(invalid));
  for (const oldSchema of [SKELETAL_EXPORT_JOB_SCHEMA, SKELETAL_EXPORT_JOB_V2_SCHEMA, SKELETAL_EXPORT_JOB_V3_SCHEMA, SKELETAL_EXPORT_JOB_V4_SCHEMA])
    assert.throws(() => parseSkeletalExportJobDocument({ ...document, $schema: oldSchema }), /unsupported field/);
});

test('v4 endpoint route is explicit and leaves all older schemas closed', () => {
  const root = path.join(os.tmpdir(), 'skeletal-endpoint-job');
  const document = { $schema: SKELETAL_EXPORT_JOB_V4_SCHEMA,
    input: { skinnedModel: path.join(root, 'conditioned.glb'), conditioningReport: path.join(root, 'report.json'), originalSkinnedModel: path.join(root, 'original.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60,
      rootMotion: 'separate-track', clipIds: ['walkSlow'], twoKeyExportBoundary: 'preserve-unselected-emitted-keys.v1' },
    endpoint: { policy: HIP_Y_LOOP_ENDPOINT_POLICY, clipId: 'walkSlow', joint: 'mixamorigHips', maxCorrectionMeters: .24 },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
  const parsed = parseSkeletalExportJobDocument(document);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V4_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V4_SCHEMA) assert.deepEqual(parsed.endpoint, document.endpoint);
  for (const invalid of [
    { ...document, endpoint: { ...document.endpoint, extra: true } },
    { ...document, endpoint: { ...document.endpoint, maxCorrectionMeters: .25 } },
    { ...document, export: { ...document.export, twoKeyExportBoundary: 'other' } },
    { ...document, input: { ...document.input, conditioningReport: document.input.skinnedModel } },
    { ...document, output: { ...document.output, currentPointer: path.join(root, 'generations', 'current.json') } },
  ]) assert.throws(() => parseSkeletalExportJobDocument(invalid));
  for (const oldSchema of [SKELETAL_EXPORT_JOB_SCHEMA, SKELETAL_EXPORT_JOB_V2_SCHEMA, SKELETAL_EXPORT_JOB_V3_SCHEMA])
    assert.throws(() => parseSkeletalExportJobDocument({ ...document, $schema: oldSchema }), /unsupported field/);
});

test('v3 floor bake binds only selected generated start/stop clips and declared bounds', () => {
  const directory = path.join(os.tmpdir(), 'skeletal-floor-job');
  const document = { $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, input: { skinnedModel: path.join(directory, 'source.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['start-walk-p25'] },
    conditioning: { mode: CONDITIONING_NLERP_MODE as string, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'walk'],
      transitions: [{ idle: 'idle', gait: 'walk', phases: [.25], durationTicks: 6 }],
      transitionFloor: { clipIds: ['start-walk-p25', 'stop-walk-p25'], floorY: 0, maxLiftMeters: .1 } },
    output: { generationRoot: path.join(directory, 'generations'), conditioningRoot: path.join(directory, 'conditioned') } };
  const parsed = parseSkeletalExportJobDocument(document);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) assert.deepEqual(parsed.conditioning.transitionFloor, document.conditioning.transitionFloor);
  for (const id of ['idle', 'reversal-walk-p25', 'start-walk-p50']) {
    const bad = structuredClone(document); bad.conditioning.transitionFloor.clipIds = [id];
    assert.throws(() => parseSkeletalExportJobDocument(bad), /transitionFloor/);
  }
  const old = structuredClone(document); old.conditioning.mode = CONDITIONING_MODE;
  assert.throws(() => parseSkeletalExportJobDocument(old), /NLERP/);
});

function job(root: string): Record<string, unknown> {
  return {
    $schema: SKELETAL_EXPORT_JOB_SCHEMA,
    input: { skinnedModel: path.join(root, 'source.glb') },
    export: {
      rootJoint: 'Base',
      units: 'meters',
      upAxis: '+Y',
      forwardAxis: '+Z',
      handedness: 'right',
      ticksPerSecond: 60,
      rootMotion: 'separate-track',
    },
    output: {
      generationRoot: path.join(root, 'generations'),
      currentPointer: path.join(root, 'generations', 'current.json'),
    },
  };
}

test('v3 explicitly binds conditioning and rejects ambiguous recipes and candidate pointers', () => {
  const root = path.join(os.tmpdir(), 'skeletal-job-v3');
  const valid = { ...job(root), $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA,
    export: { ...(job(root).export as object), rootJoint: 'LocomotionRoot', clipIds: ['start-Turn-p25', 'Wave', 'Turn'] },
    conditioning: { mode: CONDITIONING_MODE, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['Wave', 'Turn'], transitions: [{ gait: 'Turn', idle: 'Wave', phases: [0, .25, .5, .75], durationTicks: 6 }] },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') },
  };
  assert.equal(parseSkeletalExportJobDocument(valid).$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  const revised = { ...valid, conditioning: { ...valid.conditioning, mode: CONDITIONING_NLERP_MODE } };
  const parsedRevised = parseSkeletalExportJobDocument(revised);
  assert.ok(parsedRevised.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA);
  assert.equal(parsedRevised.conditioning.mode, CONDITIONING_NLERP_MODE);
  assert.throws(() => parseSkeletalExportJobDocument({ ...valid, output: { ...valid.output, currentPointer: path.join(root, 'generations/current.json') } }), /omit the current pointer/);
  const invalidPhase = structuredClone(valid); invalidPhase.conditioning.transitions[0].phases = [.1];
  assert.throws(() => parseSkeletalExportJobDocument(invalidPhase), /quarter phases/);
  const duplicate = structuredClone(valid); duplicate.conditioning.transitions.push(duplicate.conditioning.transitions[0]);
  assert.throws(() => parseSkeletalExportJobDocument(duplicate), /Duplicate conditioning gait/);
  assert.throws(() => parseSkeletalExportJobDocument({ ...valid, conditioning: { ...valid.conditioning, smoothing: true } }), /unsupported field/);
});

test('skeletal export job admits only the declared GLB, coordinate, and generation contract', () => {
  const root = path.join(os.tmpdir(), 'skeletal-job');
  const parsed = parseSkeletalExportJobDocument(job(root));
  assert.equal(parsed.input.skinnedModel, path.join(root, 'source.glb'));
  assert.equal(parsed.output.generationRoot, path.join(root, 'generations'));
  assert.equal(parsed.output.currentPointer, path.join(root, 'generations', 'current.json'));
  assert.equal(parsed.export.rootMotion, 'separate-track');
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_SCHEMA);
  assert.equal('clipIds' in parsed.export, false);
});

test('skeletal export job refuses ambiguous formats, basis declarations, and pointer escapes', () => {
  const root = path.join(os.tmpdir(), 'skeletal-job');
  const otherFormat = job(root);
  (otherFormat.input as Record<string, unknown>).skinnedModel = path.join(root, 'source.fbx');
  assert.throws(() => parseSkeletalExportJobDocument(otherFormat), /self-contained \.glb/);

  const wrongBasis = job(root);
  (wrongBasis.export as Record<string, unknown>).upAxis = '+Z';
  assert.throws(() => parseSkeletalExportJobDocument(wrongBasis), /must declare meters/);

  const escapedPointer = job(root);
  (escapedPointer.output as Record<string, unknown>).currentPointer = path.join(root, 'current.json');
  assert.throws(() => parseSkeletalExportJobDocument(escapedPointer), /direct child/);

  const unknown = job(root);
  (unknown.input as Record<string, unknown>).dropFirstClip = true;
  assert.throws(() => parseSkeletalExportJobDocument(unknown), /unsupported field/);
});

test('skeletal export job v2 requires unique explicit IDs and selects exact source names in request order', () => {
  const root = path.join(os.tmpdir(), 'skeletal-job-v2');
  const v2 = job(root);
  v2.$schema = SKELETAL_EXPORT_JOB_V2_SCHEMA;
  (v2.export as Record<string, unknown>).clipIds = ['idle', 'walk'];
  const parsed = parseSkeletalExportJobDocument(v2);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V2_SCHEMA);
  assert.deepEqual(parsed.export.clipIds, ['idle', 'walk']);

  const source = [
    { name: 'walk', sourceIndex: 1 },
    { name: 'jump', sourceIndex: 2 },
    { name: 'idle', sourceIndex: 3 },
    ...Array.from({ length: 35 }, (_, index) => ({ name: `extra-${index}`, sourceIndex: index + 4 })),
  ];
  assert.deepEqual(selectSkeletalExportClips(source, parsed.export.clipIds).map(clip => clip.name), ['idle', 'walk']);
  assert.throws(() => selectSkeletalExportClips(source, ['missing']), /was not found/);
  assert.throws(() => selectSkeletalExportClips([
    { name: 'idle' }, { name: 'idle' },
  ], ['idle']), /is ambiguous/);
  assert.throws(() => selectSkeletalExportClips(source, ['idle', 'idle']), /duplicate clip ID/);

  const duplicateRequest = job(root);
  duplicateRequest.$schema = SKELETAL_EXPORT_JOB_V2_SCHEMA;
  (duplicateRequest.export as Record<string, unknown>).clipIds = ['idle', 'idle'];
  assert.throws(() => parseSkeletalExportJobDocument(duplicateRequest), /must not contain duplicate IDs/);

  const noSelection = job(root);
  noSelection.$schema = SKELETAL_EXPORT_JOB_V2_SCHEMA;
  assert.throws(() => parseSkeletalExportJobDocument(noSelection), /1 to 32 explicit/);
});
