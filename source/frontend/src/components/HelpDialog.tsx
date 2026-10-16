import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { version } from '../../package.json';

interface HelpDialogProps { open: boolean; status: string; onDismiss: () => void; onClosed: () => void }

export default function HelpDialog({ open, status, onDismiss, onClosed }: HelpDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);
  return (
    <dialog ref={ref} className="preview-help" data-testid="help-dialog" aria-labelledby="help-title"
      onCancel={event => { event.preventDefault(); onDismiss(); }} onClose={onClosed}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]'))
          .filter(control => control.getClientRects().length > 0 && !control.matches(':disabled'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
      }}>
      <header>
        <h2 id="help-title">RustSMF Help</h2>
        <button type="button" aria-label="Close Help" data-testid="help-close" onClick={onDismiss}><X size={18} aria-hidden="true" /></button>
      </header>
      <p className="preview-help-version">{version} preview · MIT</p>
      <dl>
        <dt>Open</dt><dd>Open or drop a model. Select related files together. Drag to orbit; right-drag to pan; scroll to zoom.</dd>
        <dt>Edit</dt><dd>Choose a workspace, then open Tools. Use Undo or Redo to revise edits.</dd>
        <dt>Save Project</dt><dd>Save your work as .rsproj. Use Open Project to continue.</dd>
        <dt>Export</dt><dd>Export keeps SMF, FBX or DAE sources in that format; otherwise GLB. More selects a format.</dd>
        <dt>Format limits</dt><dd>GLB embeds textures. DAE keeps texture files separate. SMF cannot store scale animation. Unsupported exports show an error.</dd>
      </dl>
      <p className="preview-help-shortcuts"><kbd>Ctrl Z</kbd> Undo · <kbd>Ctrl Y</kbd> Redo · <kbd>Esc</kbd> Close</p>
      <details data-testid="help-status-details"><summary>Last action details</summary><p>{status}</p></details>
      <p className="preview-help-license">Project code: MIT, copyright 2026 Shoozes. Third-party terms are in the included notices.</p>
    </dialog>
  );
}
