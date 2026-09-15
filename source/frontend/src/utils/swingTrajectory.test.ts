import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parseSwingTrajectories, sampleSwingTrajectory, sampleSwingDescendantRotation, type SwingTrajectory } from './swingTrajectory';

const spec: SwingTrajectory={foot:'right',startFrame:0,endFrame:4,startAnchorFrame:0,endAnchorFrame:8,startGrounded:false,endGrounded:true,lift:.1,descendantRotations:true};
test('swing curves retain endpoints, finite clearance arc and actor-space travel without mutating anchors',()=>{
  const start={sole:new THREE.Vector3(0,.02,0),quaternion:new THREE.Quaternion()},end={sole:new THREE.Vector3(0,0,.4),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1)};
  for(let frame=0;frame<=4;frame++){
    const displacement=new THREE.Vector3(0,0,frame*.03),pose=sampleSwingTrajectory(spec,start,end,frame,displacement);
    assert.ok(Math.abs(pose.quaternion.length()-1)<1e-12);
    if(frame===0)assert.ok(pose.sole.distanceTo(start.sole)<1e-12);
    if(frame===4){assert.ok(pose.sole.add(displacement).distanceTo(end.sole)<1e-12);assert.ok(pose.quaternion.angleTo(end.quaternion)<1e-7);}
    if(frame===2)assert.ok(Math.abs(pose.sole.y-.11)<1e-12);
  }
  assert.deepEqual(start.sole.toArray(),[0,.02,0]);assert.deepEqual(end.sole.toArray(),[0,0,.4]);
  const outward=sampleSwingTrajectory({...spec,lateralOffset:.08,travelPower:3},start,end,2,new THREE.Vector3());
  assert.ok(Math.abs(outward.sole.x-.08)<1e-12);assert.ok(outward.sole.z>.2);
  for(const frame of [-1,5,.5])assert.throws(()=>sampleSwingTrajectory(spec,start,end,frame,new THREE.Vector3()));
});
test('swing profiles reject unbounded, overlapping and malformed controls and preserve omission',()=>{
  assert.equal(parseSwingTrajectories(undefined),undefined);
  assert.deepEqual(parseSwingTrajectories({brake:[spec]}),{brake:[spec]});
  for(const change of [{startFrame:NaN},{endFrame:1},{endAnchorFrame:20000},{lift:-1},{lift:Infinity},{foot:'middle'},{startGrounded:0},{descendantRotations:'true'},{travelPower:NaN},{travelPower:9},{lateralOffset:Infinity},{lateralOffset:11},{extra:true}])assert.throws(()=>parseSwingTrajectories({brake:[{...spec,...change}]}));
  for(const value of [null,[],{brake:Array(2)},{brake:[spec,spec]},{brake:Array(513).fill(spec)}])assert.throws(()=>parseSwingTrajectories(value));
});

test('swing foot identifiers reject coercible values without invoking user conversion', () => {
  for (const foot of [['left'], ['right'], new String('left'), { toString: () => 'right' }]) {
    assert.throws(() => parseSwingTrajectories({ brake: [{ ...spec, foot }] }), /Invalid swing/);
  }
  let converted = false;
  const foot = { toString() { converted = true; return 'left'; } };
  assert.throws(() => parseSwingTrajectories({ brake: [{ ...spec, foot }] }), /Invalid swing/);
  assert.equal(converted, false);
});

test('separate swings support repeated descendant rotations but still reject overlap', () => {
  const next={...spec,startFrame:7,endFrame:11,startAnchorFrame:8,endAnchorFrame:15};
  assert.deepEqual(parseSwingTrajectories({pivot:[next,spec]}),{pivot:[next,spec]});
  assert.throws(()=>parseSwingTrajectories({pivot:[spec,{...next,startFrame:4}]}),/overlap/);
  assert.throws(()=>parseSwingTrajectories({pivot:[spec,{...next,descendantRotations:false}]}),/ownership/);
  const rotation=(angle:number)=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle);
  const intervals=[{spec,start:rotation(0),end:rotation(.4)},{spec:next,start:rotation(.4),end:rotation(1)}];
  for(const [frame,angle] of [[0,0],[2,.2],[4,.4],[5,.4],[7,.4],[9,.7],[11,1],[15,1]]) {
    assert.ok(sampleSwingDescendantRotation(intervals,frame)!.angleTo(rotation(angle))<1e-7);
  }
  assert.equal(sampleSwingDescendantRotation([],0),undefined);
});
