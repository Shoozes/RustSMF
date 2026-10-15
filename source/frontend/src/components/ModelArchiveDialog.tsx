import { useEffect, useRef, useState } from 'react';
import type { ArchiveActivity } from '../hooks/useModelArchive';
import '../styles/modelArchive.css';

export default function ModelArchiveDialog({ activity, onCancel, onChoose }: {
  activity: ArchiveActivity;
  onCancel: () => void;
  onChoose: (name: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      // Open may become enabled only after the load owner's promise settles.
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        if (previous?.isConnected && previous.matches('button, input, select, textarea, a[href], [tabindex]') && !previous.matches(':disabled')) previous.focus();
        else document.querySelector<HTMLButtonElement>('[data-testid="open-model-btn"]')?.focus();
      });
    };
  }, []);
  useEffect(() => { if (activity.models) selectRef.current?.focus(); }, [activity.models]);
  return (
    <dialog ref={dialogRef} className="model-archive-dialog" aria-labelledby="archive-title"
      data-testid="archive-dialog" onCancel={event => { event.preventDefault(); onCancel(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('select, button:not(:disabled)'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <h2 id="archive-title">{activity.models ? 'Choose a model' : 'Opening ZIP'}</h2>
      <p className="archive-name" title={activity.name}>{activity.name}</p>
      {activity.models ? (
        <div>
          <label htmlFor="archive-model-choice">Model</label>
          <select id="archive-model-choice" ref={selectRef} value={selected} onChange={event => setSelected(event.target.value)}>
            <option value="" disabled>Select a model…</option>
            {activity.models.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      ) : (
        <div role="status">
          <progress aria-label="Reading archive" max={activity.total || 1} value={activity.total ? activity.completed : undefined} />
          <p>{activity.total ? `${activity.completed} / ${activity.total} files` : 'Reading files…'}</p>
        </div>
      )}
      <footer>
        <button type="button" onClick={onCancel}>Cancel</button>
        {activity.models && <button type="button" className="archive-open" disabled={!selected} onClick={() => onChoose(selected)}>Open model</button>}
      </footer>
    </dialog>
  );
}
