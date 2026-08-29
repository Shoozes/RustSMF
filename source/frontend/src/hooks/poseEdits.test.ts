import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { dqCreateFromMatrix, dqNegate, threeMatrixToSmf } from '../loaders/coord';
import { buildThreeScene, exportSMFToBuffer, importSMF, type ImportedSmf } from '../loaders/smf';
import { bytesToArrayBuffer } from '../loaders/smfBinary';
import { compareSmfRoundtrip } from '../loaders/smfDiagnostics';
import { installImageTestPolyfill } from '../test/installImageTestPolyfill';
import {
  applyPoseEditsToSmf,
  applyNudgeDelta,
  emptyPoseEdit,
  hasPoseEdits,
  hasUnsupportedPoseScaleEdits,
  markPoseBoneEdited,
} from './poseEdits';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const identityDq = (): Float32Array => new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);

const dqDistance = (left: Float32Array, right: Float32Array): number => {
  const direct = Math.hypot(...Array.from(left, (value, index) => value - right[index]));
  const negated = Math.hypot(...Array.from(left, (value, index) => value + right[index]));
  return Math.min(direct, negated);
};

test('pose edit helpers track absolute viewport edits separately from nudge deltas', () => {
  const clean = { Bone: emptyPoseEdit() };
  assert.equal(hasPoseEdits(clean), false);
  assert.equal(hasUnsupportedPoseScaleEdits(clean), false);

  const viewportMoved = {
    Bone: markPoseBoneEdited(clean.Bone),
  };
  assert.equal(hasPoseEdits(viewportMoved), true);
  assert.equal(hasUnsupportedPoseScaleEdits(viewportMoved), false);

  const viewportScaled = {
    Bone: markPoseBoneEdited(viewportMoved.Bone, { hasScale: true }),
  };
  assert.equal(hasPoseEdits(viewportScaled), true);
  assert.equal(hasUnsupportedPoseScaleEdits(viewportScaled), true);

  const scaleReset = {
    Bone: markPoseBoneEdited(viewportScaled.Bone, { hasScale: false }),
  };
  assert.equal(hasPoseEdits(scaleReset), true);
  assert.equal(hasUnsupportedPoseScaleEdits(scaleReset), false);
});

test('nudge reset clears three-axis rotation and translation deltas without forcing scale state', () => {
  const moved = applyNudgeDelta(emptyPoseEdit(), { x: 1, rotX: -0.5, rotY: 0.75, rotZ: 0.25 });
  assert.equal(hasPoseEdits({ Bone: moved }), true);
  assert.deepEqual(
    [moved.dRotX, moved.dRotY, moved.dRotZ],
    [-0.5, 0.75, 0.25],
  );

  const reset = applyNudgeDelta(moved, { reset: true });
  assert.equal(hasPoseEdits({ Bone: reset }), false);
  assert.equal(hasUnsupportedPoseScaleEdits({ Bone: reset }), false);
});

test('SMF child pose edits serialize rig-space world DQ through skipped head nodes', () => {
  const root = new THREE.Bone();
  root.name = 'SMF_Node_0';
  root.position.set(1, 0, 0);
  root.rotation.y = 0.35;
  const child = new THREE.Bone();
  child.name = 'SMF_Node_2';
  child.position.set(0, 2, 0.5);
  child.rotation.z = -0.2;
  root.add(child);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, child]);
  const smf: ImportedSmf = {
    meshes: [],
    textures: [],
    bones: [
      { index: 0, parent: 0, isBone: 1, dq: identityDq(), axis: [1, 0, 0] },
      { index: 1, parent: 0, isBone: 0, dq: identityDq(), axis: [1, 0, 0] },
      { index: 2, parent: 1, isBone: 1, dq: identityDq(), axis: [1, 0, 0] },
    ],
    animations: [],
  };

  const edited = applyPoseEditsToSmf(smf, {
    SMF_Node_2: markPoseBoneEdited(emptyPoseEdit()),
  }, skeleton);
  const expectedWorld = dqNegate(dqCreateFromMatrix(threeMatrixToSmf(child.matrixWorld)));
  const incorrectLocal = dqNegate(dqCreateFromMatrix(threeMatrixToSmf(child.matrix)));

  assert.ok(dqDistance(edited.bones[2].dq, expectedWorld) < 1e-5);
  assert.ok(dqDistance(edited.bones[2].dq, incorrectLocal) > 1e-3);
  assert.deepEqual(Array.from(smf.bones[2].dq), Array.from(identityDq()), 'source SMF must remain immutable');
  assert.equal(edited.bones[1].isBone, 0, 'head-node identity must remain unchanged');
  assert.equal(edited.bones[2].parent, 1, 'parent index through the head node must remain unchanged');
});

test('real SMF pose export and reimport preserve node, head, skin, and animation identity', () => {
  installImageTestPolyfill();
  const sampleFile = path.resolve(__dirname, '../../tests/mixamo_smf_baldguy.smf');
  assert.ok(fs.existsSync(sampleFile), 'expected the checked-in SMF fixture');

  const imported = importSMF(bytesToArrayBuffer(fs.readFileSync(sampleFile)));
  const built = buildThreeScene(imported);
  const targetNode = imported.bones.find((node) => (
    node.isBone === 1
    && node.parent >= 0
    && imported.bones[node.parent]?.isBone === 0
  ));
  assert.ok(targetNode, 'fixture must include a deform bone connected through a head node');

  const targetBone = built.skeleton.bones.find((bone) => bone.name === `SMF_Node_${targetNode.index}`);
  assert.ok(targetBone, 'head-connected deform bone must exist in the runtime skeleton');
  targetBone.position.x += 0.125;
  built.root.updateMatrixWorld(true);

  const candidate = applyPoseEditsToSmf(imported, {
    [targetBone.name]: markPoseBoneEdited(emptyPoseEdit()),
  }, built.skeleton);
  assert.ok(dqDistance(candidate.bones[targetNode.index].dq, imported.bones[targetNode.index].dq) > 1e-4);
  assert.deepEqual(
    candidate.bones.map(({ index, parent, isBone }) => ({ index, parent, isBone })),
    imported.bones.map(({ index, parent, isBone }) => ({ index, parent, isBone })),
    'pose export must not rewrite node or head identity',
  );
  assert.deepEqual(
    candidate.meshes.map((mesh) => Array.from(mesh.skinIndices)),
    imported.meshes.map((mesh) => Array.from(mesh.skinIndices)),
    'pose export must not rewrite skin indices',
  );
  assert.deepEqual(
    candidate.animations.map((animation) => ({
      name: animation.name,
      nodeCount: animation.nodeCount,
      frameCount: animation.frames.length,
      frameNodeCounts: animation.frames.map((frame) => frame.length),
    })),
    imported.animations.map((animation) => ({
      name: animation.name,
      nodeCount: animation.nodeCount,
      frameCount: animation.frames.length,
      frameNodeCounts: animation.frames.map((frame) => frame.length),
    })),
    'pose export must not rewrite animation identity or shape',
  );

  const reimported = importSMF(bytesToArrayBuffer(exportSMFToBuffer(candidate)));
  const report = compareSmfRoundtrip(candidate, reimported);
  assert.equal(report.ok, true, report.messages.join('; '));
  assert.deepEqual(
    reimported.bones.map(({ index, parent, isBone }) => ({ index, parent, isBone })),
    candidate.bones.map(({ index, parent, isBone }) => ({ index, parent, isBone })),
  );
  assert.deepEqual(
    reimported.meshes.map((mesh) => Array.from(mesh.skinIndices)),
    candidate.meshes.map((mesh) => Array.from(mesh.skinIndices)),
  );
  assert.deepEqual(
    reimported.animations.map((animation) => ({
      name: animation.name,
      nodeCount: animation.nodeCount,
      frameCount: animation.frames.length,
      frameNodeCounts: animation.frames.map((frame) => frame.length),
    })),
    candidate.animations.map((animation) => ({
      name: animation.name,
      nodeCount: animation.nodeCount,
      frameCount: animation.frames.length,
      frameNodeCounts: animation.frames.map((frame) => frame.length),
    })),
  );
});
