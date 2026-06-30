import * as THREE from 'three';

type MaterialWithColor = THREE.Material & {
  color?: THREE.Color;
};

type MaterialWithMap = THREE.Material & {
  map?: THREE.Texture | null;
};

const hasColor = (material: THREE.Material): material is MaterialWithColor => 'color' in material;
const hasMap = (material: THREE.Material): material is MaterialWithMap => 'map' in material;

export interface LegacySmfMaterialOptions {
  mapEnabled: boolean;
  opacity: number;
}

export function createLegacySmfMaterial(
  source: THREE.Material,
  options: LegacySmfMaterialOptions,
): THREE.MeshPhongMaterial {
  const sourceColor = hasColor(source) && source.color instanceof THREE.Color
    ? source.color
    : new THREE.Color(0xbfd7ff);
  const opacity = Number.isFinite(options.opacity) ? Math.max(0, Math.min(1, options.opacity)) : 1;
  const map = options.mapEnabled && hasMap(source) ? source.map ?? null : null;
  const material = new THREE.MeshPhongMaterial({
    name: `${source.name || 'material'} legacy SMF display`,
    color: sourceColor.clone(),
    map,
    side: source.side,
    transparent: source.transparent || opacity < 1,
    opacity,
    alphaTest: source.alphaTest,
    depthTest: source.depthTest,
    depthWrite: source.depthWrite,
    vertexColors: source.vertexColors,
    specular: new THREE.Color(0x9fb8d8),
    shininess: 22,
    emissive: sourceColor.clone().multiplyScalar(0.04),
  });

  material.userData = {
    ...source.userData,
    legacySmfDisplayMaterial: true,
    sourceMaterialUuid: source.uuid,
  };
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      [
        'float legacyRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);',
        'outgoingLight += vec3(0.10, 0.14, 0.20) * legacyRim;',
        '#include <opaque_fragment>',
      ].join('\n'),
    );
  };
  material.customProgramCacheKey = () => 'rustsmf-legacy-smf-lighting-v1';

  return material;
}
