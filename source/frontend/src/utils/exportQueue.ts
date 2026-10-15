export type ExportFormat = 'glb' | 'fbx' | 'dae' | 'smf';
export interface ExportPreset { format: ExportFormat; includeAnimation: boolean }
export const EXPORT_PRESETS = [
  { format: 'glb', name: 'GLB · Runtime' },
  { format: 'fbx', name: 'FBX · DCC' },
  { format: 'dae', name: 'DAE · Collada' },
  { format: 'smf', name: 'SMF · Legacy' },
] as const;
export const MAX_EXPORT_QUEUE_ITEMS = 8;
export const MAX_EXPORT_QUEUE_BYTES = 128 * 1024 * 1024;
export const MAX_EXPORT_RESULT_BYTES = 256 * 1024 * 1024;
export type ExportItemStatus = 'pending' | 'preparing' | 'saving' | 'saved' | 'downloaded' | 'failed' | 'canceled';
export interface ExportQueueItem {
  id: number; filename: string; preset: Readonly<ExportPreset>; status: ExportItemStatus; message: string;
}
export interface ExportQueueState { items: readonly ExportQueueItem[]; running: boolean; stopping: boolean; bytes: number }
export interface ExportQueueSnapshot { bytes: number; dispose(): void }
export interface ExportQueueRunner<T> {
  prepare(snapshot: T, preset: Readonly<ExportPreset>, signal: AbortSignal): Promise<Uint8Array>;
  save(bytes: Uint8Array, filename: string, signal: AbortSignal): Promise<'saved' | 'downloaded' | 'canceled'>;
  isCurrent(): boolean;
}

export function exportBasename(value: string, format: ExportFormat): string {
  let base = value.replace(/\.(glb|gltf|fbx|dae|smf|obj)$/i, '').normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
  if (!base) base = 'rustsmf-model';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `_${base}`;
  return `${base}.${format}`;
}

/** Owns captured inputs until success/removal; issued saves always settle before release. */
export class ExportQueue<T extends ExportQueueSnapshot> {
  private state: ExportQueueState = { items: [], running: false, stopping: false, bytes: 0 };
  private snapshots = new Map<number, T>();
  private listeners = new Set<() => void>();
  private nextId = 1;
  private controller: AbortController | null = null;
  private disposed = false;
  private activeId: number | null = null;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getState = () => this.state;
  private publish(update: Partial<ExportQueueState>) {
    this.state = { ...this.state, ...update };
    if (!this.disposed) this.listeners.forEach(listener => listener());
  }
  private update(id: number, status: ExportItemStatus, message = '') {
    this.publish({ items: this.state.items.map(item => item.id === id ? { ...item, status, message } : item) });
  }
  private release(id: number) {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) return;
    this.snapshots.delete(id);
    snapshot.dispose();
    this.publish({ bytes: this.state.bytes - snapshot.bytes });
  }
  add(preset: ExportPreset, basename: string, capture: (remainingBytes: number) => T) {
    if (this.disposed || this.state.running) throw new Error('Wait for the export queue to stop before adding items.');
    if (this.state.items.length >= MAX_EXPORT_QUEUE_ITEMS) throw new Error(`Queue is full (${MAX_EXPORT_QUEUE_ITEMS} items). Remove finished items first.`);
    const snapshot = capture(MAX_EXPORT_QUEUE_BYTES - this.state.bytes);
    if (!Number.isSafeInteger(snapshot.bytes) || snapshot.bytes < 0 || snapshot.bytes + this.state.bytes > MAX_EXPORT_QUEUE_BYTES) {
      snapshot.dispose(); throw new Error('Queue captures exceed 128 MiB. Remove items before adding another.');
    }
    const id = this.nextId++;
    this.snapshots.set(id, snapshot);
    this.publish({ bytes: this.state.bytes + snapshot.bytes, items: [...this.state.items,
      { id, filename: exportBasename(basename, preset.format), preset: { ...preset }, status: 'pending', message: '' }] });
  }
  remove(id: number) {
    if (this.state.running) return;
    this.release(id);
    this.publish({ items: this.state.items.filter(item => item.id !== id) });
  }
  clear() { if (!this.state.running) [...this.state.items].forEach(item => this.remove(item.id)); }
  retry() {
    if (this.state.running || this.disposed) return;
    this.publish({ items: this.state.items.map(item => this.snapshots.has(item.id) && ['failed', 'canceled'].includes(item.status)
      ? { ...item, status: 'pending', message: '' } : item) });
  }
  cancel() {
    if (this.disposed) return;
    this.controller?.abort();
    this.publish({ stopping: this.state.running, items: this.state.items.map(item => item.status === 'pending'
      ? { ...item, status: 'canceled', message: 'Canceled before preparation.' } : item) });
  }
  async run(runner: ExportQueueRunner<T>) {
    if (this.disposed || this.state.running || !this.state.items.some(item => item.status === 'pending')) return;
    this.publish({ running: true, stopping: false });
    try {
      for (const item of this.state.items) {
        if (this.disposed || this.state.stopping || !runner.isCurrent()) break;
        if (item.status !== 'pending') continue;
        const snapshot = this.snapshots.get(item.id);
        if (!snapshot) continue;
        const controller = new AbortController(); this.controller = controller; this.activeId = item.id;
        const current = () => !this.disposed && !controller.signal.aborted && runner.isCurrent();
        let saveIssued = false;
        try {
          this.update(item.id, 'preparing');
          const bytes = await runner.prepare(snapshot, item.preset, controller.signal);
          if (!current()) { this.update(item.id, 'canceled', 'Preparation canceled; no save issued.'); continue; }
          if (bytes.byteLength > MAX_EXPORT_RESULT_BYTES) throw new Error('Export exceeds the 256 MiB save limit.');
          this.update(item.id, 'saving');
          saveIssued = true;
          // Once the OS dialog/write or browser download is issued it cannot be revoked.
          const result = await runner.save(bytes, item.filename, controller.signal);
          this.update(item.id, result, result === 'canceled' ? 'Save canceled; no output issued.' : '');
          if (result !== 'canceled') this.release(item.id);
          // A destination cancellation pauses the remaining queue instead of opening more dialogs.
          if (result === 'canceled') this.cancel();
        } catch (error: unknown) {
          this.update(item.id, saveIssued || current() ? 'failed' : 'canceled', saveIssued || current()
            ? (error instanceof Error ? error.message : String(error)) : 'Preparation canceled; no save issued.');
        } finally {
          this.controller = null; this.activeId = null;
          if (this.disposed) this.release(item.id);
        }
      }
    } finally {
      this.publish({ items: this.state.items.map(item => item.status === 'pending'
        ? { ...item, status: 'canceled', message: 'Queue stopped before preparation.' } : item), running: false, stopping: false });
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.controller?.abort(); this.listeners.clear();
    for (const id of this.snapshots.keys()) if (id !== this.activeId) this.release(id);
  }
}
