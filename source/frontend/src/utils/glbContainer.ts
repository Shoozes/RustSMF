import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { MaterialTextureSemantic, ReferenceMaterialDefinition } from './materialRepair';
import {
  ImageByteBudget,
  inspectImagePayload,
  MAX_IMAGE_PIXELS,
  MAX_JPEG_DECODER_MEMORY_MB,
} from './imagePayload';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

interface GlbJson {
  buffers?: Array<{ byteLength: number; uri?: string; [key: string]: unknown }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; name?: string; [key: string]: unknown }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string; name?: string; [key: string]: unknown }>;
  textures?: Array<{ source: number; sampler?: number; name?: string; [key: string]: unknown }>;
  samplers?: Array<Record<string, unknown>>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    sparse?: unknown;
    [key: string]: unknown;
  }>;
  animations?: Array<{
    name?: string;
    samplers: Array<{ input: number; output: number; interpolation?: string }>;
    [key: string]: unknown;
  }>;
  materials?: Array<{
    name?: string;
    pbrMetallicRoughness?: {
      baseColorTexture?: { index: number };
      metallicRoughnessTexture?: { index: number };
      metallicFactor?: number;
      roughnessFactor?: number;
      [key: string]: unknown;
    };
    normalTexture?: { index: number };
    occlusionTexture?: { index: number };
    emissiveTexture?: { index: number };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface ParsedGlb {
  json: GlbJson;
  binary: Uint8Array;
}

export interface EmbeddedTextureInput {
  resource: string;
  mimeType: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
}

export interface EmbeddedMaterialReport {
  material: string;
  sourceTextureFlipY: boolean;
  textures: Array<{
    semantic: MaterialTextureSemantic | 'metallicRoughness';
    resource: string;
    mimeType: string;
    colorSpace: 'srgb' | 'linear';
  }>;
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function pngContentLength(bytes: Uint8Array, label: string): number {
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const chunkLength = bytes[offset] * 0x1000000
      + bytes[offset + 1] * 0x10000
      + bytes[offset + 2] * 0x100
      + bytes[offset + 3];
    if (chunkLength > bytes.byteLength - offset - 12) {
      throw new Error(label + ' has a truncated PNG chunk.');
    }
    const isEnd = bytes[offset + 4] === 0x49
      && bytes[offset + 5] === 0x45
      && bytes[offset + 6] === 0x4e
      && bytes[offset + 7] === 0x44;
    offset += chunkLength + 12;
    if (isEnd) {
      if (chunkLength !== 0) throw new Error(label + ' has an invalid PNG IEND chunk.');
      const padding = bytes.subarray(offset);
      if (padding.byteLength > 3 || padding.some((value) => value !== 0)) {
        throw new Error(label + ' has invalid trailing PNG data.');
      }
      return offset;
    }
  }
  throw new Error(label + ' is missing a complete PNG IEND chunk.');
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function parseGlbContainer(bytes: Uint8Array): ParsedGlb {
  if (bytes.byteLength < 20) throw new Error('GLB is shorter than its header and JSON chunk.');
  const data = view(bytes);
  if (data.getUint32(0, true) !== GLB_MAGIC) throw new Error('GLB magic is invalid.');
  if (data.getUint32(4, true) !== GLB_VERSION) throw new Error(`Unsupported GLB version ${data.getUint32(4, true)}.`);
  if (data.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB header length does not match the file size.');
  let offset = 12;
  let json: GlbJson | null = null;
  let binary = new Uint8Array();
  while (offset + 8 <= bytes.byteLength) {
    const length = data.getUint32(offset, true);
    const type = data.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > bytes.byteLength) throw new Error('GLB chunk exceeds the file boundary.');
    const chunk = bytes.subarray(offset, offset + length);
    if (type === JSON_CHUNK) {
      if (json) throw new Error('GLB contains multiple JSON chunks.');
      const text = new TextDecoder().decode(chunk).replace(/[\u0000\u0020]+$/g, '');
      json = JSON.parse(text) as GlbJson;
    } else if (type === BIN_CHUNK) {
      if (binary.byteLength > 0) throw new Error('GLB contains multiple BIN chunks.');
      binary = chunk.slice();
    }
    offset += length;
  }
  if (!json) throw new Error('GLB JSON chunk is missing.');
  const declaredLength = json.buffers?.[0]?.byteLength ?? binary.byteLength;
  if (declaredLength > binary.byteLength) throw new Error('GLB buffer length exceeds the BIN chunk.');
  return { json, binary: binary.slice(0, declaredLength) };
}

export function buildGlbContainer(json: GlbJson, binary: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.byteLength);
  const binaryLength = align4(binary.byteLength);
  const total = 12 + 8 + jsonLength + (binaryLength > 0 ? 8 + binaryLength : 0);
  const output = new Uint8Array(total);
  const data = view(output);
  data.setUint32(0, GLB_MAGIC, true);
  data.setUint32(4, GLB_VERSION, true);
  data.setUint32(8, total, true);
  data.setUint32(12, jsonLength, true);
  data.setUint32(16, JSON_CHUNK, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(jsonBytes, 20);
  if (binaryLength > 0) {
    const header = 20 + jsonLength;
    data.setUint32(header, binaryLength, true);
    data.setUint32(header + 4, BIN_CHUNK, true);
    output.set(binary, header + 8);
  }
  return output;
}

function decodeImage(
  bytes: Uint8Array,
  mimeType: EmbeddedTextureInput['mimeType'],
  budget: ImageByteBudget,
  label: string,
): { width: number; height: number; data: Uint8Array } {
  const dimensions = inspectImagePayload(bytes, mimeType, label);
  budget.reserve(dimensions, label);
  const encoded = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png') {
    const png = PNG.sync.read(encoded.subarray(0, pngContentLength(bytes, label)));
    if (png.width !== dimensions.width || png.height !== dimensions.height
      || png.data.byteLength !== dimensions.decodedByteLength) {
      throw new Error(label + ' PNG decoder returned dimensions outside the inspected image header.');
    }
    return { width: png.width, height: png.height, data: png.data };
  }
  const decoded = jpeg.decode(encoded, {
    useTArray: true,
    formatAsRGBA: true,
    tolerantDecoding: false,
    maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000,
    maxMemoryUsageInMB: MAX_JPEG_DECODER_MEMORY_MB,
  });
  if (decoded.width !== dimensions.width || decoded.height !== dimensions.height
    || decoded.data.byteLength !== dimensions.decodedByteLength) {
    throw new Error(label + ' JPEG decoder returned dimensions outside the inspected image header.');
  }
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function flipPixelRows(image: { width: number; height: number; data: Uint8Array }): void {
  const rowBytes = image.width * 4;
  const row = new Uint8Array(rowBytes);
  for (let top = 0; top < Math.floor(image.height / 2); top += 1) {
    const bottom = image.height - 1 - top;
    const topOffset = top * rowBytes;
    const bottomOffset = bottom * rowBytes;
    row.set(image.data.subarray(topOffset, topOffset + rowBytes));
    image.data.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
    image.data.set(row, bottomOffset);
  }
}

function losslessPng(
  texture: EmbeddedTextureInput,
  flipY: boolean,
  budget: ImageByteBudget,
): EmbeddedTextureInput {
  const decoded = decodeImage(texture.bytes, texture.mimeType, budget, texture.resource);
  if (flipY) flipPixelRows(decoded);
  budget.reserve(inspectImagePayload(texture.bytes, texture.mimeType, texture.resource), texture.resource + ' PNG output');
  const output = new PNG({ width: decoded.width, height: decoded.height });
  output.data.set(decoded.data);
  const bytes = PNG.sync.write(output);
  return {
    resource: `${texture.resource}.png`,
    mimeType: 'image/png',
    bytes,
  };
}

function luminance(data: Uint8Array, index: number): number {
  return Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
}

function packMetallicRoughness(
  roughness: EmbeddedTextureInput | undefined,
  metallic: EmbeddedTextureInput | undefined,
  flipY: boolean,
  budget: ImageByteBudget,
): EmbeddedTextureInput | null {
  if (!roughness && !metallic) return null;
  const rough = roughness ? decodeImage(roughness.bytes, roughness.mimeType, budget, roughness.resource) : null;
  const metal = metallic ? decodeImage(metallic.bytes, metallic.mimeType, budget, metallic.resource) : null;
  if (flipY) {
    if (rough) flipPixelRows(rough);
    if (metal) flipPixelRows(metal);
  }
  const width = rough?.width ?? metal!.width;
  const height = rough?.height ?? metal!.height;
  if ((rough && (rough.width !== width || rough.height !== height)) || (metal && (metal.width !== width || metal.height !== height))) {
    throw new Error('Metallic and roughness maps must have identical dimensions for deterministic GLB packing.');
  }
  budget.reserve({
    width,
    height,
    pixelCount: width * height,
    decodedByteLength: width * height * 4,
  }, 'Packed metallic/roughness output');
  const output = new PNG({ width, height });
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    output.data[offset] = 255;
    output.data[offset + 1] = rough ? luminance(rough.data, offset) : 255;
    output.data[offset + 2] = metal ? luminance(metal.data, offset) : 255;
    output.data[offset + 3] = 255;
  }
  const names = [roughness?.resource, metallic?.resource].filter(Boolean).join('+');
  const bytes = PNG.sync.write(output);
  return {
    resource: `packed:${names}`,
    mimeType: 'image/png',
    bytes,
  };
}

function addEmbeddedTexture(
  json: GlbJson,
  binaryParts: Uint8Array[],
  offsetRef: { value: number },
  texture: EmbeddedTextureInput,
): number {
  json.bufferViews ??= [];
  json.images ??= [];
  json.textures ??= [];
  json.samplers ??= [];
  if (json.samplers.length === 0) {
    json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
  }
  const alignedOffset = align4(offsetRef.value);
  if (alignedOffset > offsetRef.value) binaryParts.push(new Uint8Array(alignedOffset - offsetRef.value));
  const bufferView = json.bufferViews.push({
    buffer: 0,
    byteOffset: alignedOffset,
    byteLength: texture.bytes.byteLength,
    name: texture.resource,
  }) - 1;
  binaryParts.push(texture.bytes);
  offsetRef.value = alignedOffset + texture.bytes.byteLength;
  const image = json.images.push({
    bufferView,
    mimeType: texture.mimeType,
    name: texture.resource,
  }) - 1;
  return json.textures.push({ source: image, sampler: 0, name: texture.resource }) - 1;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function embedMaterialTextures(
  sourceGlb: Uint8Array,
  materialDefinitions: readonly ReferenceMaterialDefinition[],
  textures: ReadonlyMap<string, EmbeddedTextureInput>,
  options: { sourceTextureFlipY?: boolean } = {},
): { bytes: Uint8Array; report: EmbeddedMaterialReport[] } {
  const sourceTextureFlipY = options.sourceTextureFlipY ?? true;
  const { json, binary } = parseGlbContainer(sourceGlb);
  if (!json.buffers || json.buffers.length !== 1 || json.buffers[0].uri) {
    throw new Error('Texture embedding requires one URI-free GLB buffer.');
  }
  const binaryParts: Uint8Array[] = [binary];
  const offsetRef = { value: binary.byteLength };
  const reports: EmbeddedMaterialReport[] = [];
  const imageBudget = new ImageByteBudget('Material texture conversion');
  const resourceCache = new Map<string, number>();
  const normalizedTextures = new Map(
    [...textures].map(([name, value]) => [name.toLocaleLowerCase('en-US'), value]),
  );
  const resolve = (name: string): EmbeddedTextureInput => {
    const resolved = normalizedTextures.get(name.toLocaleLowerCase('en-US'));
    if (!resolved) throw new Error(`Texture bytes for ${name} are missing.`);
    return resolved;
  };
  const add = (texture: EmbeddedTextureInput): number => {
    const key = `${texture.mimeType}:${texture.resource.toLocaleLowerCase('en-US')}`;
    const cached = resourceCache.get(key);
    if (cached !== undefined) return cached;
    const index = addEmbeddedTexture(json, binaryParts, offsetRef, texture);
    resourceCache.set(key, index);
    return index;
  };

  for (const definition of materialDefinitions) {
    const matches = (json.materials ?? []).filter((material) => material.name === definition.name);
    if (matches.length !== 1) {
      throw new Error(`Exported GLB must contain exactly one material named ${definition.name}; found ${matches.length}.`);
    }
    const material = matches[0];
    material.pbrMetallicRoughness ??= {};
    const report: EmbeddedMaterialReport = { material: definition.name, sourceTextureFlipY, textures: [] };
    if (definition.textures.baseColor) {
      const resource = losslessPng(resolve(definition.textures.baseColor), sourceTextureFlipY, imageBudget);
      material.pbrMetallicRoughness.baseColorTexture = { index: add(resource) };
      report.textures.push({ semantic: 'baseColor', resource: resource.resource, mimeType: resource.mimeType, colorSpace: 'srgb' });
    }
    if (definition.textures.normal) {
      const resource = losslessPng(resolve(definition.textures.normal), sourceTextureFlipY, imageBudget);
      material.normalTexture = { index: add(resource) };
      report.textures.push({ semantic: 'normal', resource: resource.resource, mimeType: resource.mimeType, colorSpace: 'linear' });
    }
    const roughness = definition.textures.roughness ? resolve(definition.textures.roughness) : undefined;
    const metallic = definition.textures.metallic ? resolve(definition.textures.metallic) : undefined;
    const packed = packMetallicRoughness(roughness, metallic, sourceTextureFlipY, imageBudget);
    if (packed) {
      material.pbrMetallicRoughness.metallicRoughnessTexture = { index: add(packed) };
      if (roughness) material.pbrMetallicRoughness.roughnessFactor = 1;
      if (metallic) material.pbrMetallicRoughness.metallicFactor = 1;
      report.textures.push({
        semantic: 'metallicRoughness',
        resource: packed.resource,
        mimeType: packed.mimeType,
        colorSpace: 'linear',
      });
    }
    reports.push(report);
  }
  const outputBinary = concatBytes(binaryParts);
  json.buffers[0].byteLength = outputBinary.byteLength;
  const bytes = buildGlbContainer(json, outputBinary);
  validateEmbeddedGlbTextures(bytes);
  return { bytes, report: reports };
}

export function validateEmbeddedGlbTextures(bytes: Uint8Array): void {
  const { json, binary } = parseGlbContainer(bytes);
  if ((json.buffers ?? []).some((buffer) => !!buffer.uri)) throw new Error('GLB contains an external buffer URI.');
  const imageBudget = new ImageByteBudget('Embedded GLB images');
  for (const image of json.images ?? []) {
    if (image.uri) throw new Error(`GLB image ${image.name || '(unnamed)'} contains an external URI.`);
    if (!Number.isSafeInteger(image.bufferView) || image.bufferView! < 0) {
      throw new Error(`GLB image ${image.name || '(unnamed)'} has no valid embedded bufferView.`);
    }
    if (image.mimeType !== 'image/jpeg' && image.mimeType !== 'image/png') {
      throw new Error(`GLB image ${image.name || '(unnamed)'} has unsupported MIME type ${image.mimeType || '(missing)'}.`);
    }
    const bufferView = json.bufferViews?.[image.bufferView!];
    if (!bufferView) throw new Error(`GLB image ${image.name || '(unnamed)'} references a missing bufferView.`);
    const start = bufferView.byteOffset === undefined ? 0 : bufferView.byteOffset;
    if (bufferView.buffer !== 0
      || !Number.isSafeInteger(start)
      || !Number.isSafeInteger(bufferView.byteLength)
      || start < 0
      || bufferView.byteLength <= 0
      || !Number.isSafeInteger(start + bufferView.byteLength)
      || start + bufferView.byteLength > binary.byteLength) {
      throw new Error(`GLB image ${image.name || '(unnamed)'} exceeds the embedded buffer.`);
    }
    const payload = binary.subarray(start, start + bufferView.byteLength);
    decodeImage(payload, image.mimeType, imageBudget, `GLB image ${image.name || '(unnamed)'}`);
  }
  const textureCount = json.textures?.length ?? 0;
  for (const [textureIndex, texture] of (json.textures ?? []).entries()) {
    if (!Number.isSafeInteger(texture.source) || texture.source < 0 || texture.source >= (json.images?.length ?? 0)) {
      throw new Error(`GLB texture ${textureIndex} references missing image ${texture.source}.`);
    }
  }
  for (const material of json.materials ?? []) {
    const indices = [
      material.pbrMetallicRoughness?.baseColorTexture?.index,
      material.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
      material.normalTexture?.index,
      material.occlusionTexture?.index,
      material.emissiveTexture?.index,
    ].filter((value): value is number => value !== undefined);
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= textureCount) {
        throw new Error(`GLB material ${material.name || '(unnamed)'} references missing texture ${index}.`);
      }
    }
  }
}

export interface StepClipTimingSummary {
  clip: string;
  sampleCount: number;
  maxEarlyDelta: number;
}

function readFloatScalarAccessor(json: GlbJson, binary: Uint8Array, accessorIndex: number): Float32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.componentType !== 5126 || accessor.type !== 'SCALAR' || accessor.sparse) {
    throw new Error(`Animation input accessor ${accessorIndex} must be a non-sparse float SCALAR.`);
  }
  const bufferView = accessor.bufferView === undefined ? undefined : json.bufferViews?.[accessor.bufferView];
  if (!bufferView || bufferView.buffer !== 0 || (Reflect.get(bufferView, 'byteStride') ?? 4) !== 4) {
    throw new Error(`Animation input accessor ${accessorIndex} must use a tightly packed GLB bufferView.`);
  }
  const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const byteLength = accessor.count * 4;
  if (offset < 0 || byteLength <= 0 || offset + byteLength > binary.byteLength) {
    throw new Error(`Animation input accessor ${accessorIndex} exceeds the GLB buffer.`);
  }
  return new Float32Array(binary.buffer.slice(
    binary.byteOffset + offset,
    binary.byteOffset + offset + byteLength,
  ));
}

export function validateStepClipTiming(
  bytes: Uint8Array,
  clipNames: readonly string[],
  sampleRateHz: number,
): StepClipTimingSummary[] {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) throw new Error('STEP validation requires a positive sample rate.');
  const { json, binary } = parseGlbContainer(bytes);
  const animations = json.animations ?? [];
  const results: StepClipTimingSummary[] = [];
  for (const clipName of clipNames) {
    const matches = animations.filter((animation) => animation.name === clipName);
    if (matches.length !== 1) throw new Error(`Expected one exported animation named ${clipName}; found ${matches.length}.`);
    const animation = matches[0];
    let expectedSampleCount: number | null = null;
    let maxEarlyDelta = 0;
    for (const sampler of animation.samplers) {
      if (sampler.interpolation !== 'STEP') {
        throw new Error(`Animation ${clipName} contains ${sampler.interpolation ?? 'LINEAR'} interpolation; STEP is required.`);
      }
      const times = readFloatScalarAccessor(json, binary, sampler.input);
      if (expectedSampleCount !== null && expectedSampleCount !== times.length) {
        throw new Error(`Animation ${clipName} samplers do not share one 60 Hz sample count.`);
      }
      expectedSampleCount = times.length;
      for (let frame = 0; frame < times.length; frame += 1) {
        const rational = frame / sampleRateHz;
        if (times[frame] > rational) {
          throw new Error(`Animation ${clipName} frame ${frame} timestamp ${times[frame]} is above ${frame}/${sampleRateHz}.`);
        }
        maxEarlyDelta = Math.max(maxEarlyDelta, rational - times[frame]);
      }
    }
    results.push({ clip: clipName, sampleCount: expectedSampleCount ?? 0, maxEarlyDelta });
  }
  return results;
}
