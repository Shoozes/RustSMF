import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ImportedSmf } from './smf'; // shape reference only (not used for build yet)

/**
 * GLB / GLTF loader.
 * Uses three's native GLTFLoader for speed.
 * For SMF export fidelity we can later route through the same structured data
 * as the SMF importer (meshes + bones + anims).
 *
 * For now: returns a root Group containing SkinnedMesh(es) + Skeleton,
 * plus clips and a mixer, ready to drop into the scene.
 */

export interface LoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

export async function loadGLB(urlOrBuffer: string | ArrayBuffer): Promise<LoadedModel> {
  const loader = new GLTFLoader();

  let gltf: any;
  if (typeof urlOrBuffer === 'string') {
    gltf = await loader.loadAsync(urlOrBuffer);
  } else {
    gltf = await new Promise((resolve, reject) => {
      loader.parse(urlOrBuffer, '', resolve, reject);
    });
  }

  const scene = gltf.scene || gltf.scenes?.[0];
  if (!scene) throw new Error('No scene in GLB');

  // Collect skinned meshes
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const allClips: THREE.AnimationClip[] = gltf.animations || [];

  scene.traverse((obj: any) => {
    if (obj.isSkinnedMesh) {
      // Ensure we have everything three needs
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
      // Make sure skeleton is bound
      if (obj.skeleton && !obj.skeleton.bones.length) {
        // rare, but rebind if needed
      }
    }
  });

  if (skinnedMeshes.length === 0) {
    // Fallback: just use the whole scene as non-skinned for preview
    const root = scene;
    const mixer = new THREE.AnimationMixer(root);
    return { root, skinnedMeshes: [], clips: allClips, mixer };
  }

  // Use the first skinned mesh's skeleton as the main one (common case)
  const mainSkinned = skinnedMeshes[0];
  const skeleton = mainSkinned.skeleton;

  // Attach all skinned to a clean root (preserve hierarchy)
  const root = new THREE.Group();
  root.name = 'GLB_Root';
  root.add(scene); // keep original hierarchy for now

  const mixer = new THREE.AnimationMixer(root);
  // clips are already on gltf; attach for convenience
  (root as any).animations = allClips;

  return {
    root,
    skeleton,
    skinnedMeshes,
    clips: allClips,
    mixer,
  };
}

// Optional: future helper to convert a loaded GLB into the "ImportedSmf" shape
// so we can roundtrip through the SMF exporter path exactly like the reference does.
// For now we keep direct three objects for fast viewport iteration.
export async function loadGLBAsSmfData(urlOrBuffer: string | ArrayBuffer): Promise<ImportedSmf> {
  // TODO in future pass: implement full unpack like reference unpacker + ModelLoader
  // For immediate value we load via three then (in a later subtask) extract for export.
  throw new Error('loadGLBAsSmfData not implemented yet - use loadGLB for viewport, or implement via reference unpacker if export fidelity needed first.');
}
