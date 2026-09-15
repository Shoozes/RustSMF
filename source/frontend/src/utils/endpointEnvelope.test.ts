import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeEndpointEnvelope, finishEndpointEnvelope, parseEndpointEnvelopes, captureContactPointOffsets, type EndpointEnvelope } from './endpointEnvelope';
import { retargetAnimationClip } from './animationRetarget';
import { buildRigMap } from './rigMapping';
import { parseRetargetProfile, profileClipOptions, RETARGET_PROFILE_SCHEMA } from './retargetProfile';

const config: EndpointEnvelope = { entry:{targetClip:'walk',targetFrame:2,spanFrames:3,rootOffset:[0,0,-.04]},exit:{targetClip:'idle',targetFrame:4,spanFrames:3,rootOffset:[0,0,0]} };
function fixture(sign=1){
  const root=new THREE.Bone(),hand=new THREE.Bone(),head=new THREE.Bone();root.name='root';hand.name='hand';head.name='head';root.add(hand,head);hand.position.set(sign,1,0);head.position.y=2;
  root.updateWorldMatrix(true,true);
  const skeleton=new THREE.Skeleton([root,hand,head]),times=Array.from({length:16},(_,i)=>i/60);
  const make=(name:string,angle:number)=>new THREE.AnimationClip(name,15/60,[
    ...[root,hand,head].map(b=>new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`,times,times.flatMap(()=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign*angle).toArray()),THREE.InterpolateDiscrete)),
    new THREE.VectorKeyframeTrack('root.position',times,times.flatMap(()=>[0,0,0]),THREE.InterpolateDiscrete),
  ]);
  return {root,skeleton,base:make('brake',.6),targets:[make('walk',.2),make('idle',-.1)]};
}

test('fixed articulated contact point samples descendant motion without changing the skeleton',()=>{
  const f=fixture(),before=f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  const clip=new THREE.AnimationClip('toe',Math.fround(1/60),[new THREE.QuaternionKeyframeTrack('hand.quaternion',[0,1/60],[0,0,0,1,...q.toArray()],THREE.InterpolateDiscrete)]);
  const points=captureContactPointOffsets(clip,f.skeleton,2,'root','hand',[0,1,0]);
  assert.ok(new THREE.Vector3(...points[0]).distanceTo(new THREE.Vector3(1,2,0))<1e-6);
  assert.ok(new THREE.Vector3(...points[1]).distanceTo(new THREE.Vector3(0,1,0))<1e-6);
  assert.deepEqual(f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),before);
  assert.throws(()=>captureContactPointOffsets(clip,f.skeleton,2,'root','missing',[0,0,0]),/missing/);
  assert.throws(()=>captureContactPointOffsets(clip,f.skeleton,100000,'root','hand',[0,0,0]),/allocation/);
});

test('offline endpoint envelope preserves exact endpoints, mirrored fixed lengths, core and complete continuous TRS',()=>{
  for(const sign of [-1,1]){
    const f=fixture(sign),before=f.skeleton.bones.map(b=>b.matrix.toArray());
    const result=bakeEndpointEnvelope(f.base,f.skeleton,f.targets,config);
    const finished=finishEndpointEnvelope(result.clip,f.skeleton,result);
    assert.equal(finished.report.status,'matched');assert.equal(result.clip.tracks.length,9);
    const root=result.clip.tracks.find(t=>t.name==='root.position')!;
    assert.ok(Math.abs(root.values[2]+.04)<1e-8);assert.equal(root.values[root.values.length-1],0);
    for(const t of result.clip.tracks){
      assert.equal(t.getInterpolation(),THREE.InterpolateDiscrete);
      if(t.name.endsWith('.quaternion')){
        const original=f.base.tracks.find(x=>x.name===t.name)!;
        assert.deepEqual(Array.from(t.values.slice(4*3,4*13)),Array.from(original.values.slice(4*3,4*13)));
        for(let i=1;i<16;i++)assert.ok(new THREE.Quaternion().fromArray(t.values,(i-1)*4).dot(new THREE.Quaternion().fromArray(t.values,i*4))>0);
      }
      if(t.name==='hand.position') for(let i=0;i<16;i++)assert.deepEqual(Array.from(t.values.slice(i*3,i*3+3)),[sign,1,0]);
    }
    assert.deepEqual(f.skeleton.bones.map(b=>b.matrix.toArray()),before);
    const changed=result.clip.clone();changed.tracks.find(t=>t.name==='root.position')!.values[0]+=.1;
    assert.equal(finishEndpointEnvelope(changed,f.skeleton,result).report.status,'constraint-conflict');
  }
});

test('endpoint validation rejects missing clips, frames, overlaps, scales and child translation',()=>{
  const f=fixture();
  for(const change of [{entry:{...config.entry,targetClip:'missing'}},{exit:{...config.exit,targetFrame:16}},{entry:{...config.entry,spanFrames:14}}])assert.throws(()=>bakeEndpointEnvelope(f.base,f.skeleton,f.targets,{...config,...change}));
  for(const property of ['position','scale']){
    const bad=f.targets[0].clone();bad.tracks.push(new THREE.VectorKeyframeTrack(`hand.${property}`,[0,15/60],[1,2,3,1,2,3]));
    assert.throws(()=>bakeEndpointEnvelope(f.base,f.skeleton,[bad,f.targets[1]],config),/offsets|scales/);
  }
  f.root.scale.set(1,2,1);
  assert.throws(()=>bakeEndpointEnvelope(f.base,f.skeleton,f.targets,config),/uniform/);
  for(const value of [null,[],{brake:{}},{brake:{...config,extra:1}},
    {brake:{...config,entry:{...config.entry,spanFrames:1}}},{brake:{...config,entry:{...config.entry,targetFrame:.5}}},
    {brake:{...config,entry:{...config.entry,rootOffset:[0,NaN,0]}}}])assert.throws(()=>parseEndpointEnvelopes(value));
  assert.equal(parseEndpointEnvelopes(undefined),undefined);
});

test('saved endpoint profile reaches actual retarget orchestration without mutating baseline or source',()=>{
  const source=fixture(),target=fixture(),before=target.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]);
  const profile=parseRetargetProfile(JSON.stringify({$schema:RETARGET_PROFILE_SCHEMA,retarget:{clips:['brake'],manualMap:{root:'root',hand:'hand',head:'head'},
    sourceReferencePose:'rest',sampleRateHz:60,interpolation:'step',alignMappedBoneDirections:false,clipEndpointEnvelopes:{brake:{...config,entry:{...config.entry,rootYawDegrees:180}}}}}));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)),profile);
  const options=profileClipOptions(profile,source.base,[source.base],target.targets);
  const mapping=buildRigMap(source.skeleton,target.skeleton,{manualMap:profile.retarget.manualMap});
  const result=retargetAnimationClip(source.base,source.skeleton,target.skeleton,mapping,options);
  assert.equal(result.report.endpointEnvelope!.status,'matched');assert.equal(result.clip.tracks.length,9);
  assert.deepEqual(target.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),before);
  assert.deepEqual(source.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),before);
});

test('endpoint envelopes reject aligned but nonuniform grids before resampling', () => {
  const f = fixture();
  for (const track of f.base.tracks) track.times[7] = 7.5 / 60;
  const before = f.base.tracks.map(track => Array.from(track.times));
  assert.throws(() => bakeEndpointEnvelope(f.base, f.skeleton, f.targets, config), /60 Hz sample grid/);
  assert.deepEqual(f.base.tracks.map(track => Array.from(track.times)), before);
});

test('endpoint envelopes retain valid next-down float32 output timing', () => {
  const f = fixture();
  for (const track of f.base.tracks) {
    for (let frame = 0; frame < track.times.length; frame++) {
      const value = new Float32Array([frame / 60]);
      if (value[0] > frame / 60) new Uint32Array(value.buffer)[0]--;
      track.times[frame] = value[0];
    }
  }
  const result = bakeEndpointEnvelope(f.base, f.skeleton, f.targets, config);
  for (const track of result.clip.tracks) assert.deepEqual(track.times, f.base.tracks[0].times);
  assert.equal(finishEndpointEnvelope(result.clip, f.skeleton, result).report.status, 'matched');
});

test('endpoint yaw preserves a reversed world entry through transformed parents and saved profiles', () => {
  for (const degrees of [-180, 180]) {
    const f = fixture(), parent = new THREE.Group();
    parent.position.set(2, 1, -3); parent.rotation.z = .3; parent.scale.setScalar(2); parent.add(f.root);
    parent.updateMatrixWorld(true);
    const plain = bakeEndpointEnvelope(f.base, f.skeleton, f.targets, config);
    const turned = {...config, entry: {...config.entry, rootYawDegrees: degrees}};
    const parsed = parseRetargetProfile(JSON.stringify({$schema: RETARGET_PROFILE_SCHEMA,
      retarget: {clips: ['brake'], sampleRateHz: 60, interpolation: 'step', clipEndpointEnvelopes: {brake: turned}}}));
    const result = bakeEndpointEnvelope(f.base, f.skeleton, f.targets, parsed.retarget.clipEndpointEnvelopes!.brake);
    const matrices = (pose: typeof result.entry) => {
      const all = new Map<string, THREE.Matrix4>();
      for (const bone of f.skeleton.bones) {
        const p = pose.get(bone.name)!;
        const ancestor = bone.parent instanceof THREE.Bone ? all.get(bone.parent.name)! : parent.matrixWorld;
        all.set(bone.name, ancestor.clone().multiply(new THREE.Matrix4().compose(p.position,p.quaternion,p.scale)));
      }
      return all;
    };
    const before = matrices(plain.entry), after = matrices(result.entry), offset = new THREE.Vector3(...config.entry.rootOffset);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),degrees*Math.PI/180);
    for (const bone of f.skeleton.bones) {
      const expected = new THREE.Vector3().setFromMatrixPosition(before.get(bone.name)!).sub(offset).applyQuaternion(yaw).add(offset);
      assert.ok(expected.distanceTo(new THREE.Vector3().setFromMatrixPosition(after.get(bone.name)!)) < 1e-6);
      const originalRotation = new THREE.Quaternion().setFromRotationMatrix(before.get(bone.name)!.clone().scale(new THREE.Vector3(.5,.5,.5)));
      const actualRotation = new THREE.Quaternion().setFromRotationMatrix(after.get(bone.name)!.clone().scale(new THREE.Vector3(.5,.5,.5)));
      assert.ok(yaw.clone().multiply(originalRotation).angleTo(actualRotation) < 1e-6);
      if (bone.parent instanceof THREE.Bone) assert.deepEqual(result.entry.get(bone.name)!.position.toArray(), bone.position.toArray());
    }
    assert.equal(finishEndpointEnvelope(result.clip, f.skeleton, result).report.status, 'matched');
    assert.deepEqual(result.exit, plain.exit);
    assert.deepEqual(parseRetargetProfile(JSON.stringify(parsed)), parsed);
  }
});

test('endpoint yaw rejects coercion, nonfinite and out-of-range values and preserves omission', () => {
  for (const rootYawDegrees of ['180', null, [], {}, NaN, Infinity, -181, 181]) {
    assert.throws(() => parseEndpointEnvelopes({brake: {...config, entry: {...config.entry, rootYawDegrees}}}));
  }
  assert.deepEqual(parseEndpointEnvelopes({brake: config})!.brake, config);
});

test('intermediate pose path preserves exact keys, endpoints and fixed offsets', () => {
  const f = fixture();
  const middle = {frame:7,targetClip:'walk',targetFrame:4,rootOffset:[.1,0,.2] as [number,number,number],rootYawDegrees:90};
  const spec = {...config, intermediatePoses:[middle]};
  const profile = parseRetargetProfile(JSON.stringify({$schema:RETARGET_PROFILE_SCHEMA,retarget:{clips:['brake'],
    sampleRateHz:60,interpolation:'step',clipEndpointEnvelopes:{brake:spec}}}));
  const result = retargetAnimationClip(f.base,f.skeleton,f.skeleton,buildRigMap(f.skeleton,f.skeleton),
    profileClipOptions(profile,f.base,[f.base],f.targets));
  assert.equal(result.report.endpointEnvelope!.status,'matched');
  const {frame: _frame, ...reference} = middle;
  const expected = bakeEndpointEnvelope(f.base,f.skeleton,f.targets,{...config,entry:{...reference,spanFrames:3}}).entry;
  for (const track of result.clip.tracks) {
    const property = track.name.split('.')[1] as 'position'|'quaternion'|'scale';
    const wanted = expected.get(track.name.split('.')[0])![property].toArray();
    for (let i=0;i<wanted.length;i++) assert.ok(Math.abs(track.values[7*wanted.length+i]-wanted[i])<1e-6, `${track.name}[${i}]: ${track.values[7*wanted.length+i]} != ${wanted[i]}`);
  }
  for (const intermediatePoses of [[],[null],[{...middle,frame:0}],[middle,middle],[{...middle,spanFrames:2}],
    [{...middle,frame:2}],[{...middle,frame:14}],[{...middle,rootYawDegrees:'90'}]]) {
    assert.throws(()=>bakeEndpointEnvelope(f.base,f.skeleton,f.targets,{...config,intermediatePoses} as EndpointEnvelope));
  }
  assert.throws(()=>bakeEndpointEnvelope(f.base,f.skeleton,f.targets,spec,.1),/root height/);
});
