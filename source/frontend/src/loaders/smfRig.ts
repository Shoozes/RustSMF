import * as THREE from 'three';
import type { ImportedSmf } from './smf';
import { dqToMatrix, smfMatrixToThree, decomposeMatrix } from './coord';

/**
 * SMF rig node list builder.
 * Handles SMF-sourced (prebuilt heads, 1:1 preserve) vs GLB/FBX-constructed direct bone lists.
 * Used by exportSMFToBuffer for correct rig/anim serialization (parent-0, isBone/head flags).
 * Public exports from smf.ts unchanged.
 */

function dqToThreeMatrix(dq: Float32Array): THREE.Matrix4 {
  const smfMatrix = dqToMatrix(dq);
  const threeMatrix = smfMatrixToThree(smfMatrix);
  return new THREE.Matrix4().fromArray(threeMatrix);
}

function makeLocalMatrix(world: THREE.Matrix4, parentWorld: THREE.Matrix4 | null): THREE.Matrix4 {
  if (!parentWorld) return world.clone();
  return parentWorld.clone().invert().multiply(world);
}

function applyMatrixTransform(obj: THREE.Object3D, m: THREE.Matrix4) {
  const { pos, quat, scale } = decomposeMatrix(m);
  obj.position.copy(pos);
  obj.quaternion.copy(quat);
  obj.scale.copy(scale);
}

export function findEffectiveBoneParentIndex(
  bones: ImportedSmf['bones'],
  startParent: number,
  selfIndex: number
): number | null {
  const visited = new Set<number>();
  let pIdx = startParent;

  while (pIdx !== selfIndex && pIdx >= 0 && pIdx < bones.length && !visited.has(pIdx)) {
    visited.add(pIdx);
    if (bones[pIdx].isBone === 1) {
      return pIdx;
    }
    pIdx = bones[pIdx].parent;
  }

  return null;
}

export function buildSmfNodeList(importedBones: ImportedSmf['bones']): {
  nodeList: Array<{ boneIndex: number; parent: number; isBone: number; isHead: boolean; name: string }>;
  boneToNode: Map<number, number>;
} {
  const nodeList: Array<{ boneIndex: number; parent: number; isBone: number; isHead: boolean; name: string }> = [];
  const boneToNode = new Map<number, number>();
  let nodeIndex = 0;

  const hasPrebuiltHeads = importedBones.some(b => b.isBone === 0);
  if (hasPrebuiltHeads) {
    // SMF-sourced: bones array already encodes the full rig nodes (heads + bones); preserve structure/parents exactly.
    importedBones.forEach((b, bi) => {
      nodeList.push({
        boneIndex: bi,
        parent: b.parent,
        isBone: b.isBone,
        isHead: b.isBone === 0,
        name: b.isBone ? `Bone_${bi}` : `Head_${bi}`
      });
      boneToNode.set(bi, nodeIndex);
      nodeIndex++;
    });
  } else {
    // Constructed (e.g. from GLB/FBX): input is only real bones plus actual parent indices.
    // Detached head-node synthesis needs explicit source metadata, so keep direct nodes here.
    importedBones.forEach((b, bi) => {
      const hasParent = b.parent >= 0;
      nodeList.push({
        boneIndex: bi,
        parent: hasParent ? (boneToNode.get(b.parent) ?? 0) : 0,
        isBone: 1,
        isHead: false,
        name: `Bone_${bi}`
      });
      boneToNode.set(bi, nodeIndex);
      nodeIndex++;
    });
  }

  // Clamp parents (node 0 as root target for orphans)
  nodeList.forEach((n) => {
    if (n.parent < 0 || n.parent >= nodeList.length) n.parent = 0;
  });

  return { nodeList, boneToNode };
}

// Build Three Bone hierarchy from flat SMF nodes (heads=isBone:0 are dummies for disconnected subrigs).
// Skips heads when resolving .parent/.add and skeleton.bones (deform only).
// Names: SMF_Node_N for bones, SMF_Node_N_head for dummies (roundtrip safe via updated regex).
// Locals computed vs effective is-bone ancestor using world DQs for correct bind + no crossed viz.
export function buildRigHierarchy(imported: ImportedSmf, root: THREE.Group) {
  const nodeMap = new Map<number, THREE.Bone>();
  const bones: THREE.Bone[] = [];
  const worldMats: THREE.Matrix4[] = imported.bones.map((b) => dqToThreeMatrix(b.dq));

  imported.bones.forEach((nodeData, idx) => {
    if (nodeData.isBone !== 1) return;
    const bone = new THREE.Bone();
    bone.name = `SMF_Node_${idx}`;
    bone.userData = { index: idx, isBone: true, originalParent: nodeData.parent };
    const myWorld = worldMats[idx];
    const effectiveParent = findEffectiveBoneParentIndex(imported.bones, nodeData.parent, idx);
    const effWorld = effectiveParent === null ? null : worldMats[effectiveParent];
    const localM = makeLocalMatrix(myWorld, effWorld);
    applyMatrixTransform(bone, localM);
    bone.updateMatrix();
    nodeMap.set(idx, bone);
    bones.push(bone);
  });

  // Resolve parents skipping heads (core fix for spurious SkeletonHelper + inspector nesting)
  imported.bones.forEach((nodeData, idx) => {
    if (nodeData.isBone !== 1) return;
    const bone = nodeMap.get(idx)!;
    const effectiveParent = findEffectiveBoneParentIndex(imported.bones, nodeData.parent, idx);
    const parentBone = effectiveParent === null ? null : nodeMap.get(effectiveParent) ?? null;
    if (parentBone) {
      parentBone.add(bone);
    } else {
      root.add(bone);
    }
  });

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  return { skeleton, allNodes: Array.from(nodeMap.values()) };
}
