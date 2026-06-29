import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { validateRig } from './rigValidation';

function makeSkeleton(): { root: THREE.Group; skeleton: THREE.Skeleton; mesh: THREE.SkinnedMesh } {
  const sceneRoot = new THREE.Group();
  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  const tipBone = new THREE.Bone();
  tipBone.name = 'Tip';
  tipBone.position.set(0, 1, 0);
  rootBone.add(tipBone);
  sceneRoot.add(rootBone);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'RigMesh';
  const skeleton = new THREE.Skeleton([rootBone, tipBone]);
  mesh.bind(skeleton);
  sceneRoot.add(mesh);
  return { root: sceneRoot, skeleton, mesh };
}

describe('rigValidation', () => {
  it('passes a simple valid skeleton with matching skin references', () => {
    const { root, skeleton } = makeSkeleton();
    const report = validateRig(skeleton, root);

    assert.equal(report.status, 'pass');
    assert.equal(report.boneCount, 2);
    assert.equal(report.skinnedMeshCount, 1);
    assert.deepEqual(report.issues, []);
  });

  it('warns on duplicate bone names that would make tracks ambiguous', () => {
    const { root, skeleton } = makeSkeleton();
    skeleton.bones[1].name = 'Root';

    const report = validateRig(skeleton, root);

    assert.equal(report.status, 'warning');
    assert.equal(report.issues[0].code, 'RIG_DUPLICATE_BONE_NAME');
  });

  it('reports orphan parents outside the skeleton', () => {
    const { root, skeleton } = makeSkeleton();
    const outside = new THREE.Bone();
    outside.name = 'Outside';
    skeleton.bones[1].parent = outside;

    const report = validateRig(skeleton, root);

    assert.equal(report.status, 'error');
    assert.equal(report.issues[0].code, 'RIG_ORPHAN_PARENT');
    assert.equal(report.issues[0].boneName, 'Tip');
  });

  it('reports hierarchy cycles', () => {
    const { root, skeleton } = makeSkeleton();
    skeleton.bones[1].parent = skeleton.bones[0];
    skeleton.bones[0].parent = skeleton.bones[1];

    const report = validateRig(skeleton, root);
    const codes = report.issues.map((issue) => issue.code);

    assert.equal(report.status, 'error');
    assert.ok(codes.includes('RIG_CYCLE'));
  });

  it('reports skin weights that reference missing bones', () => {
    const { root, skeleton, mesh } = makeSkeleton();
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    skinIndex.setX(1, 9);
    skinIndex.needsUpdate = true;

    const report = validateRig(skeleton, root);

    assert.equal(report.status, 'error');
    assert.equal(report.issues[0].code, 'RIG_SKIN_INDEX_OUT_OF_RANGE');
    assert.equal(report.issues[0].meshName, 'RigMesh');
    assert.equal(report.issues[0].vertexIndex, 1);
  });

  it('reports incomplete skin attributes on skinned meshes', () => {
    const { root, skeleton, mesh } = makeSkeleton();
    mesh.geometry.deleteAttribute('skinWeight');

    const report = validateRig(skeleton, root);

    assert.equal(report.status, 'error');
    assert.equal(report.issues[0].code, 'RIG_SKIN_MISSING_ATTRIBUTES');
  });

  it('warns when no editable skeleton is loaded', () => {
    const report = validateRig(null, new THREE.Group());

    assert.equal(report.status, 'warning');
    assert.equal(report.issues[0].code, 'RIG_NO_SKELETON');
  });
});
