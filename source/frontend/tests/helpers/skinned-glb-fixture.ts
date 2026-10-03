import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { installFileReaderTestPolyfill } from '../../src/test/installFileReaderTestPolyfill';

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
  duplicateTextureMaterials?: boolean;
  asymmetricTexture?: boolean;
  textureMimeType?: 'image/jpeg' | 'image/png';
  withSiblingMesh?: boolean;
  rootScale?: number;
  clipName?: string;
  clipDuration?: number;
  withHeadChain?: boolean;
}

const fixtureBufferPromises = new Map<string, Promise<Buffer>>();

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

function makeTextureMaterial(
  width: number,
  height: number,
  options: { mimeType: 'image/jpeg' | 'image/png'; asymmetric: boolean; variant: number },
): THREE.MeshStandardMaterial {
  const pixelCount = width * height * 4;
  const data = new Uint8Array(pixelCount);
  const palettes = [
    [[240, 20, 20], [20, 240, 20], [20, 20, 240], [240, 220, 20]],
    [[20, 220, 220], [220, 20, 220], [220, 220, 220], [30, 30, 30]],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (options.asymmetric) {
        const quadrant = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
        data.set([...palettes[options.variant % palettes.length][quadrant], 255], index);
      } else {
        data.set([
          (index * 13) % 256,
          ((index + 1) * 13) % 256,
          ((index + 2) * 13) % 256,
          255,
        ], index);
      }
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.userData.mimeType = options.mimeType;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
  if (options.asymmetric && options.variant > 0) material.color.set(0xffffff);
  return material;
}

function createFixtureScene(options: SkinnedGlbFixtureOptions = {}): { root: THREE.Group; clips: THREE.AnimationClip[] } {
  const root = new THREE.Group();
  root.name = 'GeneratedSkinnedFixtureRoot';
  const rootScale = options.rootScale ?? 1;
  if (!Number.isFinite(rootScale) || rootScale <= 0) {
    throw new Error('Skinned GLB fixture rootScale must be finite and greater than zero');
  }
  root.scale.setScalar(rootScale);

  const rootBone = new THREE.Bone();
  rootBone.name = 'FixtureRoot';
  rootBone.position.set(0, 0, 0);

  const tipBone = new THREE.Bone();
  tipBone.name = 'FixtureTip';
  tipBone.position.set(0, 1, 0);
  rootBone.add(tipBone);
  const headBone = options.withHeadChain ? new THREE.Bone() : undefined;
  if (headBone) { headBone.name = 'FixtureHead'; headBone.position.y = .5; tipBone.add(headBone); }
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

  const textureWidth = options.asymmetricTexture ? 32 : options.nonPowerOfTwoTexture ? 3 : 4;
  const textureHeight = options.asymmetricTexture ? 32 : options.nonPowerOfTwoTexture ? 2 : 4;
  const material = options.withTexture || options.duplicateTextureMaterials
    ? makeTextureMaterial(textureWidth, textureHeight, {
      mimeType: options.textureMimeType ?? 'image/png',
      asymmetric: options.asymmetricTexture ?? false,
      variant: 0,
    })
    : new THREE.MeshBasicMaterial({ color: 0x3fbf8f, side: THREE.DoubleSide });
  if (options.duplicateTextureMaterials) material.name = 'FixtureSharedTextureMaterial';
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'FixtureSkinnedMesh';
  mesh.bind(new THREE.Skeleton([rootBone, tipBone, ...(headBone ? [headBone] : [])]));

  if (options.duplicateTextureMaterials) {
    if (geometry.getIndex()) {
      geometry.clearGroups();
      geometry.addGroup(0, 3, 0);
      geometry.addGroup(3, 3, 1);
    }
    const second = makeTextureMaterial(textureWidth, textureHeight, {
      mimeType: options.textureMimeType ?? 'image/png',
      asymmetric: options.asymmetricTexture ?? false,
      variant: 1,
    });
    second.name = 'FixtureSharedTextureMaterial';
    mesh.material = [material, second] as unknown as typeof mesh.material;
  } else if (options.withMultiMaterial) {
    if (geometry.getIndex()) {
      geometry.clearGroups();
      geometry.addGroup(0, 3, 0);
      geometry.addGroup(3, 3, 1);
    }
    const alt = new THREE.MeshStandardMaterial({ color: 0x7a5cff, side: THREE.DoubleSide });
    mesh.material = [material, alt] as unknown as typeof mesh.material;
  }

  root.add(mesh);

  if (options.withSiblingMesh) {
    const sibling = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xd2a84a }),
    );
    sibling.name = 'FixtureStaticSibling';
    sibling.position.set(0.65, 0.25, 0);
    root.add(sibling);
  }

  const clipDuration = options.clipDuration ?? 0.5;
  if (!Number.isFinite(clipDuration) || clipDuration <= 0) {
    throw new Error('Skinned GLB fixture clipDuration must be finite and greater than zero');
  }
  const clip = new THREE.AnimationClip(options.clipName ?? 'FixtureBend', clipDuration, [
    new THREE.QuaternionKeyframeTrack('FixtureTip.quaternion', [0, clipDuration], [
      0, 0, 0, 1,
      0, 0, 0.258819, 0.965926,
    ]),
    new THREE.VectorKeyframeTrack('FixtureRoot.position', [0, clipDuration], [
      0, 0, 0,
      0.05, 0, 0,
    ]),
  ]);

  if (headBone) {
    const rotation = (degrees: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(degrees)).toArray();
    clip.tracks[0] = new THREE.QuaternionKeyframeTrack('FixtureTip.quaternion', [0, clipDuration / 2, clipDuration], [...rotation(0), ...rotation(100), ...rotation(0)]);
    clip.tracks.push(new THREE.QuaternionKeyframeTrack('FixtureHead.quaternion', [0, clipDuration / 2, clipDuration], [...rotation(0), ...rotation(-60), ...rotation(0)]));
  }
  return { root, clips: [clip] };
}

function getFixtureKey(options: SkinnedGlbFixtureOptions): string {
  return [
    options.withTexture ? 'textured' : 'solid',
    options.nonPowerOfTwoTexture ? 'npot' : 'pot',
    options.withMultiMaterial ? 'multi' : 'single',
    options.duplicateTextureMaterials ? 'duplicate-texture-materials' : 'unique-materials',
    options.asymmetricTexture ? 'asymmetric' : 'patterned',
    `mime-${options.textureMimeType ?? 'image/png'}`,
    options.withSiblingMesh ? 'siblings' : 'solo',
    options.withHeadChain ? 'head-chain' : 'two-bone',
    `scale-${options.rootScale ?? 1}`,
    `clip-${options.clipName ?? 'FixtureBend'}`,
    `duration-${options.clipDuration ?? 0.5}`,
  ].join('-');
}

function getFixtureName(options: SkinnedGlbFixtureOptions): string {
  const parts = ['generated-skinned-fixture'];
  if (options.withTexture) parts.push('texture');
  if (options.withMultiMaterial) parts.push('multi-material');
  if (options.duplicateTextureMaterials) parts.push('duplicate-texture-materials');
  if (options.asymmetricTexture) parts.push('asymmetric');
  if (options.textureMimeType === 'image/jpeg') parts.push('jpeg');
  if (options.nonPowerOfTwoTexture) parts.push('npot');
  if (options.withSiblingMesh) parts.push('siblings');
  if (options.rootScale !== undefined) {
    parts.push(`scale-${String(options.rootScale).split('.').join('_').split('+').join('')}`);
  }
  if (options.clipName) parts.push(`clip-${options.clipName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  if (options.clipDuration !== undefined) parts.push(`duration-${String(options.clipDuration).replace('.', '_')}`);
  return `${parts.join('-')}.glb`;
}

async function createSkinnedGlbFixtureBuffer(options: SkinnedGlbFixtureOptions = {}): Promise<Buffer> {
  installFileReaderTestPolyfill();
  if (options.withTexture || options.duplicateTextureMaterials) installNodeCanvasSupport();
  const { root, clips } = createFixtureScene(options);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, animations: clips });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('Expected generated skinned GLB fixture to be an ArrayBuffer');
  }
  return Buffer.from(result);
}

function getSkinnedGlbFixtureBuffer(options: SkinnedGlbFixtureOptions = {}): Promise<Buffer> {
  const key = getFixtureKey(options);
  let promise = fixtureBufferPromises.get(key);
  if (!promise) {
    promise = createSkinnedGlbFixtureBuffer(options);
    fixtureBufferPromises.set(key, promise);
  }
  return promise;
}

export async function createSkinnedGlbFixtureInput(): Promise<TestFilePayload> {
  const buffer = await getSkinnedGlbFixtureBuffer();
  return {
    name: SKINNED_GLB_FIXTURE_NAME,
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(buffer),
  };
}

export async function createSkinnedGlbFixtureInputWithOptions(
  options: SkinnedGlbFixtureOptions = {},
): Promise<TestFilePayload> {
  if (getFixtureKey(options) === getFixtureKey({})) {
    return createSkinnedGlbFixtureInput();
  }
  const buffer = await getSkinnedGlbFixtureBuffer(options);
  return {
    name: getFixtureName(options),
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(buffer),
  };
}

export async function createSkinnedGltfFixtureInputWithOptions(
  options: SkinnedGlbFixtureOptions = {},
): Promise<TestFilePayload> {
  installFileReaderTestPolyfill();
  if (options.withTexture || options.duplicateTextureMaterials) installNodeCanvasSupport();
  const { root, clips } = createFixtureScene(options);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: false, animations: clips });
  if (!result || typeof result !== 'object' || result instanceof ArrayBuffer) {
    throw new Error('Expected generated skinned GLTF fixture to be a JSON object');
  }
  return {
    name: getFixtureName(options).replace(/\.glb$/i, '.gltf'),
    mimeType: 'model/gltf+json',
    buffer: Buffer.from(JSON.stringify(result)),
  };
}
