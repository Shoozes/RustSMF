import * as THREE from 'three';
import { withSourceMaterialState } from '../utils/materialPreview';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeThreeObject } from '../utils/threeDisposal';
import { isThreeBone, isThreeSkinnedMesh } from '../utils/threeTypeGuards';
import { bytesToArrayBuffer } from './smfBinary';

/**
 * GLB / GLTF loader.
 * Uses three's native GLTFLoader for speed.
 * Returns a root Group containing SkinnedMesh(es) + Skeleton plus clips and a
 * mixer. Guarded GLB/FBX-to-SMF conversion is owned by threeToSmf.ts.
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
    if (isThreeBone(node)) bones.push(node);
  });
  return bones;
}

export async function loadGLB(urlOrBuffer: string | ArrayBuffer): Promise<LoadedModel> {
  const loader = new GLTFLoader();

  let gltf: GLTF;
  if (typeof urlOrBuffer === 'string') {
    gltf = await loader.loadAsync(urlOrBuffer);
  } else {
    gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.parse(urlOrBuffer, '', resolve, reject);
    });
  }

  const scene = gltf.scene || gltf.scenes?.[0];
  if (!scene) throw new Error('No scene in GLB');

  // Collect skinned meshes
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const allClips: THREE.AnimationClip[] = gltf.animations || [];
  const sceneBones = collectSkeletonBones(scene);

  scene.traverse((obj) => {
    if (!isThreeSkinnedMesh(obj)) {
      return;
    }
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
 * Extracted for modularity and generic non-FBX export paths.
 * Preserves skinned meshes, skeleton, and animation clips via GLTFExporter.
 * No new dependencies. The produced buffer is a valid .glb that roundtrips via loadGLB.
 */
export async function exportGLB(root: THREE.Group, clips: THREE.AnimationClip[] = []): Promise<Uint8Array> {
  return withSourceMaterialState(root, async () => {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(root, { binary: true, animations: clips });
    if (!(result instanceof ArrayBuffer)) {
      throw new Error('GLB exporter returned JSON while binary output was requested.');
    }
    return new Uint8Array(result);
  });
}

export interface GlbRoundtripSummary {
  byteLength: number;
  boneCount: number;
  skinnedMeshCount: number;
  clipCount: number;
  clipNames: string[];
  trackCounts: number[];
}

function summarizeGlbScene(root: THREE.Object3D, clips: THREE.AnimationClip[], byteLength: number): GlbRoundtripSummary {
  let boneCount = 0;
  let skinnedMeshCount = 0;

  root.traverse((node) => {
    if (isThreeBone(node)) boneCount += 1;
    if (isThreeSkinnedMesh(node)) skinnedMeshCount += 1;

    const transformValues = [
      node.position.x, node.position.y, node.position.z,
      node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w,
      node.scale.x, node.scale.y, node.scale.z,
    ];
    if (transformValues.some((value) => !Number.isFinite(value))) {
      throw new Error(`GLB roundtrip validation failed: non-finite transform on ${node.name || node.type}.`);
    }
  });

  for (const clip of clips) {
    if (!Number.isFinite(clip.duration)) {
      throw new Error(`GLB roundtrip validation failed: non-finite duration on ${clip.name || 'unnamed clip'}.`);
    }
    for (const track of clip.tracks) {
      for (const value of track.times) {
        if (!Number.isFinite(value)) {
          throw new Error(`GLB roundtrip validation failed: non-finite time in ${track.name}.`);
        }
      }
      for (const value of track.values) {
        if (!Number.isFinite(value)) {
          throw new Error(`GLB roundtrip validation failed: non-finite value in ${track.name}.`);
        }
      }

      const path = THREE.PropertyBinding.parseTrackName(track.name);
      if (path.nodeName && !THREE.PropertyBinding.findNode(root, path.nodeName)) {
        throw new Error(`GLB roundtrip validation failed: animation target ${path.nodeName} is missing.`);
      }
    }
  }

  return {
    byteLength,
    boneCount,
    skinnedMeshCount,
    clipCount: clips.length,
    clipNames: clips.map((clip) => clip.name),
    trackCounts: clips.map((clip) => clip.tracks.length),
  };
}

function assertMatchingGlbSummary(expected: GlbRoundtripSummary, actual: GlbRoundtripSummary): void {
  const checks: Array<[string, number, number]> = [
    ['bone count', expected.boneCount, actual.boneCount],
    ['skinned mesh count', expected.skinnedMeshCount, actual.skinnedMeshCount],
    ['clip count', expected.clipCount, actual.clipCount],
  ];
  for (const [label, expectedValue, actualValue] of checks) {
    if (expectedValue !== actualValue) {
      throw new Error(`GLB roundtrip validation failed: ${label} changed from ${expectedValue} to ${actualValue}.`);
    }
  }

  for (let index = 0; index < expected.clipCount; index += 1) {
    const expectedName = expected.clipNames[index];
    if (expectedName && expectedName !== actual.clipNames[index]) {
      throw new Error(`GLB roundtrip validation failed: clip ${index} changed from ${expectedName} to ${actual.clipNames[index] || 'unnamed'}.`);
    }
    if (expected.trackCounts[index] !== actual.trackCounts[index]) {
      throw new Error(`GLB roundtrip validation failed: ${expectedName || `clip ${index}`} track count changed from ${expected.trackCounts[index]} to ${actual.trackCounts[index]}.`);
    }
  }
}

export async function validateExportedGLB(
  bytes: Uint8Array,
  sourceRoot: THREE.Group,
  sourceClips: THREE.AnimationClip[] = [],
): Promise<GlbRoundtripSummary> {
  if (bytes.byteLength === 0) {
    throw new Error('GLB roundtrip validation failed: exporter returned an empty file.');
  }

  const expected = summarizeGlbScene(sourceRoot, sourceClips, bytes.byteLength);
  const buffer = bytesToArrayBuffer(bytes);
  const loaded = await loadGLB(buffer);
  try {
    const actual = summarizeGlbScene(loaded.root, loaded.clips, bytes.byteLength);
    assertMatchingGlbSummary(expected, actual);
    return actual;
  } finally {
    loaded.mixer.stopAllAction();
    disposeThreeObject(loaded.root);
  }
}
