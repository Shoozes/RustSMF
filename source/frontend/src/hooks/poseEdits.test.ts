import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNudgeDelta,
  emptyPoseEdit,
  hasPoseEdits,
  hasUnsupportedPoseScaleEdits,
  markPoseBoneEdited,
} from './poseEdits';

test('pose edit helpers track absolute viewport edits separately from nudge deltas', () => {
  const clean = { Bone: emptyPoseEdit() };
  assert.equal(hasPoseEdits(clean), false);
  assert.equal(hasUnsupportedPoseScaleEdits(clean), false);

  const viewportMoved = {
    Bone: markPoseBoneEdited(clean.Bone),
  };
  assert.equal(hasPoseEdits(viewportMoved), true);
  assert.equal(hasUnsupportedPoseScaleEdits(viewportMoved), false);

  const viewportScaled = {
    Bone: markPoseBoneEdited(viewportMoved.Bone, { hasScale: true }),
  };
  assert.equal(hasPoseEdits(viewportScaled), true);
  assert.equal(hasUnsupportedPoseScaleEdits(viewportScaled), true);

  const scaleReset = {
    Bone: markPoseBoneEdited(viewportScaled.Bone, { hasScale: false }),
  };
  assert.equal(hasPoseEdits(scaleReset), true);
  assert.equal(hasUnsupportedPoseScaleEdits(scaleReset), false);
});

test('nudge reset clears dirty nudge deltas without forcing scale state', () => {
  const moved = applyNudgeDelta(emptyPoseEdit(), { x: 1, rotZ: 0.25 });
  assert.equal(hasPoseEdits({ Bone: moved }), true);

  const reset = applyNudgeDelta(moved, { reset: true });
  assert.equal(hasPoseEdits({ Bone: reset }), false);
  assert.equal(hasUnsupportedPoseScaleEdits({ Bone: reset }), false);
});
