import * as THREE from 'three';

export interface TargetPose {
  targetClip: string;
  targetFrame: number;
  rootOffset: [number, number, number];
  rootYawDegrees?: number;
}
export interface EndpointPose extends TargetPose { spanFrames: number }
export interface IntermediatePose extends TargetPose { frame: number }
export interface EndpointEnvelope { entry: EndpointPose; exit: EndpointPose; intermediatePoses?: IntermediatePose[] }
type Pose = Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }>;
export interface EndpointResidual { maximumPosition: number; positionBone: string; maximumDegrees: number; rotationBone: string }
export interface EndpointEnvelopeReport {
  status: 'matched' | 'constraint-conflict';
  entry: EndpointResidual;
  exit: EndpointResidual;
}

export function parseEndpointEnvelopes(value: unknown): Record<string, EndpointEnvelope> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256) throw new Error('Invalid clipEndpointEnvelopes map.');
  return Object.fromEntries(Object.entries(value).map(([clip, raw]) => {
    if (!clip.trim() || clip.length > 160 || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Endpoint envelope requires a named source clip.');
    const envelope = raw as Record<string, unknown>;
    if (Object.keys(envelope).some(k => !['entry', 'exit', 'intermediatePoses'].includes(k))) throw new Error('Unknown endpoint envelope field.');
    const endpoints = Object.fromEntries(['entry', 'exit'].map(key => {
      const value = envelope[key];
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Endpoint envelope requires entry and exit poses.');
      const p = value as Record<string, unknown>;
      if (Object.keys(p).some(k => !['targetClip', 'targetFrame', 'spanFrames', 'rootOffset', 'rootYawDegrees'].includes(k))) throw new Error('Unknown endpoint pose field.');
      if (typeof p.targetClip !== 'string' || !p.targetClip.trim() || p.targetClip.length > 160
        || typeof p.targetFrame !== 'number' || !Number.isInteger(p.targetFrame) || p.targetFrame < 0 || p.targetFrame > 19999
        || typeof p.spanFrames !== 'number' || !Number.isInteger(p.spanFrames) || p.spanFrames < 2 || p.spanFrames > 20000
        || !Array.isArray(p.rootOffset) || p.rootOffset.length !== 3
        || Array.from(p.rootOffset).some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 10000)) throw new Error('Invalid endpoint clip/frame/span/root offset.');
      if (p.rootYawDegrees !== undefined && (typeof p.rootYawDegrees !== 'number' || !Number.isFinite(p.rootYawDegrees) || Math.abs(p.rootYawDegrees) > 180)) throw new Error('Endpoint root yaw must be a finite number within -180..180 degrees.');
      return [key, { targetClip: p.targetClip, targetFrame: p.targetFrame, spanFrames: p.spanFrames, rootOffset: [...p.rootOffset], ...(p.rootYawDegrees !== undefined ? {rootYawDegrees: p.rootYawDegrees} : {}) }];
    })) as unknown as EndpointEnvelope;
    if (envelope.intermediatePoses !== undefined) {
      const keys = envelope.intermediatePoses;
      if (!Array.isArray(keys) || !keys.length || keys.length > 128) throw new Error('Intermediate poses require 1–128 ordered keys.');
      endpoints.intermediatePoses = Array.from(keys, (raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid intermediate pose.');
        const {frame, ...pose} = raw as Record<string, unknown>;
        if (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 1 || frame > 19998
          || (index > 0 && frame <= (keys[index - 1] as IntermediatePose).frame)
          || 'spanFrames' in pose) throw new Error('Intermediate pose frames must be strictly ordered interior samples.');
        // Reuse the exact target-pose contract; no file paths or alternate parser.
        const spec = {...pose, spanFrames: 2};
        const parsed = parseEndpointEnvelopes({key: {entry: spec, exit: spec}})!.key.entry;
        const {spanFrames: _span, ...target} = parsed;
        return {...target, frame};
      });
    }
    return [clip, endpoints];
  }));
}

export function validateEndpointWindows(envelope: EndpointEnvelope, samples: number): void {
  if (!Number.isInteger(samples) || samples > 20000 || envelope.entry.spanFrames + envelope.exit.spanFrames >= samples) throw new Error('Endpoint windows must not overlap and must leave an unmodified core sample.');
  if (envelope.intermediatePoses?.some(p => p.frame < envelope.entry.spanFrames || p.frame >= samples - envelope.exit.spanFrames)) throw new Error('Intermediate poses must lie outside endpoint blend windows.');
}

function poseSampler(clip: THREE.AnimationClip, skeleton: THREE.Skeleton) {
  const names = new Set(skeleton.bones.map(b => b.name));
  if (names.size !== skeleton.bones.length || names.has('')) throw new Error('Endpoint poses require unique named target bones.');
  const rest: Pose = new Map(skeleton.bones.map(b => [b.name, { position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }]));
  const bindings = new Set<string>();
  const channels = clip.tracks.map(track => {
    const p = THREE.PropertyBinding.parseTrackName(track.name);
    if (!names.has(p.nodeName) || p.objectName || p.propertyIndex !== undefined || !['position', 'quaternion', 'scale'].includes(p.propertyName)) throw new Error(`Endpoint envelope requires direct target-bone TRS tracks: ${track.name}.`);
    const key = `${p.nodeName}.${p.propertyName}`;
    if (bindings.has(key)) throw new Error('Endpoint envelope received duplicate channels.');
    bindings.add(key);
    if (track.getValueSize() !== (p.propertyName === 'quaternion' ? 4 : 3)
      || !track.times.length || track.values.length !== track.times.length * track.getValueSize()
      || Array.from(track.values).some(n => !Number.isFinite(n))
      || Array.from(track.times).some((n, i) => !Number.isFinite(n) || n < 0 || (i > 0 && n <= track.times[i - 1]))) throw new Error('Invalid endpoint animation channel.');
    const interpolant = (track as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }).createInterpolant();
    return { name: p.nodeName, property: p.propertyName as 'position' | 'quaternion' | 'scale', interpolant };
  });
  return (time: number): Pose => {
    if (!Number.isFinite(clip.duration) || clip.duration < time - 1e-6 || time < 0) throw new Error(`Endpoint frame is outside target clip ${clip.name}.`);
    const pose: Pose = new Map([...rest].map(([name, p]) => [name, { position: p.position.clone(), quaternion: p.quaternion.clone(), scale: p.scale.clone() }]));
    for (const channel of channels) pose.get(channel.name)![channel.property].fromArray(channel.interpolant.evaluate(Math.min(clip.duration, Math.fround(time))));
    for (const bone of skeleton.bones) {
      const p = pose.get(bone.name)!, r = rest.get(bone.name)!;
      if (p.scale.distanceTo(r.scale) > 1e-6 || [p.scale.x,p.scale.y,p.scale.z].some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Endpoint envelope cannot change bone scales.');
      if (bone.parent instanceof THREE.Bone && p.position.distanceTo(r.position) > 1e-6) throw new Error('Endpoint envelope cannot change child offsets or bone lengths.');
      if (Math.abs(p.quaternion.length() - 1) > 1e-4) throw new Error('Endpoint envelope received a non-unit rotation.');
      p.quaternion.normalize(); p.scale.copy(r.scale);
      if (bone.parent instanceof THREE.Bone) p.position.copy(r.position);
    }
    return pose;
  };
}

export function captureDescendantRotations(clip: THREE.AnimationClip, skeleton: THREE.Skeleton, frame: number, ancestor: string): Map<string, THREE.Quaternion> {
  const pose=poseSampler(clip,skeleton)(frame/60),result=new Map<string,THREE.Quaternion>();
  for(const bone of skeleton.bones) for(let parent=bone.parent;parent instanceof THREE.Bone;parent=parent.parent) {
    if(parent.name===ancestor){result.set(bone.name,pose.get(bone.name)!.quaternion.clone());break;}
  }
  return result;
}

function worldPose(pose: Pose, skeleton: THREE.Skeleton): Map<string, THREE.Matrix4> {
  const matrices = new Map<string, THREE.Matrix4>();
  const resolve = (bone: THREE.Bone): THREE.Matrix4 => {
    const cached = matrices.get(bone.name); if (cached) return cached;
    const p = pose.get(bone.name)!;
    const parent = bone.parent instanceof THREE.Bone ? resolve(bone.parent) : (bone.parent?.matrixWorld ?? new THREE.Matrix4());
    const matrix = parent.clone().multiply(new THREE.Matrix4().compose(p.position,p.quaternion,p.scale)); matrices.set(bone.name,matrix); return matrix;
  };
  skeleton.bones.forEach(resolve); return matrices;
}

function emitPoses(poses: Pose[], times: ArrayLike<number>, skeleton: THREE.Skeleton, name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, skeleton.bones.flatMap(bone => {
    const positions: number[] = [], quaternions: number[] = [], scales: number[] = [];
    let previous: THREE.Quaternion | undefined;
    for (const pose of poses) {
      const p = pose.get(bone.name)!; p.position.toArray(positions, positions.length); p.scale.toArray(scales,scales.length);
      const q = p.quaternion.clone(); if (previous && previous.dot(q) < 0) q.set(-q.x,-q.y,-q.z,-q.w);
      q.toArray(quaternions,quaternions.length); previous=q;
    }
    return [new THREE.VectorKeyframeTrack(`${bone.name}.position`,Array.from(times),positions,THREE.InterpolateDiscrete),
      new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`,Array.from(times),quaternions,THREE.InterpolateDiscrete),
      new THREE.VectorKeyframeTrack(`${bone.name}.scale`,Array.from(times),scales,THREE.InterpolateDiscrete)];
  }));
}

export function captureContactAnchor(clip: THREE.AnimationClip, skeleton: THREE.Skeleton, frame: number, ankle: string, soleOffset: [number,number,number]) {
  skeleton.bones[0]?.updateWorldMatrix(true,true);
  const matrix=worldPose(poseSampler(clip,skeleton)(frame/60),skeleton).get(ankle);
  if(!matrix)throw new Error(`Contact anchor ankle ${ankle} is missing.`);
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(position,quaternion,scale);
  return {sole:new THREE.Vector3(...soleOffset).applyMatrix4(matrix),quaternion:quaternion.normalize()};
}

export function captureContactPointOffsets(clip: THREE.AnimationClip, skeleton: THREE.Skeleton, count: number, ankle: string, contactBone: string, point: [number,number,number]): [number,number,number][] {
  const sample=poseSampler(clip,skeleton);
  if (count*skeleton.bones.length>200000) throw new Error('Contact point exceeds the 200000 bone-sample allocation limit.');
  return Array.from({length:count},(_,frame)=>{
    const pose=worldPose(sample(frame/60),skeleton),foot=pose.get(ankle),bone=pose.get(contactBone);
    if(!foot||!bone)throw new Error('Contact point bone is missing.');
    return new THREE.Vector3(...point).applyMatrix4(bone).applyMatrix4(foot.clone().invert()).toArray();
  });
}

export function bakeEndpointEnvelope(base: THREE.AnimationClip, skeleton: THREE.Skeleton, targetClips: readonly THREE.AnimationClip[], config: EndpointEnvelope, rootHeightOffset = 0) {
  const envelope = parseEndpointEnvelopes({ clip: config })!.clip;
  if (envelope.intermediatePoses && rootHeightOffset !== 0) throw new Error('Intermediate pose paths own their root offsets; separate root height must be zero.');
  const count = Math.round(base.duration * 60) + 1;
  validateEndpointWindows(envelope,count);
  if (!skeleton.bones.length || count * skeleton.bones.length > 200000) throw new Error('Endpoint envelope exceeds the 200000 bone-sample allocation limit.');
  if (Math.abs((count - 1) / 60 - base.duration) > 1e-6) throw new Error('Endpoint envelopes require a complete 60 Hz sample grid.');
  const times = base.tracks[0]?.times;
  // Accept ordinary and next-down float32 keys, not matching irregular schedules.
  if (!times || times.length !== count || Array.from(times).some((time, frame) =>
    !Number.isFinite(time) || Math.abs(time - frame / 60) > Math.max(1, frame / 60) * 2 ** -23)
    || base.tracks.some(track => track.times.length !== count || Array.from(track.times).some((time, frame) => time !== times[frame]))) {
    throw new Error('Endpoint envelopes require a shared complete 60 Hz sample grid.');
  }
  const roots = skeleton.bones.filter(b => !(b.parent instanceof THREE.Bone));
  if (roots.length !== 1) throw new Error('Endpoint envelope requires one target root bone.');
  for (const bone of skeleton.bones) for (let node: THREE.Object3D | null = bone; node; node = node.parent) {
    const s=node.scale;
    if (![s.x,s.y,s.z].every(Number.isFinite) || s.x<=0 || Math.abs(s.x-s.y)>1e-6 || Math.abs(s.x-s.z)>1e-6) throw new Error('Endpoint envelopes require positive uniform bone/ancestor scales.');
  }
  skeleton.bones[0]?.updateWorldMatrix(true,true);
  const root=roots[0], inverseParent=(root.parent?.matrixWorld ?? new THREE.Matrix4()).clone().invert();
  const localOffset=(offset: [number,number,number]) => new THREE.Vector3(...offset).applyMatrix3(new THREE.Matrix3().setFromMatrix4(inverseParent));
  const endpoint=(spec: TargetPose) => {
    const matches=targetClips.filter(c=>c.name===spec.targetClip);
    if(matches.length!==1) throw new Error(`Missing or ambiguous target endpoint clip ${spec.targetClip}.`);
    const pose=poseSampler(matches[0],skeleton)(spec.targetFrame/60);
    if (spec.rootYawDegrees) {
      // Rotate about model-space origin before applying receiving-root translation.
      const p = pose.get(root.name)!;
      const parent = root.parent?.matrixWorld ?? new THREE.Matrix4();
      const yaw = new THREE.Matrix4().makeRotationY(spec.rootYawDegrees * Math.PI / 180);
      const local = inverseParent.clone().multiply(yaw).multiply(parent)
        .multiply(new THREE.Matrix4().compose(p.position,p.quaternion,p.scale));
      local.decompose(p.position,p.quaternion,new THREE.Vector3());
      p.quaternion.normalize();
    }
    pose.get(root.name)!.position.add(localOffset(spec.rootOffset)); return pose;
  };
  const entry=endpoint(envelope.entry),exit=endpoint(envelope.exit),sample=poseSampler(base,skeleton);
  const keys = envelope.intermediatePoses ? [
    {frame: 0, pose: entry}, ...envelope.intermediatePoses.map(p => ({frame: p.frame, pose: endpoint(p)})),
    {frame: count - 1, pose: exit},
  ] : undefined;
  const poses=Array.from({length:count},(_,frame)=>{
    const pose=sample(frame/60);pose.get(root.name)!.position.add(localOffset([0,rootHeightOffset,0]));
    if (keys) {
      const index = Math.max(1, keys.findIndex(key => key.frame >= frame));
      const a = keys[index - 1], b = keys[index], t = (frame - a.frame) / (b.frame - a.frame), weight = t*t*(3-2*t);
      for (const [name,p] of pose) {
        p.position.copy(a.pose.get(name)!.position).lerp(b.pose.get(name)!.position,weight);
        p.quaternion.copy(a.pose.get(name)!.quaternion).slerp(b.pose.get(name)!.quaternion,weight).normalize();
      }
    }
    const entering=frame<envelope.entry.spanFrames,leaving=frame>=count-envelope.exit.spanFrames;
    if(entering||leaving){const t=entering?1-frame/(envelope.entry.spanFrames-1):(frame-(count-envelope.exit.spanFrames))/(envelope.exit.spanFrames-1),weight=t*t*(3-2*t),target=entering?entry:exit;
      for(const [name,p]of pose){p.position.lerp(target.get(name)!.position,weight);p.quaternion.slerp(target.get(name)!.quaternion,weight).normalize();}}
    return pose;
  });
  return { clip:emitPoses(poses,times,skeleton,base.name,base.duration),entry,exit };
}

export function finishEndpointEnvelope(clip: THREE.AnimationClip, skeleton: THREE.Skeleton, expected: ReturnType<typeof bakeEndpointEnvelope>): { clip: THREE.AnimationClip; report: EndpointEnvelopeReport } {
  const sample=poseSampler(clip,skeleton),count=Math.round(clip.duration*60)+1,poses=Array.from({length:count},(_,frame)=>sample(frame/60));
  const residual=(actual: Pose,wanted: Pose): EndpointResidual => {
    const a=worldPose(actual,skeleton),b=worldPose(wanted,skeleton),result={maximumPosition:0,positionBone:'',maximumDegrees:0,rotationBone:''};
    for(const bone of skeleton.bones){const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),rp=new THREE.Vector3(),rq=new THREE.Quaternion();a.get(bone.name)!.decompose(p,q,s);b.get(bone.name)!.decompose(rp,rq,s);const distance=p.distanceTo(rp),angle=q.normalize().angleTo(rq.normalize())*180/Math.PI;if(distance>result.maximumPosition){result.maximumPosition=distance;result.positionBone=bone.name;}if(angle>result.maximumDegrees){result.maximumDegrees=angle;result.rotationBone=bone.name;}}return result;
  };
  const entry=residual(poses[0],expected.entry),exit=residual(poses[count-1],expected.exit);
  return {clip:emitPoses(poses,clip.tracks[0].times,skeleton,clip.name,clip.duration),report:{status:[entry,exit].every(r=>r.maximumPosition<=1e-5&&r.maximumDegrees<=.001)?'matched':'constraint-conflict',entry,exit}};
}
