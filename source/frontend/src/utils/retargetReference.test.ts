import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalReferenceCorrections } from './retargetReference';

test('local reference parser copies unit rotations and rejects malformed calibration', () => {
  const value = { wrist: { from: [0, 0, 0, 1], to: [0, 1, 0, 0] } };
  const parsed = parseLocalReferenceCorrections(value);
  assert.deepEqual(parsed, value);
  assert.notEqual(parsed.wrist.from, value.wrist.from);
  assert.deepEqual(parseLocalReferenceCorrections(undefined), {});
  for (const rotation of [null, [], [0, 0, 1], [0, 0, 0, 0], [0, 0, 0, 2],
    [0, NaN, 0, 1], [0, Infinity, 0, 1], [0, '0', 0, 1], new Array(4)]) {
    for (const field of ['from', 'to']) {
      assert.throws(() => parseLocalReferenceCorrections({ wrist: { ...value.wrist, [field]: rotation } }), /unit quaternions/);
    }
  }
  for (const invalid of [null, [], 'wrist', { wrist: {} }, { wrist: { ...value.wrist, ignored: true } },
    { ' ': value.wrist }, { ['x'.repeat(161)]: value.wrist },
    Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`bone${i}`, value.wrist]))]) {
    assert.throws(() => parseLocalReferenceCorrections(invalid));
  }
});
