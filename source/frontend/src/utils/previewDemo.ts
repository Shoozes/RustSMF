import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function createPreviewDemo() {
  const scene = new THREE.Group();
  scene.name = 'RustSMFSignalRobot';
  const base = new THREE.Bone(); base.name = 'Base';
  const shoulder = new THREE.Bone(); shoulder.name = 'Shoulder'; shoulder.position.set(0.44, 1.12, 0);
  const elbow = new THREE.Bone(); elbow.name = 'Elbow'; elbow.position.y = 0.35;
  const wrist = new THREE.Bone(); wrist.name = 'Wrist'; wrist.position.y = 0.35;
  const head = new THREE.Bone(); head.name = 'Head'; head.position.y = 1.32;
  base.add(shoulder, head); shoulder.add(elbow); elbow.add(wrist);
  scene.add(base);
  const parts: { geometry: THREE.BoxGeometry; material: number }[] = [];
  const box = (size: [number, number, number], center: [number, number, number], bone: number, material: number) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.translate(...center);
    const count = geometry.getAttribute('position').count;
    const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = bone; weights[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    parts.push({ geometry, material });
  };
  box([0.9, 0.1, 0.65], [0, 0.05, 0], 0, 2);
  box([0.2, 0.48, 0.22], [-0.18, 0.34, 0], 0, 1);
  box([0.2, 0.48, 0.22], [0.18, 0.34, 0], 0, 1);
  box([0.64, 0.6, 0.36], [0, 0.9, 0], 0, 0);
  box([0.13, 0.12, 0.13], [0, 1.26, 0], 4, 1);
  box([0.36, 0.28, 0.3], [0, 1.46, 0], 4, 0);
  box([0.16, 0.5, 0.18], [-0.43, 0.99, 0], 0, 1);
  box([0.18, 0.35, 0.18], [0.44, 1.295, 0], 1, 2);
  box([0.16, 0.35, 0.16], [0.44, 1.645, 0], 2, 2);
  box([0.23, 0.18, 0.12], [0.44, 1.91, 0], 3, 0);
  const geometry = mergeGeometries(parts.map(part => part.geometry), true);
  if (!geometry) throw new Error('Demo geometry could not be assembled');
  geometry.groups.forEach((group, i) => { group.materialIndex = parts[i].material; });
  parts.forEach(part => part.geometry.dispose());
  const materials = [0xd5c9b0, 0x707b77, 0xb79251].map((color, i) => {
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.12, roughness: 0.65 });
    material.name = ['Ceramic', 'Graphite', 'Brass'][i];
    return material;
  });
  const mesh = new THREE.SkinnedMesh(geometry, materials);
  mesh.name = 'SignalRobot';
  scene.add(mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([base, shoulder, elbow, wrist, head]));
  const quaternion = (axis: THREE.Vector3, degrees: number) => new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees)).toArray();
  const z = new THREE.Vector3(0, 0, 1), y = new THREE.Vector3(0, 1, 0);
  const times = [0, 0.5, 1, 1.5, 2];
  const wave = new THREE.AnimationClip('Wave', 2, [
    new THREE.QuaternionKeyframeTrack('Shoulder.quaternion', times, [0, -22, 0, 22, 0].flatMap(angle => quaternion(z, angle))),
    new THREE.QuaternionKeyframeTrack('Elbow.quaternion', times, [0, 35, 0, -35, 0].flatMap(angle => quaternion(z, angle))),
  ]);
  const turn = new THREE.AnimationClip('Turn', 2, [
    new THREE.QuaternionKeyframeTrack('Base.quaternion', [0, 1, 2], [0, 50, 0].flatMap(angle => quaternion(y, angle))),
  ]);
  return { scene, clips: [wave, turn], mesh };
}
