import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearEditorRedo,
  createAuthoringHistoryBranch,
  restoreEditorHistory,
  makeEditorHistory,
  popRedo,
  popUndo,
  pushEditorHistory,
  selectLatestHistoryDomain,
  type EditorHistoryEntry,
} from './editorHistory';

type Snapshot = { value: number | string };

function entry(id: string, before: number, after: number): EditorHistoryEntry<Snapshot> {
  return {
    id,
    label: `Edit ${id}`,
    domain: 'pose',
    before: { value: before },
    after: { value: after },
  };
}

describe('editorHistory', () => {
  it('keeps the exact cursor and entries when restore rejects or throws', () => {
    const initial = pushEditorHistory(makeEditorHistory<Snapshot>(), entry('one', 0, 1));
    const rejected = restoreEditorHistory(initial, 'undo', () => false, 2);
    assert.equal(rejected.applied, false);
    assert.equal(rejected.state, initial);
    assert.equal(initial.undo.length, 1);
    assert.equal(initial.redo.length, 0);
    assert.throws(() => restoreEditorHistory(initial, 'undo', () => { throw Error('invalid target'); }), /invalid target/);
    assert.equal(initial.undo.length, 1);
    let restored = -1;
    const undone = restoreEditorHistory(initial, 'undo', (_, snapshot) => { restored = Number(snapshot.value); return true; }, 2);
    assert.equal(restored, 0);
    assert.equal(undone.state.redo.length, 1);
    assert.equal(restoreEditorHistory(undone.state, 'redo', () => false, 3).state, undone.state);
    const redone = restoreEditorHistory(undone.state, 'redo', (_, snapshot) => { restored = Number(snapshot.value); return true; }, 3);
    assert.equal(restored, 1);
    assert.equal(redone.state.undo.length, 1);
    assert.equal(redone.state.redo.length, 0);
  });
  it('invalidates every registered redo branch only for accepted forward edits', () => {
    const branch = createAuthoringHistoryBranch();
    const states = ['rig', 'skin', 'outliner'].map(id => popUndo(pushEditorHistory(makeEditorHistory<Snapshot>(), entry(id, 0, 1))).state);
    const release = states.map((_, index) => branch.subscribe(() => { states[index] = clearEditorRedo(states[index]); }));
    assert.deepEqual(states.map(state => state.redo.length), [1, 1, 1]);
    branch.acceptEdit();
    assert.deepEqual(states.map(state => state.redo.length), [0, 0, 0]);
    assert.ok(states.every(state => state.bytesUsed === 0));
    release.forEach(unsubscribe => unsubscribe());
    states[0] = popUndo(pushEditorHistory(makeEditorHistory<Snapshot>(), entry('later', 0, 1))).state;
    branch.acceptEdit();
    assert.equal(states[0].redo.length, 1);
  });
  it('selects the newest available history domain with a stable fallback', () => {
    const candidates = [
      { domain: 'editor' as const, available: true, order: 4 },
      { domain: 'skin' as const, available: false, order: 9 },
      { domain: 'outliner' as const, available: true, order: 7 },
    ];
    assert.equal(selectLatestHistoryDomain(candidates, 'editor'), 'outliner');
    assert.equal(
      selectLatestHistoryDomain(candidates.map((candidate) => ({ ...candidate, available: false })), 'editor'),
      'editor',
    );
  });

  it('pushes undo entries and clears redo history', () => {
    const first = pushEditorHistory(makeEditorHistory<Snapshot>(), entry('1', 0, 1));
    const undone = popUndo(first);
    const next = pushEditorHistory(undone.state, entry('2', 1, 2));

    assert.equal(next.undo.length, 1);
    assert.equal(next.undo[0].id, '2');
    assert.equal(next.redo.length, 0);
  });

  it('moves entries between undo and redo stacks', () => {
    const state = pushEditorHistory(
      pushEditorHistory(makeEditorHistory<Snapshot>(), entry('1', 0, 1)),
      entry('2', 1, 2),
    );

    const undo = popUndo(state);
    assert.equal(undo.entry?.id, '2');
    assert.deepEqual(undo.state.undo.map((item) => item.id), ['1']);
    assert.deepEqual(undo.state.redo.map((item) => item.id), ['2']);

    const redo = popRedo(undo.state);
    assert.equal(redo.entry?.id, '2');
    assert.deepEqual(redo.state.undo.map((item) => item.id), ['1', '2']);
    assert.equal(redo.state.redo.length, 0);
  });

  it('tracks separate undo and redo chronology metadata', () => {
    const pushed = pushEditorHistory(makeEditorHistory<Snapshot>(), {
      ...entry('1', 0, 1),
      order: 10,
    });

    const undo = popUndo(pushed, 20);
    assert.equal(undo.entry?.order, 10);
    assert.equal(undo.state.redo.at(-1)?.order, 10);
    assert.equal(undo.state.redo.at(-1)?.redoOrder, 20);

    const redo = popRedo(undo.state, 30);
    assert.equal(redo.entry?.redoOrder, 20);
    assert.equal(redo.state.undo.at(-1)?.order, 30);
    assert.equal(redo.state.undo.at(-1)?.redoOrder, undefined);
  });

  it('enforces the configured stack limit', () => {
    const state = ['1', '2', '3'].reduce(
      (current, id, index) => pushEditorHistory(current, entry(id, index, index + 1)),
      makeEditorHistory<Snapshot>(2),
    );

    assert.deepEqual(state.undo.map((item) => item.id), ['2', '3']);

    const undo = popUndo(state);
    const redo = popRedo(undo.state);
    assert.deepEqual(redo.state.undo.map((item) => item.id), ['2', '3']);
  });

  it('evicts oldest entries when the byte budget is reached', () => {
    const large = (id: string): EditorHistoryEntry<Snapshot> => ({
      ...entry(id, 0, 1),
      before: { value: 'x'.repeat(2_000) },
      after: { value: 'y'.repeat(2_000) },
    });
    const state = pushEditorHistory(
      pushEditorHistory(makeEditorHistory<Snapshot>(10, 10_000), large('1')),
      large('2'),
    );

    assert.deepEqual(state.undo.map((item) => item.id), ['2']);
    assert.ok(state.bytesUsed <= state.byteLimit);
    assert.equal(state.evictionCount, 1);
  });
});
