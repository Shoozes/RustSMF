import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_RETARGET_PROFILE_BYTES, parseRetargetProfile, type RetargetProfile } from '../utils/retargetProfile';
import { ArrowsLeftRight, FloppyDisk, FolderOpen } from '@phosphor-icons/react';
import { PanelAction, PanelFileAction } from './WorkspaceTasks';
import { useWorkspaceTask } from './workspaceTaskContext';

export interface RetargetProfileEditorState { draft: string; saved: string }

export default function RetargetProfileControls({ disabled, onRetarget, value, onChange }: {
  disabled: boolean;
  onRetarget: (files: readonly File[], profile: RetargetProfile) => void;
  value: RetargetProfileEditorState;
  onChange: (value: RetargetProfileEditorState) => void;
}) {
  const { draft, saved } = value;
  const task = useWorkspaceTask();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);
  const parsed = useMemo(() => {
    if (!draft.trim()) return { profile: null, error: '' };
    try { return { profile: parseRetargetProfile(draft), error: '' }; }
    catch (cause) { return { profile: null, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [draft]);
  async function importProfile(file: File) {
    const current = ++operation.current;
    setBusy(true); setError('');
    try {
      if (file.size > MAX_RETARGET_PROFILE_BYTES) throw new Error('Retarget profile exceeds 1 MiB.');
      const text = await file.text();
      const normalized = JSON.stringify(parseRetargetProfile(text), null, 2);
      if (current !== operation.current) return;
      onChange({ draft: normalized, saved: normalized });
    } catch (cause) {
      if (current === operation.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (current === operation.current) setBusy(false); }
  }
  async function exportProfile() {
    if (!parsed.profile) return;
    const current = ++operation.current, text = JSON.stringify(parsed.profile, null, 2);
    setBusy(true); setError('');
    try {
      const { saveFile } = await import('../backend-client/tauri');
      const ok = await saveFile(new TextEncoder().encode(`${text}\n`), 'retarget-profile.json');
      if (ok && current === operation.current) onChange({ draft: text, saved: text });
    } catch (cause) {
      if (current === operation.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (current === operation.current) setBusy(false); }
  }
  return <>
    {task && busy && <p role="status">Working with profile…</p>}
    {task && !profileOpen && (error || parsed.error) && <p role="alert">{error || parsed.error}</p>}
    <details data-testid="retarget-profile-controls" className={task ? 'workspace-task-details' : undefined} style={{ width: '100%' }} onToggle={event => setProfileOpen(event.currentTarget.open)}>
    <summary>{task ? 'Retarget profile' : 'Saved retarget profile'}{draft !== saved ? ' (edited)' : ''}</summary>
    <p>{task ? 'Import a profile, then choose source clips.' : 'Import a saved job or profile, then select source animation files. Profile paths are not opened.'}</p>
    <PanelFileAction icon={FolderOpen} label="Import profile" disabled={busy}><input type="file" accept=".json" disabled={busy} data-testid="retarget-profile-import"
      onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importProfile(file); }} /></PanelFileAction>
    {(!task || profileOpen) && (error || parsed.error) && <p role="alert">{error || parsed.error}</p>}
    <label style={{ display: 'block' }}>Profile JSON
      <textarea value={draft} rows={10} spellCheck={false} disabled={busy} data-testid="retarget-profile-json"
        style={{ width: '100%', fontFamily: 'monospace', color: 'var(--ui-text)', background: 'var(--ui-surface-inset)', padding: '0.5rem' }} onChange={(event) => { onChange({ ...value, draft: event.target.value }); setError(''); }} />
    </label>
    {draft !== saved && <p>Profile edits are not exported.</p>}
    <div className={task ? 'workspace-profile-actions' : undefined} style={task ? undefined : { display: 'contents' }}>
    <PanelAction icon={FloppyDisk} label="Export profile" type="button" disabled={busy || !parsed.profile} onClick={() => void exportProfile()} data-testid="retarget-profile-export">Export profile</PanelAction>
    <PanelFileAction icon={ArrowsLeftRight} label="Retarget with profile" disabled={disabled || busy || !parsed.profile} className="outliner-append-action">
      <input type="file" className="hidden" multiple accept=".fbx,.dae,.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2"
        disabled={disabled || busy || !parsed.profile} data-testid="retarget-profile-source"
        onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length && parsed.profile) onRetarget(files, parsed.profile); }} />
    </PanelFileAction>
    </div>
  </details></>;
}
