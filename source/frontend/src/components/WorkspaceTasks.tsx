import { useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import {
  ArrowsLeftRight, Bone, Cube, Eye, GearSix, Info, ListBullets, PaintBrush,
  Play, SlidersHorizontal, TreeStructure, type Icon,
} from '@phosphor-icons/react';
import { WorkspaceTaskContext as Context, useWorkspaceTask } from './workspaceTaskContext';

type Task = { id: string; label: string; icon: Icon };
const TASKS: Record<string, Task[]> = {
  view: [
    { id: 'objects', label: 'Objects', icon: ListBullets },
    { id: 'surface', label: 'Surface', icon: Cube },
    { id: 'details', label: 'Details', icon: Info },
  ],
  rig: [
    { id: 'pose', label: 'Pose', icon: Bone },
    { id: 'hierarchy', label: 'Hierarchy', icon: TreeStructure },
    { id: 'setup', label: 'Setup', icon: GearSix },
  ],
  skin: [
    { id: 'brush', label: 'Brush', icon: PaintBrush },
    { id: 'weights', label: 'Weights', icon: SlidersHorizontal },
    { id: 'display', label: 'Display', icon: Eye },
  ],
  animate: [
    { id: 'clips', label: 'Clips', icon: Play },
    { id: 'pose', label: 'Pose', icon: Bone },
    { id: 'transfer', label: 'Transfer', icon: ArrowsLeftRight },
  ],
};

export default function WorkspaceTasks({ mode, title, initialTask, children }: {
  mode: string; title: string; initialTask?: string; children: ReactNode;
}) {
  const tasks = TASKS[mode];
  const [active, setActive] = useState(initialTask ?? tasks?.[0]?.id ?? '');
  const navigation = useRef<HTMLDivElement>(null);
  const id = useId();
  if (!tasks) return <>{children}</>;
  const selected = tasks.find(task => task.id === active) ?? tasks[0];
  return (
    <Context.Provider value={{ mode, active: selected.id, taskIds: tasks.map(task => task.id), select: setActive }}>
      <div className="workspace-tasks" data-testid="workspace-tasks" data-workspace={mode}>
        <header className="workspace-task-heading">{title}</header>
        <div ref={navigation} className="workspace-task-tabs" role="tablist" aria-label={`${title} tasks`}>
          {tasks.map((task, index) => (
            <button
              key={task.id} type="button" role="tab" id={`${id}-${task.id}`}
              data-testid={`workspace-task-${task.id}`} aria-selected={selected.id === task.id}
              aria-controls={`${id}-content`} tabIndex={selected.id === task.id ? 0 : -1}
              onClick={() => setActive(task.id)}
              onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % tasks.length
                  : event.key === 'ArrowLeft' ? (index + tasks.length - 1) % tasks.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? tasks.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                setActive(tasks[next].id);
                navigation.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
              }}
            >
              <task.icon size={17} aria-hidden="true" /><span>{task.label}</span>
            </button>
          ))}
        </div>
        <div className="workspace-task-content" id={`${id}-content`} role="tabpanel" aria-labelledby={`${id}-${selected.id}`} tabIndex={0}>
          {children}
        </div>
      </div>
    </Context.Provider>
  );
}

export function TaskSection({ task, children }: { task: string | string[]; children: ReactNode }) {
  const context = useWorkspaceTask();
  const targets = typeof task === 'string' ? [task] : task;
  if (!context || !context.taskIds.some(item => targets.includes(item))) return <>{children}</>;
  return <div className="workspace-task-section" data-workspace-tasks={targets.join(' ')} hidden={!targets.includes(context.active)}>{children}</div>;
}

export function TaskDetails({ label = 'Details', children, initialOpen = false, detailsRef, hideClosed = false, onClose }: {
  label?: string; children: ReactNode; initialOpen?: boolean; detailsRef?: Ref<HTMLDetailsElement>;
  hideClosed?: boolean; onClose?: () => void;
}) {
  const context = useWorkspaceTask();
  const [open, setOpen] = useState(initialOpen);
  if (!context) return <>{children}</>;
  return <details ref={detailsRef} className={`workspace-task-details${hideClosed ? ' workspace-task-on-demand' : ''}`} open={open} onToggle={event => {
    const next = event.currentTarget.open;
    if (open && !next) onClose?.();
    setOpen(next);
  }}><summary>{label}</summary>{children}</details>;
}

export function PanelAction({ icon: ActionIcon, label, children, className = '', title, buttonRef, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: Icon; label: string; children?: ReactNode; buttonRef?: Ref<HTMLButtonElement> }) {
  const context = useWorkspaceTask();
  if (!context) return <button {...props} ref={buttonRef} className={className} title={title}>{children ?? label}</button>;
  const hint = title && title !== label ? `${label}: ${title}` : label;
  return (
    <button {...props} ref={buttonRef} type={props.type ?? 'button'} className={`${className} panel-icon-action`} aria-label={props['aria-label'] ?? label} title={hint}>
      <ActionIcon size={18} aria-hidden="true" />
      <span className="panel-action-caption">{children ?? label}</span>
    </button>
  );
}

export function PanelFileAction({ icon, label, children, disabled, className, title, 'data-testid': testId }: {
  icon: Icon; label: string; children: ReactNode; disabled?: boolean; className?: string;
  title?: string; 'data-testid'?: string;
}) {
  const context = useWorkspaceTask();
  const picker = useRef<HTMLDivElement>(null);
  if (!context) return <label className={className} title={title} data-testid={testId}>{label}{children}</label>;
  return <div ref={picker} className="workspace-file-action" data-testid={testId}>
    <PanelAction icon={icon} label={label} title={title} disabled={disabled} onClick={() => picker.current?.querySelector('input')?.click()} />
    <div hidden>{children}</div>
  </div>;
}
