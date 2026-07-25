import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { FBXExporter } from '../vendor/FBXExporter.js';
import { withSourceMaterialState } from '../utils/materialPreview';
import { disposeThreeObject } from '../utils/threeDisposal';
import { isThreeBone, isThreeMesh, isThreeSkinnedMesh } from '../utils/threeTypeGuards';
import { bytesToArrayBuffer } from './smfBinary';

// Basic FBX loader, mirroring glb.ts structure for consistency.
// Supports skinned meshes if present in FBX.
// Full roundtrip: loadFBX + exportFBX + re-load with FBXLoader.

export interface FbxLoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

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
    if (!isThreeSkinnedMesh(obj)) {
      return;
    }
    const geo = obj.geometry;
    const position = geo.attributes.position;
    if (!geo.attributes.uv && position) {
      const count = position.count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!geo.attributes.normal && position) {
      geo.computeVertexNormals();
    }
    if (!geo.attributes.tangent && geo.index && position && geo.attributes.normal && geo.attributes.uv) {
      geo.computeTangents?.();
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
  return withSourceMaterialState(root, async () => {
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
  });
}

const FBX_BINARY_HEADER = new Uint8Array([
  ...new TextEncoder().encode('Kaydara FBX Binary  \0'),
  0x1a,
  0x00,
]);
const FBX_BINARY_VERSION = 7500;
const VALUE_TOLERANCE = 1e-3;

export interface FbxRoundtripSummary {
  byteLength: number;
  version: number;
  meshCount: number;
  meshNames: string[];
  skinnedMeshCount: number;
  boneCount: number;
  primitiveVertexCount: number;
  clipCount: number;
  clipNames: string[];
  trackCounts: number[];
}

function assertFiniteValues(values: Iterable<number>, label: string): void {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error(`FBX roundtrip validation failed: non-finite ${label}.`);
    }
  }
}

function readAttributeComponent(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  component: number,
): number {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  return attribute.getW(index);
}

function validateRepresentativeSkin(mesh: THREE.SkinnedMesh): void {
  const position = mesh.geometry.getAttribute('position');
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight) {
    throw new Error(
      `FBX roundtrip validation failed: skinned mesh ${mesh.name || 'unnamed'} is missing position, skinIndex, or skinWeight data.`,
    );
  }
  if (skinIndex.itemSize < 4
    || skinWeight.itemSize < 4
    || skinIndex.count !== position.count
    || skinWeight.count !== position.count) {
    throw new Error(
      `FBX roundtrip validation failed: skinned mesh ${mesh.name || 'unnamed'} has mismatched skin attribute shape.`,
    );
  }
  if (mesh.skeleton.bones.length === 0) {
    throw new Error(
      `FBX roundtrip validation failed: skinned mesh ${mesh.name || 'unnamed'} has no bones.`,
    );
  }
  assertFiniteValues(mesh.bindMatrix.elements, `bind matrix on ${mesh.name || 'unnamed mesh'}`);

  const sampleIndices = new Set([
    0,
    Math.floor(position.count / 2),
    Math.max(0, position.count - 1),
  ]);
  for (const vertexIndex of sampleIndices) {
    if (position.count === 0) break;
    let weightSum = 0;
    for (let component = 0; component < 4; component += 1) {
      const boneIndex = readAttributeComponent(skinIndex, vertexIndex, component);
      const weight = readAttributeComponent(skinWeight, vertexIndex, component);
      if (!Number.isInteger(boneIndex)
        || boneIndex < 0
        || boneIndex >= mesh.skeleton.bones.length) {
        throw new Error(
          `FBX roundtrip validation failed: invalid skin index ${boneIndex} on ${mesh.name || 'unnamed mesh'}.`,
        );
      }
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error(
          `FBX roundtrip validation failed: invalid skin weight on ${mesh.name || 'unnamed mesh'}.`,
        );
      }
      weightSum += weight;
    }
    if (weightSum <= 0) {
      throw new Error(
        `FBX roundtrip validation failed: sampled vertex has no skin influence on ${mesh.name || 'unnamed mesh'}.`,
      );
    }
  }
}

function validateTrack(root: THREE.Object3D, track: THREE.KeyframeTrack): void {
  if (track.times.length === 0 || track.values.length !== track.times.length * track.getValueSize()) {
    throw new Error(
      `FBX roundtrip validation failed: animation track ${track.name} has mismatched keyframe data.`,
    );
  }
  assertFiniteValues(track.times, `time in ${track.name}`);
  assertFiniteValues(track.values, `value in ${track.name}`);

  const path = THREE.PropertyBinding.parseTrackName(track.name);
  if (path.nodeName && !THREE.PropertyBinding.findNode(root, path.nodeName)) {
    throw new Error(
      `FBX roundtrip validation failed: animation target ${path.nodeName} is missing.`,
    );
  }
}

function summarizeFbxScene(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
  byteLength: number,
  version: number,
): FbxRoundtripSummary {
  let meshCount = 0;
  let skinnedMeshCount = 0;
  let boneCount = 0;
  let primitiveVertexCount = 0;
  const meshNames: string[] = [];

  root.traverse((node) => {
    assertFiniteValues([
      node.position.x, node.position.y, node.position.z,
      node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w,
      node.scale.x, node.scale.y, node.scale.z,
    ], `transform on ${node.name || node.type}`);

    if (isThreeBone(node)) boneCount += 1;
    if (!isThreeMesh(node)) return;
    meshCount += 1;
    meshNames.push(node.name || `mesh-${meshCount - 1}`);
    const position = node.geometry.getAttribute('position');
    if (!position) {
      throw new Error(
        `FBX roundtrip validation failed: mesh ${node.name || 'unnamed'} has no position data.`,
      );
    }
    primitiveVertexCount += node.geometry.getIndex()?.count ?? position.count;
    if (isThreeSkinnedMesh(node)) {
      skinnedMeshCount += 1;
      validateRepresentativeSkin(node);
    }
  });

  for (const clip of clips) {
    if (!Number.isFinite(clip.duration) || clip.duration < 0) {
      throw new Error(
        `FBX roundtrip validation failed: non-finite duration on ${clip.name || 'unnamed clip'}.`,
      );
    }
    clip.tracks.forEach((track) => validateTrack(root, track));
  }

  return {
    byteLength,
    version,
    meshCount,
    meshNames: meshNames.sort(),
    skinnedMeshCount,
    boneCount,
    primitiveVertexCount,
    clipCount: clips.length,
    clipNames: clips.map((clip) => clip.name),
    trackCounts: clips.map((clip) => clip.tracks.length),
  };
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= VALUE_TOLERANCE * Math.max(1, Math.abs(left), Math.abs(right));
}

function assertMatchingTrackEndpoints(
  sourceTrack: THREE.KeyframeTrack,
  actualTrack: THREE.KeyframeTrack,
): void {
  const sourceSize = sourceTrack.getValueSize();
  const actualSize = actualTrack.getValueSize();
  if (sourceSize !== actualSize) {
    throw new Error(
      `FBX roundtrip validation failed: ${sourceTrack.name} value size changed from ${sourceSize} to ${actualSize}.`,
    );
  }
  const sourceLastKey = sourceTrack.times.length - 1;
  const actualLastKey = actualTrack.times.length - 1;
  const sourceTimes = [sourceTrack.times[0], sourceTrack.times[sourceLastKey]];
  const actualTimes = [actualTrack.times[0], actualTrack.times[actualLastKey]];
  if (!sourceTimes.every((value, index) => nearlyEqual(value, actualTimes[index]))) {
    throw new Error(
      `FBX roundtrip validation failed: ${sourceTrack.name} endpoint times changed.`,
    );
  }

  const endpointPairs: Array<[number, number]> = [
    [0, 0],
    [sourceLastKey * sourceSize, actualLastKey * actualSize],
  ];
  for (const [sourceOffset, actualOffset] of endpointPairs) {
    if (sourceTrack instanceof THREE.QuaternionKeyframeTrack
      || sourceTrack.name.endsWith('.quaternion')) {
      let dot = 0;
      let sourceLength = 0;
      let actualLength = 0;
      for (let component = 0; component < sourceSize; component += 1) {
        const sourceValue = sourceTrack.values[sourceOffset + component];
        const actualValue = actualTrack.values[actualOffset + component];
        dot += sourceValue * actualValue;
        sourceLength += sourceValue * sourceValue;
        actualLength += actualValue * actualValue;
      }
      const normalizedDot = Math.abs(dot) / Math.sqrt(sourceLength * actualLength);
      if (!Number.isFinite(normalizedDot) || 1 - normalizedDot > VALUE_TOLERANCE) {
        throw new Error(
          `FBX roundtrip validation failed: ${sourceTrack.name} endpoint rotation changed.`,
        );
      }
      continue;
    }

    for (let component = 0; component < sourceSize; component += 1) {
      if (!nearlyEqual(
        sourceTrack.values[sourceOffset + component],
        actualTrack.values[actualOffset + component],
      )) {
        throw new Error(
          `FBX roundtrip validation failed: ${sourceTrack.name} endpoint value changed.`,
        );
      }
    }
  }
}

function assertMatchingFbxSummary(
  expected: FbxRoundtripSummary,
  actual: FbxRoundtripSummary,
  sourceClips: THREE.AnimationClip[],
  actualClips: THREE.AnimationClip[],
): void {
  const checks: Array<[string, number, number]> = [
    ['mesh count', expected.meshCount, actual.meshCount],
    ['skinned mesh count', expected.skinnedMeshCount, actual.skinnedMeshCount],
    ['bone count', expected.boneCount, actual.boneCount],
    ['render vertex count', expected.primitiveVertexCount, actual.primitiveVertexCount],
    ['clip count', expected.clipCount, actual.clipCount],
  ];
  for (const [label, expectedValue, actualValue] of checks) {
    if (expectedValue !== actualValue) {
      throw new Error(
        `FBX roundtrip validation failed: ${label} changed from ${expectedValue} to ${actualValue}.`,
      );
    }
  }
  if (expected.meshNames.join('\0') !== actual.meshNames.join('\0')) {
    throw new Error('FBX roundtrip validation failed: mesh names changed during re-import.');
  }

  sourceClips.forEach((sourceClip, clipIndex) => {
    const actualClip = actualClips[clipIndex];
    if (!actualClip) return;
    if (sourceClip.name && sourceClip.name !== actualClip.name) {
      throw new Error(
        `FBX roundtrip validation failed: clip ${clipIndex} changed from ${sourceClip.name} to ${actualClip.name || 'unnamed'}.`,
      );
    }
    if (sourceClip.tracks.length !== actualClip.tracks.length) {
      throw new Error(
        `FBX roundtrip validation failed: ${sourceClip.name || `clip ${clipIndex}`} track count changed from ${sourceClip.tracks.length} to ${actualClip.tracks.length}.`,
      );
    }
    if (!nearlyEqual(sourceClip.duration, actualClip.duration)) {
      throw new Error(
        `FBX roundtrip validation failed: ${sourceClip.name || `clip ${clipIndex}`} duration changed.`,
      );
    }
    sourceClip.tracks.forEach((sourceTrack) => {
      const actualTrack = actualClip.tracks.find((track) => track.name === sourceTrack.name);
      if (!actualTrack) {
        throw new Error(
          `FBX roundtrip validation failed: animation track ${sourceTrack.name} is missing.`,
        );
      }
      assertMatchingTrackEndpoints(sourceTrack, actualTrack);
    });
  });
}

function readFbxVersion(bytes: Uint8Array): number {
  if (bytes.byteLength < FBX_BINARY_HEADER.byteLength + 4) {
    throw new Error('FBX roundtrip validation failed: exporter returned an empty or truncated file.');
  }
  for (let index = 0; index < FBX_BINARY_HEADER.byteLength; index += 1) {
    if (bytes[index] !== FBX_BINARY_HEADER[index]) {
      throw new Error('FBX roundtrip validation failed: binary FBX header is missing.');
    }
  }
  const version = new DataView(
    bytes.buffer,
    bytes.byteOffset + FBX_BINARY_HEADER.byteLength,
    4,
  ).getUint32(0, true);
  if (version !== FBX_BINARY_VERSION) {
    throw new Error(
      `FBX roundtrip validation failed: expected binary FBX ${FBX_BINARY_VERSION}, received ${version}.`,
    );
  }
  return version;
}

export async function validateExportedFBX(
  bytes: Uint8Array,
  sourceRoot: THREE.Group,
  sourceClips: THREE.AnimationClip[] = [],
): Promise<FbxRoundtripSummary> {
  const version = readFbxVersion(bytes);
  const expected = summarizeFbxScene(sourceRoot, sourceClips, bytes.byteLength, version);
  const loaded = await loadFBX(bytesToArrayBuffer(bytes));
  try {
    const actual = summarizeFbxScene(loaded.root, loaded.clips, bytes.byteLength, version);
    assertMatchingFbxSummary(expected, actual, sourceClips, loaded.clips);
    return actual;
  } finally {
    loaded.mixer.stopAllAction();
    disposeThreeObject(loaded.root);
  }
}
