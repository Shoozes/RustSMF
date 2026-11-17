import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { installFileReaderTestPolyfill } from '../../src/test/installFileReaderTestPolyfill';
import { buildGlbContainer, parseGlbContainer } from '../../src/utils/glbContainer';

export async function createSharedMorphGlbFixture() {
  installFileReaderTestPolyfill();
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const target = geometry.attributes.position.clone();
  target.setX(0, target.getX(0) + 0.25);
  geometry.morphAttributes.position = [target];
  const material = new THREE.MeshStandardMaterial();
  const animated = new THREE.Mesh(geometry, material);
  animated.name = 'AnimatedShape';
  const staticShape = new THREE.Mesh(geometry, material);
  staticShape.name = 'StaticShape';
  staticShape.position.x = 2;
  root.add(animated, staticShape);
  const clips = [new THREE.AnimationClip('Shape motion', 20, [
    new THREE.NumberKeyframeTrack('AnimatedShape.morphTargetInfluences', [0, 20], [0.25, 1]),
  ])];

  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips });
    if (!(result instanceof ArrayBuffer)) throw new Error('Expected a binary fixture');
    const { json, binary } = parseGlbContainer(new Uint8Array(result));
    const nodes = json.nodes as Array<{ name?: string; mesh?: number; weights?: number[] }>;
    const animatedNode = nodes.find(node => node.name === animated.name);
    const staticNode = nodes.find(node => node.name === staticShape.name);
    if (animatedNode?.mesh === undefined || staticNode?.mesh !== animatedNode.mesh) {
      throw new Error('The morph fixture must share one glTF mesh');
    }
    animatedNode.weights = [0.25];
    staticNode.weights = [0.75];
    return { name: 'shared-morph.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(buildGlbContainer(json, binary)) };
  } finally {
    geometry.dispose();
    material.dispose();
  }
}
