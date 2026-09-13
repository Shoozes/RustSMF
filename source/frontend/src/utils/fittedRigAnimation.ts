import * as THREE from 'three';
import type { FittedRig } from './fittedRig';
import {
  boundedFloat32SampleTime,
  buildFittedComparisonSchedule,
  MAX_FITTED_GRID_FRAMES,
} from './fittedRigTiming';

/** Samples original world motion onto the fitted topology. This preserves mapped
 * world frames, including motion from source helpers absent in the target rig.
 * Both input poses are restored on success and failure.
 */
export function bakeFittedClip(sourceRoot: THREE.Object3D, clip: THREE.AnimationClip,
  fitted: FittedRig, sampleRateHz = 60): THREE.AnimationClip {
  if (!Number.isInteger(sampleRateHz) || sampleRateHz < 1 || sampleRateHz > 240
    || !Number.isFinite(clip.duration) || clip.duration < 0 || clip.duration * sampleRateHz > MAX_FITTED_GRID_FRAMES) {
    throw new Error('Fitted animation exceeds the bounded sample contract');
  }
  const saved: Array<{ object: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }> = [];
  for (const root of [sourceRoot, fitted.root]) root.traverse(object => saved.push({ object,
    position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
  const sources = new Map([...fitted.sourceToTarget].map(([source, target]) => [target, source]));
  const ordered: THREE.Bone[] = [];
  fitted.root.traverse(object => { if ('isBone' in object && object.isBone === true) ordered.push(object as THREE.Bone); });
  const values = new Map(ordered.map(bone => [bone, { position: [] as number[], quaternion: [] as number[], scale: [] as number[] }]));
  const times = buildFittedComparisonSchedule(clip.duration, sampleRateHz);
  const mixer = new THREE.AnimationMixer(sourceRoot);
  try {
    const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    for (const time of times) {
      mixer.setTime(boundedFloat32SampleTime(time, clip.duration)); sourceRoot.updateMatrixWorld(true);
      for (const bone of ordered) {
        const source = sources.get(bone);
        if (source) {
          bone.parent!.updateWorldMatrix(true, false);
          const local = bone.parent!.matrixWorld.clone().invert().multiply(source.matrixWorld);
          if (local.elements.some(value => !Number.isFinite(value)) || Math.abs(local.determinant()) < 1e-12) {
            throw new Error(`Invalid fitted animated frame: ${bone.name}`);
          }
          local.decompose(bone.position, bone.quaternion, bone.scale); bone.updateMatrix();
          if (local.elements.some((value, index) => Math.abs(value - bone.matrix.elements[index]) > 1e-5)) {
            throw new Error(`Unsupported animated shear: ${bone.name}`);
          }
        }
        bone.updateWorldMatrix(true, false);
        const row = values.get(bone)!;
        row.position.push(...bone.position.toArray()); row.quaternion.push(...bone.quaternion.toArray()); row.scale.push(...bone.scale.toArray());
      }
    }
    // Output keys do not exceed the exact frame time consumed by the game.
    const keys = Float32Array.from(times, time => {
      const nearest = Math.fround(time);
      if (nearest <= time || time === 0) return nearest;
      const bytes = new ArrayBuffer(4), view = new DataView(bytes);
      view.setFloat32(0, nearest, true); view.setUint32(0, view.getUint32(0, true) - 1, true);
      return view.getFloat32(0, true);
    });
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [bone, row] of values) {
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, keys, row.position, THREE.InterpolateDiscrete),
        new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, keys, row.quaternion, THREE.InterpolateDiscrete),
        new THREE.VectorKeyframeTrack(`${bone.name}.scale`, keys, row.scale, THREE.InterpolateDiscrete));
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(sourceRoot);
    for (const { object, position, quaternion, scale } of saved) {
      object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale); object.updateMatrix();
    }
    sourceRoot.updateMatrixWorld(true); fitted.root.updateMatrixWorld(true);
  }
}
