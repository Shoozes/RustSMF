import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { isThreeMesh, isThreeSkinnedMesh } from '../utils/threeTypeGuards';

// Basic OBJ loader, mirroring FBX/GLB for consistency.
// OBJLoader supplies static geometry; it does not synthesize animation or rig data.
// Used for preview/import parity. Export is not supported (use GLB/SMF).

interface LoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

function isAnimationClip(value: unknown): value is THREE.AnimationClip {
  return value instanceof THREE.AnimationClip;
}

export async function loadOBJ(urlOrBuffer: string | ArrayBuffer): Promise<LoadedModel> {
  const loader = new OBJLoader();

  let obj: THREE.Group;
  if (typeof urlOrBuffer === 'string') {
    obj = await loader.loadAsync(urlOrBuffer);
  } else {
    // OBJLoader parse takes string content typically; convert buffer to text.
    const text = new TextDecoder().decode(new Uint8Array(urlOrBuffer));
    obj = loader.parse(text);
  }

  const root = obj;
  root.name = 'OBJ_Root';

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const rawAnimations: unknown = Reflect.get(root, 'animations');
  const allClips = Array.isArray(rawAnimations)
    ? rawAnimations.filter(isAnimationClip)
    : [];

  root.traverse((node) => {
    if (!isThreeMesh(node)) return;
    const geo = node.geometry;
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
    if (isThreeSkinnedMesh(node)) skinnedMeshes.push(node);
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

// No OBJ export (limited per project scope; fallback to GLB/SMF for export).
