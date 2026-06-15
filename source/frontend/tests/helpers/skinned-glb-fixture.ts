import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export const SKINNED_GLB_FIXTURE_NAME = 'generated-skinned-fixture.glb';

interface TestFilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

type ReaderCallback = ((event: { target: NodeFileReader }) => void) | null;

class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: ReaderCallback = null;
  onerror: ((error: unknown) => void) | null = null;

  async readAsArrayBuffer(blob: Blob): Promise<void> {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.({ target: this });
    } catch (error) {
      this.onerror?.(error);
    }
  }

  async readAsDataURL(blob: Blob): Promise<void> {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer());
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
      this.onloadend?.({ target: this });
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

let fixtureBufferPromise: Promise<Buffer> | null = null;

function installNodeFileReader(): void {
  if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
  }
}

function createFixtureScene(): { root: THREE.Group; clips: THREE.AnimationClip[] } {
  const root = new THREE.Group();
  root.name = 'GeneratedSkinnedFixtureRoot';

  const rootBone = new THREE.Bone();
  rootBone.name = 'FixtureRoot';
  rootBone.position.set(0, 0, 0);

  const tipBone = new THREE.Bone();
  tipBone.name = 'FixtureTip';
  tipBone.position.set(0, 1, 0);
  rootBone.add(tipBone);
  root.add(rootBone);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.35, 0, 0,
    0.35, 0, 0,
    0.35, 1, 0,
    -0.35, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ], 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const material = new THREE.MeshBasicMaterial({ color: 0x3fbf8f, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'FixtureSkinnedMesh';
  mesh.bind(new THREE.Skeleton([rootBone, tipBone]));
  root.add(mesh);

  const clip = new THREE.AnimationClip('FixtureBend', 0.5, [
    new THREE.QuaternionKeyframeTrack('FixtureTip.quaternion', [0, 0.5], [
      0, 0, 0, 1,
      0, 0, 0.258819, 0.965926,
    ]),
    new THREE.VectorKeyframeTrack('FixtureRoot.position', [0, 0.5], [
      0, 0, 0,
      0.05, 0, 0,
    ]),
  ]);

  return { root, clips: [clip] };
}

async function createSkinnedGlbFixtureBuffer(): Promise<Buffer> {
  installNodeFileReader();
  const { root, clips } = createFixtureScene();
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, animations: clips });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('Expected generated skinned GLB fixture to be an ArrayBuffer');
  }
  return Buffer.from(result);
}

export async function createSkinnedGlbFixtureInput(): Promise<TestFilePayload> {
  fixtureBufferPromise ??= createSkinnedGlbFixtureBuffer();
  const buffer = await fixtureBufferPromise;
  return {
    name: SKINNED_GLB_FIXTURE_NAME,
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(buffer),
  };
}
