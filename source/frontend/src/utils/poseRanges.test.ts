import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {auditPoseRanges,measurePoseJoint,parsePoseRangeProfile,type PoseRangeProfile} from './poseRanges';
import {calibrateMixamoPoseRanges} from './humanoidPoseRanges';

const profile=():PoseRangeProfile=>({schema:'rustsmf.pose-ranges.v1',id:'test',policy:'report',joints:[{
  bone:'knee',referenceRotation:[0,0,0,1],twistAxis:[0,-1,0],bendAxis:[1,0,0],
  flexionDegrees:[-5,160],lateralDegrees:[-15,15],twistDegrees:[-45,45],maximumSwingDegrees:170,
}]});
const rotate=(axis:number[],angle:number)=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis),THREE.MathUtils.degToRad(angle));
test('anatomical envelopes distinguish flexion, reverse bends, sideways collapse and axial twist',()=>{
  const p=profile(),rotations=[rotate([1,0,0],90),rotate([1,0,0],-20),rotate([0,0,1],45),rotate([0,-1,0],100)];
  const report=auditPoseRanges(p,'jab',4,new Set(['knee']),(frame)=>rotations[frame]);
  assert.equal(report.status,'review-required');
  assert.deepEqual(report.issues.map(i=>[i.component,i.worstFrame]),[['flexion',1],['lateral',2],['twist',3]]);
  assert.ok(Math.abs(report.issues[0].worstDegrees+20)<1e-8);
  assert.equal(auditPoseRanges(p,'idle',1,new Set(['knee']),()=>rotations[0]).status,'within-profile');
});
test('mirrored calibration and quaternion antipodes give the same limits and no false sign flips',()=>{
  const left=profile().joints[0],right={...left,bendAxis:[-1,0,0] as [number,number,number]};
  const q=rotate([1,0,0],90),mirror=rotate([-1,0,0],90);
  assert.equal(measurePoseJoint(left,q).flexion,measurePoseJoint(right,mirror).flexion);
  assert.deepEqual(measurePoseJoint(left,q),measurePoseJoint(left,new THREE.Quaternion(-q.x,-q.y,-q.z,-q.w)));
  assert.ok(measurePoseJoint(left,rotate([1,0,0],180)).swing>179.99);
});
test('malformed calibration, missing bones, invalid rotations and unbounded scans fail explicitly',()=>{
  for(const mutate of [(p:PoseRangeProfile)=>p.joints.push(p.joints[0]),(p:PoseRangeProfile)=>p.joints[0].bendAxis=[0,-1,0],(p:PoseRangeProfile)=>p.joints[0].referenceRotation=[0,0,0,0],(p:PoseRangeProfile)=>p.joints[0].twistDegrees=[90,-90]]){
    const p=profile();mutate(p);assert.throws(()=>parsePoseRangeProfile(p),/Body range/);
  }
  assert.throws(()=>parsePoseRangeProfile({...profile(),ignored:true}),/unknown/);
  assert.throws(()=>auditPoseRanges(profile(),'idle',1,new Set(),()=>new THREE.Quaternion()),/missing bone/);
  assert.throws(()=>auditPoseRanges(profile(),'idle',20001,new Set(['knee']),()=>new THREE.Quaternion()),/sample count/);
  assert.throws(()=>auditPoseRanges(profile(),'idle',1,new Set(['knee']),()=>new THREE.Quaternion(NaN,0,0,1)),/animated rotation/);
});
function humanoid(prefix:string,helper=false){
  const bones:THREE.Bone[]=[];
  const add=(name:string,parent:THREE.Bone|null,xyz:number[])=>{const b=new THREE.Bone();b.name=prefix+name;b.position.fromArray(xyz);parent?.add(b);bones.push(b);return b;};
  const hips=add('Hips',null,[0,1,0]),spine=add('Spine',hips,[0,.25,0]),neck=add('Neck',spine,[0,.2,0]);add('Head',neck,[0,.1,0]);
  for(const [side,sign] of [['Left',1],['Right',-1]] as const){
    const thigh=add(side+'UpLeg',hips,[sign*.12,-.05,0]);
    const shin=add(side+'Leg',helper?add(side+'Helper',thigh,[0,0,0]):thigh,[0,-.35,.04]);
    const ankle=add(side+'Foot',shin,[0,-.35,-.04]);add(side+'ToeBase',ankle,[0,0,.1]);
    const arm=add(side+'Arm',spine,[sign*.25,.15,0]),elbow=add(side+'ForeArm',arm,[sign*.25,0,.03]);add(side+'Hand',elbow,[sign*.2,0,.05]);
  }
  hips.updateWorldMatrix(true,true);return new THREE.Skeleton(bones);
}
test('Mixamo calibration supports colon/plain names, both sides and intermediate bones without mutating the rig',()=>{
  for(const prefix of ['mixamorig:','mixamorig','']){
    const rig=humanoid(prefix,true),before=rig.bones.map(b=>b.matrixWorld.toArray());
    const p=calibrateMixamoPoseRanges(rig),byName=new Map(rig.bones.map(b=>[b.name,b]));
    assert.equal(auditPoseRanges(p,'neutral',1,new Set(byName.keys()),(_,name)=>byName.get(name)!.quaternion).status,'within-profile');
    assert.deepEqual(before,rig.bones.map(b=>b.matrixWorld.toArray()));
    assert.ok(p.joints.some(j=>j.bone===prefix+'LeftLeg'));assert.ok(p.joints.some(j=>j.bone===prefix+'RightLeg'));
  }
  const incomplete=humanoid('mixamorig');incomplete.bones=incomplete.bones.filter(b=>b.name!=='mixamorigLeftFoot');
  assert.throws(()=>calibrateMixamoPoseRanges(incomplete),/LeftFoot/);
});
