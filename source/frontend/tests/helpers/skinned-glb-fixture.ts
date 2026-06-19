import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export const SKINNED_GLB_FIXTURE_NAME = 'generated-skinned-fixture.glb';

interface TestFilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export interface SkinnedGlbFixtureOptions {
  withTexture?: boolean;
  nonPowerOfTwoTexture?: boolean;
  withMultiMaterial?: boolean;
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
let texturedFixtureBufferPromise: Promise<Buffer> | null = null;
let multiMaterialFixtureBufferPromise: Promise<Buffer> | null = null;

function installNodeFileReader(): void {
  if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
  }
}

function installNodeCanvasSupport(): void {
  const g = globalThis as unknown as Record<string, unknown>;

  if (typeof document !== 'undefined') return;
  if (typeof g.OffscreenCanvas !== 'undefined') return;
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: ArrayLike<number> | ArrayBufferView, width: number, height: number) {
        this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data as ArrayLike<number>);
        this.width = width;
        this.height = height;
      }
    };
  }

  const pngOneByOne = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY2BgYPgPAAEEAQBwIGULAAAAAElFTkSuQmCC',
    'base64'
  );
  const pngThreeByTwo = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAQSURBVBhXY2BgYPiPhBEcAETVBfscw9AuAAAAAElFTkSuQmCC',
    'base64'
  );
  const pngFourByFour = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAARSURBVBhXY2BgYPiPhkkVAAAGWg/xd33D9AAAAABJRU5ErkJggg==',
    'base64'
  );

  const resolveTextureBlobBytes = (width: number, height: number): Buffer => {
    if (width === 3 && height === 2) return Buffer.from(pngThreeByTwo);
    if (width === 4 && height === 4) return Buffer.from(pngFourByFour);
    return Buffer.from(pngOneByOne);
  };
  const textureBlobPart = (width: number, height: number): ArrayBuffer => {
    const bytes = resolveTextureBlobBytes(width, height);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  };

  class MockCanvasContext {
    scale(_x: number, _y: number): void {}
    translate(_x: number, _y: number): void {}
    putImageData(_imageData: object, _x: number, _y: number): void {}
    drawImage(..._args: unknown[]): void {}
  }

  class MockOffscreenCanvas {
    width: number;
    height: number;

    constructor(width = 1, height = 1) {
      this.width = width;
      this.height = height;
    }

    getContext(_name: string, _opts?: unknown): MockCanvasContext | null {
      if (_name === '2d' || _name === 'webgl' || _name === 'webgl2' || _name === 'webgpu') {
        return new MockCanvasContext();
      }
      return null;
    }

    convertToBlob(_options?: BlobPropertyBag): Promise<Blob | undefined> {
      return Promise.resolve(new Blob([textureBlobPart(this.width, this.height)], { type: _options?.type ?? 'image/png' }));
    }

    toBlob(cb: ((blob: Blob | null) => void) | null, _mimeType?: string): void {
      cb?.(new Blob([textureBlobPart(this.width, this.height)], { type: _mimeType ?? 'image/png' }));
    }

  }

  g.OffscreenCanvas = MockOffscreenCanvas as unknown;
}

function makeTextureMaterial(width: number, height: number): THREE.MeshStandardMaterial {
  const pixelCount = width * height * 4;
  const data = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    data[i] = (i * 13) % 256;
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
}

function createFixtureScene(options: SkinnedGlbFixtureOptions = {}): { root: THREE.Group; clips: THREE.AnimationClip[] } {
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

  const material = options.withTexture
    ? makeTextureMaterial(options.nonPowerOfTwoTexture ? 3 : 4, options.nonPowerOfTwoTexture ? 2 : 4)
    : new THREE.MeshBasicMaterial({ color: 0x3fbf8f, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'FixtureSkinnedMesh';
  mesh.bind(new THREE.Skeleton([rootBone, tipBone]));

  if (options.withMultiMaterial) {
    if (geometry.getIndex()) {
      geometry.clearGroups();
      geometry.addGroup(0, 3, 0);
      geometry.addGroup(3, 3, 1);
    }
    const alt = new THREE.MeshStandardMaterial({ color: 0x7a5cff, side: THREE.DoubleSide });
    mesh.material = [material, alt] as unknown as typeof mesh.material;
  }

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

async function createSkinnedGlbFixtureBufferWithOptions(options: SkinnedGlbFixtureOptions): Promise<Buffer> {
  installNodeFileReader();
  installNodeCanvasSupport();
  const { root, clips } = createFixtureScene(options);
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

export async function createSkinnedGlbFixtureInputWithOptions(
  options: SkinnedGlbFixtureOptions = {}
): Promise<TestFilePayload> {
  const fixtureKey = `${options.withTexture ? 'textured' : 'solid'}-${options.withMultiMaterial ? 'multi' : 'single'}-${options.nonPowerOfTwoTexture ? 'npot' : 'pot'}`;

  if (fixtureKey === 'solid-single-pot') {
    return createSkinnedGlbFixtureInput();
  }

  if (options.withTexture && options.nonPowerOfTwoTexture && options.withMultiMaterial) {
    texturedFixtureBufferPromise ??= createSkinnedGlbFixtureBufferWithOptions({
      withTexture: true,
      withMultiMaterial: true,
      nonPowerOfTwoTexture: true,
    });
    const buffer = await texturedFixtureBufferPromise;
    return {
      name: `generated-skinned-fixture-texture-multi-npot.glb`,
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(buffer),
    };
  }

  if (options.withTexture) {
    texturedFixtureBufferPromise ??= createSkinnedGlbFixtureBufferWithOptions({
      withTexture: true,
      nonPowerOfTwoTexture: !!options.nonPowerOfTwoTexture,
    });
    const buffer = await texturedFixtureBufferPromise;
    return {
      name: options.withMultiMaterial
        ? `generated-skinned-fixture-texture.glb`
        : 'generated-skinned-fixture-texture.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(buffer),
    };
  }

  if (options.withMultiMaterial) {
    multiMaterialFixtureBufferPromise ??= createSkinnedGlbFixtureBufferWithOptions({ withMultiMaterial: true });
    const buffer = await multiMaterialFixtureBufferPromise;
    return {
      name: 'generated-skinned-fixture-multi-material.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(buffer),
    };
  }

  const buffer = await createSkinnedGlbFixtureBuffer();
  return {
    name: SKINNED_GLB_FIXTURE_NAME,
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(buffer),
  };
}
