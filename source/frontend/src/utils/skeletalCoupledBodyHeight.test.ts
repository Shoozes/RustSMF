import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bakeCoupledBodyHeight, COUPLED_BODY_HEIGHT_POLICY, COUPLED_BODY_HEIGHT_PROFILE_SHA256,
  COUPLED_BODY_HEIGHT_SOURCE_SHA256, parseCoupledBodyHeight } from './skeletalCoupledBodyHeight';

test('coupled profile bytes and seven declared masks are frozen', () => {
  const bytes = readFileSync(fileURLToPath(new URL('./walkSlowCoupledBodyHeight.v1.json', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), COUPLED_BODY_HEIGHT_PROFILE_SHA256);
  const profile = JSON.parse(bytes.toString('utf8')) as { sourceModelSha256: string; segments: Array<{ accessor: number; firstTick: number; lastTick: number; beforeBase64: string; afterBase64: string }> };
  assert.equal(profile.sourceModelSha256, COUPLED_BODY_HEIGHT_SOURCE_SHA256);
  assert.deepEqual(profile.segments.map(({ accessor, firstTick, lastTick }) => [accessor, firstTick, lastTick]),
    [[95, 51, 56], [101, 50, 57], [105, 45, 57], [109, 45, 57], [113, 50, 57], [117, 50, 57], [121, 45, 57]]);
  for (const segment of profile.segments) {
    const expected = (segment.lastTick - segment.firstTick + 1) * (segment.accessor === 95 ? 3 : 12) * 4;
    assert.equal(Buffer.from(segment.beforeBase64, 'base64').length, expected);
    assert.equal(Buffer.from(segment.afterBase64, 'base64').length, expected);
  }
});

test('coupled recipe refuses foreign source, parameters and malformed GLB', () => {
  const recipe = parseCoupledBodyHeight({ policy: COUPLED_BODY_HEIGHT_POLICY });
  assert.deepEqual(recipe, { policy: COUPLED_BODY_HEIGHT_POLICY });
  for (const invalid of [{ policy: 'other' }, { policy: COUPLED_BODY_HEIGHT_POLICY, cap: 1 }, null])
    assert.throws(() => parseCoupledBodyHeight(invalid), /unsupported recipe|recipe object/);
  assert.throws(() => bakeCoupledBodyHeight(new Uint8Array(28), '0'.repeat(64), recipe), /foreign source/);
  assert.throws(() => bakeCoupledBodyHeight(new Uint8Array(28), COUPLED_BODY_HEIGHT_SOURCE_SHA256, recipe), /invalid GLB header/);
});
