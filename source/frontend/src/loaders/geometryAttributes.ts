import * as THREE from 'three';

export interface GeometryAttributePreparation {
  synthesizedUv: boolean;
  computedNormals: boolean;
  computedTangents: boolean;
}

function hasCompatibleAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  vertexCount: number,
  minimumItemSize: number,
): boolean {
  return !!attribute && attribute.count === vertexCount && attribute.itemSize >= minimumItemSize;
}

function hasValidTriangleIndex(
  index: THREE.BufferAttribute | null,
  vertexCount: number,
): boolean {
  if (!index || index.itemSize !== 1 || index.count === 0 || index.count % 3 !== 0) return false;
  for (let offset = 0; offset < index.count; offset += 1) {
    const vertexIndex = index.getX(offset);
    if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) return false;
  }
  return true;
}

/**
 * Fill preview-safe UV/normal defaults and compute tangents only when Three's
 * indexed geometry contract is fully satisfied.
 */
export function ensureGeometryAttributes(
  geometry: THREE.BufferGeometry,
): GeometryAttributePreparation {
  const position = geometry.getAttribute('position');
  if (!position || position.count <= 0) {
    return { synthesizedUv: false, computedNormals: false, computedTangents: false };
  }

  const vertexCount = position.count;
  const sourceUv = geometry.getAttribute('uv');
  const hasSourceUv = hasCompatibleAttribute(sourceUv, vertexCount, 2);
  let synthesizedUv = false;
  if (!sourceUv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
    synthesizedUv = true;
  }

  let normal = geometry.getAttribute('normal');
  let computedNormals = false;
  if (!normal) {
    geometry.computeVertexNormals();
    normal = geometry.getAttribute('normal');
    computedNormals = true;
  }

  const canComputeTangents = (
    !geometry.getAttribute('tangent')
    && hasSourceUv
    && hasCompatibleAttribute(normal, vertexCount, 3)
    && hasValidTriangleIndex(geometry.getIndex(), vertexCount)
  );
  if (canComputeTangents) geometry.computeTangents();
  const computedTangents = canComputeTangents && !!geometry.getAttribute('tangent');

  return {
    synthesizedUv,
    computedNormals,
    computedTangents,
  };
}
