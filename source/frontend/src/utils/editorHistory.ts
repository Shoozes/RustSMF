export type EditorHistoryDomain =
  | 'pose'
  | 'rig'
  | 'skin'
  | 'animation'
  | 'outliner';

export interface EditorHistoryEntry<TSnapshot> {
  id: string;
  label: string;
  domain: EditorHistoryDomain;
  before: TSnapshot;
  after: TSnapshot;
  order?: number;
  redoOrder?: number;
}

export interface EditorHistoryState<TSnapshot> {
  undo: EditorHistoryEntry<TSnapshot>[];
  redo: EditorHistoryEntry<TSnapshot>[];
  limit: number;
}

export function makeEditorHistory<TSnapshot>(limit = 100): EditorHistoryState<TSnapshot> {
  return { undo: [], redo: [], limit };
}

export function pushEditorHistory<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  entry: EditorHistoryEntry<TSnapshot>,
): EditorHistoryState<TSnapshot> {
  return {
    ...state,
    undo: [...state.undo.slice(-(state.limit - 1)), entry],
    redo: [],
  };
}

export function popUndo<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  redoOrder?: number,
): { entry: EditorHistoryEntry<TSnapshot> | null; state: EditorHistoryState<TSnapshot> } {
  const entry = state.undo.at(-1) ?? null;
  if (!entry) return { entry: null, state };
  const redoEntry: EditorHistoryEntry<TSnapshot> = {
    ...entry,
    redoOrder,
  };

  return {
    entry,
    state: {
      ...state,
      undo: state.undo.slice(0, -1),
      redo: [...state.redo.slice(-(state.limit - 1)), redoEntry],
    },
  };
}

export function popRedo<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  undoOrder?: number,
): { entry: EditorHistoryEntry<TSnapshot> | null; state: EditorHistoryState<TSnapshot> } {
  const entry = state.redo.at(-1) ?? null;
  if (!entry) return { entry: null, state };
  const undoEntry: EditorHistoryEntry<TSnapshot> = {
    ...entry,
    order: undoOrder ?? entry.order,
    redoOrder: undefined,
  };

  return {
    entry,
    state: {
      ...state,
      undo: [...state.undo.slice(-(state.limit - 1)), undoEntry],
      redo: state.redo.slice(0, -1),
    },
  };
}
