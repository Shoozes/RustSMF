import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {advancedFixtures} from '../../scripts/retarget-advanced-fixtures';
import {restoreSkeleton} from './retargetSnapshot';

test('advanced corpus covers every advanced option/report and independent planted-leg motion', () => {
  const corpus = advancedFixtures();
  assert.equal(corpus.advancedOptions.length, 9); assert.equal(corpus.advancedReports.length, 8);
  assert.ok(corpus.positives.length >= 33 && corpus.negatives.length >= 30);
  const bounded = corpus.negatives.find(c => c.name === 'natural-aggregate-anchor-limit')!;
  assert.equal(bounded.code, 'ADVANCED_INPUT_INVALID');
  assert.ok(bounded.request.target.bones.length * 31 < 200000, 'bone-only bound would miss the regression');
  const contacts = (bounded.request.clips[0].options.naturalMotion as {contacts: {Natural: Array<{contactPatch: unknown[]}>}}).contacts.Natural;
  assert.equal(contacts.reduce((total, c) => total + c.contactPatch.length * 31, 0), 253952);
  const weights = corpus.positives.find(c => c.name === 'natural-weighted')!.expected.clips[0].report.naturalMotion.torso.effectiveWeights as number[];
  weights.forEach((v, i) => assert.ok(Math.abs(v - [2 / 7, 4 / 7, 1 / 7][i]) < 1e-12));
  assert.ok(corpus.positives.find(c => c.name === 'natural-limits')!.expected.clips[0].report.naturalMotion.legMotionLimit.sides.left.constrainedSamples > 0);
  assert.deepEqual(corpus.positives.find(c => c.name === 'twist-mirrored-axis')!.expected.clips[0].report.forearmTwist[0].axis, [0, -1, 0]);
  const referenceBend = 2 * Math.atan(.06 / .75) * 180 / Math.PI;
  const bent = corpus.positives.find(c => c.name === 'natural-bend')!.expected.clips[0].report.naturalMotion.legs.left;
  const extended = corpus.positives.find(c => c.name === 'natural-bend-extension')!.expected.clips[0].report.naturalMotion.legs.left;
  assert.ok(Math.abs(bent.maximumBendDegrees - (referenceBend + .3 * 180 / Math.PI)) < 1e-5);
  assert.ok(Math.abs(extended.minimumBendDegrees - (referenceBend - .1 * 180 / Math.PI)) < 1e-5);
  const fixture = corpus.positives.find(c => c.name === 'natural-default')!;
  const skeleton = restoreSkeleton(fixture.input.target);
  try {
    const clip = fixture.expected.clips[0].clip;
    const bones = new Map(skeleton.bones.map(b => [b.name, b]));
    for (let frame = 0; frame < 31; frame++) {
      for (const ch of clip.tracks) {
        const bone = bones.get(fixture.input.target.nodes[ch.node].name)!;
        const size = ch.property === 'quaternion' ? 4 : 3;
        bone[ch.property].fromArray(ch.values, frame * size);
      }
      skeleton.bones[0].updateWorldMatrix(true, true);
      for (const [side, x] of [['Left', .3], ['Right', -.3]] as const) {
        const hip = bones.get(`${side}UpLeg`)!.getWorldPosition(new THREE.Vector3());
        const knee = bones.get(`${side}Leg`)!.getWorldPosition(new THREE.Vector3());
        const foot = bones.get(`${side}Foot`)!;
        const ankle = foot.getWorldPosition(new THREE.Vector3());
        const length = Math.hypot(.9, .072);
        assert.ok(Math.abs(hip.distanceTo(knee) - length) < 1e-6);
        assert.ok(Math.abs(knee.distanceTo(ankle) - length) < 1e-6);
        const sole = new THREE.Vector3(0, -.08, .04).applyMatrix4(foot.matrixWorld);
        assert.ok(sole.distanceTo(new THREE.Vector3(x, .28, .04)) < 1e-6, `planted ${side} sole at frame ${frame}`);
      }
    }
    const torso = clip.tracks.find(ch => ch.name === 'Spine2.quaternion')!;
    assert.ok(torso.values.slice(-4, -1).some(v => Math.abs(v) > .01), 'actual torso movement');
    const endpoint = corpus.positives.find(c => c.name === 'endpoint')!.expected.clips[0].clip;
    const root = endpoint.tracks.find(ch => ch.name === 'root.position')!;
    assert.deepEqual(root.values.slice(0, 3), [0, 1, 0]);
    assert.deepEqual(root.values.slice(-3), [1, 1, .5]);
  } finally {skeleton.dispose();}
});
