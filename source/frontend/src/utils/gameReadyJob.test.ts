import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_READY_JOB_SCHEMA,
  parseGameReadyJob,
  type GameReadyPathPolicy,
} from './gameReadyJob';

const paths: GameReadyPathPolicy = {
  isAbsolute: (value) => value.startsWith('/'),
  resolve: (value) => value.replace(/\/+/, '/'),
  comparisonKey: (value) => value.toLocaleLowerCase('en-US'),
};

function validJob(): Record<string, unknown> {
  return {
    $schema: GAME_READY_JOB_SCHEMA,
    input: {
      riggedModel: '/input/target.glb',
      referenceObj: '/input/reference.obj',
      referenceMtl: '/input/reference.mtl',
      textures: ['/input/base.png'],
    },
    materialRepair: { mode: 'strict-auto' },
    coordinates: { unitMeters: 1, up: '+Y', forward: '+Z', grounded: true },
    rig: {
      attachments: { root: 'mixamorigHips' },
      retarget: {
        sourceModel: '/input/source.glb',
        clips: ['Walk'],
        manualMap: { Hips: 'mixamorigHips' },
        sampleRateHz: 60,
        interpolation: 'step',
      },
    },
    output: {
      glb: '/output/fighter.glb',
      manifest: '/output/fighter.manifest.json',
      report: '/output/fighter.report.json',
    },
    provenance: { ownership: 'local-test' },
  };
}

test('game-ready job parsing applies safe defaults and retains explicit contracts', () => {
  const parsed = parseGameReadyJob(validJob(), paths);
  assert.equal(parsed.materialRepair.textureFlipY, true);
  assert.deepEqual(parsed.rig.retarget?.clips, ['Walk']);
  assert.equal(parsed.rig.retarget?.alignMappedBoneDirections, true);
  assert.equal(parsed.rig.attachments?.root, 'mixamorigHips');
});

test('game-ready job parsing rejects silent selection and path ambiguities', () => {
  const emptyClips = validJob();
  (emptyClips.rig as { retarget: { clips: string[] } }).retarget.clips = [];
  assert.throws(() => parseGameReadyJob(emptyClips, paths), /clips must be a non-empty array/);

  const duplicateTextures = validJob();
  (duplicateTextures.input as { textures: string[] }).textures = ['/input/base.png', '/INPUT/BASE.PNG'];
  assert.throws(() => parseGameReadyJob(duplicateTextures, paths), /textures must not contain duplicate paths/);

  const unknownAttachment = validJob();
  (unknownAttachment.rig as { attachments: Record<string, string> }).attachments.hand = 'mixamorigRightHand';
  assert.throws(() => parseGameReadyJob(unknownAttachment, paths), /unknown roles: hand/);

  const overwrite = validJob();
  (overwrite.output as { glb: string }).glb = '/INPUT/TARGET.GLB';
  assert.throws(() => parseGameReadyJob(overwrite, paths), /must not overwrite input files/);
});
