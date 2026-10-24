import * as THREE from 'three';
import { exportGLB, type LoadedModel } from '../loaders/glb';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { chordRotationTrack, CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
import { bakeTransitionFloor, parseTransitionFloor, type TransitionFloorRecipe, type TransitionFloorReport } from './skeletalTransitionFloor';
import { bakePlantedIdle, parsePlantedIdle, type PlantedIdleRecipe, type ContactBatchSolver } from './skeletalPlantedIdle';
import { closeTerminalRotations, parseTerminalRotationClosure, type TerminalRotationClosureRecipe } from './skeletalTerminalRotation';
import { bakeTwoKeyRotations, parseTwoKeyRotationSelection, type TwoKeyRotationSelection } from './skeletalTwoKeyRotation';

export { CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
export { measureConditioningDifferences } from './skeletalConditioningFidelity';

export const CONDITIONING_MODE = 'continuous-60hz-locomotion-root' as const;
export interface ConditioningRecipe extends TwoKeyRotationSelection {
  mode: typeof CONDITIONING_MODE | typeof CONDITIONING_NLERP_MODE;
  sourceRootJoint: string;
  locomotionRootJoint: string;
  clipIds: string[];
  transitions: Array<{ gait: string; idle: string; phases: number[]; durationTicks: 6 }>;
  transitionFloor?: TransitionFloorRecipe;
  plantedIdle?: PlantedIdleRecipe;
  terminalRotationClosure?: TerminalRotationClosureRecipe;
}
interface Pose { position: number[]; rotation: number[]; scale: number[] }
interface Sample { joints: Pose[]; motion: Pose }
export interface ConditioningReport {
  schema: 'rustsmf.skeletal-conditioning.v1';
  recipe: ConditioningRecipe;
  jointLineage: Array<{ originalIndex: number | null; conditionedIndex: number; id: string }>;
  vertexLineage: Array<{ mesh: number; firstVertex: number; count: number; mode: 'unchanged' }>;
  model: { units: 'meters'; height: number; restSkinHeight: number; jointCount: number; vertexCount: number };
  clips: Array<{ id: string; durationTicks: number; sourceInterpolation: number[] }>;
  transitions: Array<{ id: string; gait: string; idle: string; kind: string; phase: number; durationTicks: 6 }>;
  differencePolicy: string;
  floorBakes?: TransitionFloorReport[];
  plantedIdleBake?: Awaited<ReturnType<typeof bakePlantedIdle>>['report'];
  terminalRotationClosureBake?: ReturnType<typeof closeTerminalRotations>['report'];
  twoKeyRotationBake?: ReturnType<typeof bakeTwoKeyRotations>['report'];
  twoKeyRotationBakes?: Array<ReturnType<typeof bakeTwoKeyRotations>['report']>;
}

function pose(matrix: THREE.Matrix4): Pose {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  matrix.decompose(p, q, s); q.normalize();
  const result = { position: p.toArray(), rotation: q.toArray(), scale: s.toArray() };
  if ([...result.position, ...result.rotation, ...result.scale].some(v => !Number.isFinite(v))) throw new Error('Conditioning encountered a non-finite transform.');
  const rebuilt = new THREE.Matrix4().compose(p, q, s);
  if (matrix.elements.some((v, i) => Math.abs(v - rebuilt.elements[i]) > 1e-5 * Math.max(1, Math.abs(v)))) throw new Error('Conditioning cannot retain a sheared joint transform.');
  return result;
}
function matrix(p: Pose): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position), new THREE.Quaternion().fromArray(p.rotation), new THREE.Vector3().fromArray(p.scale));
}
function blend(a: Pose, b: Pose, alpha: number): Pose {
  return {
    position: a.position.map((v, i) => v + (b.position[i] - v) * alpha),
    rotation: new THREE.Quaternion().fromArray(a.rotation).slerp(new THREE.Quaternion().fromArray(b.rotation), alpha).toArray(),
    scale: a.scale.map((v, i) => v + (b.scale[i] - v) * alpha),
  };
}
function clipFromSamples(id: string, bones: readonly THREE.Bone[], samples: Sample[], mode: ConditioningRecipe['mode']): THREE.AnimationClip {
  const times = samples.map((_, tick) => Math.fround(tick / 60));
  const tracks: THREE.KeyframeTrack[] = [];
  bones.forEach((bone, index) => {
    const poses = samples.map(s => index === bones.length - 1 ? s.motion : s.joints[index]);
    const bind = pose(bone.matrix);
    for (const property of ['position', 'rotation', 'scale'] as const) {
      const values = poses.map(p => p[property]);
      const same = (a: number[], b: number[]): boolean => a.every((v, i) => Math.fround(v) === Math.fround(b[i]));
      const constant = values.every(v => same(v, values[0]));
      if (constant && same(values[0], bind[property])) continue;
      const keyTimes = constant ? [times[0], times[times.length - 1]] : times;
      const keyValues = constant ? [...values[0], ...values[0]] : values.flat();
      tracks.push(property === 'rotation'
        ? mode === CONDITIONING_NLERP_MODE && index !== bones.length - 1
          ? chordRotationTrack(`${bone.name}.quaternion`, keyTimes, keyValues)
          : new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, keyTimes, keyValues)
        : new THREE.VectorKeyframeTrack(`${bone.name}.${property}`, keyTimes, keyValues));
    }
  });
  return new THREE.AnimationClip(id, times[times.length - 1], tracks);
}

function generatedSample(clip: THREE.AnimationClip, bones: readonly THREE.Bone[], seconds: number): Sample {
  const poses = bones.map(bone => pose(bone.matrix));
  for (const track of clip.tracks) {
    const binding = THREE.PropertyBinding.parseTrackName(track.name);
    const index = bones.findIndex(bone => bone.name === binding.nodeName);
    const property = binding.propertyName === 'quaternion' ? 'rotation' : binding.propertyName;
    if (index < 0 || !['position', 'rotation', 'scale'].includes(property)) throw new Error('Invalid generated conditioning track.');
    poses[index][property as keyof Pose] = Array.from(createTrackInterpolant(track).evaluate(seconds));
  }
  return { joints: poses.slice(0, -1), motion: poses[poses.length - 1] };
}

// GLTFExporter emits one skin per mesh even when all meshes share a skeleton.
// Merge only byte-identical bindings, retaining every mesh/accessor and vertex.
function sharedSkinGlb(bytes: Uint8Array): Uint8Array {
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = header.getUint32(12, true);
  interface Skin { joints: number[]; skeleton?: number; inverseBindMatrices: number }
  interface Document { skins: Skin[]; nodes: Array<{ skin?: number }>; accessors: Array<{ bufferView: number; byteOffset?: number; count: number; type: string; componentType: number }>; bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }> }
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Document;
  if (document.skins.length < 2) return bytes;
  const binaryStart = 28 + jsonLength;
  const key = (skin: Skin): string => {
    const a = document.accessors[skin.inverseBindMatrices], view = document.bufferViews[a.bufferView];
    if (a.type !== 'MAT4' || a.componentType !== 5126 || view.byteStride) throw new Error('Unexpected exported inverse-bind layout.');
    const start = binaryStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return JSON.stringify([skin.joints, skin.skeleton, Array.from(bytes.subarray(start, start + a.count * 64))]);
  };
  const keys = document.skins.map(key), unique = [...new Set(keys)];
  document.nodes.forEach(node => { if (node.skin !== undefined) node.skin = unique.indexOf(keys[node.skin]); });
  document.skins = unique.map(k => document.skins[keys.indexOf(k)]);
  const text = new TextEncoder().encode(JSON.stringify(document)), length = Math.ceil(text.length / 4) * 4;
  const result = new Uint8Array(20 + length + bytes.length - (20 + jsonLength));
  result.set(bytes.subarray(0, 20)); result.fill(32, 20, 20 + length); result.set(text, 20); result.set(bytes.subarray(20 + jsonLength), 20 + length);
  const out = new DataView(result.buffer); out.setUint32(8, result.length, true); out.setUint32(12, length, true);
  return result;
}

/** Mutates only the caller-owned loaded model; the original input bytes remain untouched. */
export async function conditionSkeletalModel(loaded: LoadedModel, recipe: ConditioningRecipe, signal?: AbortSignal, solveContacts?: ContactBatchSolver): Promise<{ bytes: Uint8Array; report: ConditioningReport }> {
  signal?.throwIfAborted();
  const skeleton = loaded.skeleton;
  if (!skeleton || skeleton.bones.length >= 64 || loaded.skinnedMeshes.some(m => m.skeleton !== skeleton)) throw new Error('Conditioning requires one shared skeleton with room for an unweighted root.');
  const vertices = loaded.skinnedMeshes.reduce((count, mesh) => count + mesh.geometry.getAttribute('position').count, 0);
  if (vertices < 3 || vertices > 8192) throw new Error('Conditioning requires 3–8,192 vertices without truncation.');
  if (![CONDITIONING_MODE, CONDITIONING_NLERP_MODE].includes(recipe.mode) || !/^[A-Za-z0-9_.-]{1,64}$/.test(recipe.locomotionRootJoint)) throw new Error('Unsupported conditioning recipe.');
  const allowedFloorClips = recipe.transitions.flatMap(t => t.phases.flatMap(p => ['start', 'stop'].map(kind => `${kind}-${t.gait}-p${p * 100}`)));
  const floor = recipe.transitionFloor === undefined ? undefined : parseTransitionFloor(recipe.transitionFloor, allowedFloorClips);
  if (floor && recipe.mode !== CONDITIONING_NLERP_MODE) throw new Error('transitionFloor requires the explicit NLERP mode.');
  const planted = recipe.plantedIdle === undefined ? undefined : parsePlantedIdle(recipe.plantedIdle,recipe.transitions.map(t=>t.idle),recipe.clipIds);
  if (planted && (recipe.mode !== CONDITIONING_NLERP_MODE || !solveContacts)) throw new Error('plantedIdle requires NLERP and the native contact runner.');
  const terminal = recipe.terminalRotationClosure === undefined ? undefined : parseTerminalRotationClosure(recipe.terminalRotationClosure, recipe.transitions.map(t => t.gait), recipe.clipIds, [recipe.sourceRootJoint, recipe.locomotionRootJoint]);
  if (terminal && recipe.mode !== CONDITIONING_NLERP_MODE) throw new Error('terminalRotationClosure requires the explicit NLERP mode.');
  const { twoKeyRotationBake: twoKey, twoKeyRotationBakes: twoKeys } = parseTwoKeyRotationSelection(recipe, recipe.transitions.map(t => t.gait), recipe.clipIds, [recipe.sourceRootJoint, recipe.locomotionRootJoint]);
  const rotationRecipes = twoKey ? [twoKey] : twoKeys ?? [];
  if (rotationRecipes.length && recipe.mode !== CONDITIONING_NLERP_MODE) throw new Error('Two-key rotation authoring requires the explicit NLERP mode.');
  const bones = [...skeleton.bones];
  if (new Set(bones.map(b => b.name)).size !== bones.length || bones.some(b => !/^[A-Za-z0-9_.-]{1,64}$/.test(b.name))) throw new Error('Conditioning requires unique safe source joint names.');
  if (loaded.root.getObjectByName(recipe.locomotionRootJoint)) throw new Error('Locomotion root name already exists.');
  const sourceRoot = bones.find(b => b.name === recipe.sourceRootJoint);
  if (!sourceRoot) throw new Error('Conditioning source root is absent.');
  for (let p = sourceRoot.parent; p; p = p.parent) if (bones.includes(p as THREE.Bone)) throw new Error('Conditioning source root must be the skeleton root.');
  const clips = recipe.clipIds.map(id => {
    const found = loaded.clips.filter(c => c.name === id);
    if (found.length !== 1) throw new Error(`Conditioning clip ${id} is missing or ambiguous.`);
    return found[0];
  });
  if (!clips.length || clips.length > 32 || new Set(recipe.clipIds).size !== clips.length) throw new Error('Conditioning selects 1–32 unique source clips.');
  loaded.root.updateMatrixWorld(true);
  const sceneInverse = loaded.root.matrixWorld.clone().invert();
  const binds = bones.map(b => sceneInverse.clone().multiply(b.matrixWorld));
  const bindShape = binds[0].clone().multiply(skeleton.boneInverses[0]);
  if (binds.some((b, i) => b.clone().multiply(skeleton.boneInverses[i]).elements.some((v, j) => Math.abs(v - bindShape.elements[j]) > 1e-4))) throw new Error('Conditioning requires a common authored bind shape.');
  const rootIndex = bones.indexOf(sourceRoot), rootBind = pose(binds[rootIndex]);
  const originalLocals = bones.map(b => pose(b.matrix));
  const sampled = new Map<string, Sample[]>();
  const clipRecords: ConditioningReport['clips'] = [];
  let sampleCount = 0;
  for (const clip of clips) {
    signal?.throwIfAborted();
    const ticks = Math.round(clip.duration * 60);
    if (ticks < 1 || ticks > 3600 || Math.abs(clip.duration * 60 - ticks) > 1e-3) throw new Error(`Conditioning clip ${clip.name} needs a bounded integer 60 Hz duration.`);
    sampleCount += (ticks + 1) * (bones.length + 1);
    if (sampleCount > 65536) throw new Error('Conditioning exceeds the 65,536 sampled joint-pose bound. Partition the source selection.');
    for (const track of clip.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(loaded.root, binding.nodeName);
      if (!bones.includes(node as THREE.Bone) || !['position', 'quaternion', 'scale'].includes(binding.propertyName)) throw new Error(`Conditioning cannot preserve unsupported channel ${track.name}.`);
      if (track.getInterpolation() !== THREE.InterpolateLinear && track.getInterpolation() !== THREE.InterpolateDiscrete) throw new Error('Conditioning supports STEP and LINEAR source tracks only.');
    }
    const mixer = new THREE.AnimationMixer(loaded.root), action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
    const samples: Sample[] = [];
    try {
      for (let tick = 0; tick <= ticks; tick++) {
        signal?.throwIfAborted();
        action.reset().play(); mixer.setTime(Math.fround(tick / 60)); loaded.root.updateMatrixWorld(true);
        const global = sceneInverse.clone().multiply(sourceRoot.matrixWorld), current = pose(global);
        const delta = new THREE.Quaternion().fromArray(current.rotation).multiply(new THREE.Quaternion().fromArray(rootBind.rotation).invert()).normalize();
        if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
        const yaw = 2 * Math.atan2(delta.y, delta.w);
        const motion: Pose = { position: current.position.map((v, i) => v - rootBind.position[i]), rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).toArray(), scale: [1, 1, 1] };
        const joints = bones.map(b => pose(b.matrix));
        joints[rootIndex] = pose(matrix(motion).invert().multiply(global));
        samples.push({ joints, motion });
      }
    } finally {
      action.stop(); mixer.stopAllAction(); mixer.uncacheRoot(loaded.root);
    }
    sampled.set(clip.name, samples);
    clipRecords.push({ id: clip.name, durationTicks: ticks, sourceInterpolation: [...new Set(clip.tracks.map(t => t.getInterpolation()))] });
  }
  // The new root is unweighted. Its inverse bind retains the common source bind shape.
  bones.forEach((b, i) => { b.position.fromArray(originalLocals[i].position); b.quaternion.fromArray(originalLocals[i].rotation); b.scale.fromArray(originalLocals[i].scale); });
  loaded.root.updateMatrixWorld(true);
  const locomotion = new THREE.Bone(); locomotion.name = recipe.locomotionRootJoint;
  loaded.root.add(locomotion); locomotion.attach(sourceRoot);
  skeleton.bones.push(locomotion); skeleton.boneInverses.push(bindShape.clone());
  skeleton.init(); loaded.root.updateMatrixWorld(true);
  const allBones = [...bones, locomotion];
  const generated = clips.map(c => clipFromSamples(c.name, allBones, sampled.get(c.name)!, recipe.mode));
  const transitions: ConditioningReport['transitions'] = [];
  for (const spec of recipe.transitions) {
    if (spec.durationTicks !== 6 || !sampled.has(spec.gait) || !sampled.has(spec.idle) || !spec.phases.length || spec.phases.some(p => ![0, .25, .5, .75].includes(p))) throw new Error('Invalid six-tick transition recipe.');
    const idle = recipe.mode === CONDITIONING_NLERP_MODE
      ? generatedSample(generated.find(c => c.name === spec.idle)!, allBones, 0)
      : sampled.get(spec.idle)![0];
    const gait = sampled.get(spec.gait)!;
    for (const phase of spec.phases) {
      const cursor = phase * (gait.length - 1), low = Math.floor(cursor), high = Math.ceil(cursor);
      const target: Sample = recipe.mode === CONDITIONING_NLERP_MODE
        ? generatedSample(generated.find(c => c.name === spec.gait)!, allBones, cursor / 60)
        : { joints: gait[low].joints.map((p, i) => blend(p, gait[high].joints[i], cursor - low)), motion: blend(gait[low].motion, gait[high].motion, cursor - low) };
      for (const kind of ['start', 'stop', 'reversal']) {
        const a = kind === 'start' ? idle : target;
        const b = kind === 'stop' ? idle : structuredClone(target);
        if (kind === 'reversal') b.motion.rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(new THREE.Quaternion().fromArray(b.motion.rotation)).toArray();
        const id = `${kind}-${spec.gait}-p${phase * 100}`;
        if (generated.some(c => c.name === id)) throw new Error(`Duplicate conditioned clip ${id}.`);
        const frames = Array.from({ length: 7 }, (_, tick) => ({ joints: a.joints.map((p, i) => blend(p, b.joints[i], tick / 6)), motion: blend(a.motion, b.motion, tick / 6) }));
        generated.push(clipFromSamples(id, allBones, frames, recipe.mode));
        transitions.push({ id, gait: spec.gait, idle: spec.idle, kind, phase, durationTicks: 6 });
      }
    }
  }
  const box = new THREE.Box3(); let vertexCount = 0;
  const vertexLineage = loaded.skinnedMeshes.map((mesh, index) => {
    const positions = mesh.geometry.getAttribute('position');
    const transform = bindShape.clone().multiply(mesh.bindMatrix);
    for (let v = 0; v < positions.count; v++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, v).applyMatrix4(transform));
    const row = { mesh: index, firstVertex: vertexCount, count: positions.count, mode: 'unchanged' as const };
    vertexCount += positions.count; return row;
  });
  const height = box.max.y - box.min.y;
  let plantedIdleBake: ConditioningReport['plantedIdleBake'];
  if (planted) {
    const index = generated.findIndex(c=>c.name===planted.clipId);
    const result = await bakePlantedIdle(loaded,generated[index],generated.find(c=>c.name===planted.calibration.clipId)!,locomotion,planted,height,solveContacts!,signal);
    generated[index] = result.clip; plantedIdleBake = result.report;
  }
  const floorBakes: TransitionFloorReport[] = [];
  for (const id of floor?.clipIds ?? []) {
    const index = generated.findIndex(c => c.name === id);
    const baked = bakeTransitionFloor(loaded, generated[index], locomotion, floor!, height, signal);
    generated[index] = baked.clip; floorBakes.push(baked.report);
  }
  let terminalRotationClosureBake: ConditioningReport['terminalRotationClosureBake'];
  if (terminal) {
    const index = generated.findIndex(c => c.name === terminal.clipId);
    const result = closeTerminalRotations(generated[index], terminal, signal);
    generated[index] = result.clip; terminalRotationClosureBake = result.report;
  }
  const authored = rotationRecipes.length ? [...generated] : generated;
  const rotationReports: NonNullable<ConditioningReport['twoKeyRotationBakes']> = [];
  for (const spec of rotationRecipes) {
    const index = authored.findIndex(c => c.name === spec.clipId);
    const result = bakeTwoKeyRotations(authored[index], spec, allBones, [recipe.sourceRootJoint, recipe.locomotionRootJoint], signal);
    authored[index] = result.clip; rotationReports.push(result.report);
  }
  loaded.clips = authored;
  const bytes = sharedSkinGlb(await exportGLB(loaded.root, authored));
  signal?.throwIfAborted();
  const differencePolicy = recipe.mode === CONDITIONING_NLERP_MODE
    ? 'Sample original STEP/LINEAR at float32 60 Hz endpoints; hemisphere-continuous quaternion chord CUBICSPLINE gives normalized linear joint rotation. Translation, scale and locomotion yaw remain LINEAR. Re-import the serialized derivative as independent reference; original-to-derived differences are descriptive, without smoothing or contact correction.'
    : 'Sample original STEP/LINEAR at float32 60 Hz endpoints; continuous LINEAR derivative is the independent receiving reference. Original-to-derived differences are reported separately; no smoothing or contact correction.';
  return { bytes, report: { schema: 'rustsmf.skeletal-conditioning.v1', recipe, jointLineage: allBones.map((b, i) => ({ originalIndex: i === bones.length ? null : i, conditionedIndex: i, id: b.name })), vertexLineage, model: { units: 'meters', height, restSkinHeight: height, jointCount: allBones.length, vertexCount }, clips: clipRecords, transitions, differencePolicy: differencePolicy + (floor ? ' Explicit selected transitionFloor bakes only interior locomotion-root Y keys; floor/lift bounds and dense before/after values are reported.' : '') + (planted ? ' Explicit plantedIdle bakes calibrated native contact corrections into idle pelvis/leg/toe channels; endpoints, other channels and clips remain unchanged.' : '') + (terminal ? ' Explicit terminalRotationClosure authors only selected final quaternion values and final-interval chord tangents; other tick transforms retain source fidelity.' : '') + (twoKey ? ' Explicit twoKeyRotationBake authors only three selected local rotations at two internal ticks and adjacent chord tangents; all other tick transforms retain source fidelity.' : '') + (twoKeys ? ' Explicit twoKeyRotationBakes composes disjoint selected local rotations and adjacent chord tangents; all other tick transforms retain source fidelity.' : ''), ...(floor ? { floorBakes } : {}), ...(planted ? { plantedIdleBake } : {}), ...(terminal ? { terminalRotationClosureBake } : {}), ...(twoKey ? { twoKeyRotationBake: rotationReports[0] } : {}), ...(twoKeys ? { twoKeyRotationBakes: rotationReports } : {}) } };
}
