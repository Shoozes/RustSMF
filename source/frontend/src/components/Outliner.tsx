import React from 'react';
import type { ModelObjectReorderDirection } from '../utils/modelAuthoring';
import type { ModelTransformPatch } from '../utils/modelSurfaceAuthoring';
import type { ModelOutlinerItem } from '../utils/modelOutliner';
import TextureThumbnail from './TextureThumbnail';

interface OutlinerProps {
  title?: string;
  clipsCount: number;
  items: ModelOutlinerItem[];
  selectedItemIds: string[];
  onSelectScene: () => void;
  onSelectItem: (id: string, options?: { additive?: boolean; toggle?: boolean }) => void;
  onToggleVisibility: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRenameSelected: (name: string) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onMoveSelected: (direction: ModelObjectReorderDirection) => void;
  objectEditingEnabled: boolean;
  objectEditingDisabledReason?: string;
  canMoveSelectedEarlier: boolean;
  canMoveSelectedLater: boolean;
  onHideSelected: () => void;
  onHideUnselected: () => void;
  onUnhideAll: () => void;
  onTransformSelected: (patch: ModelTransformPatch) => void;
  onAssignMaterial: (name: string) => void;
  onFlipWinding: () => void;
  onPrepareGeometry: () => void;
  onAppendStaticModel: (file: File) => void;
}

const getKindLabel = (kind: ModelOutlinerItem['kind']): string => {
  if (kind === 'skinnedMesh') return 'Skinned';
  if (kind === 'mesh') return 'Mesh';
  return 'Group';
};

const Outliner: React.FC<OutlinerProps> = ({
  title = 'Outliner',
  clipsCount,
  items,
  selectedItemIds,
  onSelectScene,
  onSelectItem,
  onToggleVisibility,
  onSelectAll,
  onClearSelection,
  onRenameSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onMoveSelected,
  objectEditingEnabled,
  objectEditingDisabledReason,
  canMoveSelectedEarlier,
  canMoveSelectedLater,
  onHideSelected,
  onHideUnselected,
  onUnhideAll,
  onTransformSelected,
  onAssignMaterial,
  onFlipWinding,
  onPrepareGeometry,
  onAppendStaticModel,
}) => {
  const meshCount = items.filter((item) => item.kind !== 'group').length;
  const selectedSet = new Set(selectedItemIds);
  const selectedCount = selectedItemIds.length;
  const hasItems = items.length > 0;
  const hasSelection = selectedCount > 0;
  const selectedItem = selectedCount === 1
    ? items.find((item) => item.id === selectedItemIds[0]) ?? null
    : null;
  const [renameValue, setRenameValue] = React.useState('');
  const [positionValue, setPositionValue] = React.useState<[string, string, string]>(['0', '0', '0']);
  const [scaleValue, setScaleValue] = React.useState('1');
  const [materialValue, setMaterialValue] = React.useState('');

  React.useEffect(() => {
    setRenameValue(selectedItem?.name ?? '');
    setPositionValue(selectedItem
      ? selectedItem.position.map((value) => String(Number(value.toFixed(4)))) as [string, string, string]
      : ['0', '0', '0']);
    setScaleValue(selectedItem ? String(Number(selectedItem.scale[0].toFixed(4))) : '1');
    setMaterialValue(selectedItem?.materialNames[0] ?? '');
  }, [selectedItem]);

  return (
    <div data-testid="outliner" className="sidebar">
      <div className="panel-title">{title}</div>
      <div className="outliner-root-row">
        <button
          type="button"
          className="outliner-scene-btn"
          data-testid="outliner-scene-root"
          onClick={onSelectScene}
        >
          Scene Root
        </button>
        <span className="outliner-count" data-testid="outliner-submodel-count">
          {meshCount} mesh{meshCount === 1 ? '' : 'es'}
        </span>
      </div>
      {clipsCount > 0 && (
        <div className="outliner-meta">+ {clipsCount} Animation Clips</div>
      )}
      {hasItems && (
        <div className="outliner-actions" aria-label="Outliner selection actions">
          <button type="button" data-testid="outliner-select-all-btn" onClick={onSelectAll}>
            All
          </button>
          <button type="button" data-testid="outliner-clear-selection-btn" onClick={onClearSelection} disabled={!hasSelection}>
            Clear
          </button>
          <button type="button" data-testid="outliner-hide-selected-btn" onClick={onHideSelected} disabled={!hasSelection}>
            Hide sel
          </button>
          <button type="button" data-testid="outliner-hide-unselected-btn" onClick={onHideUnselected} disabled={!hasSelection}>
            Hide other
          </button>
          <button type="button" data-testid="outliner-unhide-all-btn" onClick={onUnhideAll}>
            Show all
          </button>
          <span data-testid="outliner-selection-count">{selectedCount} selected</span>
        </div>
      )}
      <label className="outliner-append-action" data-testid="outliner-append-static">
        Append static
        <input
          type="file"
          accept=".glb,.gltf,.obj,.fbx"
          className="hidden"
          disabled={!objectEditingEnabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onAppendStaticModel(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {selectedItem && (
        <form
          className="outliner-rename-form"
          data-testid="outliner-rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            onRenameSelected(renameValue);
          }}
        >
          <label htmlFor="outliner-rename-input">Rename selected</label>
          <input
            id="outliner-rename-input"
            data-testid="outliner-rename-input"
            value={renameValue}
            maxLength={128}
            disabled={!objectEditingEnabled}
            aria-describedby={objectEditingDisabledReason ? 'outliner-editing-disabled-reason' : undefined}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
          />
          <button
            type="submit"
            data-testid="outliner-rename-btn"
            disabled={!objectEditingEnabled || !renameValue.trim() || renameValue.trim() === selectedItem.name}
            title={objectEditingDisabledReason}
          >
            Rename
          </button>
          {objectEditingDisabledReason && (
            <span id="outliner-editing-disabled-reason" className="outliner-rename-note">
              {objectEditingDisabledReason}
            </span>
          )}
        </form>
      )}
      {selectedItem && (
        <div className="outliner-order-actions" aria-label="Selected submodel order">
          <button
            type="button"
            data-testid="outliner-duplicate-btn"
            disabled={!objectEditingEnabled}
            title={objectEditingDisabledReason ?? 'Duplicate selected static submodel'}
            onClick={onDuplicateSelected}
          >
            Duplicate
          </button>
          <button
            type="button"
            data-testid="outliner-delete-btn"
            disabled={!objectEditingEnabled}
            title={objectEditingDisabledReason ?? 'Delete selected static submodel'}
            onClick={onDeleteSelected}
          >
            Delete
          </button>
          <button
            type="button"
            data-testid="outliner-move-earlier-btn"
            disabled={!objectEditingEnabled || !canMoveSelectedEarlier}
            title={objectEditingDisabledReason ?? 'Move earlier among siblings'}
            onClick={() => onMoveSelected('earlier')}
          >
            Move up
          </button>
          <button
            type="button"
            data-testid="outliner-move-later-btn"
            disabled={!objectEditingEnabled || !canMoveSelectedLater}
            title={objectEditingDisabledReason ?? 'Move later among siblings'}
            onClick={() => onMoveSelected('later')}
          >
            Move down
          </button>
        </div>
      )}
      {selectedItem && (
        <div className="outliner-surface-actions" data-testid="outliner-surface-actions">
          <div className="outliner-rename-note">Static model authoring</div>
          <div className="grid grid-cols-3 gap-1">
            {positionValue.map((value, index) => (
              <input
                key={index}
                type="number"
                step="0.01"
                value={value}
                disabled={!objectEditingEnabled}
                aria-label={`Position ${['X', 'Y', 'Z'][index]}`}
                data-testid={`outliner-position-${index}`}
                onChange={(event) => {
                  const next = [...positionValue] as [string, string, string];
                  next[index] = event.target.value;
                  setPositionValue(next);
                }}
                onBlur={() => onTransformSelected({ position: positionValue.map((item) => Number(item)) as [number, number, number] })}
              />
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            <input
              type="number"
              step="0.01"
              value={scaleValue}
              disabled={!objectEditingEnabled}
              aria-label="Uniform scale"
              data-testid="outliner-scale-input"
              onChange={(event) => setScaleValue(event.target.value)}
              onBlur={() => {
                const value = Number(scaleValue);
                onTransformSelected({ scale: [value, value, value] });
              }}
            />
            <input
              value={materialValue}
              disabled={!objectEditingEnabled}
              aria-label="Material name"
              placeholder="Material name"
              data-testid="outliner-material-input"
              onChange={(event) => setMaterialValue(event.target.value)}
            />
            <button type="button" disabled={!objectEditingEnabled || !materialValue.trim()} data-testid="outliner-material-btn" onClick={() => onAssignMaterial(materialValue)}>Material</button>
          </div>
          <div className="flex gap-1 mt-1">
            <button type="button" disabled={!objectEditingEnabled} data-testid="outliner-flip-winding-btn" onClick={onFlipWinding}>Flip winding</button>
            <button type="button" disabled={!objectEditingEnabled} data-testid="outliner-prepare-geometry-btn" onClick={onPrepareGeometry}>Normals/tangents</button>
          </div>
        </div>
      )}
      <div className="outliner-list" data-testid="outliner-submodel-list">
        {items.length === 0 ? (
          <div className="outliner-empty">No model loaded</div>
        ) : (
          items.map((item, index) => {
            const selected = selectedSet.has(item.id);
            return (
              <div
                key={item.id}
                className={`outliner-item ${selected ? 'outliner-item-selected' : ''} ${item.visible ? '' : 'outliner-item-hidden'}`}
                data-testid={`outliner-submodel-${index}`}
                data-kind={item.kind}
                data-selected={selected ? 'true' : 'false'}
                data-visible={item.visible ? 'true' : 'false'}
                style={{ paddingLeft: `${6 + item.depth * 12}px` }}
              >
                <button
                  type="button"
                  className="outliner-name-btn"
                  onClick={(event) => onSelectItem(item.id, {
                    additive: event.shiftKey,
                    toggle: event.ctrlKey || event.metaKey,
                  })}
                  title={`${getKindLabel(item.kind)}: ${item.name}`}
                >
                  <TextureThumbnail
                    color={item.color ?? '#64748b'}
                    texture={item.texture}
                  />
                  <span className="outliner-name">{item.name}</span>
                  <span className="outliner-kind">{getKindLabel(item.kind)}</span>
                </button>
                <div className="outliner-metrics">
                  {item.vertexCount > 0 && <span>{item.vertexCount}v</span>}
                  {item.materialCount > 0 && <span>{item.materialCount}m</span>}
                </div>
                <button
                  type="button"
                  className="outliner-visibility-btn"
                  data-testid={`outliner-visibility-toggle-${index}`}
                  aria-pressed={item.visible}
                  aria-label={`${item.visible ? 'Hide' : 'Show'} ${item.name}`}
                  onClick={() => onToggleVisibility(item.id)}
                  title={item.visible ? 'Hide submodel' : 'Show submodel'}
                >
                  {item.visible ? 'On' : 'Off'}
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="y-up-note mt-2">
        Y-up (Three). SMF Z-up + DQ converted via loaders/coord.ts
      </div>
    </div>
  );
};

export default Outliner;
