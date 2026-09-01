import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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
