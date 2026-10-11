import React, { useEffect, useRef } from 'react';
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  DotsThreeVertical,
  Export as ExportIcon,
  FloppyDisk,
  FolderOpen,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import { isEditorMode, type EditorMode } from '../store';
import {
  APP_THEMES,
  isAppThemeId,
  type AppThemeDefinition,
  type AppThemeId,
} from '../theme';
import { SUPPORTED_MODEL_RESOURCE_ACCEPT } from '../utils/modelFormat';
import ViewportControls, { type ViewportControlsProps } from './ViewportControls';

interface ToolbarProps extends Omit<ViewportControlsProps, 'variant'> {
  onOpen: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onRecoverProject: () => void;
  onExport: () => void;
  onExportGlb: () => void;
  onExportFbx: () => void;
  onExportDae: () => void;
  onExportSmf: () => void;
  smfExportEnabled: boolean;
  onPing: () => void;
  onUndo: () => void;
  onRedo: () => void;
  undoAvailable: boolean;
  redoAvailable: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  theme: AppThemeDefinition;
  themeId: AppThemeId;
  setThemeId: (themeId: AppThemeId) => void;
  onOpenTools: (trigger: HTMLButtonElement) => void;
  onOpenHelp: (trigger: HTMLElement) => void;
  toolsOpen: boolean;
}

const MODES: EditorMode[] = ['view', 'rig', 'skin', 'animate', 'export'];

interface WorkspaceTabsProps {
  editorMode: EditorMode;
  isLoading: boolean;
  labels: AppThemeDefinition['workspaceLabels'];
  setEditorMode: (mode: EditorMode) => void;
}

const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({ editorMode, isLoading, labels, setEditorMode }) => (
  <div className="toolbar-workspace">
    <div role="tablist" aria-label="Editor workspace mode" className="mode-tablist">
      {MODES.map((mode) => {
        const selected = editorMode === mode;
        return (
          <button
            key={mode}
            role="tab"
            aria-selected={selected}
            data-testid={`mode-tab-${mode}`}
            className={`mode-tab ${selected ? 'mode-tab-active' : ''}`}
            onClick={() => setEditorMode(mode)}
            disabled={isLoading}
            type="button"
          >
            {labels[mode]}
          </button>
        );
      })}
    </div>
  </div>
);

const HiddenWorkspaceSelect: React.FC<WorkspaceTabsProps> = ({ editorMode, isLoading, labels, setEditorMode }) => (
  <select
    data-testid="editor-mode-select"
    value={editorMode}
    onChange={(event) => {
      if (isEditorMode(event.target.value)) setEditorMode(event.target.value);
    }}
    disabled={isLoading}
    className="sr-only"
    tabIndex={-1}
    title="Editor mode (foundation for quad/mode-specific tools)"
  >
    {MODES.map((mode) => <option key={mode} value={mode}>{labels[mode]}</option>)}
  </select>
);

interface ThemeSwitcherProps {
  theme: AppThemeDefinition;
  themeId: AppThemeId;
  setThemeId: (themeId: AppThemeId) => void;
}

const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ theme, themeId, setThemeId }) => (
  <label className="theme-switcher">
    <span className="theme-switcher-label">Theme</span>
    <select
      data-testid="theme-select"
      className="theme-select"
      value={themeId}
      onChange={(event) => {
        if (isAppThemeId(event.target.value)) setThemeId(event.target.value);
      }}
      aria-describedby="appearance-theme-description"
      title={theme.description}
    >
      {APP_THEMES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    <span id="appearance-theme-description" data-testid="theme-description" className="sr-only">
      {theme.description}
    </span>
  </label>
);

const SecondaryCommands: React.FC<Pick<ToolbarProps,
  'onOpenProject' | 'onRecoverProject' | 'onExportGlb' | 'onExportFbx' | 'onExportDae' | 'onExportSmf' | 'smfExportEnabled' | 'onPing' | 'isLoading'
>> = ({ onOpenProject, onRecoverProject, onExportGlb, onExportFbx, onExportDae, onExportSmf, smfExportEnabled, onPing, isLoading }) => (
  <div className="modern-command-menu-grid">
    <button className="toolbar-action" data-testid="open-project-btn" onClick={onOpenProject} disabled={isLoading}>Open Project</button>
    <button className="toolbar-action" data-testid="recover-project-btn" onClick={onRecoverProject} disabled={isLoading}>Recover</button>
    <button className="toolbar-action" data-testid="export-glb-btn" onClick={onExportGlb} disabled={isLoading}>Export GLB</button>
    <button className="toolbar-action" data-testid="export-fbx-btn" onClick={onExportFbx} disabled={isLoading}>Export FBX</button>
    <button className="toolbar-action" data-testid="export-dae-btn" onClick={onExportDae} disabled={isLoading}>Export DAE</button>
    <button
      className="toolbar-action"
      data-testid="export-smf-btn"
      onClick={onExportSmf}
      disabled={isLoading || !smfExportEnabled}
      title={smfExportEnabled ? 'Export as SMF' : 'SMF export is blocked by the current compatibility diagnostics'}
    >
      Export SMF
    </button>
    <button className="toolbar-action toolbar-action-muted" data-testid="ping-rust-btn" onClick={onPing} disabled={isLoading}>Backend status</button>
  </div>
);

const ModernToolbar: React.FC<ToolbarProps> = (props) => {
  const headerRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDetailsElement>(null);
  const closeSiblingMenus = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const opened = event.currentTarget;
    if (!opened.open) return;
    headerRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu => {
      if (menu !== opened) menu.open = false;
    });
  };
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      headerRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((menu) => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      headerRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((menu) => {
        menu.open = false;
        menu.querySelector('summary')?.focus();
        event.preventDefault();
      });
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  const {
    onOpen,
    onSaveProject,
    onExport,
    onUndo,
    onRedo,
    undoAvailable,
    redoAvailable,
    isLoading,
    hasModel,
    editorMode,
    setEditorMode,
    theme,
    themeId,
    setThemeId,
    onOpenTools,
    toolsOpen,
  } = props;
  return (
    <header ref={headerRef} className="toolbar modern-toolbar">
      <div className="modern-appbar">
        <div className="toolbar-brand">{theme.chromeLabel}</div>
        <div className="toolbar-action-group modern-primary-actions" aria-label="Primary file actions">
          <button className="toolbar-action" data-testid="open-model-btn" onClick={onOpen} disabled={isLoading} aria-label="Open asset" title="Open asset">
            <FolderOpen size={18} aria-hidden="true" />
          </button>
          <button className="toolbar-action toolbar-action-muted" data-testid="save-project-btn" onClick={onSaveProject} disabled={isLoading || !hasModel} aria-label="Save project" title="Save project">
            <FloppyDisk size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="toolbar-action-group modern-history-actions" aria-label="Editor history">
          <button className="toolbar-action toolbar-action-muted" data-testid="editor-undo-btn" onClick={onUndo} disabled={isLoading || !undoAvailable} title="Undo editor transaction" aria-label="Undo" type="button">
            <ArrowUUpLeft size={18} aria-hidden="true" />
          </button>
          <button className="toolbar-action toolbar-action-muted" data-testid="editor-redo-btn" onClick={onRedo} disabled={isLoading || !redoAvailable} title="Redo editor transaction" aria-label="Redo" type="button">
            <ArrowUUpRight size={18} aria-hidden="true" />
          </button>
        </div>
        <details ref={workspaceRef} className="toolbar-menu modern-workspace-menu" onToggle={closeSiblingMenus}>
          <summary className="toolbar-menu-summary" data-testid="modern-workspace-button" aria-label={`Workspace: ${theme.workspaceLabels[editorMode]}`}>
            <span>{theme.workspaceLabels[editorMode]}</span><CaretDown size={12} aria-hidden="true" />
          </summary>
          <div className="toolbar-menu-panel modern-workspace-menu-panel">
            <WorkspaceTabs editorMode={editorMode} isLoading={isLoading} labels={theme.workspaceLabels} setEditorMode={(mode) => {
              setEditorMode(mode);
              if (workspaceRef.current) {
                workspaceRef.current.open = false;
                workspaceRef.current.querySelector('summary')?.focus();
              }
            }} />
          </div>
        </details>
        <button className="toolbar-action modern-tools-action" data-testid={editorMode === 'skin' ? 'modern-skin-advanced' : 'modern-tools-button'} onClick={(event) => onOpenTools(event.currentTarget)} disabled={isLoading || !hasModel} aria-label="Tools" title={`${theme.workspaceLabels[editorMode]} tools`} aria-pressed={toolsOpen}>
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button>
        <button className="toolbar-action modern-export-action" data-testid="export-btn" onClick={onExport} disabled={isLoading || !hasModel} title="Export asset" aria-label="Export asset">
          <ExportIcon size={18} aria-hidden="true" />
        </button>
        <details className="toolbar-menu modern-command-menu" onToggle={closeSiblingMenus}>
          <summary className="toolbar-menu-summary" data-testid="modern-more-menu-button" aria-label="More commands">
            <DotsThreeVertical size={20} aria-hidden="true" />
          </summary>
          <div className="toolbar-menu-panel modern-command-menu-panel" data-testid="modern-more-menu-panel">
            <button className="toolbar-action modern-mobile-redo" data-testid="modern-menu-redo" onClick={onRedo} disabled={isLoading || !redoAvailable} type="button">Redo</button>
            <SecondaryCommands {...props} />
            <ThemeSwitcher theme={theme} themeId={themeId} setThemeId={setThemeId} />
            <button type="button" className="toolbar-action" data-testid="help-open" onClick={event => {
              const menu = event.currentTarget.closest('details');
              const trigger = menu?.querySelector('summary') ?? event.currentTarget;
              if (menu) menu.open = false;
              props.onOpenHelp(trigger);
            }}>Help</button>
          </div>
        </details>
      </div>
      <HiddenWorkspaceSelect editorMode={editorMode} isLoading={isLoading} labels={theme.workspaceLabels} setEditorMode={setEditorMode} />
    </header>
  );
};

const OriginalToolbar: React.FC<ToolbarProps> = (props) => {
  const {
    onOpen,
    onOpenProject,
    onSaveProject,
    onRecoverProject,
    onExport,
    onExportGlb,
    onExportFbx,
    onExportDae,
    onExportSmf,
    smfExportEnabled,
    onPing,
    onUndo,
    onRedo,
    undoAvailable,
    redoAvailable,
    isLoading,
    hasModel,
    editorMode,
    setEditorMode,
    theme,
    themeId,
    setThemeId,
  } = props;
  return (
    <div className="toolbar original-toolbar">
      <div className="toolbar-primary">
        <div className="toolbar-brand">{theme.chromeLabel}</div>
        <div className="toolbar-action-group toolbar-file-actions" aria-label="File actions">
          <button className="toolbar-action" data-testid="open-model-btn" onClick={onOpen} disabled={isLoading}>Open Asset</button>
          <button className="toolbar-action toolbar-action-muted" data-testid="open-project-btn" onClick={onOpenProject} disabled={isLoading}>Open Project</button>
          <button className="toolbar-action toolbar-action-muted" data-testid="save-project-btn" onClick={onSaveProject} disabled={isLoading || !hasModel}>Save Project</button>
          <button className="toolbar-action toolbar-action-muted" data-testid="recover-project-btn" onClick={onRecoverProject} disabled={isLoading}>Recover</button>
          <button className="toolbar-action" data-testid="export-btn" onClick={onExport} disabled={isLoading}>Export Asset</button>
          <button className="toolbar-action" data-testid="export-glb-btn" onClick={onExportGlb} disabled={isLoading}>GLB</button>
          <button className="toolbar-action" data-testid="export-fbx-btn" onClick={onExportFbx} disabled={isLoading}>FBX</button>
          <button className="toolbar-action" data-testid="export-dae-btn" onClick={onExportDae} disabled={isLoading}>DAE</button>
          <button className="toolbar-action" data-testid="export-smf-btn" onClick={onExportSmf} disabled={isLoading || !smfExportEnabled}>SMF</button>
          <button className="toolbar-action toolbar-action-muted" data-testid="ping-rust-btn" onClick={onPing} disabled={isLoading}>Ping</button>
        </div>
        <div className="toolbar-action-group toolbar-history-actions" aria-label="Editor history">
          <button className="toolbar-action toolbar-action-muted" data-testid="editor-undo-btn" onClick={onUndo} disabled={isLoading || !undoAvailable} type="button">Undo</button>
          <button className="toolbar-action toolbar-action-muted" data-testid="editor-redo-btn" onClick={onRedo} disabled={isLoading || !redoAvailable} type="button">Redo</button>
        </div>
      </div>
      <WorkspaceTabs editorMode={editorMode} isLoading={isLoading} labels={theme.workspaceLabels} setEditorMode={setEditorMode} />
      <HiddenWorkspaceSelect editorMode={editorMode} isLoading={isLoading} labels={theme.workspaceLabels} setEditorMode={setEditorMode} />
      <ViewportControls {...props} variant="toolbar" />
      <ThemeSwitcher theme={theme} themeId={themeId} setThemeId={setThemeId} />
    </div>
  );
};

const Toolbar: React.FC<ToolbarProps> = (props) => (
  <>
    {props.theme.shellVariant === 'modern' ? <ModernToolbar {...props} /> : <OriginalToolbar {...props} />}
    <input
      type="file"
      data-testid="model-file-input"
      style={{ display: 'none' }}
      accept={SUPPORTED_MODEL_RESOURCE_ACCEPT}
      multiple
      onChange={props.onFileChange}
    />
  </>
);

export default Toolbar;
