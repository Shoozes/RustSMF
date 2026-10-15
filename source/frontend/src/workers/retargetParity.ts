import assert from 'node:assert/strict';
import type * as THREE from 'three';
import { retargetAnimationClip, type AnimationRetargetOptions } from '../utils/animationRetarget';
import type { RigMapResult } from '../utils/rigMapping';
import { bakeRetarget } from './retargetBakeRuntime';
import { snapshotSkeleton, snapshotClip, snapshotOptions } from './retargetSnapshot';

function compare(actual:unknown,expected:unknown,path='$'):void {
  if(typeof actual==='number' && typeof expected==='number'){
    assert.ok(Math.abs(actual-expected)<=1e-6*Math.max(1,Math.abs(actual),Math.abs(expected)),`${path}: ${actual} vs ${expected}`);return;
  }
  if(Array.isArray(expected) || ArrayBuffer.isView(expected)){
    const values=Array.from(expected as ArrayLike<unknown>),received=Array.from(actual as ArrayLike<unknown>);
    assert.equal(received.length,values.length,`${path} length`);values.forEach((value,index)=>compare(received[index],value,`${path}[${index}]`));return;
  }
  if(expected && typeof expected==='object'){
    assert.ok(actual && typeof actual==='object',path);
    assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path);
    for(const key of Object.keys(expected))compare((actual as Record<string,unknown>)[key],(expected as Record<string,unknown>)[key],`${path}.${key}`);return;
  }
  assert.deepEqual(actual,expected,path);
}

/** Run existing advanced solver fixtures through the actual worker runtime too. */
export function retargetWithWorkerProof(clip:THREE.AnimationClip,source:THREE.Skeleton,target:THREE.Skeleton,mapping:RigMapResult,options:AnimationRetargetOptions={}) {
  const input={source:snapshotSkeleton(source,'current'),target:snapshotSkeleton(target,'current'),mapping,
    clips:[{clip:snapshotClip(clip),options:snapshotOptions(options)}]};
  const expected=retargetAnimationClip(clip,source,target,mapping,options);
  const before=clip.tracks.map(track=>track.times.buffer.byteLength+track.values.length);
  const copied=structuredClone(input),output=bakeRetarget(copied,()=>{});
  compare(output.clips[0],snapshotClip(expected.clip));compare(output.reports[0],expected.report);
  assert.deepEqual(clip.tracks.map(track=>track.times.buffer.byteLength+track.values.length),before,'canonical buffers retained');
  return expected;
}
