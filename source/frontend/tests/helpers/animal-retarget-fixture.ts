import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { installFileReaderTestPolyfill } from '../../src/test/installFileReaderTestPolyfill';

export const animalSourceChains = [
  ['ForeUpper_L', 'ForeLower_L', 'ForePaw_L'],
  ['ForeUpper_R', 'ForeLower_R', 'ForePaw_R'],
  ['HindUpper_L', 'HindLower_L', 'HindPaw_L'],
  ['HindUpper_R', 'HindLower_R', 'HindPaw_R'],
  ['Tail01', 'Tail02', 'Tail03'],
  ['WingUpper_L', 'WingLower_L', 'WingTip_L'],
  ['WingUpper_R', 'WingLower_R', 'WingTip_R'],
];
export const animalTargetChains = [
  ['FrontUpper_L', 'FrontLower_L', 'FrontPaw_L'],
  ['FrontUpper_R', 'FrontLower_R', 'FrontPaw_R'],
  ['RearUpper_L', 'RearLower_L', 'RearPaw_L'],
  ['RearUpper_R', 'RearLower_R', 'RearPaw_R'],
  ['Tail001', 'Tail002', 'Tail003'],
  ['LeftWingShoulder', 'LeftWingElbow', 'LeftWingTip'],
  ['RightWingShoulder', 'RightWingElbow', 'RightWingTip'],
];

// First-party test geometry, not a borrowed character or frontend sample.
export async function animalRetargetFixture(source: boolean) {
  installFileReaderTestPolyfill();
  const root = new THREE.Group(), hips = new THREE.Bone(), head = new THREE.Bone();
  root.name = 'AnimalFixtureRoot';
  hips.name = 'Hips'; head.name = 'Head'; head.position.set(0, 0.3, 0.4); hips.position.y = 1; hips.add(head);
  const bones = [hips, head];
  const chains = source ? animalSourceChains : animalTargetChains;
  chains.forEach((names, chain) => {
    let parent = hips;
    names.forEach((name, segment) => {
      const bone = new THREE.Bone(); bone.name = name;
      bone.position.set(segment ? 0 : (chain % 2 ? -0.25 : 0.25), segment ? -0.15 : 0, segment ? 0 : chain < 2 ? 0.3 : -0.3);
      parent.add(bone); parent = bone; bones.push(bone);
    });
  });
  const geometry = new THREE.BoxGeometry(0.5, 0.3, 0.8);
  const count = geometry.getAttribute('position').count;
  const influences = [chains[0][0], chains[4][2], chains[6][1]].map(name => bones.findIndex(bone => bone.name === name));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: count }, (_, i) => [influences[i % influences.length], 0, 0, 0]).flat(), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0, 0]).flat(), 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 }));
  mesh.name = 'AnimalFixture'; mesh.add(hips); root.add(mesh); root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6).toArray();
  const clip = new THREE.AnimationClip(source ? 'Animal Motion' : 'Rest', 1,
    [chains[0][0], chains[4][2], chains[6][1]].map(name => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 0.5, 1], [0, 0, 0, 1, ...rotation, 0, 0, 0, 1])));
  try {
    const bytes = await new GLTFExporter().parseAsync(root, { binary: true, animations: [clip] });
    if (!(bytes instanceof ArrayBuffer)) throw new Error('Expected generated binary GLB');
    return { name: source ? 'animal-source.glb' : 'animal-target.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(bytes) };
  } finally { geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
}
