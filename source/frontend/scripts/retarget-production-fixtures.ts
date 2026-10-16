import * as THREE from 'three';
import type { PortableBakeRequestV1, PortableClipV1 } from '../src/workers/retargetPortable';
import type { BakeInput } from '../src/workers/retargetProtocol';
import type { ClipSnapshot, BakeOptions } from '../src/workers/retargetSnapshot';

/** Test-only transport decode. Production captures editor-owned snapshots directly. */
export function productionInput(request: PortableBakeRequestV1): BakeInput {
  const clip = (c: PortableClipV1, skeleton: typeof request.source): ClipSnapshot => ({
    name: c.name, duration: c.duration, blendMode: c.blendMode as THREE.AnimationBlendMode,
    tracks: c.tracks.map(t => ({name: t.name ?? `${skeleton.nodes[t.node].name}.${t.property}`,
      type: t.property === 'quaternion' ? 'quaternion' : 'vector',
      interpolation: t.interpolation === 'gltf-cubic-spline' ? t.interpolation
        : ({step: THREE.InterpolateDiscrete, linear: THREE.InterpolateLinear, smooth: THREE.InterpolateSmooth} as const)[t.interpolation],
      times: new Float32Array(t.times), values: new Float32Array(t.values)})),
  });
  if (!request.mappingDetails) throw new Error('Production bake fixture needs mapping details.');
  return {source: structuredClone(request.source), target: structuredClone(request.target), mapping: structuredClone(request.mappingDetails),
    clips: request.clips.map(j => ({clip: clip(j.clip, request.source), options: {...structuredClone(j.options) as BakeOptions,
      ...(j.sourceReferenceClip ? {sourceReferenceClip: clip(j.sourceReferenceClip, request.source)} : {}),
      ...(j.targetReferenceClip ? {targetReferenceClip: clip(j.targetReferenceClip, request.target)} : {}),
      ...(j.endpointTargetClips.length ? {endpointTargetClips: j.endpointTargetClips.map(c => clip(c, request.target))} : {}),
    }}))};
}
