import * as THREE from 'three';

export function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  return meshes;
}

/** Compares every skinned vertex at the baked frame grid, restoring both poses. */
export function compareFittedMotion(source: THREE.Object3D, received: THREE.Object3D,
  sourceClips: readonly THREE.AnimationClip[], receivedClips: readonly THREE.AnimationClip[], rate = 60) {
  const original = skinnedMeshes(source), replacement = skinnedMeshes(received);
  if (!original.length || original.length !== replacement.length || !Number.isInteger(rate) || rate < 1 || rate > 240) {
    throw new Error('Fitted verification requires matching skinned meshes and a bounded frame rate');
  }
  let vertices = 0;
  for (const [index, mesh] of original.entries()) {
    const count = mesh.geometry.getAttribute('position').count;
    if (count !== replacement[index].geometry.getAttribute('position').count) throw new Error('Fitted vertex count changed');
    vertices += count;
  }
  if (!sourceClips.length || sourceClips.some(clip => !Number.isFinite(clip.duration) || clip.duration < 0)
    || sourceClips.reduce((sum, clip) => sum + Math.ceil(clip.duration * rate) + 1, 0) * vertices > 20_000_000) {
    throw new Error('Fitted comparison exceeds 20 million vertex samples or has no clips');
  }
  const saved: Array<{ node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }> = [];
  for (const root of [source, received]) root.traverse(node => saved.push({ node,
    position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
  const results: Array<{ clip: string; maximumVertexError: number; worstFrame: number; frames: number }> = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  try {
    for (const clip of sourceClips) {
      const counterparts = receivedClips.filter(candidate => candidate.name === clip.name);
      if (counterparts.length !== 1) throw new Error(`Missing or ambiguous fitted clip: ${clip.name}`);
      const a = new THREE.AnimationMixer(source), b = new THREE.AnimationMixer(received);
      let maximumVertexError = 0, worstFrame = 0;
      const frames = Math.floor(clip.duration * rate) + 1;
      try {
        for (const [mixer, motion] of [[a, clip], [b, counterparts[0]]] as const) {
          const action = mixer.clipAction(motion); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
        }
        for (let frame = 0; frame < frames; frame++) {
          a.setTime(Math.min(clip.duration, Math.fround(frame / rate))); b.setTime(frame / rate);
          source.updateMatrixWorld(true); received.updateMatrixWorld(true);
          for (const [index, mesh] of original.entries()) {
            const target = replacement[index];
            for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
              mesh.getVertexPosition(vertex, p).applyMatrix4(mesh.matrixWorld);
              target.getVertexPosition(vertex, q).applyMatrix4(target.matrixWorld);
              const error = p.distanceTo(q);
              if (!Number.isFinite(error)) throw new Error('Non-finite fitted vertex');
              if (error > maximumVertexError) { maximumVertexError = error; worstFrame = frame; }
            }
          }
        }
        results.push({ clip: clip.name, maximumVertexError, worstFrame, frames });
      } finally { a.stopAllAction(); a.uncacheRoot(source); b.stopAllAction(); b.uncacheRoot(received); }
    }
    return { vertices, meshes: original.length, sampleRateHz: rate,
      maximumVertexError: Math.max(...results.map(result => result.maximumVertexError)), clips: results };
  } finally {
    for (const { node, position, quaternion, scale } of saved) {
      node.position.copy(position); node.quaternion.copy(quaternion); node.scale.copy(scale); node.updateMatrix();
    }
    source.updateMatrixWorld(true); received.updateMatrixWorld(true);
  }
}
