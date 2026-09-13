import * as THREE from 'three';
import {
  boundedFloat32SampleTime,
  boundedRequestedSampleTime,
  buildFittedComparisonSchedule,
  fittedDurationTolerance,
} from './fittedRigTiming';

export {
  FITTED_DURATION_TOLERANCE_FACTOR,
  buildFittedComparisonSchedule,
  fittedDurationTolerance,
} from './fittedRigTiming';
const MAX_VERTEX_SAMPLES = 20_000_000;

export interface FittedCoverageRejection {
  clip: string;
  reason: 'duplicate-source' | 'missing-received' | 'duplicate-received' | 'duration-mismatch';
  sourceDuration: number;
  receivedDuration?: number;
  durationDifference?: number;
  durationTolerance?: number;
}

export interface FittedMotionClipReport {
  clip: string;
  sourceDuration: number;
  receivedDuration: number;
  durationDifference: number;
  durationTolerance: number;
  maximumVertexError: number;
  worstFrame: number;
  worstTime: number;
  worstMesh: string;
  worstMeshIndex: number;
  worstVertex: number;
  worstSourcePosition: [number, number, number];
  worstReceivedPosition: [number, number, number];
  worstInfluences: Array<{ bone: string; weight: number }>;
  rejectedSamples: Array<{
    requestedTime: number;
    sourceSampleTime: number;
    receivedSampleTime: number;
    maximumVertexError: number;
  }>;
  requestedSamples: number;
  completedSamples: number;
  frames: number;
}

export class FittedMotionCoverageError extends Error {
  readonly requestedSamples: number;
  readonly completedSamples = 0;
  readonly rejectedCoverage: readonly FittedCoverageRejection[];

  constructor(rejections: FittedCoverageRejection[], requestedSamples: number) {
    const summary = rejections.map(({ clip, reason }) => `${clip} (${reason})`).join(', ');
    super(`Missing or incompatible fitted clip coverage: ${summary}`);
    this.name = 'FittedMotionCoverageError';
    this.requestedSamples = requestedSamples;
    this.rejectedCoverage = rejections;
  }
}

export function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((node) => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  return meshes;
}

function clipCoverage(
  sourceClips: readonly THREE.AnimationClip[],
  receivedClips: readonly THREE.AnimationClip[],
  rate: number,
): { counterparts: Map<THREE.AnimationClip, THREE.AnimationClip>; requestedSamples: number } {
  const requestedSamples = sourceClips.reduce(
    (sum, clip) => sum + buildFittedComparisonSchedule(clip.duration, rate).length,
    0,
  );
  const rejections: FittedCoverageRejection[] = [];
  const counterparts = new Map<THREE.AnimationClip, THREE.AnimationClip>();
  for (const clip of sourceClips) {
    if (sourceClips.filter((candidate) => candidate.name === clip.name).length !== 1) {
      rejections.push({ clip: clip.name, reason: 'duplicate-source', sourceDuration: clip.duration });
      continue;
    }
    const candidates = receivedClips.filter((candidate) => candidate.name === clip.name);
    if (candidates.length !== 1) {
      rejections.push({
        clip: clip.name,
        reason: candidates.length === 0 ? 'missing-received' : 'duplicate-received',
        sourceDuration: clip.duration,
      });
      continue;
    }
    const received = candidates[0];
    const durationDifference = Math.abs(received.duration - clip.duration);
    const durationTolerance = fittedDurationTolerance(clip.duration, received.duration);
    if (!Number.isFinite(received.duration) || received.duration < 0 || durationDifference > durationTolerance) {
      rejections.push({
        clip: clip.name,
        reason: 'duration-mismatch',
        sourceDuration: clip.duration,
        receivedDuration: received.duration,
        durationDifference,
        durationTolerance,
      });
      continue;
    }
    counterparts.set(clip, received);
  }
  if (rejections.length > 0) throw new FittedMotionCoverageError(rejections, requestedSamples);
  return { counterparts, requestedSamples };
}

/** Compares every skinned vertex at the frame grid and exact terminal pose, restoring both inputs. */
export function compareFittedMotion(
  source: THREE.Object3D,
  received: THREE.Object3D,
  sourceClips: readonly THREE.AnimationClip[],
  receivedClips: readonly THREE.AnimationClip[],
  rate = 60,
) {
  const original = skinnedMeshes(source);
  const replacement = skinnedMeshes(received);
  if (!original.length || original.length !== replacement.length || !Number.isInteger(rate) || rate < 1 || rate > 240) {
    throw new Error('Fitted verification requires matching skinned meshes and a bounded frame rate');
  }
  let vertices = 0;
  for (const [index, mesh] of original.entries()) {
    const count = mesh.geometry.getAttribute('position').count;
    if (count !== replacement[index].geometry.getAttribute('position').count) throw new Error('Fitted vertex count changed');
    vertices += count;
  }
  if (!sourceClips.length) throw new Error('Fitted comparison has no clips');
  const { counterparts, requestedSamples } = clipCoverage(sourceClips, receivedClips, rate);
  if (requestedSamples * vertices > MAX_VERTEX_SAMPLES) {
    throw new Error('Fitted comparison exceeds 20 million vertex samples');
  }
  const saved: Array<{
    node: THREE.Object3D;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  }> = [];
  for (const root of [source, received]) root.traverse((node) => saved.push({
    node,
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  }));
  const results: FittedMotionClipReport[] = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  let completedSamples = 0;
  try {
    for (const clip of sourceClips) {
      const receivedClip = counterparts.get(clip)!;
      const a = new THREE.AnimationMixer(source);
      const b = new THREE.AnimationMixer(received);
      let maximumVertexError = 0;
      let worstTime = 0;
      let worstMesh = original[0].name || '(unnamed)';
      let worstMeshIndex = 0;
      let worstVertex = 0;
      let worstSourcePosition: [number, number, number] = [0, 0, 0];
      let worstReceivedPosition: [number, number, number] = [0, 0, 0];
      let worstInfluences: Array<{ bone: string; weight: number }> = [];
      const rejectedSamples: FittedMotionClipReport['rejectedSamples'] = [];
      const times = buildFittedComparisonSchedule(clip.duration, rate);
      try {
        for (const [mixer, motion] of [[a, clip], [b, receivedClip]] as const) {
          const action = mixer.clipAction(motion);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
        }
        for (const time of times) {
          const sourceSampleTime = boundedFloat32SampleTime(time, clip.duration);
          const receivedSampleTime = boundedRequestedSampleTime(time, receivedClip.duration);
          a.setTime(sourceSampleTime);
          b.setTime(receivedSampleTime);
          source.updateMatrixWorld(true);
          received.updateMatrixWorld(true);
          let sampleMaximumVertexError = 0;
          for (const [index, mesh] of original.entries()) {
            const target = replacement[index];
            const vertexCount = mesh.geometry.getAttribute('position').count;
            for (let vertex = 0; vertex < vertexCount; vertex += 1) {
              mesh.getVertexPosition(vertex, p).applyMatrix4(mesh.matrixWorld);
              target.getVertexPosition(vertex, q).applyMatrix4(target.matrixWorld);
              const error = p.distanceTo(q);
              if (!Number.isFinite(error)) throw new Error('Non-finite fitted vertex');
              sampleMaximumVertexError = Math.max(sampleMaximumVertexError, error);
              if (error > maximumVertexError) {
                maximumVertexError = error;
                worstTime = time;
                worstMesh = mesh.name || '(unnamed)';
                worstMeshIndex = index;
                worstVertex = vertex;
                worstSourcePosition = p.toArray();
                worstReceivedPosition = q.toArray();
                const skinIndex = mesh.geometry.getAttribute('skinIndex');
                const skinWeight = mesh.geometry.getAttribute('skinWeight');
                worstInfluences = Array.from({ length: Math.min(4, skinWeight?.itemSize ?? 0) }, (_, slot) => ({
                  bone: mesh.skeleton.bones[skinIndex.getComponent(vertex, slot)]?.name ?? '(invalid)',
                  weight: skinWeight.getComponent(vertex, slot),
                })).filter((influence) => influence.weight > 0);
              }
            }
          }
          if (sampleMaximumVertexError > 0.00001) {
            rejectedSamples.push({ requestedTime: time, sourceSampleTime, receivedSampleTime, maximumVertexError: sampleMaximumVertexError });
          }
          completedSamples += 1;
        }
        const durationDifference = Math.abs(receivedClip.duration - clip.duration);
        results.push({
          clip: clip.name,
          sourceDuration: clip.duration,
          receivedDuration: receivedClip.duration,
          durationDifference,
          durationTolerance: fittedDurationTolerance(clip.duration, receivedClip.duration),
          maximumVertexError,
          worstFrame: worstTime * rate,
          worstTime,
          worstMesh,
          worstMeshIndex,
          worstVertex,
          worstSourcePosition,
          worstReceivedPosition,
          worstInfluences,
          rejectedSamples,
          requestedSamples: times.length,
          completedSamples: times.length,
          frames: times.length,
        });
      } finally {
        a.stopAllAction();
        a.uncacheRoot(source);
        b.stopAllAction();
        b.uncacheRoot(received);
      }
    }
    return {
      vertices,
      meshes: original.length,
      sampleRateHz: rate,
      requestedSamples,
      completedSamples,
      rejectedCoverage: [] as FittedCoverageRejection[],
      maximumVertexError: Math.max(...results.map((result) => result.maximumVertexError)),
      clips: results,
    };
  } finally {
    for (const { node, position, quaternion, scale } of saved) {
      node.position.copy(position);
      node.quaternion.copy(quaternion);
      node.scale.copy(scale);
      node.updateMatrix();
    }
    source.updateMatrixWorld(true);
    received.updateMatrixWorld(true);
  }
}
