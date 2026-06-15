import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// Basic OBJ loader, mirroring fbx/glb for consistency.
// OBJ is typically static meshes (no skinning/rigging), but we support any animations if present.
// Used for preview/import parity. Export not supported (use GLB/SMF).

interface LoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

export async function loadOBJ(urlOrBuffer: string | ArrayBuffer): Promise<LoadedModel> {
  const loader = new OBJLoader();

  let obj: THREE.Group;
  if (typeof urlOrBuffer === 'string') {
    obj = await loader.loadAsync(urlOrBuffer);
  } else {
    // OBJLoader parse takes string content typically; convert buffer to text.
    const text = new TextDecoder().decode(new Uint8Array(urlOrBuffer as ArrayBuffer));
    obj = loader.parse(text);
  }

  const root = obj;
  root.name = 'OBJ_Root';

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const allClips: THREE.AnimationClip[] = (obj as any).animations || [];

  root.traverse((obj: any) => {
    if (obj.isMesh) {
      const geo = obj.geometry as THREE.BufferGeometry;
      if (!geo.attributes.uv) {
        const count = geo.attributes.position?.count || 0;
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      if (!geo.attributes.normal) {
        geo.computeVertexNormals();
      }
      if (!geo.attributes.tangent && geo.index && geo.attributes.position && geo.attributes.normal && geo.attributes.uv) {
        geo.computeTangents?.();
      }

      // OBJ meshes are rarely skinned, but collect if so
      if (obj.isSkinnedMesh) {
        skinnedMeshes.push(obj);
      }
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

// No OBJ export (limited per project scope; fallback to GLB/SMF for export).
