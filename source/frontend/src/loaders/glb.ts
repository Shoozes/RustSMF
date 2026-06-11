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

// Helper to convert a loaded GLB into the "ImportedSmf" shape for SMF exporter roundtrips
// (matches reference unpacker output: meshes/textures/bones/animations with flat data + dqs).
// Basic extraction from three scene (positions/normals/uvs from geometry, bones from skeleton,
// clips from mixer). Not full fidelity (no exact DQ reconstruction or head/tail nodes yet;
// use for basic GLB→SMF export when needed). See smf_export_and_fidelity group.
export async function loadGLBAsSmfData(urlOrBuffer: string | ArrayBuffer): Promise<ImportedSmf> {
  const loaded = await loadGLB(urlOrBuffer);
  const { root, skinnedMeshes, skeleton, clips } = loaded;

  // Minimal meshes from first skinned (extend for multi-mesh later)
  const meshes: ImportedSmf['meshes'] = [];
  if (skinnedMeshes.length > 0) {
    const m = skinnedMeshes[0];
    const geo = m.geometry;
    const pos = geo.attributes.position?.array as Float32Array || new Float32Array(0);
    const nor = geo.attributes.normal?.array as Float32Array || new Float32Array(0);
    const uv = geo.attributes.uv?.array as Float32Array || new Float32Array(0);
    const tan = geo.attributes.tangent?.array as Float32Array || new Float32Array(0);
    const skinInd = geo.attributes.skinIndex?.array as Uint16Array || new Uint16Array(0);
    const skinW = geo.attributes.skinWeight?.array as Float32Array || new Float32Array(0);
    const triCount = (geo.index ? geo.index.count : pos.length / 3) / 3;
    const triangles: number[][] = [];
    if (geo.index) {
      const idx = geo.index.array;
      for (let i = 0; i < idx.length; i += 3) triangles.push([idx[i], idx[i+1], idx[i+2]]);
    } else {
      for (let i = 0; i < pos.length / 3; i += 3) triangles.push([i, i+1, i+2]);
    }
    meshes.push({
      name: m.name || 'GLB_Mesh',
      verts: pos.length / 3,
      triangles,
      texIdx: -1, // textures from material.map later if needed
      positions: pos,
      normals: nor,
      uvs: uv,
      tangents: tan,
      skinIndices: skinInd,
      skinWeights: skinW,
      visible: m.visible ? 1 : 0
    });
  }

  // Textures: minimal (extend from materials if present)
  const textures: ImportedSmf['textures'] = [];

  // Bones from skeleton (use current local transforms as approx dqs; full DQ from matrices later)
  const bones: ImportedSmf['bones'] = [];
  if (skeleton) {
    skeleton.bones.forEach((b, i) => {
      const pos = b.position;
      const quat = b.quaternion;
      // Approx DQ from pos/quat (placeholder; use coord.dqCreateFromMatrix for exact)
      const dq = new Float32Array(8);
      dq[0] = quat.x; dq[1] = quat.y; dq[2] = quat.z; dq[3] = quat.w;
      dq[4] = 0.5 * (pos.x * quat.w - pos.y * quat.z + pos.z * quat.y); // rough dual
      dq[5] = 0.5 * (pos.y * quat.w + pos.x * quat.z - pos.z * quat.x);
      dq[6] = 0.5 * (pos.z * quat.w - pos.x * quat.y + pos.y * quat.x);
      dq[7] = -0.5 * (pos.x * quat.x + pos.y * quat.y + pos.z * quat.z);
      bones.push({
        index: i,
        parent: skeleton.bones.indexOf(b.parent as any),
        isBone: 1,
        dq,
        axis: [0, 1, 0] // default
      });
    });
  }

  // Animations from clips (extract tracks to frames/times; basic)
  const animations: ImportedSmf['animations'] = [];
  clips.forEach((clip) => {
    const times = clip.tracks[0]?.times ? Array.from(clip.tracks[0].times) : [0];
    const frames: Float32Array[][] = times.map(() => bones.map(() => new Float32Array(8))); // placeholder DQs
    animations.push({
      name: clip.name || 'GLB_Anim',
      duration: clip.duration,
      times,
      frames,
      nodeCount: bones.length
    });
  });

  return { meshes, textures, bones, animations };
}
