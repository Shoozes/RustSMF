import assert from 'node:assert/strict';
import test from 'node:test';
import { getSmfRigControlPolicy, listSmfRigPolicies } from './smfRigPolicy';

test('SMF rig policy enables only identity-safe bind reset', () => {
  assert.equal(getSmfRigControlPolicy('reset').supported, true);
  for (const control of ['reparent', 'create-child', 'delete', 'detach-connect'] as const) {
    assert.equal(getSmfRigControlPolicy(control).id, 'structure');
    assert.equal(getSmfRigControlPolicy(control).supported, false);
  }
  for (const control of ['move', 'rotate', 'spin', 'snap'] as const) {
    assert.equal(getSmfRigControlPolicy(control).id, 'bind-transform');
    assert.equal(getSmfRigControlPolicy(control).supported, false);
  }
  assert.equal(getSmfRigControlPolicy('rename').supported, false);
  assert.equal(getSmfRigControlPolicy('mirror').supported, false);
  assert.match(getSmfRigControlPolicy('rename').reason, /no persisted name field/i);
  assert.match(getSmfRigControlPolicy('detach-connect').reason, /head nodes.*skin indices.*animation/i);
  assert.match(getSmfRigControlPolicy('mirror').reason, /no mirror command.*no left\/right pairing/i);
});

test('every SMF rig policy has an explicit user-facing reason', () => {
  const policies = listSmfRigPolicies();
  assert.deepEqual(policies.map((policy) => policy.id), [
    'rename',
    'structure',
    'bind-transform',
    'mirror',
    'reset',
  ]);
  for (const policy of policies) {
    assert.ok(policy.reason.length >= 40, `${policy.id} policy reason should be actionable`);
  }
});
