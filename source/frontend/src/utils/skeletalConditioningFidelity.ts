import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { rotationDifferenceDegrees, type TerminalRotationClosureRecipe } from './skeletalTerminalRotation';

/** Original conversion differences remain separate from receiving tolerances. */
export function measureConditioningDifferences(original: LoadedModel, derived: LoadedModel, clipIds: string[], authoredIdleId?: string, terminal?: TerminalRotationClosureRecipe) {
  function sample(model: LoadedModel, clip: THREE.AnimationClip, tick: number, restore?: Map<string, number[]>) {
    const mixer = new THREE.AnimationMixer(model.root), action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    try {
      mixer.setTime(Math.fround(tick / 60));
      for (const [name, value] of restore ?? []) {
        const bone = model.skeleton!.bones.find(b => b.name === name);
        if (!bone) throw new Error(`Conditioning lost joint ${name}.`);
        bone.quaternion.fromArray(value);
      }
      model.root.updateMatrixWorld(true);
      const positions: THREE.Vector3[] = [];
      for (const mesh of model.skinnedMeshes) {
        const p = mesh.geometry.getAttribute('position'), joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        const palette = mesh.skeleton.bones.map((bone, i) => bone.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
        for (let v = 0; v < p.count; v++) {
          const point = new THREE.Vector3();
          for (let j = 0; j < 4; j++) point.addScaledVector(new THREE.Vector3().fromBufferAttribute(p, v).applyMatrix4(palette[joints.getComponent(v, j)]), weights.getComponent(v, j));
          positions.push(point);
        }
      }
      return { positions, matrices: new Map(model.skeleton!.bones.map(b => [b.name, [...b.matrixWorld.elements]])), rotations: new Map(model.skeleton!.bones.map(b => [b.name, b.quaternion.toArray()])) };
    } finally { action.stop(); mixer.stopAllAction(); mixer.uncacheRoot(model.root); }
  }
  return clipIds.map(clipId => {
    const a = original.clips.find(c => c.name === clipId)!, b = derived.clips.find(c => c.name === clipId)!;
    const ticks = Math.round(a.duration * 60), phases = [0, ticks * .25 + .125, ticks * .5 + .25, ticks * .75 - .125, ticks];
    let maximumPositionMeters = 0, maximumJointMatrix = 0, maximumTickJointMatrix = 0, maximumEndpointJointMatrix = 0, maximumPreservedTickJointMatrix = 0;
    for (const tick of [...new Set([...phases, ...Array.from({ length: ticks + 1 }, (_, i) => i)])]) {
      const left = sample(original, a, tick), right = sample(derived, b, tick);
      let checked = right;
      if (terminal?.clipId === clipId && tick === ticks) {
        if (terminal.startTick !== ticks - 1 || clipId === authoredIdleId) throw new Error('Invalid terminal source-fidelity selection.');
        const entry = sample(original, a, 0), restore = new Map<string, number[]>();
        for (const joint of terminal.joints) {
          const expected = entry.rotations.get(joint), actual = right.rotations.get(joint), before = left.rotations.get(joint);
          if (!expected || !actual || !before || rotationDifferenceDegrees(expected, actual) > 1e-4 || rotationDifferenceDegrees(before, actual) > terminal.maxRotationDegrees) throw new Error(`Invalid terminal entry rotation for ${joint}.`);
          restore.set(joint, before);
        }
        // Undo only authorized local rotations for fidelity checks of every joint.
        checked = sample(derived, b, tick, restore);
      }
      for (const [name, values] of left.matrices) {
        const other = right.matrices.get(name), preserved = checked.matrices.get(name);
        if (!other || !preserved) throw new Error(`Conditioning lost joint ${name}.`);
        const error = Math.max(...values.map((v, i) => Math.abs(v - other[i])));
        maximumJointMatrix = Math.max(maximumJointMatrix, error);
        if (Number.isInteger(tick)) {
          maximumTickJointMatrix = Math.max(maximumTickJointMatrix, error);
          if (clipId !== authoredIdleId || tick === 0 || tick === ticks) maximumPreservedTickJointMatrix = Math.max(maximumPreservedTickJointMatrix, ...values.map((v, i) => Math.abs(v - preserved[i])));
        }
        if (tick === 0 || tick === ticks) maximumEndpointJointMatrix = Math.max(maximumEndpointJointMatrix, error);
      }
      if (left.positions.length !== right.positions.length) throw new Error('Conditioning changed the vertex count.');
      if (phases.includes(tick)) left.positions.forEach((p, i) => { maximumPositionMeters = Math.max(maximumPositionMeters, p.distanceTo(right.positions[i])); });
    }
    if (![maximumPositionMeters, maximumJointMatrix, maximumTickJointMatrix, maximumEndpointJointMatrix, maximumPreservedTickJointMatrix].every(Number.isFinite) || maximumPreservedTickJointMatrix > 1e-4) throw new Error(`Conditioning ${clipId} failed original tick-pose preservation (${maximumPreservedTickJointMatrix}).`);
    return { clipId, phases, maximumPositionMeters, maximumJointMatrix, maximumTickJointMatrix, maximumEndpointJointMatrix, maximumPreservedTickJointMatrix,
      differenceKind: clipId === authoredIdleId ? 'explicit planted idle authoring; endpoints retain source fidelity' : clipId === terminal?.clipId ? 'explicit terminal rotation authoring; all other tick transforms retain source fidelity' : 'sampled source tick preservation' };
  });
}
