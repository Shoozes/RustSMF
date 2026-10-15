import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { portableBakeRequest } from './retargetPortable';
import { snapshotSkeleton, snapshotClip, snapshotOptions } from './retargetSnapshot';
import { buildRigMap } from '../utils/rigMapping';
import { samplerFixtures, decodedSamplerFixture } from '../../scripts/retarget-sampler-fixtures';
function input() {
  const bone = new THREE.Bone(); bone.name = 'Root'; bone.updateMatrixWorld(true);
  const rig = new THREE.Skeleton([bone]);
  const clip = new THREE.AnimationClip('Linear', 1, [new THREE.VectorKeyframeTrack('Root.position', [0,1], [0,0,0, 1,2,3])]);
  const result = { source: snapshotSkeleton(rig,'current'), target: snapshotSkeleton(rig,'current'), mapping: buildRigMap(rig,rig,{manualMap:{Root:'Root'}}),
    clips: [{clip:snapshotClip(clip), options:snapshotOptions({sourceReferenceClip:clip, targetReferenceClip:clip, endpointTargetClips:[clip]})}] };
  rig.dispose(); return result;
}
test('portable adapter owns JSON arrays, helper rest data, mappings and every reference buffer', () => {
  const original=input(), before=structuredClone(original), request=portableBakeRequest(original,[0,.5,1]);
  assert.deepEqual(original,before);assert.deepEqual(JSON.parse(JSON.stringify(request)),request);assert.deepEqual(request.clips[0].options,{});
  request.clips[0].clip.tracks[0].values[0]=99;request.clips[0].sourceReferenceClip!.tracks[0].values[0]=98;
  request.clips[0].targetReferenceClip!.tracks[0].values[0]=97;request.clips[0].endpointTargetClips[0].tracks[0].values[0]=96;
  request.source.nodes[0].position[0]=95;request.mapping.Root='Other';assert.deepEqual(original,before);
});
test('portable adapter refuses ambiguous bindings, unsupported types, nonfinite and oversized payloads',()=>{
  const original=input();assert.throws(()=>portableBakeRequest(original,[NaN]),/Invalid portable/);
  assert.throws(()=>portableBakeRequest(original,Array(20_001).fill(0)),/Invalid portable/);
  original.clips[0].clip.tracks[0].name='Missing.position';assert.throws(()=>portableBakeRequest(original,[0]),/Unsupported portable transform/);
  original.clips[0].clip.tracks[0].name='Root.position';original.clips[0].clip.tracks[0].values=new Float32Array([NaN]);
  assert.throws(()=>portableBakeRequest(original,[0]),/finite numbers/);original.source.nodes.push(original.source.nodes[0]);
  assert.throws(()=>portableBakeRequest(original,[0]),/uniquely named/);
});
test('sampler fixtures establish independent Hermite, smooth and transformed-helper anchors',()=>{
  const fixtures=samplerFixtures();assert.equal(fixtures.positives.length,13);assert.ok(fixtures.negatives.length>=19);
  assert.ok(fixtures.positives.every(c=>c.expected.status==='sampled'));
});

test('portable decoded glTF retains known cubic position and scale values',async()=>{await decodedSamplerFixture();});
