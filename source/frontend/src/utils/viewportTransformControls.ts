import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export type ViewportTransformMode = 'translate' | 'rotate' | 'scale';

export interface ViewportTransformControlsController {
  readonly controls: TransformControls;
  readonly helper: THREE.Object3D;
  attach(target: THREE.Object3D): void;
  detach(): void;
  setEnabled(enabled: boolean): void;
  setMode(mode: ViewportTransformMode): void;
  dispose(): void;
}

interface ViewportTransformControlsOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  domElement: HTMLElement;
  mode: ViewportTransformMode;
  onChange: () => void;
  onDraggingChange: (dragging: boolean) => void;
  onAxisChange: () => void;
}

function readDraggingValue(event: unknown): boolean | null {
  if (typeof event !== 'object' || event === null) return null;
  const value = Reflect.get(event, 'value');
  return typeof value === 'boolean' ? value : null;
}

export function createViewportTransformControls({
  scene,
  camera,
  domElement,
  mode,
  onChange,
  onDraggingChange,
  onAxisChange,
}: ViewportTransformControlsOptions): ViewportTransformControlsController {
  const controls = new TransformControls(camera, domElement);
  const helper = controls.getHelper();
  const handleChange = (): void => onChange();
  const handleDraggingChange = (event: unknown): void => {
    const dragging = readDraggingValue(event);
    if (dragging !== null) onDraggingChange(dragging);
  };
  const handleAxisChange = (): void => onAxisChange();

  controls.setMode(mode);
  controls.addEventListener('change', handleChange);
  controls.addEventListener('dragging-changed', handleDraggingChange);
  controls.addEventListener('axis-changed', handleAxisChange);
  scene.add(helper);
  let disposed = false;

  return {
    controls,
    helper,
    attach: (target) => controls.attach(target),
    detach: () => controls.detach(),
    setEnabled: (enabled) => {
      controls.enabled = enabled;
    },
    setMode: (nextMode) => controls.setMode(nextMode),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      controls.detach();
      controls.removeEventListener('change', handleChange);
      controls.removeEventListener('dragging-changed', handleDraggingChange);
      controls.removeEventListener('axis-changed', handleAxisChange);
      scene.remove(helper);
      controls.dispose();
    },
  };
}
