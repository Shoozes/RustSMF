import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasPendingAuthoringChanges } from './replacementGuard';

describe('replacementGuard', () => {
  it('stays clean only when every authoring/history source is clean', () => {
    assert.equal(hasPendingAuthoringChanges({ pose: false, animation: false, skin: false, editorHistory: false }), false);
    assert.equal(hasPendingAuthoringChanges({ pose: true, animation: false, skin: false, editorHistory: false }), true);
    assert.equal(hasPendingAuthoringChanges({ pose: false, animation: false, skin: false, editorHistory: false, externalHistory: true }), true);
  });
});
