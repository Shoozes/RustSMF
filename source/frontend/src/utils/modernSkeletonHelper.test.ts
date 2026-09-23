import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { ModernSkeletonHelper, findBoneNameFromSkeletonHelperHit } from './modernSkeletonHelper';

describe('ModernSkeletonHelper', () => {
  it('builds clickable rig parts with source bone metadata', () => {
    const root = new THREE.Group();
    const parentBone = new THREE.Bone();
    parentBone.name = 'SMF_Node_0';
    const childBone = new THREE.Bone();
    childBone.name = 'SMF_Node_1';
    childBone.position.set(0, 1, 0);
    parentBone.add(childBone);
    root.add(parentBone);
    root.updateMatrixWorld(true);

    const helper = new ModernSkeletonHelper(root);
    helper.updateMatrixWorld(true);
    const helperParts: THREE.Object3D[] = [];
    helper.traverse((object) => {
      if (object.userData?.isModernSkeletonHelperPart && object.userData?.boneName) {
        helperParts.push(object);
      }
    });

    assert.ok(helperParts.length >= 2, 'creates joint and bone helper parts');
    assert.ok(helperParts.some((object) => object.userData.boneName === 'SMF_Node_0'));
    assert.ok(helperParts.some((object) => object.userData.boneName === 'SMF_Node_1'));
    const childPart = helperParts.find((object) => object.userData.boneName === 'SMF_Node_1');
    assert.ok(childPart, 'child helper part exists for direct hit mapping');
    assert.equal(findBoneNameFromSkeletonHelperHit({ object: childPart } as THREE.Intersection), 'SMF_Node_1');
    helper.dispose();
  });

  it('keeps overlay thickness proportional for small imported world-space bones', () => {
    const getThicknessRatio = (rootScale: number): number => {
      const root = new THREE.Group();
      root.scale.setScalar(rootScale);
      const parentBone = new THREE.Bone();
      const childBone = new THREE.Bone();
      parentBone.name = 'Parent';
      childBone.name = 'Child';
      childBone.position.y = 1;
      parentBone.add(childBone);
      root.add(parentBone);
      root.updateMatrixWorld(true);

      const helper = new ModernSkeletonHelper(root);
      helper.updateMatrixWorld(true);
      const segment = helper.children.find((object): object is THREE.Mesh => (
        object instanceof THREE.Mesh
        && object.userData.boneName === childBone.name
        && Math.abs(object.scale.x - object.scale.z) > Number.EPSILON
      ));
      assert.ok(segment, 'creates a scaled segment for the child bone');
      const ratio = segment.scale.x / segment.scale.z;
      helper.dispose();
      return ratio;
    };

    const unitScaleRatio = getThicknessRatio(1);
    const centimeterScaleRatio = getThicknessRatio(0.01);
    assert.ok(Math.abs(unitScaleRatio - 0.06) < 1e-6);
    assert.ok(Math.abs(centimeterScaleRatio - unitScaleRatio) < 1e-6);
  });

  it('uses model bounds to size joints when bone links have zero length', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshBasicMaterial());
    mesh.scale.setScalar(0.01);
    root.add(mesh);

    const parentBone = new THREE.Bone();
    const childBone = new THREE.Bone();
    parentBone.add(childBone);
    root.add(parentBone);
    root.updateMatrixWorld(true);
    const modelSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).length();

    const helper = new ModernSkeletonHelper(root);
    helper.updateMatrixWorld(true);
    const joint = helper.children.find((object): object is THREE.Mesh => (
      object instanceof THREE.Mesh
      && object.userData.boneName === childBone.name
      && object.scale.x === object.scale.y
      && object.scale.y === object.scale.z
    ));

    assert.ok(joint, 'creates a joint marker for a collapsed bone chain');
    assert.ok(Math.abs(joint.scale.x - (modelSize / 2) * 0.085) < 1e-8);
    helper.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
