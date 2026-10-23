import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSkeletalExportJobDocument, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';
import { CONDITIONING_MODE, CONDITIONING_NLERP_MODE } from './skeletalConditioning';
import { bakePlantedIdle, parsePlantedIdle, type PlantedIdleRecipe, type ContactBatchSolver } from './skeletalPlantedIdle';
import { solveNativePoseContacts } from '../../scripts/pose-contact-native';
import { disposeThreeObject } from './threeDisposal';
import { exportGLB, loadGLB, type LoadedModel } from '../loaders/glb';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { bytesToArrayBuffer } from '../loaders/smfBinary';

function fixture() {
  const group=new THREE.Group(),root=new THREE.Bone(),pelvis=new THREE.Bone(),chest=new THREE.Bone();
  const pelvisY=1+Math.cos(.15);
  root.name='Root';pelvis.name='Pelvis';chest.name='Chest';pelvis.position.y=pelvisY;root.add(pelvis);pelvis.add(chest);group.add(root);
  const bones=[root,pelvis,chest],legs:PlantedIdleRecipe['legs']=[];
  for(const side of ['Left','Right']) {
    const chain=['Hip','Knee','Foot','Toe'].map(part=>{const b=new THREE.Bone();b.name=side+part;bones.push(b);return b;});
    pelvis.add(chain[0]);chain[0].add(chain[1]);chain[1].add(chain[2]);chain[2].add(chain[3]);
    chain[0].position.x=side==='Left'?.3:-.3;chain[0].quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
    chain[1].position.y=1;chain[2].position.y=1;chain[3].position.z=.2;
    chain[1].quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),.15);
    chain[2].quaternion.copy(chain[0].quaternion).multiply(chain[1].quaternion).invert();
    legs.push({hip:chain[0].name,knee:chain[1].name,ankle:chain[2].name,toe:chain[3].name,vertices:side==='Left'?[0,1,2]:[3,4,5]});
  }
  group.updateMatrixWorld(true);
  const positions:number[]=[],joints:number[]=[],weights:number[]=[];
  for(const leg of legs){const foot=bones.findIndex(b=>b.name===leg.ankle),p=new THREE.Vector3().setFromMatrixPosition(bones[foot].matrixWorld);for(const x of [-.02,0,.02]){positions.push(p.x+x,p.y,p.z);joints.push(foot,0,0,0);weights.push(1,0,0,0);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(positions.map((_,i)=>i%3===1?1:0),3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const skeleton=new THREE.Skeleton(bones),mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());group.add(mesh);mesh.bind(skeleton);
  const times=Array.from({length:7},(_,i)=>i/60);
  const upper=new THREE.QuaternionKeyframeTrack('Chest.quaternion',times,times.flatMap((_,i)=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.sin(i*Math.PI/3)*.1).toArray()));
  const clip=new THREE.AnimationClip('idle',Math.fround(.1),[new THREE.VectorKeyframeTrack('Pelvis.position',times,times.flatMap((_,i)=>[i===0||i===6?0:.1*Math.sin(i*Math.PI/6),pelvisY,0])),upper]);
  const model:LoadedModel={root:group,skeleton,skinnedMeshes:[mesh],clips:[clip],mixer:new THREE.AnimationMixer(group)};
  const spec:PlantedIdleRecipe={clipId:'idle',pelvisJoint:'Pelvis',calibration:{clipId:'idle',phaseTicks:0},legs,floorY:0,maxPelvisCorrectionMeters:.1,maxRotationDegrees:90};
  return {model,root,clip,spec,upper};
}
const ownedCopies=async()=> (await readdir(os.tmpdir())).filter(n=>n.startsWith('rustsmf-contact-')).sort();

test('native planted bake retains animated upper body and endpoints, survives GLB reload and releases its copy',async()=>{
  installNodeThreeRuntime();const {model,root,clip,spec,upper}=fixture(),before=await ownedCopies();let derived:LoadedModel|undefined;
  const original=Array.from(clip.tracks[0].values),binds=model.skeleton!.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
  try {
    const result=await bakePlantedIdle(model,clip,clip,root,spec,2,solveNativePoseContacts);
    assert.ok(result.report.before.maxDrift>.09);assert.ok(result.report.after.maxDrift<.002);
    assert.equal(result.clip.tracks.find(t=>t.name===upper.name),upper);
    const track=result.clip.tracks.find(t=>t.name==='Pelvis.position')!;
    assert.deepEqual(Array.from(track.values.slice(0,3)),original.slice(0,3));assert.deepEqual(Array.from(track.values.slice(-3)),original.slice(-3));
    assert.deepEqual(Array.from(clip.tracks[0].values),original);
    assert.deepEqual(model.skeleton!.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),binds);
    derived=await loadGLB(bytesToArrayBuffer(await exportGLB(model.root,[result.clip])));
    const mixer=new THREE.AnimationMixer(derived.root),action=mixer.clipAction(derived.clips[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
    let anchors:THREE.Vector3[]=[];
    try { for(let step=0;step<=24;step++) {
      action.reset().play();mixer.setTime(step/240);derived.root.updateMatrixWorld(true);
      const points=derived.skinnedMeshes.flatMap(mesh=>Array.from({length:mesh.geometry.getAttribute('position').count},(_,i)=>mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),i)).applyMatrix4(mesh.matrixWorld)));
      if(step===0)anchors=points;else assert.ok(points.every((p,i)=>p.distanceTo(anchors[i])<.002));
    }}finally{action.stop();mixer.uncacheRoot(derived.root);}
    assert.deepEqual(await ownedCopies(),before);
  }finally{disposeThreeObject(model.root);if(derived)disposeThreeObject(derived.root);}
});

test('planted bake refuses malformed, excessive and cancelled solves with bind restoration',async()=>{
  const {model,root,clip,spec}=fixture(),before=model.skeleton!.bones.map(b=>b.position.toArray());
  try {
    const bad:ContactBatchSolver=async()=>({schema:'rustsmf.pose-contact-batch-result.v1',frames:[],runtime:{solverSourceSha256:'',executableSha256:''}});
    await assert.rejects(bakePlantedIdle(model,clip,clip,root,spec,2,bad),/frame count/);
    const abort=new AbortController();const cancel:ContactBatchSolver=async input=>{abort.abort(new Error('cancel planted'));return solveNativePoseContacts(input,abort.signal);};
    await assert.rejects(bakePlantedIdle(model,clip,clip,root,spec,2,cancel,abort.signal),/cancel planted/);
    await assert.rejects(bakePlantedIdle(model,clip,clip,root,{...spec,maxRotationDegrees:.001},2,solveNativePoseContacts),/rotation correction/);
    assert.deepEqual(model.skeleton!.bones.map(b=>b.position.toArray()),before);
  }finally{disposeThreeObject(model.root);}
});

test('native bridge failure and active cancellation release their owned executable',async()=>{
  const {model,root,clip,spec}=fixture(),before=await ownedCopies();
  try {
    const refuse:ContactBatchSolver=(input,signal)=>solveNativePoseContacts({...input,parents:[]},signal);
    await assert.rejects(bakePlantedIdle(model,clip,clip,root,spec,2,refuse),/pose bounds/);
    const abort=new AbortController();const cancel:ContactBatchSolver=(input)=>{const result=solveNativePoseContacts(input,abort.signal);setTimeout(()=>abort.abort(),0);return result;};
    await assert.rejects(bakePlantedIdle(model,clip,clip,root,spec,2,cancel,abort.signal));
    assert.deepEqual(await ownedCopies(),before);
  }finally{disposeThreeObject(model.root);}
});

test('planted recipe validates selection, source indices, topology names and correction limits',()=>{
  const {model,spec}=fixture();try {
    assert.deepEqual(parsePlantedIdle(spec,['idle'],['idle']),spec);
    for(const invalid of [null,{}, {...spec,extra:true},{...spec,clipId:'gait'},{...spec,calibration:{clipId:'missing',phaseTicks:0}},
      {...spec,maxRotationDegrees:0},{...spec,maxRotationDegrees:181},{...spec,maxPelvisCorrectionMeters:NaN},{...spec,legs:[spec.legs[0],spec.legs[0]]},
      {...spec,legs:[{...spec.legs[0],vertices:[0,0,1]},spec.legs[1]]}]) assert.throws(()=>parsePlantedIdle(invalid,['idle'],['idle']),/plantedIdle/);
  }finally{disposeThreeObject(model.root);}
});

test('v3 binds planted authoring only to a selected NLERP idle with explicit source calibration',()=>{
  const {model,spec}=fixture(),directory=path.join(os.tmpdir(),'planted-idle-job');
  try {
    const document={$schema:SKELETAL_EXPORT_JOB_V3_SCHEMA,input:{skinnedModel:path.join(directory,'source.glb')},
      export:{rootJoint:'LocomotionRoot',units:'meters',upAxis:'+Y',forwardAxis:'+Z',handedness:'right',ticksPerSecond:60,rootMotion:'separate-track',clipIds:['idle']},
      conditioning:{mode:CONDITIONING_NLERP_MODE as string,sourceRootJoint:'Base',locomotionRootJoint:'LocomotionRoot',clipIds:['idle','gait'],transitions:[{idle:'idle',gait:'gait',phases:[.25],durationTicks:6}],plantedIdle:spec},
      output:{generationRoot:path.join(directory,'generations'),conditioningRoot:path.join(directory,'conditioned')}};
    const parsed=parseSkeletalExportJobDocument(document);assert.equal(parsed.$schema,SKELETAL_EXPORT_JOB_V3_SCHEMA);
    if(parsed.$schema===SKELETAL_EXPORT_JOB_V3_SCHEMA)assert.deepEqual(parsed.conditioning.plantedIdle,spec);
    assert.throws(()=>parseSkeletalExportJobDocument({...document,conditioning:{...document.conditioning,mode:CONDITIONING_MODE}}),/NLERP/);
    assert.throws(()=>parseSkeletalExportJobDocument({...document,conditioning:{...document.conditioning,plantedIdle:{...spec,clipId:'gait'}}}),/plantedIdle/);
  }finally{disposeThreeObject(model.root);}
});
