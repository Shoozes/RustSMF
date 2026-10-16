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
  byteLimit: number;
  bytesUsed: number;
  evictionCount: number;
}

export const EDITOR_HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;

export function createAuthoringHistoryBranch() {
  const listeners = new Set<() => void>();
  return {
    subscribe(invalidateRedo: () => void): () => void {
      listeners.add(invalidateRedo);
      return () => { listeners.delete(invalidateRedo); };
    },
    // Call only for accepted forward edits, never when allocating undo order.
    acceptEdit(): void {
      for (const invalidateRedo of listeners) invalidateRedo();
    },
  };
}

export type AuthoringHistoryBranch = ReturnType<typeof createAuthoringHistoryBranch>;

export function clearEditorRedo<TSnapshot>(state: EditorHistoryState<TSnapshot>): EditorHistoryState<TSnapshot> {
  if (state.redo.length === 0) return state;
  return { ...state, redo: [], bytesUsed: sumEntryBytes(state.undo) };
}

export function restoreEditorHistory<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  direction: 'undo' | 'redo',
  restore: (entry: EditorHistoryEntry<TSnapshot>, snapshot: TSnapshot) => boolean,
  order?: number,
) {
  const candidate = direction === 'undo' ? popUndo(state, order) : popRedo(state, order);
  const applied = !!candidate.entry && restore(candidate.entry, direction === 'undo' ? candidate.entry.before : candidate.entry.after);
  return { entry: candidate.entry, state: applied ? candidate.state : state, applied };
}

export interface HistoryChronologyCandidate<TDomain extends string> {
  domain: TDomain;
  available: boolean;
  order: number;
}

export function selectLatestHistoryDomain<TDomain extends string>(
  candidates: readonly HistoryChronologyCandidate<TDomain>[],
  fallback: TDomain,
): TDomain {
  return candidates.reduce<HistoryChronologyCandidate<TDomain> | null>((latest, candidate) => (
    candidate.available && (!latest || candidate.order > latest.order) ? candidate : latest
  ), null)?.domain ?? fallback;
}

function estimateHistoryValue(
  value: unknown,
  seen: WeakSet<object>,
  depth = 0,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length * 2 + 16;
  if (typeof value === 'number' || typeof value === 'bigint') return 8;
  if (typeof value === 'boolean') return 4;
  if (typeof value === 'function') return 0;
  if (typeof value !== 'object') return 8;

  if (ArrayBuffer.isView(value)) return value.byteLength + 32;
  if (value instanceof ArrayBuffer) return value.byteLength + 32;
  if (seen.has(value)) return 0;
  seen.add(value);

  // Three Object3D references are intentionally retained by rig snapshots;
  // their live scene graph is not owned by history and must not be traversed.
  if (Reflect.get(value, 'isObject3D') === true) return 256;
  if (depth > 8) return 64;
  if (value instanceof Map) {
    let bytes = 48;
    for (const [key, entry] of value) {
      bytes += estimateHistoryValue(key, seen, depth + 1);
      bytes += estimateHistoryValue(entry, seen, depth + 1);
    }
    return bytes;
  }
  if (value instanceof Set) {
    let bytes = 48;
    for (const entry of value) bytes += estimateHistoryValue(entry, seen, depth + 1);
    return bytes;
  }
  if (Array.isArray(value)) {
    return 32 + value.reduce((total, entry) => total + estimateHistoryValue(entry, seen, depth + 1), 0);
  }

  let bytes = 64;
  for (const [key, entry] of Object.entries(value)) {
    bytes += key.length * 2 + estimateHistoryValue(entry, seen, depth + 1);
  }
  return bytes;
}

export function estimateEditorHistoryEntryBytes<TSnapshot>(
  entry: EditorHistoryEntry<TSnapshot>,
): number {
  return Math.max(128, estimateHistoryValue(entry, new WeakSet<object>()));
}

function sumEntryBytes<TSnapshot>(entries: readonly EditorHistoryEntry<TSnapshot>[]): number {
  return entries.reduce((total, entry) => total + estimateEditorHistoryEntryBytes(entry), 0);
}

function constrainHistory<TSnapshot>(
  undo: EditorHistoryEntry<TSnapshot>[],
  redo: EditorHistoryEntry<TSnapshot>[],
  limit: number,
  byteLimit: number,
): {
  undo: EditorHistoryEntry<TSnapshot>[];
  redo: EditorHistoryEntry<TSnapshot>[];
  bytesUsed: number;
  evictions: number;
} {
  let bytesUsed = sumEntryBytes(undo) + sumEntryBytes(redo);
  let evictions = 0;
  const removeOldest = (entries: EditorHistoryEntry<TSnapshot>[]): void => {
    const removed = entries.shift();
    if (!removed) return;
    bytesUsed -= estimateEditorHistoryEntryBytes(removed);
    evictions += 1;
  };

  while (undo.length > limit) removeOldest(undo);
  while (redo.length > limit) removeOldest(redo);
  while (bytesUsed > byteLimit && (undo.length > 0 || redo.length > 0)) {
    // Prefer evicting redo entries so the current undo chain remains usable
    // after a direction change. The newest entry is always at the end.
    removeOldest(redo.length > 0 ? redo : undo);
  }

  return { undo, redo, bytesUsed: Math.max(0, bytesUsed), evictions };
}

export function makeEditorHistory<TSnapshot>(
  limit = 100,
  byteLimit = EDITOR_HISTORY_BYTE_LIMIT,
): EditorHistoryState<TSnapshot> {
  return { undo: [], redo: [], limit, byteLimit, bytesUsed: 0, evictionCount: 0 };
}

export function pushEditorHistory<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  entry: EditorHistoryEntry<TSnapshot>,
): EditorHistoryState<TSnapshot> {
  const constrained = constrainHistory(
    [...state.undo, entry],
    [],
    state.limit,
    state.byteLimit,
  );

  return {
    ...state,
    undo: constrained.undo,
    redo: constrained.redo,
    bytesUsed: constrained.bytesUsed,
    evictionCount: state.evictionCount + constrained.evictions,
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

  const constrained = constrainHistory(
    state.undo.slice(0, -1),
    [...state.redo.slice(-(state.limit - 1)), redoEntry],
    state.limit,
    state.byteLimit,
  );
  return {
    entry,
    state: {
      ...state,
      undo: constrained.undo,
      redo: constrained.redo,
      bytesUsed: constrained.bytesUsed,
      evictionCount: state.evictionCount + constrained.evictions,
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

  const constrained = constrainHistory(
    [...state.undo.slice(-(state.limit - 1)), undoEntry],
    state.redo.slice(0, -1),
    state.limit,
    state.byteLimit,
  );
  return {
    entry,
    state: {
      ...state,
      undo: constrained.undo,
      redo: constrained.redo,
      bytesUsed: constrained.bytesUsed,
      evictionCount: state.evictionCount + constrained.evictions,
    },
  };
}
