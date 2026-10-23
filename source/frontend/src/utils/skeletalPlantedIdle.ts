import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { chordRotationTrack } from './skeletalChordRotation';

interface PlantedLeg { hip: string; knee: string; ankle: string; toe: string; vertices: number[] }
export interface PlantedIdleRecipe {
  clipId: string;
  pelvisJoint: string;
  calibration: { clipId: string; phaseTicks: number };
  legs: PlantedLeg[];
  floorY: number;
  maxPelvisCorrectionMeters: number;
  maxRotationDegrees: number;
}
export interface ContactBatchRequest {
  schema: 'rustsmf.pose-contact-batch.v1';
  parents: number[]; pelvis: number;
  legs: Array<{ name: string; hip: number; knee: number; ankle: number; upperAxis: number[]; pole: number[]; lowerAxis: number[]; normal: number[]; minimumBend: number; maximumBend: number }>;
  maximumPelvisCorrection: number;
  frames: Array<{ pose: number[][]; supports: Array<{ leg: number; position: number[]; rotation: number[] }> }>;
}
export interface ContactBatchResult {
  schema: 'rustsmf.pose-contact-batch-result.v1';
  frames: Array<{ pose: number[][]; pelvisTranslation: number[]; legs: Array<{ residual: number; bendDegrees: number; reachable: boolean; clamped: boolean }> }>;
  runtime: { solverSourceSha256: string; executableSha256: string };
}
export type ContactBatchSolver = (input: ContactBatchRequest, signal?: AbortSignal) => Promise<ContactBatchResult>;

export function parsePlantedIdle(value: unknown, idleIds: readonly string[], clipIds: readonly string[]): PlantedIdleRecipe {
  const fail = (): never => { throw new Error('plantedIdle requires one selected idle, explicit direct leg/toe chains, source vertices, calibration and finite correction bounds.'); };
  const object = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== keys.sort().join(',')) fail();
    return v as Record<string, unknown>;
  };
  const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v);
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000;
  const p = object(value, ['clipId', 'pelvisJoint', 'calibration', 'legs', 'floorY', 'maxPelvisCorrectionMeters', 'maxRotationDegrees']);
  const c = object(p.calibration, ['clipId', 'phaseTicks']);
  if (!id(p.clipId) || !idleIds.includes(p.clipId) || !id(p.pelvisJoint) || !id(c.clipId) || !clipIds.includes(c.clipId)
    || !finite(c.phaseTicks) || c.phaseTicks < 0 || !finite(p.floorY) || !finite(p.maxPelvisCorrectionMeters) || p.maxPelvisCorrectionMeters <= 0
    || !finite(p.maxRotationDegrees) || p.maxRotationDegrees <= 0 || p.maxRotationDegrees > 180 || !Array.isArray(p.legs) || p.legs.length !== 2) fail();
  const legs = (p.legs as unknown[]).map(value => {
    const l = object(value, ['hip', 'knee', 'ankle', 'toe', 'vertices']);
    if (![l.hip,l.knee,l.ankle,l.toe].every(id) || !Array.isArray(l.vertices) || l.vertices.length < 3 || l.vertices.length > 8192
      || !l.vertices.every(v => Number.isInteger(v) && v >= 0 && v < 8192) || new Set(l.vertices).size !== l.vertices.length) fail();
    return { hip: l.hip as string, knee: l.knee as string, ankle: l.ankle as string, toe: l.toe as string, vertices: [...l.vertices as number[]] };
  });
  if (new Set(legs.flatMap(l => [l.hip,l.knee,l.ankle,l.toe])).size !== 8 || new Set(legs.flatMap(l => l.vertices)).size !== legs.reduce((n,l)=>n+l.vertices.length,0)) fail();
  return { clipId: p.clipId as string, pelvisJoint: p.pelvisJoint as string, calibration: { clipId: c.clipId as string, phaseTicks: c.phaseTicks as number },
    legs, floorY: p.floorY as number, maxPelvisCorrectionMeters: p.maxPelvisCorrectionMeters as number, maxRotationDegrees: p.maxRotationDegrees as number };
}

/** Bake native Rust contact output into canonical tracks; preserve original clips and bind pose. */
export async function bakePlantedIdle(model: LoadedModel, clip: THREE.AnimationClip, calibrationClip: THREE.AnimationClip,
  locomotion: THREE.Bone, spec: PlantedIdleRecipe, height: number, solve: ContactBatchSolver, signal?: AbortSignal) {
  const ticks = Math.round(clip.duration * 60), skeleton = model.skeleton!;
  if (!Number.isFinite(height) || height<=0 || ticks < 2 || ticks > 3600 || (ticks+1)*skeleton.bones.length>131072 || Math.abs(ticks - clip.duration * 60) > 1e-3 || spec.calibration.phaseTicks > calibrationClip.duration * 60 + 1e-5) throw new Error('Invalid planted idle duration, model height or calibration phase.');
  const bones: THREE.Bone[] = [];
  const visit = (bone: THREE.Bone): void => { bones.push(bone); bone.children.filter(b => skeleton.bones.includes(b as THREE.Bone)).forEach(b => visit(b as THREE.Bone)); };
  visit(locomotion);
  if (bones.length !== skeleton.bones.length || locomotion.parent !== model.root) throw new Error('Planted idle requires one complete locomotion hierarchy.');
  const bind = bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()]);
  const apply = (pose: number[][]): void => { bones.forEach((b,i) => { b.position.fromArray(pose[i]); b.quaternion.fromArray(pose[i],3); b.scale.fromArray(pose[i],7); }); model.root.updateMatrixWorld(true); };
  const pose = (): number[][] => bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()]);
  const index = (id: string): number => { const i = bones.findIndex(b => b.name === id); if (i < 0) throw new Error(`Missing planted joint ${id}.`); return i; };
  const pelvis = index(spec.pelvisJoint);
  if (pelvis===0) throw new Error('Planted pelvis must be below the unchanged locomotion root.');
  model.root.updateMatrixWorld(true);
  const sceneInverse = model.root.matrixWorld.clone().invert();
  const world = (): THREE.Matrix4[] => bones.map(b => sceneInverse.clone().multiply(b.matrixWorld));
  const orientation = (m: THREE.Matrix4): THREE.Quaternion => { const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(),q,new THREE.Vector3()); return q.normalize(); };
  const position = (m: THREE.Matrix4): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(m);
  const evaluator = (clip: THREE.AnimationClip) => {
    const tracks = clip.tracks.map(t => { const b = THREE.PropertyBinding.parseTrackName(t.name); return { bone: bones[index(b.nodeName)], property: b.propertyName, curve: createTrackInterpolant(t) }; });
    return (seconds: number): number[][] => {
      signal?.throwIfAborted(); apply(bind);
      for (const t of tracks) { const v = t.curve.evaluate(seconds); if (t.property === 'position') t.bone.position.fromArray(v); else if (t.property === 'quaternion') t.bone.quaternion.fromArray(v); else if (t.property === 'scale') t.bone.scale.fromArray(v); else throw new Error('Unsupported planted track.'); }
      model.root.updateMatrixWorld(true); return pose();
    };
  };
  const skin = (): number[][] => {
    const result: number[][] = [];
    for (const mesh of model.skinnedMeshes) {
      const p = mesh.geometry.getAttribute('position'), j = mesh.geometry.getAttribute('skinIndex'), w = mesh.geometry.getAttribute('skinWeight');
      const palette = mesh.skeleton.bones.map((b,i) => sceneInverse.clone().multiply(b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
      for (let v = 0; v < p.count; v++) {
        const point = new THREE.Vector3(), base = new THREE.Vector3().fromBufferAttribute(p,v);
        for (let slot = 0; slot < 4; slot++) point.addScaledVector(base.clone().applyMatrix4(palette[j.getComponent(v,slot)]),w.getComponent(v,slot));
        if (!point.toArray().every(Number.isFinite)) throw new Error('Non-finite planted skin.'); result.push(point.toArray());
      }
    }
    return result;
  };
  try {
    const evaluate = evaluator(clip), entry = evaluate(0), anchors = world(), entrySkin = skin();
    if (entrySkin.length<3 || entrySkin.length>8192) throw new Error('Planted bake requires 3–8,192 skinned vertices.');
    if (spec.legs.some(l => l.vertices.some(v => v >= entrySkin.length))) throw new Error('Planted vertex is outside the source mesh.');
    evaluator(calibrationClip)(spec.calibration.phaseTicks / 60); const calibration = world();
    const chains = spec.legs.map(l => [l.hip,l.knee,l.ankle,l.toe].map(index));
    const legs = chains.map(([hip,knee,ankle,toe],i) => {
      if (bones[hip].parent !== bones[pelvis] || bones[knee].parent !== bones[hip] || bones[ankle].parent !== bones[knee] || bones[toe].parent !== bones[ankle]) throw new Error('Planted chains must be direct independent pelvis/hip/knee/ankle/toe chains.');
      const upper = position(calibration[knee]).sub(position(calibration[hip])).normalize(), lower = position(calibration[ankle]).sub(position(calibration[knee])).normalize();
      const normal = upper.clone().cross(lower);
      if (normal.length() < 1e-4) throw new Error('Planted calibration needs a known bent source pose.'); normal.normalize();
      const q = orientation(calibration[hip]).invert(), k = orientation(calibration[knee]).invert();
      return { name: `leg-${i}`, hip,knee,ankle, upperAxis: upper.clone().applyQuaternion(q).toArray(), pole: upper.clone().cross(normal).applyQuaternion(q).toArray(), lowerAxis: lower.applyQuaternion(k).toArray(), normal: normal.applyQuaternion(k).toArray(), minimumBend: .05, maximumBend: 179.95 };
    });
    const times = Array.from({length:ticks+1},(_,i)=>Math.fround(i/60)), frames = times.map((t,tick) => {
      const current = evaluate(t);
      // An ankle anchor also fixes its articulated toe's source entry pose.
      if (tick > 0 && tick < ticks) for (const chain of chains) current[chain[3]].splice(3,4,...entry[chain[3]].slice(3,7));
      for (let joint=0;joint<bones.length;joint++) if (current[joint].some((v,c)=> (c>=7 || (c<3 && joint!==0 && joint!==pelvis)) && Math.abs(v-entry[joint][c])>1e-6)) throw new Error('Planted bake requires fixed limb offsets and scales.');
      return { pose: current, supports: tick===0||tick===ticks ? [] : chains.map(([, ,ankle],leg)=>({leg,position:position(anchors[ankle]).toArray(),rotation:orientation(anchors[ankle]).toArray()})) };
    });
    const request: ContactBatchRequest = { schema:'rustsmf.pose-contact-batch.v1',parents:bones.map(b=>bones.indexOf(b.parent as THREE.Bone)),pelvis,legs,maximumPelvisCorrection:spec.maxPelvisCorrectionMeters,frames };
    signal?.throwIfAborted(); const solved = await solve(request,signal); signal?.throwIfAborted();
    if (solved.frames.length !== frames.length) throw new Error('Contact solver frame count mismatch.');
    const affected = new Set(chains.flat()), rotations: Record<string,number> = {};
    for (let tick=0;tick<frames.length;tick++) {
      const frame = solved.frames[tick];
      if (frame.pose.length !== bones.length || frame.pose.some(p=>p.length!==10 || !p.every(Number.isFinite)) || frame.pelvisTranslation.length!==3 || !frame.pelvisTranslation.every(Number.isFinite)
        || Math.hypot(...frame.pelvisTranslation)>spec.maxPelvisCorrectionMeters+1e-10 || frame.legs.some(l=>!Number.isFinite(l.residual)||l.residual>height*1e-5)) throw new Error('Contact solve exceeded its bounded finite result contract.');
      if (tick===0||tick===ticks) frame.pose = frames[tick].pose.map(p=>[...p]);
      for (const joint of affected) {
        const original = evaluate(times[tick])[joint], a = new THREE.Quaternion().fromArray(original,3).normalize(), b = new THREE.Quaternion().fromArray(frame.pose[joint],3).normalize();
        const angle = 2*Math.acos(Math.min(1,Math.abs(a.dot(b))))*180/Math.PI;
        rotations[bones[joint].name] = Math.max(rotations[bones[joint].name]??0,angle);
        if (angle>spec.maxRotationDegrees) throw new Error('Planted rotation correction exceeds its declared bound.');
      }
    }
    const replacements: THREE.KeyframeTrack[] = [new THREE.VectorKeyframeTrack(`${bones[pelvis].name}.position`,times,solved.frames.flatMap(f=>f.pose[pelvis].slice(0,3)))];
    for (const joint of affected) replacements.push(chordRotationTrack(`${bones[joint].name}.quaternion`,times,solved.frames.flatMap(f=>f.pose[joint].slice(3,7))));
    const storedPelvisCorrections=times.map((t,tick)=>{
      const original=evaluate(t)[pelvis];
      const delta=[0,1,2].map(c=>replacements[0].values[tick*3+c]-Math.fround(original[c]));
      if (Math.hypot(...delta)>spec.maxPelvisCorrectionMeters) throw new Error('Stored planted pelvis correction exceeds its declared bound.');
      return delta;
    });
    for (const joint of affected) {
      const track=replacements.find(t=>t.name===`${bones[joint].name}.quaternion`)!;
      rotations[bones[joint].name]=Math.max(...times.map((t,tick)=>{
        const a=new THREE.Quaternion().fromArray(evaluate(t)[joint],3).normalize(),b=new THREE.Quaternion().fromArray(track.values,tick*12+4).normalize();
        return 2*Math.acos(Math.min(1,Math.abs(a.dot(b))))*180/Math.PI;
      }));
      if (rotations[bones[joint].name]>spec.maxRotationDegrees) throw new Error('Stored planted rotation exceeds its declared bound.');
    }
    const names = new Set(replacements.map(t=>t.name));
    const baked = new THREE.AnimationClip(clip.name,clip.duration,[...clip.tracks.filter(t=>!names.has(t.name)),...replacements]);
    const inspect = (candidate: THREE.AnimationClip) => {
      const sample = evaluator(candidate); let maxDrift=0,maxSoleGap=0,maxPenetration=0;
      for (let step=0;step<=ticks*4;step++) {
        sample(step/240); const points=skin();
        maxPenetration=Math.max(maxPenetration,...points.map(p=>spec.floorY-p[1]));
        if (step<ticks*4) for (const l of spec.legs) for (const vertex of l.vertices) {
          const p=points[vertex],a=entrySkin[vertex]; maxDrift=Math.max(maxDrift,Math.hypot(p[0]-a[0],p[2]-a[2]));maxSoleGap=Math.max(maxSoleGap,Math.abs(p[1]-spec.floorY));
        }
      }
      return {samples:ticks*4+1,maxDrift,maxSoleGap,maxPenetration};
    };
    const before=inspect(clip),after=inspect(baked);
    if (after.maxDrift>height*.01 || after.maxSoleGap>height*.005 || after.maxPenetration>height*.005) throw new Error(`Stored-key planted bake failed dense constraints: ${JSON.stringify(after)}`);
    return { clip:baked,report:{clipId:clip.name,policy:'native-v1-two-leg-entry-anchor.v1',calibration:{...spec.calibration,legs},runtime:solved.runtime,before,after,
      pelvisCorrectionByTick:storedPelvisCorrections,maximumRotationDegreesByJoint:rotations,solverMaximumResidual:Math.max(...solved.frames.flatMap(f=>f.legs.map(l=>l.residual))),endpointPolicy:'Unchanged source pose and root at both endpoints; other clips and root channels untouched.'} };
  } finally { apply(bind); }
}
