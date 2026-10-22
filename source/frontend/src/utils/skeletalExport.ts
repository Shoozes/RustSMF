import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';

export const SKELETAL_ASSET_SCHEMA = 'gaim.skeletal-asset.v1';
export const SKELETAL_MAPPING_SCHEMA = 'gaim.skeletal-export-mapping.v1';
export const SKELETAL_REFERENCES_SCHEMA = 'gaim.skeletal-reference-samples.v1';
export const SKELETAL_EXPORT_TICK_RATE = 60;
export const SKELETAL_ASSET_REQUEST_LIMIT = 4 * 1024 * 1024;
export const SKELETAL_REFERENCE_LIMIT = 16 * 1024 * 1024;

const MAX_JOINTS = 64;
const MAX_VERTICES = 8192;
const MAX_INDICES = 49_152;
const MAX_CLIPS = 32;
const MAX_KEYS = 16_384;
const IDENTIFIER = /^[A-Za-z0-9_.-]{1,64}$/;
const BIND_SHAPE_TOLERANCE = 1e-4;

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Matrix = number[];

export interface SkeletalTransform {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface SkeletalAssetDocument {
  schema: typeof SKELETAL_ASSET_SCHEMA;
  id: string;
  joints: Array<{ id: string; parent: number; bind: SkeletalTransform }>;
  mesh: {
    positions: Vec3[];
    normals: Vec3[];
    indices: number[];
    joints: Array<[number, number, number, number]>;
    weights: Array<[number, number, number, number]>;
  };
  clips: Array<{
    id: string;
    durationTicks: number;
    tracks: Array<{ joint: number; keys: Array<{ tick: number; transform: SkeletalTransform }> }>;
    root: Array<{ tick: number; position: Vec3; yaw: number }>;
  }>;
  sockets: [];
}

export interface SkeletalMappingDocument {
  schema: typeof SKELETAL_MAPPING_SCHEMA;
  sourceIdentitySha256: string;
  sourceJointCount: number;
  sourceVertexCount: number;
  joints: Array<{ sourceIndex: number; sourceId: string; exportIndex: number; exportId: string }>;
  vertices: Array<{ sourceIndex: number; exportIndices: number[] }>;
}

export interface SkeletalReferenceSample {
  clipId: string;
  phaseTicks: number;
  positions: Vec3[];
  normals: Vec3[];
  joints: Array<{ sourceIndex: number; matrix: Matrix }>;
  sockets: Array<{ id: string; matrix: Matrix }>;
  rootPosition: Vec3;
  rootYaw: number;
}

export interface SkeletalReferencesDocument {
  schema: typeof SKELETAL_REFERENCES_SCHEMA;
  sourceIdentitySha256: string;
  tolerances: {
    position: number;
    normalRadians: number;
    matrix: number;
    rootPosition: number;
    rootYawRadians: number;
  };
  samples: SkeletalReferenceSample[];
}

export interface SkeletalExportSettings {
  sourceRootJoint: string;
  units: 'meters';
  upAxis: '+Y';
  forwardAxis: '+Z';
  handedness: 'right';
  ticksPerSecond: typeof SKELETAL_EXPORT_TICK_RATE;
  rootMotion: 'separate-track';
}

export interface PreparedSkeletalExport {
  asset: SkeletalAssetDocument;
  mapping: SkeletalMappingDocument;
  references: SkeletalReferencesDocument;
  assetBytes: Uint8Array;
  mappingBytes: Uint8Array;
  referenceBytes: Uint8Array;
  settings: SkeletalExportSettings;
  statistics: {
    joints: number;
    vertices: number;
    indices: number;
    clips: number;
    keys: number;
    referenceSamples: number;
  };
}

export interface PrepareSkeletalExportOptions {
  sourceIdentitySha256: string;
  rootJoint: string;
  signal?: AbortSignal;
  yieldEvery?: number;
}

interface SourceMesh {
  mesh: THREE.SkinnedMesh;
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  normals: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  bindMatrix: THREE.Matrix4;
  bindNormal: THREE.Matrix3;
  vertexStart: number;
  sourceIndices: number[];
}

interface SampledPose {
  tick: number;
  rootPosition: Vec3;
  rootYaw: number;
  adjustedGlobals: THREE.Matrix4[];
  localTransforms: SkeletalTransform[];
}

function fail(message: string): never {
  throw new Error(message);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = signal.reason instanceof Error ? signal.reason : new Error('Skeletal export cancelled.');
  error.name = 'AbortError';
  throw error;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function vec3(value: THREE.Vector3): Vec3 {
  return [value.x, value.y, value.z];
}

function transformFromMatrix(matrix: THREE.Matrix4, label: string): SkeletalTransform {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  const components = [...position.toArray(), ...rotation.toArray(), ...scale.toArray()];
  if (components.some(value => !Number.isFinite(value)) || scale.toArray().some(value => Math.abs(value) < 1e-12)) {
    fail(`${label} cannot be represented as a finite, non-singular TRS transform.`);
  }
  rotation.normalize();
  const recomposed = new THREE.Matrix4().compose(position, rotation, scale);
  const original = matrix.elements;
  const rebuilt = recomposed.elements;
  const tolerance = Math.max(1, ...original.map(Math.abs)) * 1e-5;
  if (original.some((value, index) => Math.abs(value - rebuilt[index]) > tolerance)) {
    fail(`${label} contains shear or another transform that the skeletal asset contract cannot represent.`);
  }
  const q = rotation.toArray() as Quat;
  return {
    translation: vec3(position),
    rotation: q,
    scale: vec3(scale),
  };
}

function matrixRowMajor(matrix: THREE.Matrix4): Matrix {
  const values: number[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      values.push(matrix.elements[column * 4 + row]);
    }
  }
  return values;
}

function validIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

function exportedJointId(name: string, sourceIndex: number): string {
  return validIdentifier(name) ? name : `joint_${sourceIndex}`;
}

function sampleTick(time: number, clipName: string, trackName: string): number {
  const tick = time * SKELETAL_EXPORT_TICK_RATE;
  const rounded = Math.round(tick);
  if (!Number.isFinite(tick) || Math.abs(tick - rounded) > 1e-3) {
    fail(`Clip ${clipName} track ${trackName} has a key at ${time}s that does not map to an integer 60 Hz tick.`);
  }
  return rounded;
}

function makeRootMotion(
  currentRoot: THREE.Matrix4,
  bindRoot: THREE.Matrix4,
  clipName: string,
  phase: string,
): { position: Vec3; yaw: number; matrix: THREE.Matrix4 } {
  const currentPosition = new THREE.Vector3();
  const currentRotation = new THREE.Quaternion();
  const currentScale = new THREE.Vector3();
  currentRoot.decompose(currentPosition, currentRotation, currentScale);
  const bindPosition = new THREE.Vector3();
  const bindRotation = new THREE.Quaternion();
  const bindScale = new THREE.Vector3();
  bindRoot.decompose(bindPosition, bindRotation, bindScale);
  const position = currentPosition.sub(bindPosition);
  const rotationDelta = currentRotation.multiply(bindRotation.invert()).normalize();
  if (rotationDelta.w < 0) rotationDelta.set(-rotationDelta.x, -rotationDelta.y, -rotationDelta.z, -rotationDelta.w);
  const yaw = 2 * Math.atan2(rotationDelta.y, rotationDelta.w);
  const wrappedYaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, 2 * Math.PI) - Math.PI;
  const yawRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wrappedYaw);
  const residual = yawRotation.clone().invert().multiply(rotationDelta).normalize();
  const residualAngle = 2 * Math.acos(Math.min(1, Math.abs(residual.w)));
  if (!Number.isFinite(residualAngle) || residualAngle > 1e-5) {
    fail(`Clip ${clipName} root at ${phase} contains pitch or roll; separate-track export supports translation and +Y yaw while preserving the residual joint pose.`);
  }
  if (position.toArray().some(value => !Number.isFinite(value))) {
    fail(`Clip ${clipName} root at ${phase} has a non-finite translation.`);
  }
  const rootMatrix = new THREE.Matrix4().compose(
    position,
    yawRotation,
    new THREE.Vector3(1, 1, 1),
  );
  return { position: vec3(position), yaw: wrappedYaw, matrix: rootMatrix };
}

function referencePhases(durationTicks: number): number[] {
  const interior = [
    durationTicks * 0.25 + 0.125,
    durationTicks * 0.5 + 0.25,
    durationTicks * 0.75 - 0.125,
  ].filter(phase => phase > 0 && phase < durationTicks);
  return [0, ...[...new Set(interior)].sort((a, b) => a - b), durationTicks];
}

function interpolationIsLinear(track: THREE.KeyframeTrack): boolean {
  return track.getInterpolation() === THREE.InterpolateLinear;
}

function interpolationLabel(track: THREE.KeyframeTrack): string {
  const interpolation = track.getInterpolation();
  if (interpolation === THREE.InterpolateDiscrete) return 'STEP';
  if (interpolation === THREE.InterpolateSmooth) return 'SMOOTH';
  return `unknown (${interpolation})`;
}

function validateFiniteTransform(transform: SkeletalTransform, label: string): void {
  const values = [...transform.translation, ...transform.rotation, ...transform.scale];
  if (values.some(value => !Number.isFinite(value))) fail(`${label} contains a non-finite value.`);
  const rotationLength = Math.hypot(...transform.rotation);
  if (Math.abs(rotationLength - 1) > 1e-6) fail(`${label} quaternion is not normalized.`);
}

function directParentBone(bone: THREE.Bone, boneSet: Set<THREE.Bone>): THREE.Bone | null {
  let cursor = bone.parent;
  while (cursor && !boneSet.has(cursor as THREE.Bone)) cursor = cursor.parent;
  return cursor as THREE.Bone | null;
}

function orderedBones(bones: readonly THREE.Bone[]): { bones: THREE.Bone[]; parents: Map<THREE.Bone, THREE.Bone | null> } {
  if (bones.length === 0 || bones.length > MAX_JOINTS) {
    fail(`Skeleton has ${bones.length} joints; the skeletal asset limit is ${MAX_JOINTS}.`);
  }
  const boneSet = new Set(bones);
  const names = new Set<string>();
  const parents = new Map<THREE.Bone, THREE.Bone | null>();
  const children = new Map<THREE.Bone | null, THREE.Bone[]>();
  for (const bone of bones) {
    if (!bone.name.trim()) fail('Skeleton contains an unnamed joint; name every exported joint before export.');
    if (names.has(bone.name)) fail(`Skeleton contains duplicate joint name ${bone.name}; resolve it before export.`);
    names.add(bone.name);
    const parent = directParentBone(bone, boneSet);
    parents.set(bone, parent);
    const siblings = children.get(parent) ?? [];
    siblings.push(bone);
    children.set(parent, siblings);
  }
  const roots = children.get(null) ?? [];
  if (roots.length !== 1) fail(`Skeleton must have one root joint; found ${roots.length}.`);
  const ordered: THREE.Bone[] = [];
  const visiting = new Set<THREE.Bone>();
  const visited = new Set<THREE.Bone>();
  const visit = (bone: THREE.Bone): void => {
    if (visiting.has(bone)) fail(`Skeleton contains a parent cycle at ${bone.name}.`);
    if (visited.has(bone)) return;
    visiting.add(bone);
    ordered.push(bone);
    for (const child of children.get(bone) ?? []) visit(child);
    visiting.delete(bone);
    visited.add(bone);
  };
  visit(roots[0]);
  if (ordered.length !== bones.length) fail('Skeleton contains joints outside its single root hierarchy.');
  return { bones: ordered, parents };
}

function sourceMeshRecords(
  loaded: LoadedModel,
  boneSet: Set<THREE.Bone>,
  bindShape: THREE.Matrix4,
): SourceMesh[] {
  if (loaded.skinnedMeshes.length === 0) fail('Input has no skinned mesh.');
  const unexpected: string[] = [];
  loaded.root.traverse(object => {
    if ((object as THREE.Mesh).isMesh && !(object as THREE.SkinnedMesh).isSkinnedMesh) {
      unexpected.push(object.name || '(unnamed mesh)');
    }
  });
  if (unexpected.length > 0) {
    fail(`Input contains ${unexpected.length} unskinned mesh(es) (${unexpected.slice(0, 4).join(', ')}); this skeletal asset format cannot represent them.`);
  }
  let vertexStart = 0;
  let indexCount = 0;
  const records = loaded.skinnedMeshes.map((mesh, meshNumber) => {
    if (mesh.skeleton !== loaded.skeleton) {
      fail(`Skinned mesh ${mesh.name || meshNumber} uses a different skeleton; multi-skeleton assets are not supported.`);
    }
    if (mesh.skeleton.bones.length !== boneSet.size || mesh.skeleton.bones.some(bone => !boneSet.has(bone))) {
      fail(`Skinned mesh ${mesh.name || meshNumber} has a different joint binding.`);
    }
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    if (!positions || !normals || !skinIndex || !skinWeight) {
      fail(`Skinned mesh ${mesh.name || meshNumber} requires position, normal, skinIndex, and skinWeight attributes.`);
    }
    if (normals.count !== positions.count || skinIndex.count !== positions.count || skinWeight.count !== positions.count) {
      fail(`Skinned mesh ${mesh.name || meshNumber} has mismatched vertex attributes.`);
    }
    if (skinIndex.itemSize !== 4 || skinWeight.itemSize !== 4) {
      fail(`Skinned mesh ${mesh.name || meshNumber} must retain exactly four influence slots per vertex.`);
    }
    if (positions.count < 3) fail(`Skinned mesh ${mesh.name || meshNumber} has fewer than three vertices.`);
    const index = mesh.geometry.index;
    if (index && index.count % 3 !== 0) fail(`Skinned mesh ${mesh.name || meshNumber} index count is not a triangle list.`);
    if (!index && positions.count % 3 !== 0) fail(`Unindexed skinned mesh ${mesh.name || meshNumber} is not a triangle list.`);
    const meshIndexCount = index?.count ?? positions.count;
    if (vertexStart + positions.count > MAX_VERTICES) {
      fail(`Input contains more than ${MAX_VERTICES} skinned vertices after RustSMF loading. No vertices were removed.`);
    }
    if (indexCount + meshIndexCount > MAX_INDICES) {
      fail(`Input contains more than ${MAX_INDICES} triangle indices. No triangles were removed.`);
    }
    const sourceIndices: number[] = [];
    if (index) {
      for (let cursor = 0; cursor < index.count; cursor += 1) {
        const value = index.getX(cursor);
        if (!Number.isInteger(value) || value < 0 || value >= positions.count) {
          fail(`Skinned mesh ${mesh.name || meshNumber} has an out-of-range triangle index.`);
        }
        sourceIndices.push(value + vertexStart);
      }
    } else {
      for (let cursor = 0; cursor < positions.count; cursor += 1) sourceIndices.push(cursor + vertexStart);
    }
    indexCount += sourceIndices.length;
    const bindMatrix = bindShape.clone().multiply(mesh.bindMatrix.clone());
    const determinant = bindMatrix.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
      fail(`Skinned mesh ${mesh.name || meshNumber} has a singular bind transform.`);
    }
    const bindNormal = new THREE.Matrix3().getNormalMatrix(bindMatrix);
    const result: SourceMesh = {
      mesh,
      positions,
      normals,
      skinIndex,
      skinWeight,
      bindMatrix,
      bindNormal,
      vertexStart,
      sourceIndices,
    };
    vertexStart += positions.count;
    return result;
  });
  if (vertexStart > MAX_VERTICES) {
    fail(`Input contains ${vertexStart} skinned vertices after RustSMF loading; the asset limit is ${MAX_VERTICES}. No vertices were removed.`);
  }
  if (indexCount === 0 || indexCount > MAX_INDICES) {
    fail(`Input contains ${indexCount} triangle indices; the asset limit is ${MAX_INDICES}.`);
  }
  return records;
}

function buildClipBindings(
  clip: THREE.AnimationClip,
  root: THREE.Object3D,
  boneIndices: Map<THREE.Bone, number>,
  rootBoneIndex: number,
): { durationTicks: number; tracks: number[][]; rootTicks: number[] } {
  if (!validIdentifier(clip.name)) fail(`Clip name ${JSON.stringify(clip.name)} cannot be used as an asset ID; rename it to 1–64 ASCII letters, digits, underscore, dot, or hyphen.`);
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) fail(`Clip ${clip.name} has an invalid duration.`);
  const durationFloat = clip.duration * SKELETAL_EXPORT_TICK_RATE;
  const durationTicks = Math.round(durationFloat);
  if (!Number.isSafeInteger(durationTicks) || Math.abs(durationFloat - durationTicks) > 1e-3 || durationTicks < 1) {
    fail(`Clip ${clip.name} duration ${clip.duration}s must map to a positive, exactly representable whole tick count at 60 Hz.`);
  }
  const ticksByBone: Array<Set<number> | undefined> = Array.from({ length: boneIndices.size }, () => undefined);
  const rootTicks = new Set<number>([0, durationTicks]);
  const seenProperties = new Set<string>();
  for (const track of clip.tracks) {
    if (!interpolationIsLinear(track)) {
      fail(`Clip ${clip.name} track ${track.name} uses unsupported ${interpolationLabel(track)} interpolation; only LINEAR vector and shortest-arc quaternion tracks are admitted.`);
    }
    if (track.times.length < 1 || track.values.length !== track.times.length * track.getValueSize()) {
      fail(`Clip ${clip.name} track ${track.name} has an invalid key/value shape.`);
    }
    if ([...track.times, ...track.values].some(value => !Number.isFinite(value))) {
      fail(`Clip ${clip.name} track ${track.name} contains a non-finite key.`);
    }
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const node = parsed.nodeName ? THREE.PropertyBinding.findNode(root, parsed.nodeName) : undefined;
    if (!(node instanceof THREE.Bone) || !boneIndices.has(node)) {
      fail(`Clip ${clip.name} track ${track.name} targets a non-joint node; the skeletal asset cannot represent that channel.`);
    }
    const property = parsed.propertyName;
    if (property !== 'position' && property !== 'quaternion' && property !== 'scale') {
      fail(`Clip ${clip.name} track ${track.name} targets unsupported property ${property}.`);
    }
    if (parsed.propertyIndex !== undefined) fail(`Clip ${clip.name} track ${track.name} targets one component; export requires complete TRS channels.`);
    const expectedSize = property === 'quaternion' ? 4 : 3;
    if (track.getValueSize() !== expectedSize) fail(`Clip ${clip.name} track ${track.name} has the wrong value size for ${property}.`);
    const boneIndex = boneIndices.get(node)!;
    const propertyKey = `${boneIndex}:${property}`;
    if (seenProperties.has(propertyKey)) fail(`Clip ${clip.name} has duplicate ${property} tracks for joint ${node.name}.`);
    seenProperties.add(propertyKey);
    let prior = -Infinity;
    for (const time of track.times) {
      if (time < 0 || time > clip.duration + 1e-4 || time <= prior) {
        fail(`Clip ${clip.name} track ${track.name} has an unordered or out-of-range key time.`);
      }
      prior = time;
      const tick = sampleTick(time, clip.name, track.name);
      if (tick < 0 || tick > durationTicks) fail(`Clip ${clip.name} track ${track.name} has a key outside its duration.`);
      ticksByBone[boneIndex] ??= new Set<number>([0, durationTicks]);
      ticksByBone[boneIndex]!.add(tick);
      if (boneIndex === rootBoneIndex) rootTicks.add(tick);
    }
  }
  const tracks = ticksByBone.map(ticks => ticks ? [...ticks].sort((a, b) => a - b) : []);
  const sortedRoot = [...rootTicks].sort((a, b) => a - b);
  return { durationTicks, tracks, rootTicks: sortedRoot };
}

function localTransforms(
  adjustedGlobals: readonly THREE.Matrix4[],
  ordered: readonly THREE.Bone[],
  parents: ReadonlyMap<THREE.Bone, THREE.Bone | null>,
  orderedIndices: ReadonlyMap<THREE.Bone, number>,
): SkeletalTransform[] {
  return ordered.map((bone, index) => {
    const parent = parents.get(bone) ?? null;
    const local = parent
      ? adjustedGlobals[orderedIndices.get(parent)!].clone().invert().multiply(adjustedGlobals[index])
      : adjustedGlobals[index].clone();
    const transform = transformFromMatrix(local, `Joint ${bone.name}`);
    validateFiniteTransform(transform, `Joint ${bone.name}`);
    return transform;
  });
}

function capturePose(
  root: THREE.Object3D,
  rootInverse: THREE.Matrix4,
  ordered: readonly THREE.Bone[],
  parents: ReadonlyMap<THREE.Bone, THREE.Bone | null>,
  orderedIndices: ReadonlyMap<THREE.Bone, number>,
  rootBoneIndex: number,
  bindGlobals: readonly THREE.Matrix4[],
  tick: number,
  clipName: string,
): SampledPose {
  root.updateMatrixWorld(true);
  const currentGlobals = ordered.map(bone => rootInverse.clone().multiply(bone.matrixWorld));
  const motion = makeRootMotion(
    currentGlobals[rootBoneIndex],
    bindGlobals[rootBoneIndex],
    clipName,
    `tick ${tick}`,
  );
  const motionInverse = motion.matrix.clone().invert();
  const adjustedGlobals = currentGlobals.map(matrix => motionInverse.clone().multiply(matrix));
  for (const [index, matrix] of adjustedGlobals.entries()) {
    if (matrix.elements.some(value => !Number.isFinite(value))) {
      fail(`Clip ${clipName} joint ${ordered[index].name} at tick ${tick} exceeds the admitted matrix bounds.`);
    }
  }
  const transforms = localTransforms(adjustedGlobals, ordered, parents, orderedIndices);
  return {
    tick,
    rootPosition: motion.position,
    rootYaw: motion.yaw,
    adjustedGlobals,
    localTransforms: transforms,
  };
}

function sourceReferenceGeometry(
  meshes: readonly SourceMesh[],
  adjustedGlobals: readonly THREE.Matrix4[],
  inverseBindGlobals: readonly THREE.Matrix4[],
  sourceToExportJoint: readonly number[],
): { positions: Vec3[]; normals: Vec3[] } {
  const palette = adjustedGlobals.map((global, index) => global.clone().multiply(inverseBindGlobals[index]));
  const normalPalette = palette.map(matrix => new THREE.Matrix3().getNormalMatrix(matrix));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  for (const source of meshes) {
    for (let vertex = 0; vertex < source.positions.count; vertex += 1) {
      const bindPosition = new THREE.Vector3(
        source.positions.getComponent(vertex, 0),
        source.positions.getComponent(vertex, 1),
        source.positions.getComponent(vertex, 2),
      ).applyMatrix4(source.bindMatrix);
      const bindNormal = new THREE.Vector3(
        source.normals.getComponent(vertex, 0),
        source.normals.getComponent(vertex, 1),
        source.normals.getComponent(vertex, 2),
      ).applyMatrix3(source.bindNormal);
      if (![...bindPosition.toArray(), ...bindNormal.toArray()].every(Number.isFinite) || bindNormal.lengthSq() < 1e-16) {
        fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} has a non-finite or zero bind normal.`);
      }
      bindNormal.normalize();
      const point = new THREE.Vector3();
      const normal = new THREE.Vector3();
      for (let influence = 0; influence < 4; influence += 1) {
        const sourceJoint = source.skinIndex.getComponent(vertex, influence);
        const weight = source.skinWeight.getComponent(vertex, influence);
        const exportJoint = sourceToExportJoint[sourceJoint];
        const transformedPosition = bindPosition.clone().applyMatrix4(palette[exportJoint]);
        const transformedNormal = bindNormal.clone().applyMatrix3(normalPalette[exportJoint]);
        point.addScaledVector(transformedPosition, weight);
        normal.addScaledVector(transformedNormal, weight);
      }
      if (!Number.isFinite(point.lengthSq()) || !Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 1e-16) {
        fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} produced invalid deformation.`);
      }
      if (point.toArray().some(value => !Number.isFinite(value))) {
        fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} exceeds the admitted deformation bounds.`);
      }
      normal.normalize();
      positions.push(vec3(point));
      normals.push(vec3(normal));
    }
  }
  return { positions, normals };
}

function createMixer(root: THREE.Object3D, clip: THREE.AnimationClip): { mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return { mixer, action };
}

function cleanupMixer(root: THREE.Object3D, mixer: THREE.AnimationMixer, action: THREE.AnimationAction): void {
  action.stop();
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
}

function setMixerTime(
  mixer: THREE.AnimationMixer,
  action: THREE.AnimationAction,
  seconds: number,
): void {
  action.reset();
  action.play();
  mixer.setTime(seconds);
}

function totalKeyCount(bindings: readonly { tracks: number[][]; rootTicks: number[] }[]): number {
  return bindings.reduce((sum, binding) => sum
    + binding.tracks.reduce((clipSum, ticks) => clipSum + ticks.length, 0)
    + binding.rootTicks.length, 0);
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
}

export async function prepareSkeletalExport(
  loaded: LoadedModel,
  options: PrepareSkeletalExportOptions,
): Promise<PreparedSkeletalExport> {
  if (!/^[a-f0-9]{64}$/.test(options.sourceIdentitySha256)) {
    fail('Source identity must be a lowercase SHA-256 digest.');
  }
  throwIfAborted(options.signal);
  if (!loaded.skeleton) fail('Input has no bound skeleton.');
  if (loaded.clips.length > MAX_CLIPS) {
    fail(`Input has ${loaded.clips.length} animation clips; export accepts at most ${MAX_CLIPS}.`);
  }
  const clipNames = new Set<string>();
  for (const clip of loaded.clips) {
    if (clipNames.has(clip.name)) fail(`Input contains duplicate animation clip name ${clip.name}.`);
    clipNames.add(clip.name);
  }
  const sourceBones = loaded.skeleton.bones;
  const sourceIndices = new Map(sourceBones.map((bone, index) => [bone, index]));
  const orderedData = orderedBones(sourceBones);
  const ordered = orderedData.bones;
  const parentByBone = orderedData.parents;
  const rootBone = ordered.find(bone => parentByBone.get(bone) === null)!;
  if (rootBone.name !== options.rootJoint) {
    fail(`Requested root joint ${options.rootJoint} does not match the single skeleton root ${rootBone.name}.`);
  }
  const rootBoneIndex = ordered.indexOf(rootBone);
  const exportIndices = new Map(ordered.map((bone, index) => [bone, index]));
  const exportIds = new Map(ordered.map((bone, sourceIndex) => [
    bone,
    exportedJointId(bone.name, sourceIndices.get(bone) ?? sourceIndex),
  ]));
  if (new Set(exportIds.values()).size !== exportIds.size) fail('Joint ID normalization produced a collision; rename the source joints before export.');
  loaded.root.updateMatrixWorld(true);
  const rootInverse = loaded.root.matrixWorld.clone().invert();
  const bindGlobals = ordered.map(bone => rootInverse.clone().multiply(bone.matrixWorld));
  let bindShape: THREE.Matrix4 | undefined;
  const inverseBindGlobals = bindGlobals.map((matrix, index) => {
    const determinant = matrix.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
      fail(`Joint ${ordered[index].name} has a singular bind matrix.`);
    }
    const inverseBind = matrix.clone().invert();
    const sourceIndex = sourceIndices.get(ordered[index])!;
    const authoredInverseBind = loaded.skeleton!.boneInverses[sourceIndex];
    if (!authoredInverseBind
      || authoredInverseBind.elements.some(value => !Number.isFinite(value))) {
      fail(`Joint ${ordered[index].name} has a missing or non-finite authored inverse-bind matrix.`);
    }
    const authoredBindShape = matrix.clone().multiply(authoredInverseBind);
    if (!bindShape) bindShape = authoredBindShape;
    else if (authoredBindShape.elements.some((value, element) => (
      Math.abs(value - bindShape!.elements[element]) > BIND_SHAPE_TOLERANCE
    ))) {
      fail(`Joint ${ordered[index].name} authored inverse-bind matrix does not share one bind-shape transform in scene-root space; export will not infer a replacement rest pose.`);
    }
    return inverseBind;
  });
  if (!bindShape) fail('Input has no authored bind-shape transform.');
  const bindShapeDeterminant = bindShape.determinant();
  if (!Number.isFinite(bindShapeDeterminant) || Math.abs(bindShapeDeterminant) < 1e-12) {
    fail('Authored inverse-bind matrices resolve to a singular common bind-shape transform.');
  }
  const bindTransforms = localTransforms(bindGlobals, ordered, parentByBone, exportIndices);
  const sourceMeshList = sourceMeshRecords(loaded, new Set(sourceBones), bindShape);
  const totalVertices = sourceMeshList.reduce((sum, item) => sum + item.positions.count, 0);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const indices: number[] = [];
  const meshJoints: Array<[number, number, number, number]> = [];
  const meshWeights: Array<[number, number, number, number]> = [];
  for (const source of sourceMeshList) {
    for (let vertex = 0; vertex < source.positions.count; vertex += 1) {
      const position = new THREE.Vector3(
        source.positions.getComponent(vertex, 0),
        source.positions.getComponent(vertex, 1),
        source.positions.getComponent(vertex, 2),
      ).applyMatrix4(source.bindMatrix);
      const normal = new THREE.Vector3(
        source.normals.getComponent(vertex, 0),
        source.normals.getComponent(vertex, 1),
        source.normals.getComponent(vertex, 2),
      ).applyMatrix3(source.bindNormal);
      if (![...position.toArray(), ...normal.toArray()].every(Number.isFinite) || normal.lengthSq() < 1e-16) {
        fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} has invalid bind geometry.`);
      }
      normal.normalize();
      positions.push(vec3(position));
      normals.push(vec3(normal));
      const jointRow: number[] = [];
      const weightRow: number[] = [];
      let weightSum = 0;
      for (let influence = 0; influence < 4; influence += 1) {
        const sourceJoint = source.skinIndex.getComponent(vertex, influence);
        const weight = source.skinWeight.getComponent(vertex, influence);
        if (!Number.isInteger(sourceJoint) || sourceJoint < 0 || sourceJoint >= sourceBones.length) {
          fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} references joint ${sourceJoint} outside its skeleton.`);
        }
        if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
          fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} has an invalid influence weight.`);
        }
        jointRow.push(exportIndices.get(sourceBones[sourceJoint])!);
        weightRow.push(weight);
        weightSum += weight;
      }
      if (Math.abs(weightSum - 1) > 1e-6) {
        fail(`Source mesh ${source.mesh.name || '(unnamed)'} vertex ${vertex} has influence sum ${weightSum}; the asset contract requires normalized four-slot weights. No influences were removed or renormalized.`);
      }
      meshJoints.push(jointRow as [number, number, number, number]);
      meshWeights.push(weightRow as [number, number, number, number]);
    }
    for (const sourceIndex of source.sourceIndices) indices.push(sourceIndex);
  }
  if (positions.length !== totalVertices) fail('Internal vertex accounting did not match the source mesh set.');

  const boneIndices = new Map(ordered.map((bone, index) => [bone, index]));
  const bindings = loaded.clips.map(clip => buildClipBindings(clip, loaded.root, boneIndices, rootBoneIndex));
  const totalKeys = totalKeyCount(bindings);
  if (totalKeys > MAX_KEYS) {
    fail(`Lossless 60 Hz export needs ${totalKeys} keys across all tracks; the asset limit is ${MAX_KEYS}. No tracks or clips were removed.`);
  }
  const referencePhaseLists = bindings.map(binding => referencePhases(binding.durationTicks));
  const assetJoints = ordered.map((bone, index) => ({
    id: exportIds.get(bone)!,
    parent: (parentByBone.get(bone) && exportIndices.has(parentByBone.get(bone)!)
      ? exportIndices.get(parentByBone.get(bone)!)!
      : -1),
    bind: bindTransforms[index],
  }));
  const assetId = `rustsmf-${options.sourceIdentitySha256.slice(0, 16)}`;
  const assetClips: SkeletalAssetDocument['clips'] = [];
  const referenceSamples: SkeletalReferenceSample[] = [];
  const sourceToExportJoint = sourceBones.map(bone => exportIndices.get(bone)!);
  let referenceSampleJsonBytes = 0;
  const yieldEvery = Math.max(1, options.yieldEvery ?? 32);
  let workSinceYield = 0;

  for (const [clipIndex, clip] of loaded.clips.entries()) {
    throwIfAborted(options.signal);
    const binding = bindings[clipIndex];
    const { mixer, action } = createMixer(loaded.root, clip);
    try {
      const sampleTicks = [...new Set([
        ...binding.rootTicks,
        ...binding.tracks.flatMap(ticks => ticks),
      ])].sort((a, b) => a - b);
      const poses = new Map<number, SampledPose>();
      for (const tick of sampleTicks) {
        throwIfAborted(options.signal);
        setMixerTime(mixer, action, tick / SKELETAL_EXPORT_TICK_RATE);
        loaded.root.updateMatrixWorld(true);
        poses.set(tick, capturePose(
          loaded.root,
          rootInverse,
          ordered,
          parentByBone,
          exportIndices,
          rootBoneIndex,
          bindGlobals,
          tick,
          clip.name,
        ));
        workSinceYield += 1;
        if (workSinceYield >= yieldEvery) {
          await yieldToEventLoop();
          throwIfAborted(options.signal);
          workSinceYield = 0;
        }
      }
      const tracks: SkeletalAssetDocument['clips'][number]['tracks'] = [];
      for (let joint = 0; joint < ordered.length; joint += 1) {
        const keyTicks = binding.tracks[joint];
        if (keyTicks.length === 0) continue;
        tracks.push({
          joint,
          keys: keyTicks.map(tick => ({ tick, transform: poses.get(tick)!.localTransforms[joint] })),
        });
      }
      const root = binding.rootTicks.map(tick => {
        const pose = poses.get(tick)!;
        return { tick, position: pose.rootPosition, yaw: pose.rootYaw };
      });
      assetClips.push({
        id: clip.name,
        durationTicks: binding.durationTicks,
        tracks,
        root,
      });
      for (const phaseTicks of referencePhaseLists[clipIndex]) {
        throwIfAborted(options.signal);
        setMixerTime(mixer, action, phaseTicks / SKELETAL_EXPORT_TICK_RATE);
        loaded.root.updateMatrixWorld(true);
        const phasePose = capturePose(
          loaded.root,
          rootInverse,
          ordered,
          parentByBone,
          exportIndices,
          rootBoneIndex,
          bindGlobals,
          phaseTicks,
          clip.name,
        );
        const geometry = sourceReferenceGeometry(
          sourceMeshList,
          phasePose.adjustedGlobals,
          inverseBindGlobals,
          sourceToExportJoint,
        );
        const sample: SkeletalReferenceSample = {
          clipId: clip.name,
          phaseTicks,
          positions: geometry.positions,
          normals: geometry.normals,
          joints: sourceBones.map((bone, sourceIndex) => ({
            sourceIndex,
            matrix: matrixRowMajor(phasePose.adjustedGlobals[exportIndices.get(bone)!]),
          })),
          sockets: [],
          rootPosition: phasePose.rootPosition,
          rootYaw: phasePose.rootYaw,
        };
        referenceSampleJsonBytes += new TextEncoder().encode(JSON.stringify(sample)).byteLength + 1;
        if (referenceSampleJsonBytes > SKELETAL_REFERENCE_LIMIT) {
          fail(`Independent source reference samples exceed ${SKELETAL_REFERENCE_LIMIT} bytes; no vertices, clips, or samples were omitted.`);
        }
        referenceSamples.push(sample);
        workSinceYield += 1;
        if (workSinceYield >= yieldEvery) {
          await yieldToEventLoop();
          throwIfAborted(options.signal);
          workSinceYield = 0;
        }
      }
    } finally {
      cleanupMixer(loaded.root, mixer, action);
      loaded.root.updateMatrixWorld(true);
    }
  }

  const asset: SkeletalAssetDocument = {
    schema: SKELETAL_ASSET_SCHEMA,
    id: assetId,
    joints: assetJoints,
    mesh: { positions, normals, indices, joints: meshJoints, weights: meshWeights },
    clips: assetClips,
    sockets: [],
  };
  const mapping: SkeletalMappingDocument = {
    schema: SKELETAL_MAPPING_SCHEMA,
    sourceIdentitySha256: options.sourceIdentitySha256,
    sourceJointCount: sourceBones.length,
    sourceVertexCount: totalVertices,
    joints: sourceBones.map((bone, sourceIndex) => ({
      sourceIndex,
      sourceId: bone.name,
      exportIndex: exportIndices.get(bone)!,
      exportId: exportIds.get(bone)!,
    })),
    vertices: Array.from({ length: totalVertices }, (_, sourceIndex) => ({
      sourceIndex,
      exportIndices: [sourceIndex],
    })),
  };
  const references: SkeletalReferencesDocument = {
    schema: SKELETAL_REFERENCES_SCHEMA,
    sourceIdentitySha256: options.sourceIdentitySha256,
    tolerances: {
      position: 5e-5,
      normalRadians: 1e-4,
      matrix: 1e-4,
      rootPosition: 1e-5,
      rootYawRadians: 1e-5,
    },
    samples: referenceSamples,
  };
  const assetBytes = jsonBytes(asset);
  const mappingBytes = jsonBytes(mapping);
  const referenceBytes = jsonBytes(references);
  if (assetBytes.byteLength > SKELETAL_ASSET_REQUEST_LIMIT) {
    fail(`Skeletal asset JSON is ${assetBytes.byteLength} bytes; Gaim admission accepts at most ${SKELETAL_ASSET_REQUEST_LIMIT} bytes. No source geometry or clips were removed.`);
  }
  if (referenceBytes.byteLength > SKELETAL_REFERENCE_LIMIT) {
    fail(`Independent references are ${referenceBytes.byteLength} bytes; exporter reference output is capped at ${SKELETAL_REFERENCE_LIMIT} bytes. Reduce the source asset complexity or request fewer clips in a later supported workflow; no references were truncated.`);
  }
  return {
    asset,
    mapping,
    references,
    assetBytes,
    mappingBytes,
    referenceBytes,
    settings: {
      sourceRootJoint: options.rootJoint,
      units: 'meters',
      upAxis: '+Y',
      forwardAxis: '+Z',
      handedness: 'right',
      ticksPerSecond: SKELETAL_EXPORT_TICK_RATE,
      rootMotion: 'separate-track',
    },
    statistics: {
      joints: asset.joints.length,
      vertices: asset.mesh.positions.length,
      indices: asset.mesh.indices.length,
      clips: asset.clips.length,
      keys: totalKeys,
      referenceSamples: references.samples.length,
    },
  };
}
