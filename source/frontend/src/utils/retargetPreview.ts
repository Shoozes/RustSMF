import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { TransferPreview } from '../hooks/useRetargetTransfer';
import type { SkeletonNodeSnapshotV1 } from '../workers/retargetAnalysisTypes';

/** Shared geometry/textures stay editor-owned; only cloned materials/bones are released here. */
export function createRetargetPreview(root:THREE.Group,preview:TransferPreview) {
  const copy=clone(root) as THREE.Group, materials:THREE.Material[]=[], skeletons=new Set<THREE.Skeleton>();
  copy.traverse(node=>{
    if(node instanceof THREE.Mesh){
      node.material=Array.isArray(node.material)?node.material.map(material=>material.clone()):node.material.clone();
      materials.push(...(Array.isArray(node.material)?node.material:[node.material]));
    }
    if(node instanceof THREE.SkinnedMesh)skeletons.add(node.skeleton);
  });
  const bones=new Map<string,THREE.Bone>();copy.traverse(node=>{if(node instanceof THREE.Bone)bones.set(node.name,node);});
  const visited=new Set<THREE.Object3D>();
  for(const boneIndex of preview.rest.bones){
    let node:THREE.Object3D|null=bones.get(preview.rest.nodes[boneIndex].name)??null,index:number|null=boneIndex;
    while(node && index!==null){
      const item:SkeletonNodeSnapshotV1=preview.rest.nodes[index];
      if(!visited.has(node)){
        node.position.fromArray(item.position);node.quaternion.fromArray(item.quaternion);node.scale.fromArray(item.scale);node.updateMatrix();visited.add(node);
      }
      node=node.parent;index=item.parent;
    }
  }
  copy.visible=true;copy.updateMatrixWorld(true);
  const mixer=new THREE.AnimationMixer(copy);let current=0,action:THREE.AnimationAction;
  const play=(index:number)=>{mixer.stopAllAction();current=index;action=mixer.clipAction(preview.clips[index]);action.play();mixer.update(0);};
  play(preview.activeClip??0);
  return {id:preview.id,root:copy,mixer,play,get currentClip(){return preview.clips[current];},get time(){return action.time;},
    setTime:(time:number)=>{action.time=Math.max(0,Math.min(time,preview.clips[current].duration));mixer.update(0);copy.updateMatrixWorld(true);},dispose:()=>{
    mixer.stopAllAction();mixer.uncacheRoot(copy);copy.removeFromParent();materials.forEach(material=>material.dispose());skeletons.forEach(skeleton=>skeleton.dispose());
  }};
}
