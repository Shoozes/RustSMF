import * as THREE from 'three';
import { isThreeSkinnedMesh } from './threeTypeGuards';
import { getSkinnedVertexWorldPosition } from './skinnedVertexPosition';

export interface SkinValidationSummary {
  mesh: string;
  vertexCount: number;
  boneCount: number;
  maxWeightSumError: number;
  unweightedVertices: number;
  invalidInfluences: number;
}

export interface DeformationSample {
  clip: string;
  time: number;
  min: [number, number, number];
  max: [number, number, number];
  sampledVertices: number;
}

export interface GameReadyValidationReport {
  boneCount: number;
  rootBones: string[];
  clipCount: number;
  clips: Array<{ name: string; duration: number; trackCount: number }>;
  skin: SkinValidationSummary[];
  deformationSamples: DeformationSample[];
}

function readComponent(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertex: number,
  component: number,
): number {
  return attribute.getComponent(vertex, component);
}

function validateSkin(mesh: THREE.SkinnedMesh): SkinValidationSummary {
  const position = mesh.geometry.getAttribute('position');
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight) {
    throw new Error(`Skinned mesh ${mesh.name || '(unnamed)'} is missing position, skinIndex, or skinWeight.`);
  }
  if (skinIndex.itemSize !== 4 || skinWeight.itemSize !== 4 || skinIndex.count !== position.count || skinWeight.count !== position.count) {
    throw new Error(`Skinned mesh ${mesh.name || '(unnamed)'} must contain exactly four skin slots per vertex.`);
  }
  let maxWeightSumError = 0;
  let unweightedVertices = 0;
  let invalidInfluences = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    let sum = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      const index = readComponent(skinIndex, vertex, influence);
      const weight = readComponent(skinWeight, vertex, influence);
      if (!Number.isInteger(index) || index < 0 || index >= mesh.skeleton.bones.length || !Number.isFinite(weight) || weight < 0) {
        invalidInfluences += 1;
      }
      sum += weight;
    }
    if (sum <= 1e-8) unweightedVertices += 1;
    maxWeightSumError = Math.max(maxWeightSumError, Math.abs(sum - 1));
  }
  if (invalidInfluences > 0 || unweightedVertices > 0 || maxWeightSumError > 1e-4) {
    throw new Error(
      `Skin validation failed for ${mesh.name || '(unnamed)'}: ${invalidInfluences} invalid influences, ${unweightedVertices} unweighted vertices, maximum sum error ${maxWeightSumError}.`,
    );
  }
  return {
    mesh: mesh.name || '(unnamed)',
    vertexCount: position.count,
    boneCount: mesh.skeleton.bones.length,
    maxWeightSumError,
    unweightedVertices,
    invalidInfluences,
  };
}

function validateSkeleton(skeleton: THREE.Skeleton): string[] {
  if (skeleton.bones.length === 0) throw new Error('Skeleton contains no bones.');
  const names = new Set<string>();
  const boneSet = new Set(skeleton.bones);
  const roots: string[] = [];
  for (const bone of skeleton.bones) {
    if (!bone.name.trim()) throw new Error('Skeleton contains an unnamed bone.');
    if (names.has(bone.name)) throw new Error(`Skeleton contains duplicate bone name ${bone.name}.`);
    names.add(bone.name);
    const transforms = [...bone.position.toArray(), ...bone.quaternion.toArray(), ...bone.scale.toArray()];
    if (transforms.some((value) => !Number.isFinite(value))) throw new Error(`Bone ${bone.name} has a non-finite rest transform.`);
    if (bone.parent instanceof THREE.Bone) {
      if (!boneSet.has(bone.parent)) throw new Error(`Bone ${bone.name} has an orphaned bone parent ${bone.parent.name}.`);
      const visited = new Set<THREE.Bone>([bone]);
      let cursor: THREE.Bone | null = bone.parent;
      while (cursor) {
        if (visited.has(cursor)) throw new Error(`Skeleton contains a cycle at ${bone.name}.`);
        visited.add(cursor);
        cursor = cursor.parent instanceof THREE.Bone ? cursor.parent : null;
      }
    } else {
      roots.push(bone.name);
    }
  }
  if (roots.length !== 1) throw new Error(`Skeleton must have one deform root; found ${roots.length}: ${roots.join(', ')}.`);
  return roots;
}

function validateClips(root: THREE.Object3D, clips: readonly THREE.AnimationClip[]): void {
  const clipNames = new Set<string>();
  for (const clip of clips) {
    if (!clip.name.trim()) throw new Error('Animation contains an unnamed clip.');
    if (clipNames.has(clip.name)) throw new Error(`Animation contains duplicate clip name ${clip.name}.`);
    clipNames.add(clip.name);
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`Clip ${clip.name} has an invalid duration.`);
    for (const track of clip.tracks) {
      if (track.times.length === 0 || track.values.length !== track.times.length * track.getValueSize()) {
        throw new Error(`Track ${track.name} has invalid key/value shape.`);
      }
      if ([...track.times, ...track.values].some((value) => !Number.isFinite(value))) {
        throw new Error(`Track ${track.name} contains non-finite values.`);
      }
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      if (parsed.nodeName && !THREE.PropertyBinding.findNode(root, parsed.nodeName)) {
        throw new Error(`Track ${track.name} targets missing node ${parsed.nodeName}.`);
      }
    }
  }
}

function sampleDeformation(
  root: THREE.Object3D,
  meshes: readonly THREE.SkinnedMesh[],
  clips: readonly THREE.AnimationClip[],
): DeformationSample[] {
  const samples: DeformationSample[] = [];
  for (const clip of clips) {
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    try {
      const times = [0, clip.duration * 0.25, clip.duration * 0.5, clip.duration * 0.75, clip.duration];
      for (const time of times) {
        mixer.setTime(time);
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3();
        let sampledVertices = 0;
        for (const mesh of meshes) {
          const position = mesh.geometry.getAttribute('position');
          if (!position) continue;
          mesh.skeleton.update();
          for (let vertex = 0; vertex < position.count; vertex += 1) {
            const point = new THREE.Vector3();
            const failure = getSkinnedVertexWorldPosition(mesh, vertex, point);
            if (failure) throw new Error(`Deformation sample failed for ${mesh.name || '(unnamed)'} vertex ${vertex}: ${failure}.`);
            bounds.expandByPoint(point);
            sampledVertices += 1;
          }
        }
        if (sampledVertices === 0 || bounds.isEmpty()) throw new Error(`Clip ${clip.name} produced no deformation samples.`);
        const min = bounds.min.toArray();
        const max = bounds.max.toArray();
        if ([...min, ...max].some((value) => !Number.isFinite(value))) throw new Error(`Clip ${clip.name} produced non-finite bounds at ${time}s.`);
        samples.push({ clip: clip.name, time, min, max, sampledVertices });
      }
    } finally {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
  }
  return samples;
}

export function validateGameReadyModel(
  root: THREE.Object3D,
  skeleton: THREE.Skeleton,
  clips: readonly THREE.AnimationClip[],
): GameReadyValidationReport {
  const rootBones = validateSkeleton(skeleton);
  validateClips(root, clips);
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if (isThreeSkinnedMesh(object)) meshes.push(object);
  });
  if (meshes.length === 0) throw new Error('Game-ready validation requires at least one skinned mesh.');
  const skin = meshes.map(validateSkin);
  const deformationSamples = sampleDeformation(root, meshes, clips);
  return {
    boneCount: skeleton.bones.length,
    rootBones,
    clipCount: clips.length,
    clips: clips.map((clip) => ({ name: clip.name, duration: clip.duration, trackCount: clip.tracks.length })),
    skin,
    deformationSamples,
  };
}
