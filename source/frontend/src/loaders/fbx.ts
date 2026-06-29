import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { FBXExporter } from '../vendor/FBXExporter.js';

// Basic FBX loader, mirroring glb.ts structure for consistency.
// Supports skinned meshes if present in FBX.
// Full roundtrip: loadFBX + exportFBX + re-load with FBXLoader.

interface FbxLoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

const isSkinnedMesh = (obj: THREE.Object3D): obj is THREE.SkinnedMesh => obj.type === 'SkinnedMesh';

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

  root.traverse((obj) => {
    if (!isSkinnedMesh(obj)) {
      return;
    }
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

export async function exportFBX(root: THREE.Group, clips: THREE.AnimationClip[] = []): Promise<Uint8Array> {
  const exporter = new FBXExporter();
  const blob = await exporter.parse(root, {
    animations: clips,
    embedImages: typeof document !== 'undefined',
    exportMaterials: true,
    exportSkin: true,
    onlyVisible: true,
    scale: 1,
  });
  return new Uint8Array(await blob.arrayBuffer());
}
