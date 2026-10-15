import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { copyImportedSceneOwnership } from '../loaders/glb';
import { cloneImportedSmf } from '../loaders/smfData';
import type { ImportedSmf } from '../loaders';
import { withSourceMaterialStateSync } from '../utils/materialPreview';
import type { ExportPreset, ExportQueueSnapshot } from '../utils/exportQueue';
import { buildSmfExportCandidate, type SmfExportCandidateInput } from './smfExportCandidate';
import { cloneAnimationClips } from './editorSnapshots';

export interface ExportSnapshot extends ExportQueueSnapshot {
  root: THREE.Group | null;
  clips: THREE.AnimationClip[];
  smf: ImportedSmf | null;
}

/** Counts owned arrays, images and scene metadata before allocating the capture. */
function snapshotBytes(root: THREE.Object3D | null, clips: THREE.AnimationClip[], smf: ImportedSmf | null, limit: number): number {
  let bytes = 0;
  const visited = new Set<object>();
  const add = (count: number) => {
    bytes += count;
    if (!Number.isSafeInteger(bytes) || bytes > limit) throw new Error('Queue captures exceed 128 MiB. Remove items before adding another.');
  };
  const countData = (value: unknown): void => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') { add(value.length * 2); return; }
    if (typeof value !== 'object') { add(8); return; }
    if (visited.has(value)) return;
    visited.add(value);
    if (ArrayBuffer.isView(value)) { add(value.byteLength); return; }
    if (value instanceof ArrayBuffer) { add(value.byteLength); return; }
    if (Array.isArray(value)) { add(value.length * 8); value.forEach(countData); return; }
    for (const [key, item] of Object.entries(value)) { add(key.length * 2); countData(item); }
  };
  if (smf) countData(smf);
  clips.forEach(clip => {
    add(256 + clip.name.length * 2);
    clip.tracks.forEach(track => { add(256 + track.name.length * 2); countData(track.times); countData(track.values); });
  });
  root?.traverse(node => {
    add(1024 + node.name.length * 2); countData(node.userData);
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    if (!visited.has(geometry)) {
      visited.add(geometry); add(512);
      const attributes = [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat(), geometry.index];
      for (const attribute of attributes) if (attribute) countData(attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array);
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (visited.has(material)) continue;
      visited.add(material); add(2048); countData(material.userData);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && !visited.has(value)) {
        visited.add(value); add(512);
        const image = value.image as { width?: number; height?: number; data?: ArrayBufferView } | undefined;
        if (image?.data) countData(image.data);
        else if (image) add((image.width ?? 0) * (image.height ?? 0) * 4);
      }
    }
    if (node instanceof THREE.SkinnedMesh) add(node.skeleton.bones.length * 256);
  });
  return bytes;
}

function copyTextureImage(image: unknown): unknown {
  if (!image) return image;
  if (typeof image === 'object' && 'data' in image) return structuredClone(image);
  if (typeof document === 'undefined') throw new Error('Texture capture requires a readable image.');
  const source = image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) throw new Error('Texture is not ready. Wait for resources before queuing.');
  context.drawImage(source, 0, 0);
  // Reject tainted/inaccessible resources now, while the author can repair them.
  context.getImageData(0, 0, 1, 1);
  return canvas;
}

export function captureExportSnapshot(input: SmfExportCandidateInput, preset: Readonly<ExportPreset>, limit: number): ExportSnapshot {
  if (!input.root) throw new Error('Load a model before adding exports.');
  const capture = (): ExportSnapshot => {
    if (preset.format === 'smf') {
      snapshotBytes(input.root, input.clips, input.sourceSmf, limit);
      // Build from imported SMF before cloning so source-only fidelity data is retained.
      const candidate = buildSmfExportCandidate({ ...input, clips: preset.includeAnimation ? input.clips : [] });
      if (!candidate) throw new Error('No compatible SMF export is available.');
      const selected = preset.includeAnimation ? candidate : { ...candidate, animations: [] };
      const bytes = snapshotBytes(null, [], selected, limit);
      return { bytes, root: null, clips: [], smf: cloneImportedSmf(selected), dispose() {} };
    }
    const clips = preset.includeAnimation ? input.clips : [];
    const bytes = snapshotBytes(input.root, clips, null, limit);
    const resources = new Set<{ dispose(): void }>();
    const canvases: HTMLCanvasElement[] = [];
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true; resources.forEach(resource => resource.dispose());
      canvases.forEach(canvas => { canvas.width = 0; canvas.height = 0; });
    };
    try {
      const root = clone(input.root!) as THREE.Group;
      const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
      const materials = new Map<THREE.Material, THREE.Material>();
      const textures = new Map<THREE.Texture, THREE.Texture>();
      const copyMaterial = (source: THREE.Material) => {
        let result = materials.get(source);
        if (result) return result;
        result = source.clone(); materials.set(source, result); resources.add(result);
        for (const [key, value] of Object.entries(source)) if (value instanceof THREE.Texture) {
          let texture = textures.get(value);
          if (!texture) {
            texture = value.clone(); resources.add(texture);
            const image = copyTextureImage(value.image);
            texture.source = new THREE.Source(image);
            texture.needsUpdate = true; textures.set(value, texture);
            if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) canvases.push(image);
          }
          Reflect.set(result, key, texture);
        }
        return result;
      };
      root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        let geometry = geometries.get(node.geometry);
        if (!geometry) {
          const owned: THREE.BufferGeometry = node.geometry.clone();
          geometries.set(node.geometry, owned); resources.add(owned); geometry = owned;
        }
        node.geometry = geometry;
        node.material = Array.isArray(node.material) ? node.material.map(copyMaterial) : copyMaterial(node.material);
        if (node instanceof THREE.SkinnedMesh) {
          resources.add(node.skeleton);
          if (node.skeleton.bones.some(bone => !bone)) throw new Error('Skeleton has bones outside the model. Export this model directly or repair its hierarchy.');
          node.skeleton.boneInverses = node.skeleton.boneInverses.map(matrix => matrix.clone());
        }
      });
      copyImportedSceneOwnership(input.root!, root);
      return { bytes, root, clips: cloneAnimationClips(clips), smf: null, dispose };
    } catch (error) { dispose(); throw error; }
  };
  return withSourceMaterialStateSync(input.root, capture);
}
