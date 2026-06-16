import React from 'react';

interface ToolbarProps {
  onOpen: () => void;
  onExport: () => void;
  onExportSmf: () => void;
  onPing: () => void;
  isLoading: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  editorMode: 'view' | 'rig' | 'skin' | 'animate' | 'export';
  setEditorMode: (mode: 'view' | 'rig' | 'skin' | 'animate' | 'export') => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onOpen,
  onExport,
  onExportSmf,
  onPing,
  isLoading,
  onFileChange,
  editorMode,
  setEditorMode,
}) => {
  return (
    <div className="toolbar">
      <div className="font-semibold tracking-wide">RustSMF</div>
      <button data-testid="open-model-btn" onClick={onOpen} disabled={isLoading}>
        Open Model
      </button>
      <button data-testid="export-btn" onClick={onExport} disabled={isLoading}>
        Export
      </button>
      <button data-testid="export-smf-btn" onClick={onExportSmf} disabled={isLoading}>
        Export as SMF
      </button>
      <button data-testid="ping-rust-btn" onClick={onPing} disabled={isLoading}>
        Ping Rust
      </button>
      {/* Basic editor mode toggle (small step for #1 modern workspaces; data + UI, future modes will affect viz/tools) */}
      <select
        data-testid="editor-mode-select"
        value={editorMode}
        onChange={(e) => setEditorMode(e.target.value as any)}
        disabled={isLoading}
        className="text-xs bg-slate-800 border border-slate-700 px-1 py-0.5 rounded"
        title="Editor mode (foundation for quad/mode-specific tools)"
      >
        <option value="view">View</option>
        <option value="rig">Rig</option>
        <option value="skin">Skin</option>
        <option value="animate">Animate</option>
        <option value="export">Export</option>
      </select>
      {/* Persistent hidden file input for reliable e2e file simulation (Playwright setInputFiles) */}
      <input
        type="file"
        data-testid="model-file-input"
        style={{ display: 'none' }}
        accept=".smf,.glb,.gltf,.fbx,.obj"
        onChange={onFileChange}
      />
      <div className="text-xs text-slate-400 ml-auto pr-2">
        Drag rotate • Right-drag pan • Wheel zoom • R reset • Space play/pause
      </div>
    </div>
  );
};

export default Toolbar;
