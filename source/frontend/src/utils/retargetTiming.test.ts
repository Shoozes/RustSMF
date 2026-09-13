import test from 'node:test';
import assert from 'node:assert/strict';
import {retargetSourceTime,validateRetargetVisualTiming} from './retargetTiming';

test('explicit visual cadence repeats on the output grid and retains the terminal source sample', () => {
  const timing={durationFrames:40,cycles:2},sourceDuration=26/60;
  assert.equal(retargetSourceTime(0,sourceDuration,timing),0);
  assert.ok(Math.abs(retargetSourceTime(10/60,sourceDuration,timing)-13/60)<1e-10);
  assert.equal(retargetSourceTime(20/60,sourceDuration,timing),0);
  assert.equal(retargetSourceTime(40/60,sourceDuration,timing),sourceDuration);
  assert.throws(()=>validateRetargetVisualTiming({durationFrames:41,cycles:2}),/dividing/);
  assert.throws(()=>validateRetargetVisualTiming({durationFrames:40,cycles:0}),/cycles/);
  assert.throws(()=>retargetSourceTime(NaN,1,timing),/Invalid/);
});


test('landmarks align release frames, permit authored holds and preserve endpoints',()=>{
 const timing={durationFrames:46,cycles:1,landmarks:[{outputFrame:0,sourcePhase:0},{outputFrame:16,sourcePhase:13/48},{outputFrame:20,sourcePhase:13/48},{outputFrame:46,sourcePhase:1}]};
 assert.equal(retargetSourceTime(16/60,48/60,timing),13/60);
 assert.equal(retargetSourceTime(18/60,48/60,timing),13/60);
 assert.equal(retargetSourceTime(0,48/60,timing),0);
 assert.equal(retargetSourceTime(46/60,48/60,timing),48/60);
 assert.ok(retargetSourceTime(30/60,48/60,timing)>13/60);
 for(const invalid of [{...timing,cycles:2},{...timing,landmarks:timing.landmarks.slice(1)},
  {...timing,landmarks:[{outputFrame:0,sourcePhase:0},{outputFrame:16,sourcePhase:0.8},{outputFrame:20,sourcePhase:0.7},{outputFrame:46,sourcePhase:1}]},
  {...timing,landmarks:[{outputFrame:0,sourcePhase:0},{outputFrame:46,sourcePhase:0.9}]}]) assert.throws(()=>validateRetargetVisualTiming(invalid),/landmarks/);
});
