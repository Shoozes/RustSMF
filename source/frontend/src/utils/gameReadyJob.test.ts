import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_READY_JOB_SCHEMA,
  parseGameReadyJob,
  resolvePreservedTargetRotations,
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
        directionTransfer: 'absolute',
        directionTransferBones: ['mixamorigLeftArm', 'mixamorigRightArm'],
        preserveTargetRotations: ['mixamorigLeftHand', 'mixamorigRightHand'],
        clipPreserveTargetRotations: {
          Walk: ['mixamorigRightHand', 'mixamorigLeftFoot'],
        },
        targetChainCurls: [{
          palmBone: 'mixamorigLeftHand',
          bones: ['mixamorigLeftHandIndex1', 'mixamorigLeftHandIndex2', 'mixamorigLeftHandIndex3'],
          palmNormal: [0, 0, 1],
          degrees: [55, 75, 60],
        }],
        naturalMotion: {
          torso: {
            targetBones: ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'],
          },
          legs: {
            left: {
              hip: 'mixamorigLeftUpLeg', knee: 'mixamorigLeftLeg', ankle: 'mixamorigLeftFoot',
              soleOffset: [0, 0.08, -0.05],
              pole: [0, 0, 1], minBendDegrees: 5, maxBendDegrees: 150, maxPelvisCorrection: 0.05,
            },
            right: {
              hip: 'mixamorigRightUpLeg', knee: 'mixamorigRightLeg', ankle: 'mixamorigRightFoot',
              soleOffset: [0, 0.08, -0.05],
              pole: [0, 0, 1], minBendDegrees: 5, maxBendDegrees: 150, maxPelvisCorrection: 0.05,
            },
          },
          contacts: {
            Walk: [{ foot: 'left', startFrame: 2, endFrame: 7, blendFrames: 2 }],
          },
          rootTravelPerFrame: { Walk: [0.01, 0, 0] },
          legMotionLimits: {
            Walk: {
              maximumForwardDegrees: 50,
              maximumBackwardDegrees: 40,
              maximumLateralDegrees: 20,
              minimumSwingBendDegrees: 12,
            },
          },
        },
        sampleRateHz: 60,
        interpolation: 'step',
      },
    },
    output: {
      generationRoot: '/output/generations',
      currentPointer: '/output/generations/current.json',
    },
    provenance: { ownership: 'local-test' },
  };
}

test('game-ready job parsing applies safe defaults and retains explicit contracts', () => {
  const parsed = parseGameReadyJob(validJob(), paths);
  assert.equal(parsed.rig.retarget?.naturalMotion?.reachTransfer, undefined);
  const calibratedJob = validJob();
  const calibratedMotion = (calibratedJob.rig as { retarget: { naturalMotion: { reachTransfer?: string } } }).retarget.naturalMotion;
  calibratedMotion.reachTransfer = 'calibrated-bend';
  assert.equal(parseGameReadyJob(calibratedJob, paths).rig.retarget?.naturalMotion?.reachTransfer, 'calibrated-bend');
  calibratedMotion.reachTransfer = 'unrecognized';
  assert.throws(() => parseGameReadyJob(calibratedJob, paths), /reachTransfer/);
  assert.equal(parsed.materialRepair.textureFlipY, true);
  assert.deepEqual(parsed.rig.retarget?.clips, ['Walk']);
  assert.equal(parsed.rig.retarget?.alignMappedBoneDirections, true);
  assert.equal(parsed.rig.retarget?.directionTransfer, 'absolute');
  assert.deepEqual(parsed.rig.retarget?.directionTransferBones, ['mixamorigLeftArm', 'mixamorigRightArm']);
  assert.deepEqual(parsed.rig.retarget?.preserveTargetRotations, ['mixamorigLeftHand', 'mixamorigRightHand']);
  assert.deepEqual(resolvePreservedTargetRotations(parsed.rig.retarget!, 'Walk'), [
    'mixamorigLeftHand',
    'mixamorigRightHand',
    'mixamorigLeftFoot',
  ]);
  assert.deepEqual(resolvePreservedTargetRotations(parsed.rig.retarget!, 'Idle'), [
    'mixamorigLeftHand',
    'mixamorigRightHand',
  ]);
  assert.deepEqual(parsed.rig.retarget?.targetChainCurls, [{
    palmBone: 'mixamorigLeftHand',
    bones: ['mixamorigLeftHandIndex1', 'mixamorigLeftHandIndex2', 'mixamorigLeftHandIndex3'],
    palmNormal: [0, 0, 1],
    degrees: [55, 75, 60],
  }]);
  assert.deepEqual(parsed.rig.retarget?.naturalMotion?.torso, {
    targetBones: ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'],
    weights: undefined,
  });
  assert.deepEqual(parsed.rig.retarget?.naturalMotion?.contacts?.Walk, [
    { foot: 'left', startFrame: 2, endFrame: 7, blendFrames: 2 },
  ]);
  assert.deepEqual(parsed.rig.retarget?.naturalMotion?.rootTravelPerFrame?.Walk, [0.01, 0, 0]);
  assert.deepEqual(parsed.rig.retarget?.naturalMotion?.legMotionLimits?.Walk, {
    maximumForwardDegrees: 50,
    maximumBackwardDegrees: 40,
    maximumLateralDegrees: 20,
    minimumSwingBendDegrees: 12,
  });
  assert.deepEqual(parsed.rig.retarget?.naturalMotion?.legs.left.soleOffset, [0, 0.08, -0.05]);
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
  (overwrite.output as { generationRoot: string }).generationRoot = '/INPUT/TARGET.GLB';
  delete (overwrite.output as { currentPointer?: string }).currentPointer;
  assert.throws(() => parseGameReadyJob(overwrite, paths), /must not overwrite input files/);

  const outsidePointer = validJob();
  (outsidePointer.output as { currentPointer: string }).currentPointer = '/output/current.json';
  assert.throws(() => parseGameReadyJob(outsidePointer, paths), /direct child/);

  const invalidDirection = validJob();
  (invalidDirection.rig as { retarget: { directionTransfer: string } }).retarget.directionTransfer = 'automatic';
  assert.throws(() => parseGameReadyJob(invalidDirection, paths), /directionTransfer must be relative or absolute/);

  const duplicatePreservedRotations = validJob();
  (duplicatePreservedRotations.rig as { retarget: { preserveTargetRotations: string[] } }).retarget.preserveTargetRotations = [
    'mixamorigHead',
    'mixamorigHead',
  ];
  assert.throws(() => parseGameReadyJob(duplicatePreservedRotations, paths), /preserveTargetRotations must not contain duplicates/);

  const invalidChainCurl = validJob();
  (invalidChainCurl.rig as { retarget: { targetChainCurls: unknown[] } }).retarget.targetChainCurls = [{
    palmBone: 'mixamorigHand',
    bones: ['mixamorigFinger1', 'mixamorigFinger2'],
    palmNormal: [0, 0, 1],
    degrees: [55],
  }];
  assert.throws(() => parseGameReadyJob(invalidChainCurl, paths), /degrees must match bones/);

  const overlappingContacts = validJob();
  (overlappingContacts.rig as { retarget: { naturalMotion: { contacts: Record<string, unknown[]> } } })
    .retarget.naturalMotion.contacts.Walk.push({ foot: 'left', startFrame: 7, endFrame: 10, blendFrames: 1 });
  assert.throws(() => parseGameReadyJob(overlappingContacts, paths), /overlapping left-foot contacts/);

  const invalidPole = validJob();
  (invalidPole.rig as { retarget: { naturalMotion: { legs: { left: { pole: number[] } } } } })
    .retarget.naturalMotion.legs.left.pole = [0, 0, 0];
  assert.throws(() => parseGameReadyJob(invalidPole, paths), /pole must be non-zero/);

  const invalidSole = validJob();
  (invalidSole.rig as { retarget: { naturalMotion: { legs: { left: { soleOffset: number[] } } } } })
    .retarget.naturalMotion.legs.left.soleOffset = [0, Number.NaN, 0];
  assert.throws(() => parseGameReadyJob(invalidSole, paths), /soleOffset must contain three finite/);

  const unknownRetargetField = validJob();
  (unknownRetargetField.rig as { retarget: Record<string, unknown> }).retarget.preserverTargetRotations = [];
  assert.throws(() => parseGameReadyJob(unknownRetargetField, paths), /unknown fields: preserverTargetRotations/);

  const unselectedContact = validJob();
  (unselectedContact.rig as { retarget: { naturalMotion: { contacts: Record<string, unknown[]> } } })
    .retarget.naturalMotion.contacts.Idle = [{ foot: 'left', startFrame: 0, endFrame: 2, blendFrames: 1 }];
  assert.throws(() => parseGameReadyJob(unselectedContact, paths), /configures unselected clips: Idle/);

  const invalidMotionLimit = validJob();
  (invalidMotionLimit.rig as { retarget: { naturalMotion: { legMotionLimits: Record<string, { maximumBackwardDegrees: number }> } } })
    .retarget.naturalMotion.legMotionLimits.Walk.maximumBackwardDegrees = 90;
  assert.throws(() => parseGameReadyJob(invalidMotionLimit, paths), /direction limits must be from 0/);

  const unselectedMotionLimit = validJob();
  (unselectedMotionLimit.rig as { retarget: { naturalMotion: { legMotionLimits: Record<string, unknown> } } })
    .retarget.naturalMotion.legMotionLimits.Idle = {
      maximumForwardDegrees: 50,
      maximumBackwardDegrees: 40,
      maximumLateralDegrees: 20,
      minimumSwingBendDegrees: 12,
    };
  assert.throws(() => parseGameReadyJob(unselectedMotionLimit, paths), /legMotionLimits configures unselected clips: Idle/);
});


test('grounding profiles reject invalid, ignored and unselected settings', () => {
  const job = validJob();
  const rig = job.rig as {retarget:{naturalMotion:Record<string,unknown>}};
  rig.retarget.naturalMotion.legOrientation='animated';
  rig.retarget.naturalMotion.grounding={Walk:{strideScale:0.3,rootHeightOffset:-0.04,groundHeight:0}};
  assert.equal(parseGameReadyJob(job,paths).rig.retarget!.naturalMotion!.grounding!.Walk.strideScale,0.3);
  for (const grounding of [{Other:{strideScale:1,rootHeightOffset:0,groundHeight:0}},
    {Walk:{strideScale:0,rootHeightOffset:0,groundHeight:0}},
    {Walk:{strideScale:1,rootHeightOffset:Infinity,groundHeight:0}},
    {Walk:{strideScale:1,rootHeightOffset:0,groundHeight:0,ignored:true}}]) {
    rig.retarget.naturalMotion.grounding=grounding;
    assert.throws(()=>parseGameReadyJob(job,paths),/grounding|finite|unknown/i);
  }
});

test('ground-plane intervals round trip explicitly and reject unknown contact modes', () => {
  const job=validJob();
  const natural=(job.rig as {retarget:{naturalMotion:Record<string,unknown>}}).retarget.naturalMotion;
  natural.contacts={Walk:[{foot:'left',positionMode:'plane',orientationMode:'animated-heading',startFrame:0,endFrame:10,blendFrames:1}]};
  assert.equal(parseGameReadyJob(job,paths).rig.retarget!.naturalMotion!.contacts!.Walk[0].positionMode,'plane');
  assert.equal(parseGameReadyJob(job,paths).rig.retarget!.naturalMotion!.contacts!.Walk[0].orientationMode,'animated-heading');
  natural.contacts={Walk:[{foot:'left',orientationMode:'unbounded',startFrame:0,endFrame:10,blendFrames:1}]};
  assert.throws(()=>parseGameReadyJob(job,paths),/orientationMode/);
  natural.contacts={Walk:[{foot:'left',positionMode:'floating',startFrame:0,endFrame:10,blendFrames:1}]};
  assert.throws(()=>parseGameReadyJob(job,paths),/positionMode/);
});
