import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parseRetargetProfile, profileClipOptions } from './retargetProfile';
import {
  GAME_READY_JOB_SCHEMA,
  GAME_READY_PRESERVE_JOB_SCHEMA,
  parseGameReadyJob,
  parseGameReadyJobDocument,
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

test('sampled root travel shares job/profile validation and preserves omitted serialization', () => {
  const legacy = parseGameReadyJob(validJob(), paths);
  assert.equal(Object.prototype.hasOwnProperty.call(legacy.rig.retarget!.naturalMotion!, 'rootTravelSamples'), false);
  const input = structuredClone(legacy), retarget = input.rig.retarget!, natural = retarget.naturalMotion!;
  delete natural.rootTravelPerFrame;
  natural.rootTravelSamples = { Walk: Array.from({ length: 8 }, (_, frame) => [0, 0, frame * .01] as [number,number,number]) };
  retarget.sampleRateHz = 60; retarget.interpolation = 'step';
  natural.swingTrajectories={Walk:[{foot:'right',startFrame:0,endFrame:3,startAnchorFrame:0,endAnchorFrame:7,startGrounded:false,endGrounded:true,lift:.08,travelPower:2,descendantRotations:true}]};
  const parsed = parseGameReadyJob(input, paths);
  assert.deepEqual(parseGameReadyJob(JSON.parse(JSON.stringify(parsed)), paths), parsed);
  const portable = parseRetargetProfile(JSON.stringify(parsed));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(portable)), portable);
  const source = new THREE.AnimationClip('Walk', 7/60, []);
  const sourceReference = new THREE.AnimationClip(retarget.sourceReferenceClip!, 1, []);
  const targetReference = new THREE.AnimationClip(retarget.targetReferenceClip!, 1, []);
  assert.deepEqual(profileClipOptions(portable, source, [source,sourceReference], [targetReference]).naturalMotion!.rootTravelSamples, natural.rootTravelSamples);
  const invalid = [
    (job: typeof input) => { job.rig.retarget!.naturalMotion!.swingTrajectories!.Walk[0].endAnchorFrame=8; },
    (job: typeof input) => { job.rig.retarget!.naturalMotion!.rootTravelPerFrame = { Walk: [0,0,0] }; },
    (job: typeof input) => { job.rig.retarget!.naturalMotion!.contacts = {}; },
    (job: typeof input) => { job.rig.retarget!.naturalMotion!.contacts!.Walk[0].wrapToStart = true; },
    (job: typeof input) => { job.rig.retarget!.sampleRateHz = 30; },
    (job: typeof input) => { job.rig.retarget!.interpolation = 'linear'; },
    (job: typeof input) => { job.rig.retarget!.clips = ['Other']; },
    (job: typeof input) => { job.rig.retarget!.clipVisualTiming = { Walk: { durationFrames: 10, cycles: 1 } }; },
  ];
  for (const change of invalid) { const job = structuredClone(input); change(job); assert.throws(() => parseGameReadyJob(job, paths)); }
  assert.deepEqual(parseGameReadyJob(validJob(), paths), legacy);
});

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

test('normalized game-ready jobs replay with omitted, empty and populated curls', () => {
  for (const mode of ['omitted', 'empty', 'populated']) {
    const job = validJob();
    const retarget = (job.rig as { retarget: Record<string, unknown> }).retarget;
    if (mode === 'omitted') delete retarget.targetChainCurls;
    if (mode === 'empty') retarget.targetChainCurls = [];
    const normalized = parseGameReadyJob(job, paths);
    const replay = parseGameReadyJob(JSON.parse(JSON.stringify(normalized)), paths);
    assert.deepEqual(replay, normalized);
  }
  for (const invalid of [null, {}, 'none', [null], [{}]]) {
    const job = validJob();
    (job.rig as { retarget: Record<string, unknown> }).retarget.targetChainCurls = invalid;
    assert.throws(() => parseGameReadyJob(job, paths), /array|object|palmBone/);
  }
});

test('versioned preserve-existing jobs accept embedded GLB or declared FBX sidecars without repair inputs', () => {
  const preserveJob = (model = '/input/target.glb', sidecars: string[] = []): Record<string, unknown> => ({
    $schema: GAME_READY_PRESERVE_JOB_SCHEMA,
    input: { riggedModel: model, sidecars },
    materials: { mode: 'preserve-existing' },
    coordinates: { unitMeters: 1, up: '+Y', forward: '+Z', grounded: true },
    rig: { attachments: { root: 'TargetRoot' } },
    output: { generationRoot: '/output/generations', currentPointer: '/output/generations/current.json' },
    provenance: { ownership: 'caller-owned neutral fixture' },
  });

  const embeddedGlb = parseGameReadyJobDocument(preserveJob(), paths);
  assert.equal(embeddedGlb.$schema, GAME_READY_PRESERVE_JOB_SCHEMA);
  assert.deepEqual(embeddedGlb.input, { riggedModel: '/input/target.glb', sidecars: [] });
  assert.deepEqual(embeddedGlb.materials, { mode: 'preserve-existing' });
  assert.deepEqual(parseGameReadyJobDocument(JSON.parse(JSON.stringify(embeddedGlb)), paths), embeddedGlb);
  assert.throws(() => parseGameReadyJob(preserveJob(), paths), /requires rustsmf\.game-ready-job\.v2/);

  const sidecarFbx = parseGameReadyJobDocument(
    preserveJob('/input/target.fbx', ['/input/albedo.png']),
    paths,
  );
  assert.deepEqual(sidecarFbx.input, { riggedModel: '/input/target.fbx', sidecars: ['/input/albedo.png'] });

  const invalid = [
    (job: Record<string, unknown>) => { (job.input as Record<string, unknown>).sidecars = ['/input/side.png']; },
    (job: Record<string, unknown>) => { (job.materials as Record<string, unknown>).mode = 'strict-auto'; },
    (job: Record<string, unknown>) => { (job.input as Record<string, unknown>).riggedModel = '/input/target.dae'; },
    (job: Record<string, unknown>) => { (job.input as Record<string, unknown>).sidecars = ['/input/target.glb']; },
    (job: Record<string, unknown>) => { (job.output as Record<string, unknown>).generationRoot = '/input/target.glb'; },
  ];
  for (const change of invalid) {
    const job = preserveJob();
    change(job);
    assert.throws(() => parseGameReadyJobDocument(job, paths));
  }
  const duplicate = preserveJob('/input/target.fbx', ['/input/albedo.png', '/input/ALBEDO.PNG']);
  assert.throws(() => parseGameReadyJobDocument(duplicate, paths), /duplicate paths/);
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
  natural.contacts={Walk:[{foot:'right',positionMode:'plane',orientationMode:'animated',contactPoint:[.02,-.1,.15],startFrame:0,endFrame:10,blendFrames:1}]};
  const toe=parseGameReadyJob(job,paths).rig.retarget!.naturalMotion!.contacts!.Walk[0];
  assert.equal(toe.orientationMode,'animated');
  assert.deepEqual(toe.contactPoint,[.02,-.1,.15]);
  natural.contacts={Walk:[{...toe,contactBone:'mixamorigRightToeBase'}]};
  assert.equal(parseGameReadyJob(job,paths).rig.retarget!.naturalMotion!.contacts!.Walk[0].contactBone,'mixamorigRightToeBase');
  const patch={foot:'right',positionMode:'plane',orientationMode:'animated',contactPatch:[{point:[0,0,0]},{bone:'mixamorigRightToeBase',point:[0,0,.1]}],startFrame:0,endFrame:10,blendFrames:0};
  natural.contacts={Walk:[patch]};
  assert.deepEqual(parseGameReadyJob(job,paths).rig.retarget!.naturalMotion!.contacts!.Walk[0].contactPatch,patch.contactPatch);
  for(const override of [{positionMode:'planted'},{orientationMode:'reference'},{contactPoint:[0,0,0]},{anchorFrame:0}]){
    natural.contacts={Walk:[{...patch,...override}]};assert.throws(()=>parseGameReadyJob(job,paths),/contactPatch/);
  }
  for(const contactBone of ['',42]){
    natural.contacts={Walk:[{...toe,contactBone}]};
    assert.throws(()=>parseGameReadyJob(job,paths),/contactBone/);
  }
  for(const contactPoint of [null,[0,0],['0',0,0],[0,Infinity,0]]){
    natural.contacts={Walk:[{...toe,contactPoint}]};
    assert.throws(()=>parseGameReadyJob(job,paths),/contactPoint/);
  }
  natural.contacts={Walk:[{foot:'left',orientationMode:'unbounded',startFrame:0,endFrame:10,blendFrames:1}]};
  assert.throws(()=>parseGameReadyJob(job,paths),/orientationMode/);
  natural.contacts={Walk:[{foot:'left',positionMode:'floating',startFrame:0,endFrame:10,blendFrames:1}]};
  assert.throws(()=>parseGameReadyJob(job,paths),/positionMode/);
});

test('asymmetric contact overrides round trip and malformed ramps fail closed', () => {
  const job = validJob();
  const natural = (job.rig as { retarget: { naturalMotion: Record<string, unknown> } }).retarget.naturalMotion;
  const contact = { foot: 'left', startFrame: 0, endFrame: 8, blendFrames: 3, blendInFrames: 0, blendOutFrames: 4 };
  natural.contacts = { Walk: [contact] };
  assert.deepEqual(parseGameReadyJob(job, paths).rig.retarget!.naturalMotion!.contacts!.Walk[0], contact);
  for (const invalid of [-1, 1.5, NaN, '2', null, 100]) {
    natural.contacts = { Walk: [{ ...contact, blendOutFrames: invalid }] };
    assert.throws(() => parseGameReadyJob(job, paths), /integer|full-weight/);
  }
});

test('selected scale transfer survives job parsing and rejects conflicting clips', () => {
  const job = validJob();
  const retarget = (job.rig as {retarget: Record<string, unknown>}).retarget;
  const transfer = {sourceBone: 'Hips', targetBone: 'mixamorigHips', axes: ['x', 'y', 'z'], strength: [0.5, 1, 0]};
  retarget.clipScaleTransfer = {Walk: [transfer]};
  assert.deepEqual(parseGameReadyJob(job, paths).rig.retarget!.clipScaleTransfer!.Walk[0], transfer);
  retarget.clipScaleTransfer = {Idle: [transfer]};
  assert.throws(() => parseGameReadyJob(job, paths), /unselected clip/);
  retarget.clipScaleTransfer = {Walk: [transfer]};
  retarget.clipPoseRecovery = {Walk: {peakFrame: 1, holdThroughFrame: 2, returnByFrame: 3}};
  assert.throws(() => parseGameReadyJob(job, paths), /pose recovery/);
});
