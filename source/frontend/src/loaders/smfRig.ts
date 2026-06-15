import type { ImportedSmf } from './smf';

/**
 * SMF rig node list builder.
 * Handles SMF-sourced (prebuilt heads, 1:1 preserve) vs GLB/FBX-constructed direct bone lists.
 * Used by exportSMFToBuffer for correct rig/anim serialization (parent-0, isBone/head flags).
 * Public exports from smf.ts unchanged.
 */

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
