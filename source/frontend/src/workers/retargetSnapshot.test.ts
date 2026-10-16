import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {rememberRetargetRest,snapshotSkeleton,restoreSkeleton,snapshotClip,restoreClip} from './retargetSnapshot';
import {createRetargetPreview} from '../utils/retargetPreview';

test('authored rest survives playback and distinct skin inverse binds without mutating live nodes',()=>{
  const root=new THREE.Group(),helper=new THREE.Group(),hips=new THREE.Bone(),hand=new THREE.Bone();
  root.name='Asset';helper.name='Helper';hips.name='hips';hand.name='hand';
  helper.position.x=3;hand.position.y=2;root.add(helper);helper.add(hips);hips.add(hand);root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton([hips,hand],[new THREE.Matrix4(),new THREE.Matrix4()]);
  rememberRetargetRest(skeleton);const rest=snapshotSkeleton(skeleton);
  helper.position.x=70;hand.position.y=20;root.updateMatrixWorld(true);
  assert.deepEqual(snapshotSkeleton(skeleton),rest);
  assert.equal(helper.position.x,70);assert.equal(hand.position.y,20);
  const privateSkeleton=restoreSkeleton(rest);assert.equal(privateSkeleton.bones[1].position.y,2);
  assert.equal(privateSkeleton.bones[0].getWorldPosition(new THREE.Vector3()).x,3);
  hand.position.y=4;rememberRetargetRest(skeleton);assert.equal(snapshotSkeleton(skeleton).nodes.at(-1)!.position[1],4);
  privateSkeleton.dispose();skeleton.dispose();
});
test('track serialization copies buffers and preserves linear, smooth and discrete interpolation',()=>{
  for(const interpolation of [THREE.InterpolateLinear,THREE.InterpolateSmooth,THREE.InterpolateDiscrete]){
    const clip=new THREE.AnimationClip('motion',1,[new THREE.VectorKeyframeTrack('hips.position',[0,1],[0,1,0,1,1,0],interpolation)]);
    const copied=snapshotClip(clip),restored=restoreClip(copied);
    assert.equal(restored.tracks[0].getInterpolation(),interpolation);
    assert.notEqual(copied.tracks[0].times.buffer,clip.tracks[0].times.buffer);
    assert.deepEqual(Array.from(restored.tracks[0].values),Array.from(clip.tracks[0].values));
  }
});
test('preview uses private bones, mixer and materials; releasing it retains live geometry and texture owners',()=>{
  const root=new THREE.Group(),bone=new THREE.Bone();bone.name='hips';root.add(bone);
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial(),mesh=new THREE.SkinnedMesh(geometry,material);
  mesh.bind(new THREE.Skeleton([bone]));root.add(mesh);rememberRetargetRest(mesh.skeleton);
  let materialDisposed=false,geometryDisposed=false;material.addEventListener('dispose',()=>{materialDisposed=true;});geometry.addEventListener('dispose',()=>{geometryDisposed=true;});
  const clip=new THREE.AnimationClip('preview',1,[new THREE.VectorKeyframeTrack('hips.position',[0,1],[0,0,0,2,0,0])]);
  const preview=createRetargetPreview(root,{id:1,clips:[clip],rest:snapshotSkeleton(mesh.skeleton)});
  preview.mixer.update(.5);assert.equal(bone.position.x,0);assert.equal(root.visible,true);
  assert.notEqual(preview.root.getObjectByName('hips'),bone);preview.dispose();
  assert.equal(materialDisposed,false);assert.equal(geometryDisposed,false);assert.equal(root.children.includes(mesh),true);
  mesh.skeleton.dispose();geometry.dispose();material.dispose();
});

test('snapshot keeps unnamed helper identity and enforces the production bone limit', () => {
  const helper = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'Root'; helper.add(bone); helper.updateMatrixWorld(true);
  const rig = new THREE.Skeleton([bone]); const snapshot = snapshotSkeleton(rig, 'current');
  assert.equal(snapshot.nodes[0].name, ''); assert.equal(snapshot.nodes[0].id, helper.uuid);
  const restored = restoreSkeleton(snapshot); assert.equal(restored.bones[0].parent!.uuid, helper.uuid);
  const bones = Array.from({length: 513}, (_, i) => {const b = new THREE.Bone(); b.name = `Joint_${i}`; return b;});
  const edge = new THREE.Skeleton(bones.slice(0, 512)); assert.equal(snapshotSkeleton(edge, 'current').bones.length, 512);
  const oversized = new THREE.Skeleton(bones); assert.throws(() => snapshotSkeleton(oversized), /512 bones.*513/);
  [rig, restored, edge, oversized].forEach(s => s.dispose());
});
