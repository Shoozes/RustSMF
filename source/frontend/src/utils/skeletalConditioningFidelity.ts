import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { rotationDifferenceDegrees, type TerminalRotationClosureRecipe } from './skeletalTerminalRotation';
import { parseTwoKeyRotationSelection, type TwoKeyRotationBakeRecipe } from './skeletalTwoKeyRotation';
import { parseRotationSpanBake, assertDisjointRotationSpan, type RotationSpanBakeRecipe } from './skeletalRotationSpan';
import { parsePelvisLayer, pelvisLayerRecipe, restorePelvisLayer, type PelvisLayerRecipe, type PelvisLayerReport } from './skeletalPelvisLayer';

/** Original conversion differences remain separate from receiving tolerances. */
export function measureConditioningDifferences(original: LoadedModel, derived: LoadedModel, clipIds: string[], authoredIdleId?: string, terminal?: TerminalRotationClosureRecipe, twoKey?: TwoKeyRotationBakeRecipe, twoKeys?: readonly TwoKeyRotationBakeRecipe[], spanRecipe?: RotationSpanBakeRecipe, pelvisRecipe?: PelvisLayerRecipe, pelvisReport?: PelvisLayerReport) {
  let checkedDerived = derived;
  if (pelvisRecipe !== undefined || pelvisReport !== undefined) {
    const originalRoots = original.skeleton!.bones.filter(b => !original.skeleton!.bones.includes(b.parent as THREE.Bone)), roots = derived.skeleton!.bones.filter(b => !derived.skeleton!.bones.includes(b.parent as THREE.Bone));
    if (!pelvisRecipe || !pelvisReport || originalRoots.length !== 1 || roots.length !== 1 || pelvisRecipe.clipId === authoredIdleId) throw new Error('Missing or invalid gait pelvis-layer fidelity selection.');
    const spec = parsePelvisLayer(pelvisRecipe, clipIds, clipIds, originalRoots[0].name, roots[0].name);
    if (JSON.stringify(spec) !== JSON.stringify(pelvisLayerRecipe(pelvisReport))) throw new Error('Pelvis-layer recipe/provenance differs.');
    checkedDerived = { ...derived, clips: derived.clips.map(c => c.name === spec.clipId
      ? restorePelvisLayer(c, pelvisReport, derived.skeleton!.bones, derived.root, roots[0].name, pelvisReport.height) : c) };
  }
  let selections: TwoKeyRotationBakeRecipe[] = [];
  if (twoKey !== undefined || twoKeys !== undefined) {
    const roots = [...original.skeleton!.bones, ...derived.skeleton!.bones].filter(b => !(b.parent instanceof THREE.Bone)).map(b => b.name);
    const parsed = parseTwoKeyRotationSelection({ ...(twoKey === undefined ? {} : { twoKeyRotationBake: twoKey }), ...(twoKeys === undefined ? {} : { twoKeyRotationBakes: twoKeys }) }, clipIds, clipIds, roots);
    selections = parsed.twoKeyRotationBake ? [parsed.twoKeyRotationBake] : parsed.twoKeyRotationBakes!;
    if (selections.some(s => s.clipId === authoredIdleId)) throw new Error('Two-key gait authoring cannot use the idle source-fidelity exception.');
  }
  const span = spanRecipe === undefined ? undefined : parseRotationSpanBake(spanRecipe, clipIds, clipIds,
    [...original.skeleton!.bones, ...derived.skeleton!.bones].filter(b => !(b.parent instanceof THREE.Bone)).map(b => b.name));
  if (span) {
    if (span.clipId === authoredIdleId) throw new Error('Rotation-span gait authoring cannot use the idle source-fidelity exception.');
    assertDisjointRotationSpan(span, selections);
    if (terminal?.clipId === span.clipId && span.startTick + span.rotations[0].values.length >= terminal.startTick
      && terminal.joints.some(j => span.rotations.some(r => r.joint === j))) throw new Error('rotationSpanBake conflicts with terminal source fidelity.');
    selections.push(span);
  }
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
    const checkedClip = checkedDerived.clips.find(c => c.name === clipId)!;
    const ticks = Math.round(a.duration * 60), phases = [0, ticks * .25 + .125, ticks * .5 + .25, ticks * .75 - .125, ticks];
    const selected = selections.filter(s => s.clipId === clipId);
    if (selected.some(s => s.startTick + s.rotations[0].values.length - 1 >= ticks)) throw new Error('Invalid rotation source-fidelity interval.');
    let maximumPositionMeters = 0, maximumJointMatrix = 0, maximumTickJointMatrix = 0, maximumEndpointJointMatrix = 0, maximumPreservedTickJointMatrix = 0;
    for (const tick of [...new Set([...phases, ...Array.from({ length: ticks + 1 }, (_, i) => i)])]) {
      const left = sample(original, a, tick), right = sample(derived, b, tick);
      let checked = checkedDerived === derived ? right : sample(checkedDerived, checkedClip, tick);
      const restore = new Map<string, number[]>();
      if (terminal?.clipId === clipId && tick === ticks) {
        if (terminal.startTick !== ticks - 1 || clipId === authoredIdleId) throw new Error('Invalid terminal source-fidelity selection.');
        const entry = sample(original, a, 0);
        for (const joint of terminal.joints) {
          const expected = entry.rotations.get(joint), actual = checked.rotations.get(joint), before = left.rotations.get(joint);
          if (!expected || !actual || !before || rotationDifferenceDegrees(expected, actual) > 1e-4 || rotationDifferenceDegrees(before, actual) > terminal.maxRotationDegrees) throw new Error(`Invalid terminal entry rotation for ${joint}.`);
          restore.set(joint, before);
        }
      }
      for (const selection of selected.filter(s => Number.isInteger(tick) && tick >= s.startTick && tick < s.startTick + s.rotations[0].values.length)) {
        for (const rotation of selection.rotations) {
          const before = left.rotations.get(rotation.joint), actual = checked.rotations.get(rotation.joint);
          const expected = rotation.values[tick - selection.startTick];
          if (!before || !actual || rotationDifferenceDegrees(expected, actual) > 1e-4
            || rotationDifferenceDegrees(before, actual) > selection.maxRotationDegrees) throw new Error(`Invalid ${selection === span ? 'rotation-span' : 'two-key'} source-fidelity rotation for ${rotation.joint}.`);
          restore.set(rotation.joint, before);
        }
      }
      // Undo only authorized local rotations for fidelity checks of every joint.
      if (restore.size) checked = sample(checkedDerived, checkedClip, tick, restore);
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
      differenceKind: clipId === pelvisRecipe?.clipId ? 'explicit bounded pelvis/leg layer; reversed before older selections and all-joint fidelity' : clipId === authoredIdleId ? 'explicit planted idle authoring; endpoints retain source fidelity' : clipId === span?.clipId ? 'explicit bounded rotation-span authoring; only declared local rotations and existing selections excepted' : clipId === twoKey?.clipId ? 'explicit two-key rotation authoring; only declared local rotations and existing terminal selection excepted' : selected.length ? 'explicit composed two-key rotation authoring; only declared local rotations and existing terminal selection excepted' : clipId === terminal?.clipId ? 'explicit terminal rotation authoring; all other tick transforms retain source fidelity' : 'sampled source tick preservation' };
  });
}
