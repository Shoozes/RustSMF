import type { ImportedSmf, SmfCodecProgress } from '../loaders/smf';

export type SmfCodecOperation = 'import' | 'export';

export type SmfCodecRequest =
  | {
    type: 'request';
    requestId: number;
    operation: 'import';
    buffer: ArrayBuffer;
  }
  | {
    type: 'request';
    requestId: number;
    operation: 'export';
    data: ImportedSmf;
  };

export interface SmfCodecSerializedError {
  name: string;
  message: string;
  stack?: string;
}

export type SmfCodecResponse =
  | {
    type: 'progress';
    requestId: number;
    operation: SmfCodecOperation;
    progress: SmfCodecProgress;
  }
  | {
    type: 'success';
    requestId: number;
    operation: 'import';
    data: ImportedSmf;
  }
  | {
    type: 'success';
    requestId: number;
    operation: 'export';
    buffer: ArrayBuffer;
  }
  | {
    type: 'error';
    requestId: number;
    operation: SmfCodecOperation;
    error: SmfCodecSerializedError;
  };

const SMF_CODEC_PHASES: readonly SmfCodecProgress['phase'][] = [
  'header',
  'textures',
  'meshes',
  'rig',
  'animations',
  'finalize',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isOperation(value: unknown): value is SmfCodecOperation {
  return value === 'import' || value === 'export';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= minimum
    && Number(value) <= maximum;
}

function isOwnedTypedArray<T extends Float32Array | Uint16Array | Uint8Array>(
  value: unknown,
  constructor: new (...args: never[]) => T,
  expectedLength: number,
): value is T {
  return value instanceof constructor
    && value.buffer instanceof ArrayBuffer
    && value.length === expectedLength;
}

function isTriangleSample(value: unknown, verts: number): boolean {
  return Array.isArray(value)
    && value.length === 3
    && value.every((index) => isIntegerInRange(index, 0, Math.max(0, verts - 1)));
}

function isMeshPayload(value: unknown): value is ImportedSmf['meshes'][number] {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || !isIntegerInRange(value.verts, 0, Number.MAX_SAFE_INTEGER)
    || value.verts % 3 !== 0
    || !Array.isArray(value.triangles)
    || value.triangles.length !== value.verts / 3
    || !isIntegerInRange(value.texIdx, -1, 255)
    || !isIntegerInRange(value.visible, 0, 1)) {
    return false;
  }

  const verts = value.verts;
  if (value.triangles.length > 0
    && (!isTriangleSample(value.triangles[0], verts)
      || !isTriangleSample(value.triangles[value.triangles.length - 1], verts))) {
    return false;
  }

  return isOwnedTypedArray(value.positions, Float32Array, verts * 3)
    && isOwnedTypedArray(value.normals, Float32Array, verts * 3)
    && isOwnedTypedArray(value.uvs, Float32Array, verts * 2)
    && isOwnedTypedArray(value.tangents, Float32Array, verts * 4)
    && isOwnedTypedArray(value.skinIndices, Uint16Array, verts * 4)
    && isOwnedTypedArray(value.skinWeights, Float32Array, verts * 4);
}

function isTexturePayload(value: unknown): value is ImportedSmf['textures'][number] {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || !isIntegerInRange(value.width, 0, 65_535)
    || !isIntegerInRange(value.height, 0, 65_535)) {
    return false;
  }
  return isOwnedTypedArray(value.pixels, Uint8Array, value.width * value.height * 4);
}

function isBonePayload(
  value: unknown,
  boneCount: number,
): value is ImportedSmf['bones'][number] {
  return isRecord(value)
    && isIntegerInRange(value.index, 0, Math.max(0, boneCount - 1))
    && isIntegerInRange(value.parent, -1, Math.max(0, boneCount - 1))
    && isIntegerInRange(value.isBone, 0, 1)
    && isOwnedTypedArray(value.dq, Float32Array, 8)
    && Array.isArray(value.axis)
    && value.axis.length === 3
    && value.axis.every(isFiniteNumber);
}

function isAnimationPayload(
  value: unknown,
  boneCount: number,
): value is ImportedSmf['animations'][number] {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || !isFiniteNumber(value.duration)
    || value.duration < 0
    || !Array.isArray(value.times)
    || !value.times.every(isFiniteNumber)
    || !Array.isArray(value.frames)
    || value.frames.length !== value.times.length
    || !isIntegerInRange(value.nodeCount, 0, Number.MAX_SAFE_INTEGER)
    || value.nodeCount !== boneCount
    || !isIntegerInRange(value.loop, 0, 255)
    || !isIntegerInRange(value.interpolation, 0, 255)
    || !isIntegerInRange(value.sampleFrameMultiplier, 0, 255)
    || !Array.isArray(value.lockedBones)
    || !value.lockedBones.every((index) => isIntegerInRange(index, 0, Math.max(0, boneCount - 1)))) {
    return false;
  }

  return value.frames.every((frame) => Array.isArray(frame)
    && frame.length === value.nodeCount
    && frame.every((dq) => isOwnedTypedArray(dq, Float32Array, 8)));
}

export function isImportedSmfPayload(value: unknown): value is ImportedSmf {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.meshes)
    || value.meshes.length > 255
    || !Array.isArray(value.textures)
    || value.textures.length > 255
    || !Array.isArray(value.bones)
    || !Array.isArray(value.animations)
    || value.animations.length > 255) {
    return false;
  }

  const meshes = value.meshes;
  const textures = value.textures;
  const bones = value.bones;
  const animations = value.animations;
  const boneCount = bones.length;
  return meshes.every(isMeshPayload)
    && meshes.every((mesh) => mesh.texIdx < textures.length)
    && textures.every(isTexturePayload)
    && bones.every((bone, index) => isBonePayload(bone, boneCount) && bone.index === index)
    && animations.every((animation) => isAnimationPayload(animation, boneCount));
}

function isProgress(value: unknown): value is SmfCodecProgress {
  if (!isRecord(value)) return false;
  return typeof value.phase === 'string'
    && SMF_CODEC_PHASES.some((phase) => phase === value.phase)
    && typeof value.percent === 'number'
    && Number.isFinite(value.percent)
    && value.percent >= 0
    && value.percent <= 100;
}

function isSerializedError(value: unknown): value is SmfCodecSerializedError {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string'
    && typeof value.message === 'string'
    && (value.stack === undefined || typeof value.stack === 'string');
}

export function readSmfCodecRequestId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return isRequestId(value.requestId) ? value.requestId : null;
}

export function readSmfCodecOperation(value: unknown): SmfCodecOperation | null {
  if (!isRecord(value)) return null;
  return isOperation(value.operation) ? value.operation : null;
}

export function isSmfCodecRequest(value: unknown): value is SmfCodecRequest {
  if (!isRecord(value)
    || value.type !== 'request'
    || !isRequestId(value.requestId)
    || !isOperation(value.operation)) {
    return false;
  }

  if (value.operation === 'import') {
    return value.buffer instanceof ArrayBuffer;
  }
  return isImportedSmfPayload(value.data);
}

export function isSmfCodecResponse(value: unknown): value is SmfCodecResponse {
  if (!isRecord(value)
    || !isRequestId(value.requestId)
    || !isOperation(value.operation)
    || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'progress') return isProgress(value.progress);
  if (value.type === 'error') return isSerializedError(value.error);
  if (value.type !== 'success') return false;
  if (value.operation === 'import') return isImportedSmfPayload(value.data);
  return value.buffer instanceof ArrayBuffer;
}

export function serializeSmfCodecError(error: unknown): SmfCodecSerializedError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : String(error),
  };
}
