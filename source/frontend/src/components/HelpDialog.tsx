import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { version } from '../../package.json';
import { IS_WEB_EDITION } from '../webEdition';

interface HelpDialogProps { open: boolean; status: string; classic: boolean; onDismiss: () => void; onClosed: () => void }

export default function HelpDialog({ open, status, classic, onDismiss, onClosed }: HelpDialogProps) {
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
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, summary, a[href], [tabindex="0"]'))
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
      <p className="preview-help-version">{version} {IS_WEB_EDITION ? 'Web Edition' : 'preview'} · MIT</p>
      <dl>
        <dt>Open</dt><dd>Open or drop a model. Select related files together. Drag to orbit; right-drag to pan; scroll to zoom.</dd>
        <dt>Edit</dt><dd>{classic ? 'Choose a workspace from the tabs.' : 'Choose a workspace, then open Tools.'} Use Undo or Redo to revise edits.</dd>
        <dt>Save Project</dt><dd>{IS_WEB_EDITION
          ? 'Download an .rsproj before closing the tab. Use Open Project to continue.'
          : 'Save your work as .rsproj. Use Open Project to continue.'}</dd>
        {IS_WEB_EDITION && <><dt>Theme</dt><dd>{classic
          ? 'Choose Modern under Theme to switch layouts.'
          : 'Choose Classic (Original SMF) under Theme in More.'}</dd></>}
        <dt>Export</dt><dd>Export keeps SMF, FBX or DAE sources in that format; otherwise GLB. {classic
          ? 'Use the format buttons to choose a different format.'
          : 'More selects a format.'}</dd>
        <dt>Format limits</dt><dd>GLB embeds textures. DAE keeps texture files separate. SMF cannot store scale animation. Unsupported exports show an error.</dd>
      </dl>
      <p className="preview-help-shortcuts"><kbd>Ctrl Z</kbd> Undo · <kbd>Ctrl Y</kbd> Redo · <kbd>Esc</kbd> Close</p>
      <details data-testid="help-status-details"><summary>Last action details</summary><p>{status}</p></details>
      <p className="preview-help-license">Project code: MIT, copyright 2026 Shoozes. {IS_WEB_EDITION
        ? <a href={`${import.meta.env.BASE_URL}licenses/THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noopener">Third-party licenses</a>
        : 'Third-party terms are in the included notices.'}</p>
    </dialog>
  );
}
