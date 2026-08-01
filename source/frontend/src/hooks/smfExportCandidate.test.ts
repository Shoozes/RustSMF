import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import type { ImportedSmf } from '../loaders';
import { SmfConversionError } from '../loaders';
import {
  makeAnimationEditState,
  setAnimationClipLoop,
  setAnimationClipSampleFrameMultiplier,
} from '../utils/animationEdits';
import {
  buildSmfExportCandidate,
  UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE,
} from './smfExportCandidate';

function makeSkeleton(boneName = 'SMF_Node_0'): THREE.Skeleton {
  const bone = new THREE.Bone();
  bone.name = boneName;
  return new THREE.Skeleton([bone]);
}

function makeSkinnedMesh(skeleton: THREE.Skeleton, name = 'source-mesh'): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0, 1,
  ], 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    0.25, 0.75, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

function makeSourceSmf(): ImportedSmf {
  return {
    meshes: [{
      name: 'source-mesh',
      verts: 3,
      triangles: [[0, 1, 2]],
      texIdx: -1,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      tangents: new Float32Array(12),
      skinIndices: new Uint16Array(12),
      skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      visible: 1,
    }],
    textures: [],
    bones: [{
      index: 0,
      parent: 0,
      isBone: 1,
      dq: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
      axis: [0, 1, 0],
    }],
    animations: [{
      name: 'Idle',
      duration: 1,
      times: [0],
      frames: [[new Float32Array([0, 0, 0, 1, 0, 0, 0, 0])]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
}

describe('buildSmfExportCandidate', () => {
  it('returns null when no source or root is available', () => {
    assert.equal(buildSmfExportCandidate({
      sourceSmf: null,
      root: null,
      skeleton: null,
      clips: [],
      poseEdits: {},
      animationEdits: makeAnimationEditState(),
    }), null);
  });

  it('blocks unsupported scale edits through the shared policy', () => {
    assert.throws(
      () => buildSmfExportCandidate({
        sourceSmf: makeSourceSmf(),
        root: null,
        skeleton: makeSkeleton(),
        clips: [],
        poseEdits: {
          SMF_Node_0: {
            dx: 0,
            dy: 0,
            dRotZ: 0,
            dirty: true,
            hasScale: true,
          },
        },
        animationEdits: makeAnimationEditState(),
      }),
      (error: unknown) => error instanceof SmfConversionError
        && error.message === UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE,
    );
  });

  it('applies pose, animation metadata, and live skin edits to one source candidate', () => {
    const source = makeSourceSmf();
    const sourceDq = [...source.bones[0].dq];
    const sourceWeights = [...source.meshes[0].skinWeights];
    const skeleton = makeSkeleton();
    skeleton.bones[0].position.set(2, 0, 0);
    const root = new THREE.Group();
    root.add(makeSkinnedMesh(skeleton));
    const clip = new THREE.AnimationClip('Idle', 1, [
      new THREE.VectorKeyframeTrack('SMF_Node_0.position', [0], [2, 0, 0]),
      new THREE.QuaternionKeyframeTrack('SMF_Node_0.quaternion', [0], [0, 0, 0, 1]),
    ]);
    const loopEdited = setAnimationClipLoop(
      makeAnimationEditState(),
      'Idle',
      false,
      { loop: true, sampleFrameMultiplier: 1 },
    );
    const animationEdits = setAnimationClipSampleFrameMultiplier(
      loopEdited,
      'Idle',
      4,
      { loop: false, sampleFrameMultiplier: 1 },
    );

    const candidate = buildSmfExportCandidate({
      sourceSmf: source,
      root,
      skeleton,
      clips: [clip],
      poseEdits: {
        SMF_Node_0: {
          dx: 2,
          dy: 0,
          dRotZ: 0,
          dirty: true,
          hasScale: false,
        },
      },
      animationEdits,
    });

    assert.ok(candidate);
    assert.notDeepEqual([...candidate.bones[0].dq], sourceDq);
    assert.equal(candidate.animations[0].loop, 0);
    assert.equal(candidate.animations[0].sampleFrameMultiplier, 4);
    assert.deepEqual([...candidate.meshes[0].skinWeights.slice(0, 4)], [0.25, 0.75, 0, 0]);
    assert.deepEqual([...source.bones[0].dq], sourceDq);
    assert.deepEqual([...source.meshes[0].skinWeights], sourceWeights);
  });

  it('builds a verified non-SMF conversion candidate before serialization', () => {
    const skeleton = makeSkeleton('Bone_0');
    const root = new THREE.Group();
    root.add(makeSkinnedMesh(skeleton, 'converted-mesh'));

    const candidate = buildSmfExportCandidate({
      sourceSmf: null,
      root,
      skeleton,
      clips: [],
      poseEdits: {},
      animationEdits: makeAnimationEditState(),
    });

    assert.ok(candidate);
    assert.equal(candidate.meshes.length, 1);
    assert.equal(candidate.bones.length, 1);
  });
});
