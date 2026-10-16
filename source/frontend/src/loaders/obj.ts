import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { isThreeMesh, isThreeSkinnedMesh } from '../utils/threeTypeGuards';
import { ensureGeometryAttributes } from './geometryAttributes';
import { bytesToArrayBuffer } from './smfBinary';
import { createModelResourceLifecycle } from '../utils/modelResourceLifecycle';
import { disposeThreeObject } from '../utils/threeDisposal';
import {
  createResourceUrlRegistry,
  normalizeResourceName,
  resolveModelResource,
  type ModelResourceBundle,
} from '../utils/modelResourceBundle';

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

export async function loadOBJ(urlOrBuffer: string | ArrayBuffer | ModelResourceBundle): Promise<LoadedModel> {
  const isBundle = typeof urlOrBuffer === 'object' && !(urlOrBuffer instanceof ArrayBuffer);
  const bundle = isBundle ? urlOrBuffer as ModelResourceBundle : null;
  const registry = bundle ? createResourceUrlRegistry(bundle) : null;
  const manager = new THREE.LoadingManager();
  const lifecycle = createModelResourceLifecycle(manager, 'OBJ');
  if (registry) manager.setURLModifier((url) => registry.resolve(url));
  const loader = new OBJLoader(manager);
  let obj: THREE.Group | null = null;
  let creator: ReturnType<MTLLoader['parse']> | null = null;

  try {
    if (typeof urlOrBuffer === 'string') {
      obj = await loader.loadAsync(urlOrBuffer);
    } else {
      // OBJLoader parse takes string content typically; convert buffer to text.
      const primaryBytes = bundle ? bytesToArrayBuffer(bundle.primary.data) : urlOrBuffer as ArrayBuffer;
      const text = new TextDecoder().decode(new Uint8Array(primaryBytes));
      if (bundle) {
        const materialRefs = readMaterialLibraryReferences(text);
        if (materialRefs.length > 1) {
          throw new Error(`OBJ references multiple material libraries; select one library at a time (found ${materialRefs.join(', ')}).`);
        }
        if (materialRefs.length === 1) {
          const mtlName = resolveRelativeResourceName(bundle.primary.name, materialRefs[0]);
          const mtl = resolveModelResource(bundle, mtlName);
          if (!mtl) throw new Error(`OBJ material library "${materialRefs[0]}" is embedded and cannot be loaded.`);
          const mtlLoader = new MTLLoader(manager);
          creator = mtlLoader.parse(new TextDecoder().decode(bytesToArrayBuffer(mtl.data)), resourceBasePath(mtl.name));
          creator.preload();
          loader.setMaterials(creator);
        }
      }
      obj = loader.parse(text);
    }
    await lifecycle.wait();

    const root = obj;
    root.name = 'OBJ_Root';

    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const rawAnimations: unknown = Reflect.get(root, 'animations');
    const allClips = Array.isArray(rawAnimations)
      ? rawAnimations.filter(isAnimationClip)
      : [];

    root.traverse((node) => {
      if (!isThreeMesh(node)) return;
      ensureGeometryAttributes(node.geometry);

      // OBJ meshes are rarely skinned, but collect if so
      if (isThreeSkinnedMesh(node)) skinnedMeshes.push(node);
    });

    let skeleton: THREE.Skeleton | undefined;
    if (skinnedMeshes.length > 0) {
      skeleton = skinnedMeshes[0].skeleton;
    }

    const mixer = new THREE.AnimationMixer(root);
    releaseUnusedMaterials(creator, materialResources(root));

    return {
      root,
      skeleton,
      skinnedMeshes,
      clips: allClips,
      mixer,
    };
  } catch (error) {
    const used = materialResources(obj);
    if (obj) disposeThreeObject(obj);
    releaseUnusedMaterials(creator, used);
    throw error;
  } finally {
    lifecycle.dispose();
    registry?.dispose();
  }
}

function materialResources(obj: THREE.Group | null): Set<THREE.Material | THREE.Texture> {
  const used = new Set<THREE.Material | THREE.Texture>();
  obj?.traverse(node => {if (isThreeMesh(node)) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
    used.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) used.add(value);
  }});
  return used;
}
function releaseUnusedMaterials(creator: ReturnType<MTLLoader['parse']> | null, used: Set<THREE.Material | THREE.Texture>): void {
  const resources = new Set<THREE.Material | THREE.Texture>();
  for (const material of Object.values(creator?.materials ?? {})) {
    resources.add(material);
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
  }
  resources.forEach(resource => {if (!used.has(resource)) resource.dispose();});
}

function readMaterialLibraryReferences(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^mtllib\s+/i.test(line))
    .map((line) => line.replace(/^mtllib\s+/i, '').trim())
    .filter(Boolean);
}

function resourceBasePath(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? `${name.slice(0, slash + 1)}` : '';
}

function resolveRelativeResourceName(primaryName: string, reference: string): string {
  const base = resourceBasePath(primaryName);
  return normalizeResourceName(`${base}${reference}`);
}

// No OBJ export (limited per project scope; fallback to GLB/SMF for export).
