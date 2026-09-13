import * as THREE from 'three';
import { buildGlbContainer, parseGlbContainer, type ParsedGlb } from './glbContainer';
import type { FittedRig } from './fittedRig';

interface Node { name?: string; children?: number[]; mesh?: number; skin?: number; [key: string]: unknown }
interface Primitive { attributes: Record<string, number>; [key: string]: unknown }
interface Mesh { primitives: Primitive[]; [key: string]: unknown }
interface Accessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean; sparse?: unknown; [key: string]: unknown }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }
interface Skin { joints: number[]; inverseBindMatrices?: number }
type Document = ParsedGlb['json'] & { nodes: Node[]; meshes: Mesh[]; skins: Skin[];
  scenes: Array<{ nodes: number[] }>; accessors: Accessor[]; bufferViews: BufferView[] };

/** Preserves source vertex, UV, material and image bytes. Only joint indices,
 * fitted inverse binds and animation tracks are appended to the GLB buffer.
 */
export function exportFittedRigGlb(source: Uint8Array, fitted: FittedRig,
  clips: readonly THREE.AnimationClip[]): Uint8Array {
  const parsed = parseGlbContainer(source), document = parsed.json as Document;
  if (!Array.isArray(document.nodes) || !Array.isArray(document.meshes) || !Array.isArray(document.skins)
    || !Array.isArray(document.accessors) || !Array.isArray(document.bufferViews)
    || document.scenes?.length !== 1 || document.nodes.length > 2048
    || document.buffers?.length !== 1 || document.buffers[0].uri
    || document.images?.some(image => image.uri) || fitted.root.parent || clips.length > 128) {
    throw new Error('Fitted export requires one bounded embedded GLB scene and an unattached fitted rig');
  }
  const chunks: Array<{ offset: number; bytes: Uint8Array }> = [{ offset: 0, bytes: parsed.binary }];
  let length = parsed.binary.length;
  const append = (values: Float32Array | Uint16Array, type: string, width: number): number => {
    const offset = Math.ceil(length / 4) * 4;
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    length = offset + bytes.length;
    if (length > 64 * 1024 * 1024) throw new Error('Fitted GLB exceeds 64 MiB');
    chunks.push({ offset, bytes });
    const bufferView = document.bufferViews.length;
    document.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length,
      ...(values instanceof Uint16Array ? { target: 34962 } : {}) });
    const index = document.accessors.length;
    document.accessors.push({ bufferView, componentType: values instanceof Uint16Array ? 5123 : 5126,
      count: values.length / width, type,
      ...(type === 'SCALAR' ? { min: [values[0]], max: [values[values.length - 1]] } : {}) });
    return index;
  };
  const vector = (index: number, expected: number[]): { count: number; at: (vertex: number, slot: number) => number } => {
    const accessor = document.accessors[index], view = accessor && document.bufferViews[accessor.bufferView];
    if (!accessor || !view || accessor.sparse || accessor.type !== 'VEC4' || !expected.includes(accessor.componentType)
      || view.buffer !== 0 || !Number.isInteger(accessor.count) || accessor.count < 1 || accessor.count > 1_000_000) {
      throw new Error('Unsupported source skin accessor');
    }
    const size = accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? size * 4;
    if (!Number.isInteger(start) || !Number.isInteger(stride) || stride < size * 4 || start < 0
      || (accessor.byteOffset ?? 0) + (accessor.count - 1) * stride + size * 4 > view.byteLength
      || start + (accessor.count - 1) * stride + size * 4 > parsed.binary.length) throw new Error('Skin accessor exceeds its buffer view');
    const data = new DataView(parsed.binary.buffer, parsed.binary.byteOffset, parsed.binary.byteLength);
    return { count: accessor.count, at: (vertex, slot) => {
      const offset = start + vertex * stride + slot * size;
      const value = size === 1 ? data.getUint8(offset) : size === 2 ? data.getUint16(offset, true) : data.getFloat32(offset, true);
      return accessor.normalized ? value / (size === 1 ? 255 : 65535) : value;
    } };
  };
  const targetByName = new Map(fitted.skeleton.bones.map((bone, index) => [bone.name, index]));
  const mapped = new Map([...fitted.sourceToTarget].map(([old, bone]) => [old.name, targetByName.get(bone.name)!]));
  const nodeStart = document.nodes.length;
  const oldNodes = document.nodes.slice(), oldMeshes = document.meshes.slice(), oldSkins = document.skins;
  const skins: Skin[] = [];
  const reboundSkins = new Map<number, number>();
  const rebindSkin = (skinIndex: number): number => {
    const existing = reboundSkins.get(skinIndex); if (existing !== undefined) return existing;
    const skin = oldSkins[skinIndex];
    const matrices: number[][] = fitted.skeleton.boneInverses.map(matrix => matrix.toArray());
    const accessor = skin.inverseBindMatrices === undefined ? undefined : document.accessors[skin.inverseBindMatrices];
    const view = accessor && document.bufferViews[accessor.bufferView];
    if (skin.inverseBindMatrices !== undefined && (!accessor || !view || accessor.type !== 'MAT4'
      || accessor.componentType !== 5126 || accessor.count !== skin.joints.length || accessor.sparse
      || view.buffer !== 0 || view.byteStride)) throw new Error('Unsupported source inverse bind accessor');
    const offset = (view?.byteOffset ?? 0) + (accessor?.byteOffset ?? 0);
    if (accessor && (!Number.isInteger(offset) || offset < 0
      || (accessor.byteOffset ?? 0) + accessor.count * 64 > view!.byteLength
      || offset + accessor.count * 64 > parsed.binary.length)) throw new Error('Inverse binds exceed their buffer view');
    const data = new DataView(parsed.binary.buffer, parsed.binary.byteOffset, parsed.binary.byteLength);
    skin.joints.forEach((node, index) => {
      const name = oldNodes[node]?.name, target = name === undefined ? undefined : mapped.get(name);
      if (target === undefined) return;
      const matrix = accessor ? Array.from({ length: 16 }, (_, element) => data.getFloat32(offset + index * 64 + element * 4, true))
        : new THREE.Matrix4().toArray();
      if (matrix.some(value => !Number.isFinite(value))) throw new Error('Invalid source inverse bind matrix');
      matrices[target] = matrix;
    });
    const index = skins.length;
    skins.push({ joints: fitted.skeleton.bones.map((_, bone) => nodeStart + bone),
      inverseBindMatrices: append(Float32Array.from(matrices.flat()), 'MAT4', 16) });
    reboundSkins.set(skinIndex, index); return index;
  };
  for (const node of oldNodes) {
    if (node.skin === undefined) continue;
    const skin = oldSkins[node.skin], mesh = node.mesh === undefined ? undefined : oldMeshes[node.mesh];
    if (!skin || !mesh || !Array.isArray(skin.joints)) throw new Error('Invalid skinned source node');
    const replacement = structuredClone(mesh);
    for (const primitive of replacement.primitives) {
      const indices = vector(primitive.attributes.JOINTS_0, [5121, 5123]);
      const weights = vector(primitive.attributes.WEIGHTS_0, [5121, 5123, 5126]);
      if (indices.count !== weights.count || primitive.attributes.JOINTS_1 !== undefined || primitive.attributes.WEIGHTS_1 !== undefined) {
        throw new Error('Fitted export requires matching four-influence skin streams');
      }
      const remapped = new Uint16Array(indices.count * 4);
      for (let vertex = 0; vertex < indices.count; vertex++) {
        let sum = 0;
        for (let slot = 0; slot < 4; slot++) {
          const weight = weights.at(vertex, slot); sum += weight;
          if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('Invalid source weight');
          if (weight === 0) continue;
          const oldIndex = indices.at(vertex, slot), sourceName = oldNodes[skin.joints[oldIndex]]?.name;
          const targetIndex = sourceName === undefined ? undefined : mapped.get(sourceName);
          if (targetIndex === undefined) throw new Error(`Unmapped weighted source joint: ${sourceName ?? oldIndex}`);
          remapped[vertex * 4 + slot] = targetIndex;
        }
        if (Math.abs(sum - 1) > 1e-5) throw new Error('Source skin weights must sum to one');
      }
      primitive.attributes.JOINTS_0 = append(remapped, 'VEC4', 4);
    }
    node.mesh = document.meshes.length; document.meshes.push(replacement); node.skin = rebindSkin(node.skin);
  }
  for (const bone of fitted.skeleton.bones) document.nodes.push({ name: bone.name,
    translation: bone.position.toArray(), rotation: bone.quaternion.toArray(), scale: bone.scale.toArray(),
    ...(bone.children.length ? { children: bone.children.map(child => fitted.skeleton.bones.indexOf(child as THREE.Bone) + nodeStart) } : {}) });
  document.scenes[0].nodes.push(...fitted.skeleton.bones.flatMap((bone, index) => bone.parent === fitted.root ? [nodeStart + index] : []));
  document.skins = skins;
  document.animations = clips.map(clip => {
    const channels: Array<{ sampler: number; target: { node: number; path: string } }> = [];
    const samplers = clip.tracks.map((track, index) => {
      const split = track.name.lastIndexOf('.'), name = track.name.slice(0, split), property = track.name.slice(split + 1);
      const boneIndex = targetByName.get(name), targetPath = { position: 'translation', quaternion: 'rotation', scale: 'scale' }[property];
      if (boneIndex === undefined || !targetPath || track.getInterpolation() !== THREE.InterpolateDiscrete) throw new Error('Unexpected fitted animation channel');
      const width = property === 'quaternion' ? 4 : 3;
      channels.push({ sampler: index, target: { node: nodeStart + boneIndex, path: targetPath } });
      return { input: append(Float32Array.from(track.times), 'SCALAR', 1), output: append(Float32Array.from(track.values), width === 4 ? 'VEC4' : 'VEC3', width), interpolation: 'STEP' };
    });
    return { name: clip.name, samplers, channels };
  });
  const binary = new Uint8Array(length); for (const chunk of chunks) binary.set(chunk.bytes, chunk.offset);
  document.buffers![0].byteLength = length;
  return buildGlbContainer(document, binary);
}
