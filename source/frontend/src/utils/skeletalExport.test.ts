import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadGLB } from '../loaders/glb';
import { bytesToArrayBuffer } from '../loaders/smfBinary';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { disposeThreeObject } from './threeDisposal';
import { prepareSkeletalExport } from './skeletalExport';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const signalRobotPath = path.join(repositoryRoot, 'examples', 'rustsmf-demo.glb');
const sablePath = path.join(repositoryRoot, 'examples', 'black-cat', 'sable.glb');
const sourceIdentitySha256 = 'a'.repeat(64);

async function loadFixture(filePath: string): Promise<Awaited<ReturnType<typeof loadGLB>>> {
  installNodeThreeRuntime();
  const bytes = await readFile(filePath);
  return loadGLB(bytesToArrayBuffer(bytes));
}

function disposeLoaded(loaded: Awaited<ReturnType<typeof loadGLB>>): void {
  loaded.mixer.stopAllAction();
  disposeThreeObject(loaded.root);
}

test('Signal Robot exports all loaded skinned mesh data and both authored clips', async () => {
  const loaded = await loadFixture(signalRobotPath);
  try {
    const prepared = await prepareSkeletalExport(loaded, {
      sourceIdentitySha256,
      rootJoint: 'Base',
    });
    assert.deepEqual(Object.keys(prepared.asset), ['schema', 'id', 'joints', 'mesh', 'clips', 'sockets']);
    assert.equal(prepared.asset.schema, 'gaim.skeletal-asset.v1');
    assert.equal(prepared.asset.joints.length, 5);
    assert.equal(prepared.asset.mesh.positions.length, 2400);
    assert.equal(prepared.asset.mesh.normals.length, 2400);
    assert.equal(prepared.asset.mesh.joints.length, 2400);
    assert.equal(prepared.asset.mesh.weights.length, 2400);
    assert.equal(prepared.asset.mesh.indices.length, 360);
    assert.deepEqual(prepared.asset.clips.map(clip => clip.id), ['Wave', 'Turn']);
    assert.equal(prepared.assetBytes.byteLength <= 4 * 1024 * 1024, true);
    assert.equal(prepared.asset.sockets.length, 0);

    const turn = prepared.asset.clips.find(clip => clip.id === 'Turn');
    assert.ok(turn);
    assert.deepEqual(turn.root.map(key => key.tick), [0, 60, 120]);
    assert.ok(Math.abs(turn.root[1].yaw - THREE.MathUtils.degToRad(50)) < 1e-6);
    assert.ok(turn.tracks.some(track => track.joint === 0));
    assert.deepEqual(prepared.mapping.joints.map(joint => [joint.sourceIndex, joint.exportIndex]), [
      [0, 0], [1, 1], [2, 2], [3, 3], [4, 4],
    ]);
    assert.equal(prepared.mapping.vertices.length, 2400);
    assert.deepEqual(prepared.mapping.vertices[2399], { sourceIndex: 2399, exportIndices: [2399] });

    assert.equal(prepared.references.samples.length, 10);
    assert.deepEqual(prepared.references.tolerances, {
      position: 5e-5,
      normalRadians: 1e-4,
      matrix: 1e-4,
      rootPosition: 1e-5,
      rootYawRadians: 1e-5,
    });
    for (const sample of prepared.references.samples) {
      assert.equal(sample.positions.length, 2400);
      assert.equal(sample.normals.length, 2400);
      assert.equal(sample.joints.length, 5);
      assert.equal(sample.joints.every(joint => joint.matrix.length === 16), true);
      assert.deepEqual(sample.sockets, []);
    }
    const fractionalTurn = prepared.references.samples.find(sample => sample.clipId === 'Turn' && sample.phaseTicks === 60.25);
    assert.ok(fractionalTurn);
    assert.ok(fractionalTurn.rootYaw > THREE.MathUtils.degToRad(49.7));
    assert.ok(fractionalTurn.rootYaw < THREE.MathUtils.degToRad(50));
    const waveStart = prepared.references.samples.find(sample => sample.clipId === 'Wave' && sample.phaseTicks === 0);
    const waveQuarter = prepared.references.samples.find(sample => sample.clipId === 'Wave' && sample.phaseTicks === 30.125);
    assert.ok(waveStart && waveQuarter);
    assert.ok(waveStart.positions.some((position, index) => (
      Math.hypot(
        position[0] - waveQuarter.positions[index][0],
        position[1] - waveQuarter.positions[index][1],
        position[2] - waveQuarter.positions[index][2],
      ) > 1e-4
    )));
  } finally {
    disposeLoaded(loaded);
  }
});

test('a skinned source with no clips exports its bind asset without inventing motion', async () => {
  const loaded = await loadFixture(signalRobotPath);
  try {
    loaded.clips = [];
    const prepared = await prepareSkeletalExport(loaded, {
      sourceIdentitySha256,
      rootJoint: 'Base',
    });
    assert.deepEqual(prepared.asset.clips, []);
    assert.deepEqual(prepared.references.samples, []);
    assert.equal(prepared.asset.mesh.positions.length, 2400);
    assert.equal(prepared.asset.joints.length, 5);
  } finally {
    disposeLoaded(loaded);
  }
});

test('a common ancestor scale encoded by inverse binds is retained in bind-space geometry', async () => {
  const baseline = await loadFixture(signalRobotPath);
  let baselinePrepared: Awaited<ReturnType<typeof prepareSkeletalExport>> | undefined;
  try {
    baselinePrepared = await prepareSkeletalExport(baseline, {
      sourceIdentitySha256,
      rootJoint: 'Base',
    });
  } finally {
    disposeLoaded(baseline);
  }
  const baselinePacket = baselinePrepared ?? assert.fail('baseline export did not complete');

  const loaded = await loadFixture(signalRobotPath);
  try {
    const normalizationScale = 4.407004976352389;
    const normalization = new THREE.Group();
    normalization.name = 'source-normalization';
    normalization.scale.setScalar(normalizationScale);
    for (const child of [...loaded.root.children]) normalization.add(child);
    loaded.root.add(normalization);
    loaded.root.updateMatrixWorld(true);

    assert.ok(loaded.skeleton);
    const bindShapes = loaded.skeleton.bones.map((bone, index) => (
      bone.matrixWorld.clone().multiply(loaded.skeleton!.boneInverses[index])
    ));
    const commonBindShape = bindShapes[0];
    assert.ok(bindShapes.every(matrix => matrix.elements.every((value, index) => (
      Math.abs(value - commonBindShape.elements[index]) <= 1e-4
    ))));
    assert.ok(Math.abs(commonBindShape.elements[0] - normalizationScale) < 1e-5);

    const prepared = await prepareSkeletalExport(loaded, {
      sourceIdentitySha256,
      rootJoint: 'Base',
    });
    const totalVertices = loaded.skinnedMeshes.reduce((total, mesh) => (
      total + mesh.geometry.getAttribute('position').count
    ), 0);
    assert.equal(prepared.asset.mesh.positions.length, totalVertices);
    for (let vertex = 0; vertex < totalVertices; vertex += 1) {
      assert.ok(prepared.asset.mesh.positions[vertex].every((value, axis) => (
        Math.abs(value - baselinePacket.asset.mesh.positions[vertex][axis] * normalizationScale) < 1e-4
      )), `vertex ${vertex} did not retain the common bind-shape scale`);
    }
    assert.equal(prepared.references.samples.length, baselinePacket.references.samples.length);
    for (const [sampleIndex, sample] of prepared.references.samples.entries()) {
      const baselineSample = baselinePacket.references.samples[sampleIndex];
      assert.equal(sample.clipId, baselineSample.clipId);
      assert.equal(sample.phaseTicks, baselineSample.phaseTicks);
      for (let vertex = 0; vertex < totalVertices; vertex += 1) {
        assert.ok(sample.positions[vertex].every((value, axis) => (
          Math.abs(value - baselineSample.positions[vertex][axis] * normalizationScale) < 1e-4
        )), `${sample.clipId} reference vertex ${vertex} lost the common bind-shape scale`);
      }
    }
    assert.ok(prepared.asset.joints[0].bind.scale.every(value => Math.abs(value - normalizationScale) < 1e-5));
  } finally {
    disposeLoaded(loaded);
  }
});

test('STEP animation is refused with its interpolation mode identified', async () => {
  const loaded = await loadFixture(signalRobotPath);
  try {
    loaded.clips = [new THREE.AnimationClip('Step', 2, [
      new THREE.QuaternionKeyframeTrack(
        'Base.quaternion',
        [0, 2],
        [0, 0, 0, 1, 0, 0, 0, 1],
        THREE.InterpolateDiscrete,
      ),
    ])];
    await assert.rejects(
      prepareSkeletalExport(loaded, { sourceIdentitySha256, rootJoint: 'Base' }),
      /Clip Step track Base\.quaternion uses unsupported STEP interpolation/,
    );
  } finally {
    disposeLoaded(loaded);
  }
});

test('source assets over the runtime vertex limit fail without trimming loaded geometry', async () => {
  const loaded = await loadFixture(sablePath);
  try {
    assert.equal(loaded.skinnedMeshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0), 10_425);
    await assert.rejects(
      prepareSkeletalExport(loaded, { sourceIdentitySha256, rootJoint: 'Root' }),
      /more than 8192 skinned vertices.*No vertices were removed/,
    );
    assert.equal(loaded.skinnedMeshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0), 10_425);
  } finally {
    disposeLoaded(loaded);
  }
});

test('root pitch/roll is refused before it can be lost from the separate yaw channel', async () => {
  const loaded = await loadFixture(signalRobotPath);
  try {
    const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2);
    loaded.clips[1] = new THREE.AnimationClip('Turn', 2, [
      new THREE.QuaternionKeyframeTrack('Base.quaternion', [0, 2], [0, 0, 0, 1, ...pitch.toArray()]),
    ]);
    await assert.rejects(
      prepareSkeletalExport(loaded, { sourceIdentitySha256, rootJoint: 'Base' }),
      /contains pitch or roll/,
    );
  } finally {
    disposeLoaded(loaded);
  }
});
