import * as THREE from 'three';
import { getSkinnedVertexWorldPosition } from './skinnedVertexPosition';

export interface SkinBrushVertexRef {
  meshId: string;
  vertexIndex: number;
  localPosition: [number, number, number];
  skinnedWorldPosition?: [number, number, number];
}

export interface SkinBrushIndex {
  meshId: string;
  cellSize: number;
  vertexCount: number;
  valid: boolean;
  failureReason?: string;
  cells: Map<string, SkinBrushVertexRef[]>;
}

const cellCoord = (value: number, cellSize: number): number => Math.floor(value / cellSize);

const cellKey = (x: number, y: number, z: number, cellSize: number): string => {
  return `${cellCoord(x, cellSize)}:${cellCoord(y, cellSize)}:${cellCoord(z, cellSize)}`;
};

export function buildSkinBrushIndex(
  mesh: THREE.SkinnedMesh,
  cellSize: number,
): SkinBrushIndex {
  const position = mesh.geometry.getAttribute('position');
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 0.1;
  const cells = new Map<string, SkinBrushVertexRef[]>();

  if (!position || position.itemSize < 3) {
    return { meshId: mesh.uuid, cellSize: safeCellSize, vertexCount: 0, valid: false, failureReason: 'missing-position', cells };
  }

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    const x = position.getX(vertexIndex);
    const y = position.getY(vertexIndex);
    const z = position.getZ(vertexIndex);
    const key = cellKey(x, y, z, safeCellSize);
    const bucket = cells.get(key) ?? [];
    bucket.push({
      meshId: mesh.uuid,
      vertexIndex,
      localPosition: [x, y, z],
    });
    cells.set(key, bucket);
  }

  return { meshId: mesh.uuid, cellSize: safeCellSize, vertexCount: position.count, valid: true, cells };
}

export function buildSkinnedWorldBrushIndex(
  mesh: THREE.SkinnedMesh,
  cellSize: number,
): SkinBrushIndex {
  const position = mesh.geometry.getAttribute('position');
  const safeCellSize = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 0.1;
  const cells = new Map<string, SkinBrushVertexRef[]>();

  if (!position || position.itemSize < 3) {
    return { meshId: mesh.uuid, cellSize: safeCellSize, vertexCount: 0, valid: false, failureReason: 'missing-position', cells };
  }

  if (!mesh.geometry.getAttribute('skinIndex') || !mesh.geometry.getAttribute('skinWeight')) {
    return {
      meshId: mesh.uuid,
      cellSize: safeCellSize,
      vertexCount: position.count,
      valid: false,
      failureReason: 'missing-skin-attributes',
      cells,
    };
  }

  mesh.updateMatrixWorld(true);
  mesh.skeleton?.update();

  const local = new THREE.Vector3();
  const world = new THREE.Vector3();

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    local.fromBufferAttribute(position, vertexIndex);
    const failure = getSkinnedVertexWorldPosition(mesh, vertexIndex, world);
    if (failure) {
      return {
        meshId: mesh.uuid,
        cellSize: safeCellSize,
        vertexCount: position.count,
        valid: false,
        failureReason: `${failure} at vertex ${vertexIndex}`,
        cells: new Map(),
      };
    }

    const key = cellKey(world.x, world.y, world.z, safeCellSize);
    const bucket = cells.get(key) ?? [];
    bucket.push({
      meshId: mesh.uuid,
      vertexIndex,
      localPosition: [local.x, local.y, local.z],
      skinnedWorldPosition: [world.x, world.y, world.z],
    });
    cells.set(key, bucket);
  }

  return { meshId: mesh.uuid, cellSize: safeCellSize, vertexCount: position.count, valid: true, cells };
}

export function querySkinBrushIndex(
  index: SkinBrushIndex,
  localCenter: THREE.Vector3,
  localRadius: number,
): SkinBrushVertexRef[] {
  if (!index.valid || !Number.isFinite(localRadius) || localRadius < 0 || index.vertexCount === 0) return [];

  const cellRadius = Math.max(0, Math.ceil(localRadius / index.cellSize));
  const centerX = cellCoord(localCenter.x, index.cellSize);
  const centerY = cellCoord(localCenter.y, index.cellSize);
  const centerZ = cellCoord(localCenter.z, index.cellSize);
  const radiusSq = localRadius * localRadius;
  const result: SkinBrushVertexRef[] = [];

  for (let x = centerX - cellRadius; x <= centerX + cellRadius; x += 1) {
    for (let y = centerY - cellRadius; y <= centerY + cellRadius; y += 1) {
      for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z += 1) {
        const bucket = index.cells.get(`${x}:${y}:${z}`);
        if (!bucket) continue;
        for (const candidate of bucket) {
          const dx = candidate.localPosition[0] - localCenter.x;
          const dy = candidate.localPosition[1] - localCenter.y;
          const dz = candidate.localPosition[2] - localCenter.z;
          if ((dx * dx) + (dy * dy) + (dz * dz) <= radiusSq) {
            result.push(candidate);
          }
        }
      }
    }
  }

  return result;
}

export function querySkinBrushWorldIndex(
  index: SkinBrushIndex,
  worldCenter: THREE.Vector3,
  worldRadius: number,
): SkinBrushVertexRef[] {
  if (!index.valid || !Number.isFinite(worldRadius) || worldRadius < 0 || index.vertexCount === 0) return [];

  const cellRadius = Math.max(0, Math.ceil(worldRadius / index.cellSize));
  const centerX = cellCoord(worldCenter.x, index.cellSize);
  const centerY = cellCoord(worldCenter.y, index.cellSize);
  const centerZ = cellCoord(worldCenter.z, index.cellSize);
  const radiusSq = worldRadius * worldRadius;
  const result: SkinBrushVertexRef[] = [];

  for (let x = centerX - cellRadius; x <= centerX + cellRadius; x += 1) {
    for (let y = centerY - cellRadius; y <= centerY + cellRadius; y += 1) {
      for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z += 1) {
        const bucket = index.cells.get(`${x}:${y}:${z}`);
        if (!bucket) continue;
        for (const candidate of bucket) {
          const position = candidate.skinnedWorldPosition;
          if (!position) continue;
          const dx = position[0] - worldCenter.x;
          const dy = position[1] - worldCenter.y;
          const dz = position[2] - worldCenter.z;
          if ((dx * dx) + (dy * dy) + (dz * dz) <= radiusSq) {
            result.push(candidate);
          }
        }
      }
    }
  }

  return result;
}
