import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  alignNaturalAnatomicalFrame,
  calibratedNaturalBend,
  contactBlendWeight,
  lengthNormalizedWeights,
  limitNaturalLegDirection,
  naturalSolePoint,
  naturalFootHeading,
  naturalContactOrientation,
  parseContactPoint,
  parseContactPatch,
  lowestContactPoint,
  naturalContactRamp,
  parseRootTravelSamples,
  sampledRootDisplacement,
  resolveNaturalContactPose,
  solveNaturalTwoBoneLeg,
  solveNaturalPelvisCorrection,
  type NaturalFootContact,
} from './naturalRetarget';

test('toe contacts retain full pitch and use bounded independent local points', () => {
  const point: [number,number,number]=[.02,-.1,.15];
  assert.deepEqual(parseContactPoint(point),point);
  assert.notEqual(parseContactPoint(point),point);
  for(const invalid of [null,[0,0],['0',0,0],[0,NaN,0],[0,10001,0],Array(3)])assert.throws(()=>parseContactPoint(invalid),/contactPoint/);
  const animated=new THREE.Quaternion().setFromEuler(new THREE.Euler(.7,.2,-.1)),reference=new THREE.Quaternion();
  assert.deepEqual(naturalContactOrientation('animated',animated,reference).toArray(),animated.toArray());
  assert.notEqual(naturalContactOrientation('animated',animated,reference),animated);
  assert.deepEqual(naturalContactOrientation(undefined,animated,reference).toArray(),reference.toArray());
  assert.deepEqual(naturalContactOrientation('animated-heading',animated,reference).toArray(),naturalFootHeading(animated,reference).toArray());
  const result=resolveNaturalContactPose({naturalAnkle:new THREE.Vector3(0,1,0),naturalFootQuaternion:animated,referenceFootQuaternion:animated,soleOffset:point,pinnedSole:new THREE.Vector3(.2,0,.3),rootTravelPerFrame:[0,0,0],elapsedFrames:0,weight:1});
  assert.ok(naturalSolePoint(result.ankle,result.footQuaternion,point).distanceTo(new THREE.Vector3(.2,0,.3))<1e-12);
  assert.ok(result.footQuaternion.angleTo(animated)<1e-7);
});

test('a fixed sole patch switches support under articulation without refitting points',()=>{
  const points:[number,number,number][]=[[0,0,-1],[0,0,1]],before=structuredClone(points);
  const forward=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.5),backward=forward.clone().invert();
  assert.equal(lowestContactPoint(points,forward),points[1]);
  assert.equal(lowestContactPoint(points,backward),points[0]);
  assert.deepEqual(points,before);
  assert.deepEqual(parseContactPatch(points.map(point=>({point}))),points.map(point=>({point})));
  for(const value of [[],[{point:[0,0,0]}],Array(17).fill({point:[0,0,0]}),[{point:[0,0,0]},{point:[0,NaN,0]}],[{point:[0,0,0]},{point:[0,0,0],ignored:true}]])assert.throws(()=>parseContactPatch(value),/contactPatch|contactPoint/);
});

test('sampled nonlinear root travel keeps planted soles fixed in receiving space', () => {
  const samples = parseRootTravelSamples({ brake: [[0,0,0],[0,0,.03],[0,0,.05],[0,0,.06]] })!.brake;
  for (const start of [0, 1]) for (let frame = start; frame < samples.length; frame++) {
    const pin = new THREE.Vector3(1,0,2), displacement = sampledRootDisplacement(samples, frame, start);
    const result = resolveNaturalContactPose({ naturalAnkle: new THREE.Vector3(2,1,3), naturalFootQuaternion: new THREE.Quaternion(),
      referenceFootQuaternion: new THREE.Quaternion(), soleOffset: [0,-.1,0], pinnedSole: pin,
      rootTravelPerFrame: [0,0,0], elapsedFrames: frame-start, rootDisplacement: displacement, weight: 1 });
    assert.ok(result.targetSole.clone().add(displacement).distanceTo(pin) < 1e-12);
  }
  assert.throws(() => sampledRootDisplacement(samples, 4, 0), /outside/);
  assert.deepEqual(sampledRootDisplacement(samples, 0, 1).toArray(), [0,0,-.03]);
  assert.throws(() => sampledRootDisplacement(samples, .5, 0), /outside/);
});

test('future contact anchors remain fixed with signed nonlinear travel and reject invalid intervals', () => {
  const contact: NaturalFootContact = { foot: 'right', startFrame: 1, endFrame: 3, blendFrames: 0, anchorFrame: 3 };
  assert.equal(naturalContactRamp(contact).fullWeightStartFrame, 1);
  for (const anchorFrame of [0, 4, 1.5, NaN, Infinity]) {
    assert.throws(() => naturalContactRamp({ ...contact, anchorFrame }), /anchorFrame/);
  }
  assert.throws(() => naturalContactRamp({ ...contact, positionMode: 'plane' }), /anchorFrame/);
  assert.throws(() => naturalContactRamp({ ...contact, wrapToStart: true }), /anchorFrame/);
  const samples: [number, number, number][] = [[0,0,0], [0,0,.03], [0,0,.05], [0,0,.06]];
  const pin = new THREE.Vector3(1,0,2);
  for (let frame = 1; frame <= 3; frame++) {
    const displacement = sampledRootDisplacement(samples, frame, 3);
    const pose = resolveNaturalContactPose({ naturalAnkle: new THREE.Vector3(2,1,3), naturalFootQuaternion: new THREE.Quaternion(),
      referenceFootQuaternion: new THREE.Quaternion(), soleOffset: [0,-.1,0], pinnedSole: pin,
      rootTravelPerFrame: [0,0,0], elapsedFrames: frame-3, rootDisplacement: displacement, weight: 1 });
    assert.ok(pose.targetSole.clone().add(new THREE.Vector3(...samples[frame]))
      .distanceTo(pin.clone().add(new THREE.Vector3(...samples[3]))) < 1e-12);
  }
});

test('sampled root travel rejects malformed, nonfinite, oversized and nonzero-origin input', () => {
  assert.equal(parseRootTravelSamples(undefined), undefined);
  for (const value of [null, [], { '': [[0,0,0],[0,0,1]] }, { brake: [] }, { brake: [[0,0,0]] },
    { brake: [[0,0,1],[0,0,2]] }, { brake: [[0,0,0],[0,0,Infinity]] }, { brake: [[0,0,0],[0,0,NaN]] },
    { brake: [[0,0,0],[0,0,10001]] }, { brake: [[0,0,0],[0,0,'1']] }, { brake: [[0,0,0],[0,0]] },
    { brake: Array(20001).fill([0,0,0]) }, { brake: Array(2) }, { brake: [[0,0,0],Array(3)] }]) assert.throws(() => parseRootTravelSamples(value));
});

test('calibrated bend preserves reference and maps articulation without extension plateaus', () => {
  const sourceReference = THREE.MathUtils.degToRad(50), targetReference = THREE.MathUtils.degToRad(23);
  assert.equal(calibratedNaturalBend(sourceReference, sourceReference, targetReference), targetReference);
  assert.equal(calibratedNaturalBend(0, sourceReference, targetReference), 0);
  assert.equal(calibratedNaturalBend(Math.PI, sourceReference, targetReference), Math.PI);
  const bends = [2, 10, 23, 50, 90, 135, 179].map(degrees => calibratedNaturalBend(THREE.MathUtils.degToRad(degrees), sourceReference, targetReference));
  assert.ok(bends.every((v, i) => v > 0 && (!i || v > bends[i - 1])));
  assert.ok(Math.abs(THREE.MathUtils.radToDeg(bends[2]) - 10.58) < 1e-8);
  assert.throws(() => calibratedNaturalBend(1, 0, 1), /nondegenerate/);
  assert.throws(() => calibratedNaturalBend(NaN, 1, 1), /finite/);
});

test('natural torso weights use target lengths and optional multipliers', () => {
  assert.deepEqual(lengthNormalizedWeights([1, 2, 1]), [0.25, 0.5, 0.25]);
  assert.deepEqual(lengthNormalizedWeights([1, 2, 1], [2, 1, 0]), [0.5, 0.5, 0]);
  assert.throws(() => lengthNormalizedWeights([1, 0]), /positive finite/);
  assert.throws(() => lengthNormalizedWeights([1, 2], [0, 0]), /positive value/);
});

test('natural contact windows are inclusive with symmetric linear ramps', () => {
  const contact: NaturalFootContact = {
    foot: 'left', startFrame: 10, endFrame: 15, blendFrames: 2,
  };
  assert.deepEqual([9, 10, 11, 12, 14, 15, 16].map((frame) => contactBlendWeight(frame, contact)), [
    0, 0.5, 1, 1, 1, 0.5, 0,
  ]);
});

test('natural leg direction limits bound target-pelvis swing without changing reach length', () => {
  const input = new THREE.Vector3(0.2, -0.3, -0.93).normalize();
  const result = limitNaturalLegDirection(input, {
    maximumForwardDegrees: 50,
    maximumBackwardDegrees: 40,
    maximumLateralDegrees: 20,
    minimumSwingBendDegrees: 12,
  });
  assert.equal(result.constrained, true);
  assert.ok(Math.abs(result.solvedSagittalDegrees + 40) < 1e-8);
  assert.ok(Math.abs(result.solvedLateralDegrees - 20) < 1e-8);
  assert.ok(Math.abs(result.direction.length() - 1) < 1e-8);

  const planted = limitNaturalLegDirection(input, {
    maximumForwardDegrees: 50,
    maximumBackwardDegrees: 40,
    maximumLateralDegrees: 20,
    minimumSwingBendDegrees: 12,
  }, 0);
  assert.equal(planted.constrained, false);
  assert.ok(planted.direction.distanceTo(input) < 1e-8);
});

test('natural contacts lock the calibrated sole and reference orientation', () => {
  const naturalAnkle = new THREE.Vector3(1, 0.5, 3);
  const naturalRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
  const referenceRotation = new THREE.Quaternion();
  const soleOffset: [number, number, number] = [0, -0.1, 0.2];
  const pinnedSole = naturalSolePoint(naturalAnkle, naturalRotation, soleOffset).setY(0);
  const result = resolveNaturalContactPose({
    naturalAnkle,
    naturalFootQuaternion: naturalRotation,
    referenceFootQuaternion: referenceRotation,
    soleOffset,
    pinnedSole,
    rootTravelPerFrame: [0, 0, 0.05],
    elapsedFrames: 2,
    weight: 1,
  });
  assert.ok(result.footQuaternion.angleTo(referenceRotation) < 1e-8);
  assert.ok(naturalSolePoint(result.ankle, result.footQuaternion, soleOffset)
    .distanceTo(pinnedSole.clone().add(new THREE.Vector3(0, 0, -0.1))) < 1e-8);
});

test('level sole retains animated heading for either side and a rotated reference',()=>{
  for(const sign of [-1,1]){
    const reference=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,sign*.3,1.8));
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign*1.4);
    const tilted=yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.7)).multiply(reference);
    const expected=yaw.clone().multiply(reference),solved=naturalFootHeading(tilted,reference);
    assert.ok(solved.angleTo(expected)<1e-7);
    assert.ok(naturalFootHeading(new THREE.Quaternion(-tilted.x,-tilted.y,-tilted.z,-tilted.w),reference).angleTo(expected)<1e-7);
    const singular=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI).multiply(reference);
    assert.ok(naturalFootHeading(singular,reference,expected).angleTo(expected)<1e-7);
  }
});

test('asymmetric contact ramps retain boundary support and an outgoing fade', () => {
  const outgoing = { foot: 'left' as const, startFrame: 0, endFrame: 6, blendFrames: 3, blendInFrames: 0 };
  const incoming = { foot: 'right' as const, startFrame: 2, endFrame: 9, blendFrames: 3, blendOutFrames: 0 };
  assert.deepEqual(Array.from({ length: 7 }, (_, f) => contactBlendWeight(f, outgoing)), [1, 1, 1, 1, 1, 2 / 3, 1 / 3]);
  for (let frame = 0; frame <= 9; frame++) assert.equal(Math.max(contactBlendWeight(frame, outgoing), contactBlendWeight(frame, incoming)), 1);
  assert.equal(naturalContactRamp(incoming).fullWeightEndFrame, 9);
  assert.equal(naturalContactRamp(incoming).fullWeightStartFrame, 4);
  assert.throws(() => naturalContactRamp({ ...incoming, blendInFrames: NaN }), /integer/);
  assert.throws(() => naturalContactRamp({ ...incoming, blendOutFrames: 20 }), /full-weight/);
});

test('direction limits handle the upward hemisphere and preserve zero-weight input', () => {
  const limits = { maximumForwardDegrees: 50, maximumBackwardDegrees: 40, maximumLateralDegrees: 20, minimumSwingBendDegrees: 12 };
  for (const value of [[0, 1, 0], [0.01, 1, -0.01], [1, -1e-12, 1], [-1, -1e-12, -1], [0, -1, 0]]) {
    const input = new THREE.Vector3().fromArray(value).normalize();
    const result = limitNaturalLegDirection(input, limits);
    assert.ok(result.direction.y < 0, 'Fully constrained direction must be downward');
    const sagittal = THREE.MathUtils.radToDeg(Math.atan2(result.direction.z, -result.direction.y));
    const lateral = THREE.MathUtils.radToDeg(Math.atan2(result.direction.x, -result.direction.y));
    assert.ok(sagittal >= -40 - 1e-6 && sagittal <= 50 + 1e-6);
    assert.ok(Math.abs(lateral) <= 20 + 1e-6);
    assert.ok(limitNaturalLegDirection(input, limits, 0).direction.distanceTo(input) < 1e-8);
  }
  const half = limitNaturalLegDirection(new THREE.Vector3(0, 1, 0), { ...limits, maximumForwardDegrees: 0, maximumBackwardDegrees: 0, maximumLateralDegrees: 0 }, 0.5);
  assert.ok(Math.abs(half.direction.length() - 1) < 1e-8, 'Antipodal blend must not collapse');
});

test('natural leg solve is mirrored, length preserving, and stable near straight', () => {
  const solve = (x: number) => solveNaturalTwoBoneLeg({
    hip: new THREE.Vector3(x, 2, 0),
    desiredAnkle: new THREE.Vector3(x, 0.05, 0),
    referenceKnee: new THREE.Vector3(x, 1, 0.1),
    poleDirection: new THREE.Vector3(0, 0, 1),
    firstLength: 1,
    secondLength: 1,
    minBendDegrees: 5,
    maxBendDegrees: 150,
  });
  const left = solve(-0.25);
  const right = solve(0.25);
  assert.ok(Math.abs(left.knee.x + 0.25) < 1e-8);
  assert.ok(Math.abs(right.knee.x - 0.25) < 1e-8);
  assert.ok(Math.abs(left.knee.distanceTo(new THREE.Vector3(-0.25, 2, 0)) - 1) < 1e-8);
  assert.ok(Math.abs(left.knee.distanceTo(left.ankle) - 1) < 1e-8);
  assert.ok(left.knee.z > 0 && right.knee.z > 0);
});

test('natural leg solve reports unreachable contacts instead of silently accepting them', () => {
  const result = solveNaturalTwoBoneLeg({
    hip: new THREE.Vector3(0, 2, 0),
    desiredAnkle: new THREE.Vector3(0, -10, 0),
    referenceKnee: new THREE.Vector3(0, 1, 0.1),
    poleDirection: new THREE.Vector3(0, 0, 1),
    firstLength: 1,
    secondLength: 1,
    minBendDegrees: 5,
    maxBendDegrees: 150,
  });
  assert.equal(result.clamped, true);
  assert.ok(result.residual > 9);
  assert.ok(result.bendDegrees >= 4.999 && result.bendDegrees <= 5.001);
});

test('natural anatomical alignment maps both segment and bend-plane axes', () => {
  const referenceSegment = new THREE.Vector3(0, -1, 0);
  const referencePlane = new THREE.Vector3(1, 0, 0);
  const solvedSegment = new THREE.Vector3(0, -1, 1).normalize();
  const solvedPlane = new THREE.Vector3(1, 0, 0);
  const aligned = alignNaturalAnatomicalFrame(
    referenceSegment,
    referencePlane,
    solvedSegment,
    solvedPlane,
    new THREE.Quaternion(),
  );
  assert.ok(referenceSegment.clone().applyQuaternion(aligned).angleTo(solvedSegment) < 1e-8);
  assert.ok(referencePlane.clone().applyQuaternion(aligned).angleTo(solvedPlane) < 1e-8);
});


test('shared pelvis correction satisfies both feet and bounds unreachable requests', () => {
  const leg=(x:number,z:number)=>({hip:new THREE.Vector3(x,2,0),desiredAnkle:new THREE.Vector3(x,0.1,z),referenceKnee:new THREE.Vector3(x,1,0.2),poleDirection:new THREE.Vector3(0,0,1),firstLength:0.9,secondLength:0.9,minBendDegrees:8,maxBendDegrees:165});
  const constraints=[{leg:leg(-0.15,0.2),maximumCorrection:0.25},{leg:leg(0.15,-0.3),maximumCorrection:0.25}];
  const correction=solveNaturalPelvisCorrection(constraints);
  for(const c of constraints)assert.ok(solveNaturalTwoBoneLeg({...c.leg,hip:c.leg.hip.clone().add(correction)}).residual<1e-7);
  assert.ok(correction.length()<=0.25);
  const impossible=constraints.map(c=>({...c,maximumCorrection:0.01}));
  const bounded=solveNaturalPelvisCorrection(impossible);
  assert.ok(bounded.length()<=0.01000000001);
  assert.ok(impossible.some(c=>solveNaturalTwoBoneLeg({...c.leg,hip:c.leg.hip.clone().add(bounded)}).residual>0.01));
  assert.deepEqual(solveNaturalPelvisCorrection([]).toArray(),[0,0,0]);
  const mixed=constraints.map((c,i)=>({...c,weight:i===0?1:.5}));
  assert.ok(solveNaturalPelvisCorrection(mixed).distanceTo(correction)<1e-12);
  const partial=constraints.map(c=>({...c,weight:.1}));
  assert.ok(solveNaturalPelvisCorrection(partial).length()<=.0250000001);
  assert.throws(()=>solveNaturalPelvisCorrection([{...constraints[0],weight:NaN}]),/weights/);
});
