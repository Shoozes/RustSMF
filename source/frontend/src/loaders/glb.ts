import * as THREE from 'three';
import { withSourceMaterialState } from '../utils/materialPreview';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeThreeObject } from '../utils/threeDisposal';
import { isThreeBone, isThreeSkinnedMesh } from '../utils/threeTypeGuards';
import { bytesToArrayBuffer } from './smfBinary';
import { ensureGeometryAttributes } from './geometryAttributes';
import {
  createResourceUrlRegistry,
  type ModelResourceBundle,
} from '../utils/modelResourceBundle';

/**
 * GLB / GLTF loader.
 * Uses three's native GLTFLoader for speed.
 * Returns a root Group containing SkinnedMesh(es) + Skeleton plus clips and a
 * mixer. Validated GLB/FBX-to-SMF conversion is owned by threeToSmf.ts.
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

// Loader scene envelopes are not authored nodes. Never infer ownership from names.
const importedSceneRoots = new WeakSet<THREE.Object3D>();

export function copyImportedSceneOwnership(source: THREE.Object3D, copy: THREE.Object3D): void {
  if (importedSceneRoots.has(source)) importedSceneRoots.add(copy);
}

export async function loadGLB(urlOrBuffer: string | ArrayBuffer | ModelResourceBundle): Promise<LoadedModel> {
  const isBundle = typeof urlOrBuffer === 'object' && !(urlOrBuffer instanceof ArrayBuffer);
  const bundle = isBundle ? urlOrBuffer as ModelResourceBundle : null;
  const registry = bundle ? createResourceUrlRegistry(bundle) : null;
  const manager = new THREE.LoadingManager();
  if (registry) manager.setURLModifier((url) => registry.resolve(url));
  const loader = new GLTFLoader(manager);
  // Three normalizes even valid float weights, causing drift on animation-only
  // roundtrips. Snapshot source accessors before meshes mutate the shared cache.
  loader.register(parser => {
    const authored = new Map<number, THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
    return {
      name: 'RustSMF_authored_skin_weights',
      async beforeRoot() {
        const indices = new Set<number>();
        for (const mesh of parser.json.meshes ?? []) {
          for (const primitive of mesh.primitives ?? []) {
            const index: unknown = primitive.attributes?.WEIGHTS_0;
            if (typeof index === 'number') indices.add(index);
          }
        }
        await Promise.all([...indices].map(async index => {
          const attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute = await parser.getDependency('accessor', index);
          if (attribute.itemSize !== 4) return;
          for (let i = 0; i < attribute.count; i++) {
            const weights = [attribute.getX(i), attribute.getY(i), attribute.getZ(i), attribute.getW(i)];
            if (weights.some(weight => !Number.isFinite(weight) || weight < 0 || weight > 1)
              || Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-6) return;
          }
          authored.set(index, attribute.clone());
        }));
      },
      async afterRoot(gltf) {
        for (const scene of gltf.scenes) scene.traverse(node => {
          if (!isThreeSkinnedMesh(node)) return;
          const association = parser.associations.get(node) as { meshes?: number; primitives?: number } | undefined;
          if (association?.meshes === undefined || association.primitives === undefined) return;
          const index = parser.json.meshes[association.meshes].primitives[association.primitives].attributes.WEIGHTS_0;
          const attribute = authored.get(index);
          if (attribute) node.geometry.setAttribute('skinWeight', attribute.clone());
        });
      },
    };
  });

  try {
    let gltf: GLTF;
    if (typeof urlOrBuffer === 'string') {
      gltf = await loader.loadAsync(urlOrBuffer);
    } else {
      const bytes = bundle ? bytesToArrayBuffer(bundle.primary.data) : urlOrBuffer as ArrayBuffer;
      const basePath = bundle ? resourceBasePath(bundle.primary.name) : '';
      gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(bytes, basePath, resolve, reject);
      });
    }

    const scene = gltf.scene || gltf.scenes?.[0];
    if (!scene) throw new Error('No scene in GLB');
    importedSceneRoots.add(scene);

    // Collect skinned meshes
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const allClips: THREE.AnimationClip[] = gltf.animations || [];
    const sceneBones = collectSkeletonBones(scene);

    scene.traverse((obj) => {
      if (!isThreeSkinnedMesh(obj)) {
        return;
      }
      ensureGeometryAttributes(obj.geometry);

      skinnedMeshes.push(obj);
      // Some GLB/GLTF paths can produce skinned meshes with an empty bone list.
      // Build a fallback local skeleton so skinning and animation pipelines can still proceed.
      if (!obj.skeleton || !obj.skeleton.bones.length) {
        if (sceneBones.length > 0) {
          obj.bind(new THREE.Skeleton(sceneBones), obj.bindMatrix);
        }
      }
    });

    return {
      root: scene,
      skeleton: skinnedMeshes[0]?.skeleton,
      skinnedMeshes,
      clips: allClips,
      mixer: new THREE.AnimationMixer(scene),
    };
  } finally {
    registry?.dispose();
  }
}

function resourceBasePath(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? `${name.slice(0, slash + 1)}` : '';
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
    if (clips.length) root.traverse(node => {
      if (!node.matrixAutoUpdate && !node.matrix.equals(new THREE.Matrix4().compose(node.position, node.quaternion, node.scale))) {
        throw new Error(`GLB animated export cannot preserve the matrix-only transform of ${node.name || '(unnamed node)'}. Apply the matrix to position/rotation/scale before export.`);
      }
    });
    const rootMatrix = root.matrixAutoUpdate
      ? new THREE.Matrix4().compose(root.position, root.quaternion, root.scale) : root.matrix;
    const rootAnimated = clips.some(clip => clip.tracks.some(track => (
      THREE.PropertyBinding.findNode(root, THREE.PropertyBinding.parseTrackName(track.name).nodeName) === root
    )));
    let input: THREE.Object3D = root;
    if (importedSceneRoots.has(root) && root.visible && rootMatrix.equals(new THREE.Matrix4()) && !rootAnimated) {
      const scene = new THREE.Scene();
      scene.name = root.name;
      scene.userData = root.userData;
      // Read-only export envelope: retain real node parents and original hierarchy.
      scene.children = [...root.children];
      input = scene;
    }
    const result = await exporter.parseAsync(input, { binary: true, animations: clips });
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
  const deformBones = new Set<string>();
  let hierarchyBoneCount = 0;
  let skinnedMeshCount = 0;

  root.traverse((node) => {
    if (isThreeBone(node)) hierarchyBoneCount += 1;
    if (isThreeSkinnedMesh(node)) {
      skinnedMeshCount += 1;
      node.skeleton.bones.forEach((bone) => deformBones.add(bone.uuid));
    }

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
    boneCount: deformBones.size > 0 ? deformBones.size : hierarchyBoneCount,
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
