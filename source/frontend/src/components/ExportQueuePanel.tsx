import { useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { EXPORT_PRESETS, MAX_EXPORT_QUEUE_ITEMS, type ExportFormat, type ExportPreset, type ExportQueueState } from '../utils/exportQueue';

export interface ExportQueueControls {
  state: ExportQueueState; error: string; disabled: boolean;
  enqueue(preset: ExportPreset, basename: string): void;
  run(): void; cancel(): void; retry(): void; remove(id: number): void; clear(): void;
}
const labels = { pending: 'Queued', preparing: 'Preparing…', saving: 'Choosing destination / saving…', saved: 'Saved', downloaded: 'Download issued', failed: 'Failed', canceled: 'Canceled' };

export default function ExportQueuePanel({ state, error, disabled, enqueue, run, cancel, retry, remove, clear }: ExportQueueControls) {
  const [format, setFormat] = useState<ExportFormat>('glb');
  const [basename, setBasename] = useState('');
  const [includeAnimation, setIncludeAnimation] = useState(true);
  const pending = state.items.some(item => item.status === 'pending');
  const incomplete = state.items.some(item => item.status === 'failed' || item.status === 'canceled');
  return <details className="export-queue" data-testid="export-queue">
    <summary>Export queue{state.items.length > 0 && ` · ${state.items.length}`}</summary>
    <div className="export-queue-body">
      <div className="export-queue-add">
        <label className="sr-only" htmlFor="export-preset">Export preset</label>
        <select id="export-preset" data-testid="export-preset" value={format} onChange={event => setFormat(event.target.value as ExportFormat)} disabled={disabled || state.running}>
          {EXPORT_PRESETS.map(preset => <option key={preset.format} value={preset.format}>{preset.name}</option>)}
        </select>
        <button type="button" aria-label="Add export to queue" title="Capture the current model with this preset" data-testid="export-queue-add" disabled={disabled || state.running || state.items.length >= MAX_EXPORT_QUEUE_ITEMS} onClick={() => enqueue({ format, includeAnimation }, basename)}><Plus size={16} /></button>
      </div>
      <details className="export-queue-options"><summary>Options</summary>
        <label>Filename<input data-testid="export-queue-name" placeholder="Model name" maxLength={120} value={basename} disabled={disabled || state.running} onChange={event => setBasename(event.target.value)} /></label>
        <label><input type="checkbox" data-testid="export-queue-animation" checked={includeAnimation} disabled={disabled || state.running} onChange={event => setIncludeAnimation(event.target.checked)} />Include all clips</label>
      </details>
      {error && <div role="alert" className="export-queue-error" data-testid="export-queue-error">{error}</div>}
      {state.items.length === 0 ? <p className="export-queue-note">Add a capture of the current model. Queue stays in this session.</p> : <>
        <ol className="export-queue-items" aria-label="Queued exports">
          {state.items.map(item => <li key={item.id} data-testid="export-queue-item" data-status={item.status}>
            <div><span className="export-queue-filename" title={item.filename}>{item.filename}</span><span className="export-queue-result">{labels[item.status]}{!item.preset.includeAnimation && ' · no clips'}</span>
              {item.message && <span className="export-queue-error">{item.message}</span>}</div>
            <button type="button" title={`Remove ${item.filename}`} aria-label={`Remove ${item.filename}`} disabled={state.running} onClick={() => remove(item.id)}><Trash size={14} /></button>
          </li>)}
        </ol>
        <div className="export-queue-actions">
          {state.running ? <button type="button" data-testid="export-queue-cancel" disabled={state.stopping} onClick={cancel}>{state.stopping ? 'Stopping…' : 'Cancel queue'}</button>
            : pending ? <button type="button" data-testid="export-queue-run" disabled={disabled} onClick={run}>Export queued</button>
            : incomplete ? <button type="button" data-testid="export-queue-retry" disabled={disabled} onClick={() => { retry(); run(); }}>Retry incomplete</button> : null}
          {!state.running && <button type="button" data-testid="export-queue-clear" onClick={clear}>Clear</button>}
        </div>
        <p className="export-queue-note">{(state.bytes / 1048576).toFixed(1)} / 128 MiB · {state.items.length} / {MAX_EXPORT_QUEUE_ITEMS} items. Downloads are issued to your browser; check its download list.</p>
      </>}
    </div>
  </details>;
}
