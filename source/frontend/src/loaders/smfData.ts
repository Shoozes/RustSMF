import type { ImportedSmf } from './smf';

/**
 * Clone every mutable SMF payload so edits and transferable worker messages
 * never detach or mutate the app's canonical imported data.
 */
export function cloneImportedSmf(source: ImportedSmf): ImportedSmf {
  return {
    meshes: source.meshes.map((mesh) => ({
      ...mesh,
      positions: new Float32Array(mesh.positions),
      normals: new Float32Array(mesh.normals),
      uvs: new Float32Array(mesh.uvs),
      tangents: new Float32Array(mesh.tangents),
      skinIndices: new Uint16Array(mesh.skinIndices),
      skinWeights: new Float32Array(mesh.skinWeights),
      triangles: mesh.triangles.map((triangle) => [...triangle]),
    })),
    textures: source.textures.map((texture) => ({
      ...texture,
      pixels: new Uint8Array(texture.pixels),
    })),
    bones: source.bones.map((bone) => ({
      ...bone,
      dq: new Float32Array(bone.dq),
      axis: [...bone.axis],
    })),
    animations: source.animations.map((animation) => ({
      ...animation,
      times: [...animation.times],
      frames: animation.frames.map((frame) => frame.map((dq) => new Float32Array(dq))),
      lockedBones: [...animation.lockedBones],
    })),
  };
}

export function collectImportedSmfTransferables(source: ImportedSmf): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (view: ArrayBufferView<ArrayBufferLike>): void => {
    if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
  };

  source.meshes.forEach((mesh) => {
    add(mesh.positions);
    add(mesh.normals);
    add(mesh.uvs);
    add(mesh.tangents);
    add(mesh.skinIndices);
    add(mesh.skinWeights);
  });
  source.textures.forEach((texture) => add(texture.pixels));
  source.bones.forEach((bone) => add(bone.dq));
  source.animations.forEach((animation) => {
    animation.frames.forEach((frame) => frame.forEach(add));
  });

  return [...buffers];
}
