import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditorMode } from './index';

test('editor mode guard accepts only registered workspace modes', () => {
  assert.equal(isEditorMode('rig'), true);
  assert.equal(isEditorMode('settings'), false);
  assert.equal(isEditorMode(undefined), false);
});
