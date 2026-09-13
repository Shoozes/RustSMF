import * as THREE from 'three';
import {parsePoseRangeProfile,type PoseJointRange,type PoseRangeProfile} from './poseRanges';

/** Broad animation-review heuristics, not medical ranges or a physics rig. */
export function calibrateMixamoPoseRanges(skeleton: THREE.Skeleton): PoseRangeProfile {
  const names = new Map<string,THREE.Bone>();
  for(const bone of skeleton.bones){
    const name=bone.name.replace(/^mixamorig:?/i,'').toLowerCase();
    if(names.has(name))throw new Error(`Ambiguous humanoid bone ${name}`);
    names.set(name,bone);
  }
  const find=(name:string)=>{const bone=names.get(name.toLowerCase());if(!bone)throw new Error(`Humanoid calibration requires ${name}`);return bone;};
  const position=(bone:THREE.Bone)=>bone.getWorldPosition(new THREE.Vector3());
  const descendant=(parent:THREE.Bone,child:THREE.Bone)=>{for(let node:THREE.Object3D|null=child.parent;node;node=node.parent)if(node===parent)return;throw new Error(`Invalid humanoid chain ${parent.name} → ${child.name}`);};
  const joints:PoseJointRange[]=[];
  const hips=find('Hips');hips.updateWorldMatrix(true,true);
  const forward=new THREE.Vector3(0,0,1); // Explicit Mixamo Y-up/Z-forward calibration convention.
  function add(name:string,childName:string,kind:'knee'|'elbow'|'hip'|'shoulder'|'spine'|'neck'|'head'|'wrist'|'ankle'){
    const bone=find(name),child=find(childName);descendant(bone,child);
    const outgoing=position(child).sub(position(bone));
    if(outgoing.lengthSq()<1e-10)throw new Error(`Degenerate humanoid segment ${name}`);
    const inverse=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const twistAxis=outgoing.clone().normalize().applyQuaternion(inverse);
    let bendAxis:THREE.Vector3,referenceBend=0;
    if(kind==='knee'||kind==='elbow'){
      const parent=find(name.replace(kind==='knee'?'Leg':'ForeArm',kind==='knee'?'UpLeg':'Arm'));
      descendant(parent,bone);
      const incoming=position(bone).sub(position(parent));
      if(incoming.lengthSq()<1e-10)throw new Error(`Degenerate humanoid hinge ${name}`);
      const expected=incoming.clone().cross(forward.clone().multiplyScalar(kind==='knee'?-1:1)).normalize();
      if(expected.lengthSq()<1e-10)throw new Error(`Calibrate ${name} from a neutral Y-up/Z-forward pose`);
      bendAxis=incoming.clone().cross(outgoing);
      const sign=bendAxis.dot(expected)<0?-1:1;
      referenceBend=THREE.MathUtils.radToDeg(incoming.angleTo(outgoing))*sign;
      if(bendAxis.lengthSq()<1e-10)bendAxis=expected;else bendAxis.normalize().multiplyScalar(sign);
      bendAxis.applyQuaternion(inverse);
    }else{
      bendAxis=new THREE.Vector3(1,0,0).applyQuaternion(inverse);
      bendAxis.addScaledVector(twistAxis,-bendAxis.dot(twistAxis));
      if(bendAxis.lengthSq()<1e-10){bendAxis.copy(forward).applyQuaternion(inverse);bendAxis.addScaledVector(twistAxis,-bendAxis.dot(twistAxis));}
    }
    bendAxis.normalize();
    const cone={knee:170,elbow:175,hip:135,shoulder:175,spine:40,neck:70,head:55,wrist:100,ankle:75}[kind];
    const twist={knee:50,elbow:120,hip:100,shoulder:150,spine:50,neck:90,head:75,wrist:110,ankle:50}[kind];
    const hinge=kind==='knee'||kind==='elbow';
    joints.push({bone:bone.name,referenceRotation:bone.quaternion.toArray(),twistAxis:twistAxis.toArray(),bendAxis:bendAxis.toArray(),
      flexionDegrees:hinge?[Math.max(-180,-8-referenceBend),Math.min(180,(kind==='knee'?160:170)-referenceBend)]:[-cone,cone],
      lateralDegrees:hinge?[-35,35]:[-cone,cone],twistDegrees:[-twist,twist],maximumSwingDegrees:cone});
  }
  for(const side of ['Left','Right']){
    add(`${side}UpLeg`,`${side}Leg`,'hip');add(`${side}Leg`,`${side}Foot`,'knee');
    add(`${side}Foot`,`${side}ToeBase`,'ankle');add(`${side}Arm`,`${side}ForeArm`,'shoulder');
    add(`${side}ForeArm`,`${side}Hand`,'elbow');
    if(names.has(`${side}HandIndex1`.toLowerCase()))add(`${side}Hand`,`${side}HandIndex1`,'wrist');
  }
  const spine=['Spine','Spine1','Spine2'].filter(name=>names.has(name.toLowerCase()));
  if(!spine.length)throw new Error('Humanoid calibration requires a spine');
  for(let i=0;i<spine.length;i++)add(spine[i],spine[i+1]??'Neck','spine');
  add('Neck','Head','neck');
  const head=find('Head'),headEnd=head.children.find((node):node is THREE.Bone=>node instanceof THREE.Bone);
  if(headEnd){names.set(headEnd.name.toLowerCase(),headEnd);add('Head',headEnd.name,'head');}
  else {
    const neckJoint=joints.find(j=>j.bone===find('Neck').name)!;
    const axis=position(head).sub(position(find('Neck'))).normalize().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
    const bend=new THREE.Vector3(1,0,0).addScaledVector(axis,-axis.x).normalize();
    joints.push({...neckJoint,bone:head.name,referenceRotation:head.quaternion.toArray(),twistAxis:axis.toArray(),bendAxis:bend.toArray(),flexionDegrees:[-55,55],lateralDegrees:[-55,55],twistDegrees:[-75,75],maximumSwingDegrees:55});
  }
  return parsePoseRangeProfile({schema:'rustsmf.pose-ranges.v1',id:'mixamo-humanoid-review-v1',policy:'report',joints});
}
