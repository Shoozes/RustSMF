import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { exportGLB } from './glb';

// Basic FBX loader, mirroring glb.ts structure for consistency.
// Supports skinned meshes if present in FBX.
// Full roundtrip: loadFBX + exportFBX (GLTF equivalent) + re-load as GLB.

interface FbxLoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

export async function loadFBX(urlOrBuffer: string | ArrayBuffer): Promise<FbxLoadedModel> {
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

  return {
    root,
    skeleton,
    skinnedMeshes,
    clips: allClips,
    mixer,
  };
}

/**
 * FBX export path (Cycle 2).
 * Uses the proven GLTF/GLB exporter as the "equivalent" (Three.js provides no official FBXExporter
 * in examples, and we honor no-new-deps). Produces a .glb buffer that fully preserves the
 * post-processed skinned mesh + skeleton + animations from the FBX load (Y-up RH scene).
 * Re-importing the exported .glb works via loadGLB. For "native .fbx" file users can use
 * DCC roundtrip or save as SMF first (high fidelity path).
 * Wired to existing loaders/coord (the loaded root is already transformed correctly).
 */
export async function exportFBX(root: THREE.Group, clips: THREE.AnimationClip[] = []): Promise<Uint8Array> {
  return exportGLB(root, clips);
}
