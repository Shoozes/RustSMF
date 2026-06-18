import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

function collectSkeletonBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((node: THREE.Object3D) => {
    if ((node as THREE.Bone).isBone) {
      bones.push(node as THREE.Bone);
    }
  });
  return bones;
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
  const sceneBones = collectSkeletonBones(scene);

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
      // Some GLB/GLTF paths can produce skinned meshes with an empty bone list.
      // Build a fallback local skeleton so skinning and animation pipelines can still proceed.
      if (!obj.skeleton || !obj.skeleton.bones.length) {
        if (sceneBones.length > 0) {
          obj.bind(new THREE.Skeleton(sceneBones), obj.bindMatrix);
        }
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

  return {
    root,
    skeleton,
    skinnedMeshes,
    clips: allClips,
    mixer,
  };
}


/**
 * Reusable GLB/GLTF binary export for the current Three scene root + clips.
 * Extracted for modularity (used by main GLB export and FBX export equivalent path).
 * Preserves skinned meshes, skeleton, and animation clips via GLTFExporter.
 * No new dependencies. The produced buffer is a valid .glb that roundtrips via loadGLB.
 */
export async function exportGLB(root: THREE.Group, clips: THREE.AnimationClip[] = []): Promise<Uint8Array> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, animations: clips });
  return new Uint8Array(result as ArrayBuffer);
}
