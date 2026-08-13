import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { disposeThreeObject } from './threeDisposal';
import {
  countStaticMeshes,
  prepareStaticMeshesForSkinning,
  reapplyStaticMeshSkinPreparation,
  restoreStaticMeshSkinPreparation,
} from './staticMeshSkinPrep';

function makeStaticRoot(): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
  ]), 3));
  const meshA = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  meshA.name = 'Body';
  const meshB = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  meshB.name = 'Hair';
  meshB.position.set(0, 2, 0);

  const root = new THREE.Group();
  root.name = 'StaticRoot';
  root.add(meshA);
  root.add(meshB);
  return root;
}

describe('prepareStaticMeshesForSkinning', () => {
  it('converts static meshes to one shared root skeleton', () => {
    const root = makeStaticRoot();
    try {
      assert.equal(countStaticMeshes(root), 2);
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(result.convertedCount, 2);
      assert.equal(result.rootBoneName, 'Root');
      assert.equal(result.skeleton.bones.length, 1);
      assert.equal(result.skinnedMeshes.length, 2);
      assert.equal(countStaticMeshes(root), 0);

      for (const mesh of result.skinnedMeshes) {
        assert.equal(mesh.type, 'SkinnedMesh');
        assert.equal(mesh.skeleton, result.skeleton);
        const skinIndex = mesh.geometry.getAttribute('skinIndex');
        const skinWeight = mesh.geometry.getAttribute('skinWeight');
        assert.ok(skinIndex);
        assert.ok(skinWeight);
        assert.equal(skinIndex.getX(0), 0);
        assert.equal(skinWeight.getX(0), 1);
      }
      assert.equal(root.getObjectByName('Root')?.type, 'Bone');
    } finally {
      disposeThreeObject(root);
    }
  });

  it('rejects roots that already have a skeleton', () => {
    const root = makeStaticRoot();
    try {
      const first = prepareStaticMeshesForSkinning(root);
      assert.equal(first.ok, true);
      const second = prepareStaticMeshesForSkinning(root);
      assert.equal(second.ok, false);
      if (second.ok) return;
      assert.equal(second.reason, 'already-skinned');
    } finally {
      disposeThreeObject(root);
    }
  });

  it('rejects any existing skinned geometry without mutating static meshes', () => {
    const root = makeStaticRoot();
    const staticMesh = root.children[0] as THREE.Mesh;
    const skinned = new THREE.SkinnedMesh(
      staticMesh.geometry.clone(),
      new THREE.MeshBasicMaterial(),
    );
    skinned.name = 'MalformedSkinnedMesh';
    root.add(skinned);
    try {
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reason, 'already-skinned');
      assert.equal(staticMesh.geometry.getAttribute('skinIndex'), undefined);
      assert.equal(root.getObjectByName('Root'), undefined);
    } finally {
      disposeThreeObject(root);
    }
  });

  it('rejects empty roots', () => {
    const root = new THREE.Group();
    try {
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reason, 'no-static-meshes');
    } finally {
      disposeThreeObject(root);
    }
  });

  it('preflights every mesh before adding skin attributes', () => {
    const root = makeStaticRoot();
    const validMesh = root.children[0] as THREE.Mesh;
    const emptyMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    emptyMesh.name = 'Empty';
    root.add(emptyMesh);
    const childrenBefore = [...root.children];
    try {
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reason, 'empty-geometry');
      assert.deepEqual(root.children, childrenBefore);
      assert.equal(validMesh.geometry.getAttribute('skinIndex'), undefined);
      assert.equal(validMesh.geometry.getAttribute('skinWeight'), undefined);
      assert.equal(root.getObjectByName('Root'), undefined);
    } finally {
      disposeThreeObject(root);
    }
  });

  it('uses each transformed mesh world matrix as its bind space', () => {
    const root = makeStaticRoot();
    const original = root.getObjectByName('Body') as THREE.Mesh;
    original.position.set(2, 0, 0);
    root.updateWorldMatrix(true, true);
    try {
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const skinned = result.skinnedMeshes.find((mesh) => mesh.name === 'Body');
      assert.ok(skinned);
      result.skeleton.bones[0].rotation.z = Math.PI / 2;
      root.updateWorldMatrix(true, true);
      result.skeleton.update();

      const worldVertex = skinned.getVertexPosition(1, new THREE.Vector3())
        .applyMatrix4(skinned.matrixWorld);
      assert.ok(worldVertex.distanceTo(new THREE.Vector3(0, 3, 0)) < 1e-5);
    } finally {
      disposeThreeObject(root);
    }
  });

  it('allocates a root-bone name that cannot collide with imported object names', () => {
    const root = makeStaticRoot();
    root.children[0].name = 'Root';
    root.children[1].name = 'Root_2';
    try {
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.rootBoneName, 'Root_3');
      assert.equal(result.skeleton.bones[0].name, 'Root_3');
    } finally {
      disposeThreeObject(root);
    }
  });

  it('restores and reapplies the preparation without losing original mesh state', () => {
    const root = makeStaticRoot();
    const originalMeshes = root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    try {
      const result = prepareStaticMeshesForSkinning(root);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      restoreStaticMeshSkinPreparation(result.preparation);
      assert.equal(root.getObjectByName('Root'), undefined);
      assert.deepEqual(
        root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
        originalMeshes,
      );
      for (const mesh of originalMeshes) {
        assert.equal(mesh.geometry.getAttribute('skinIndex'), undefined);
        assert.equal(mesh.geometry.getAttribute('skinWeight'), undefined);
      }

      reapplyStaticMeshSkinPreparation(result.preparation);
      assert.equal(root.getObjectByName('Root')?.type, 'Bone');
      assert.equal(countStaticMeshes(root), 0);
      assert.equal(result.preparation.skeleton.bones.length, 1);
    } finally {
      disposeThreeObject(root);
    }
  });
});
