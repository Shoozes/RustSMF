import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Basic FBX loader, mirroring glb.ts structure for consistency.
// Supports skinned meshes if present in FBX.
// For export, FBX is slightly limited (see project notes); use GLB/SMF for full fidelity or the Shoozes FBXExporter-threejs if integrated.
export interface LoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

export async function loadFBX(urlOrBuffer: string | ArrayBuffer): Promise<LoadedModel> {
  const loader = new FBXLoader();

  let fbx: THREE.Group;
  if (typeof urlOrBuffer === 'string') {
    fbx = await loader.loadAsync(urlOrBuffer);
  } else {
    // FBXLoader parse expects ArrayBuffer or string; for buffer, use parse.
    // Note: FBXLoader's parse is sync but may require additional setup for some FBX features.
    fbx = loader.parse(urlOrBuffer, '');
  }

  const root = fbx; // FBX loads as group-like
  root.name = 'FBX_Root';

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const allClips: THREE.AnimationClip[] = fbx.animations || [];

  root.traverse((obj: any) => {
    if (obj.isSkinnedMesh) {
      const geo = obj.geometry;
      if (!geo.attributes.tangent) {
        geo.computeTangents?.();
      }
      if (!geo.attributes.uv) {
        const count = geo.attributes.position.count;
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      if (!geo.attributes.normal) {
        geo.computeVertexNormals();
      }

      skinnedMeshes.push(obj);
    }
  });

  let skeleton: THREE.Skeleton | undefined;
  if (skinnedMeshes.length > 0) {
    skeleton = skinnedMeshes[0].skeleton;
  }

  const mixer = new THREE.AnimationMixer(root);
  (root as any).animations = allClips;

  return {
    root,
    skeleton,
    skinnedMeshes,
    clips: allClips,
    mixer,
  };
}

// No full FBX export impl here (limited per project; integrate external exporter if needed for advanced cases).
// For now, fall back to GLB export in UI for FBX-loaded models.