import type * as THREE from 'three';

export interface FBXExporterOptions {
  exportSkin?: boolean;
  exportMaterials?: boolean;
  onlyVisible?: boolean;
  embedImages?: boolean;
  maxTextureSize?: number;
  scale?: number;
  animations?: THREE.AnimationClip[];
}

export class FBXExporter {
  static export(
    scene: THREE.Object3D,
    animations?: THREE.AnimationClip[] | FBXExporterOptions,
    options?: FBXExporterOptions,
  ): Promise<Blob>;

  parse(
    scene: THREE.Object3D,
    options?: FBXExporterOptions,
    animations?: THREE.AnimationClip[],
  ): Promise<Blob>;
}
