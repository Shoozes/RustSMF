import * as THREE from 'three';
import {
  getAppTheme,
  type AppThemeId,
  type ViewportGridMode,
} from '../theme';
import { disposeThreeObject } from './threeDisposal';
import type { ViewportRole } from './viewportLayout';

export interface ThemeViewportGrids {
  floor: THREE.GridHelper;
  front: THREE.GridHelper;
  side: THREE.GridHelper;
}

const createThemeGrid = (themeId: AppThemeId): THREE.GridHelper => {
  const { viewportGrid } = getAppTheme(themeId);
  return new THREE.GridHelper(
    viewportGrid.size,
    viewportGrid.divisions,
    viewportGrid.centerLine,
    viewportGrid.line,
  );
};

export function createThemeViewportGrids(themeId: AppThemeId): ThemeViewportGrids {
  const floor = createThemeGrid(themeId);
  floor.position.y = 0.001;
  const front = createThemeGrid(themeId);
  front.rotation.x = Math.PI / 2;
  front.position.z = -0.001;
  const side = createThemeGrid(themeId);
  side.rotation.z = Math.PI / 2;
  side.position.x = 0.001;
  return { floor, front, side };
}

export function updateThemeViewportGridVisibility(
  grids: ThemeViewportGrids,
  enabled: boolean,
  mode: ViewportGridMode,
  role: ViewportRole,
): void {
  const cameraPlanes = mode === 'camera-planes';
  grids.floor.visible = enabled && (
    !cameraPlanes || role === 'top' || role === 'perspective'
  );
  grids.front.visible = enabled && cameraPlanes && role === 'front';
  grids.side.visible = enabled && cameraPlanes && role === 'side';
}

export function disposeThemeViewportGrids(
  scene: THREE.Scene,
  grids: ThemeViewportGrids | null,
): void {
  if (!grids) return;
  scene.remove(grids.floor, grids.front, grids.side);
  disposeThreeObject(grids.floor);
  disposeThreeObject(grids.front);
  disposeThreeObject(grids.side);
}
