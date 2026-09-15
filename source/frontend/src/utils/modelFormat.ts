export type ModelSourceFormat = 'smf' | 'glb' | 'fbx' | 'dae' | 'obj';
export const MODEL_SOURCE_FORMATS = ['smf', 'glb', 'fbx', 'dae', 'obj'] as const;

export const MODEL_FORMAT_EXTENSIONS: Record<ModelSourceFormat, readonly string[]> = {
  smf: ['.smf'],
  glb: ['.glb', '.gltf'],
  fbx: ['.fbx'],
  dae: ['.dae'],
  obj: ['.obj'],
};

export const SUPPORTED_MODEL_EXTENSIONS = Object.values(MODEL_FORMAT_EXTENSIONS).flat();
export const SUPPORTED_MODEL_ACCEPT = SUPPORTED_MODEL_EXTENSIONS.join(',');
export const SUPPORTED_MODEL_RESOURCE_ACCEPT = `${SUPPORTED_MODEL_ACCEPT},.bin,.mtl,.png,.jpg,.jpeg,.webp,.ktx2`;

// Keep browser and native model ingestion within the same allocation envelope.
// SMF has the same binary boundary; GLB/FBX/OBJ loaders also need a guard before
// File.arrayBuffer() or a native read can materialize an unbounded payload.
export const MAX_MODEL_INPUT_BYTES = 256 * 1024 * 1024;

export class ModelInputSizeError extends Error {
  readonly code = 'MODEL_INPUT_TOO_LARGE';

  constructor(name: string, size: number, limit = MAX_MODEL_INPUT_BYTES) {
    super(`Model file "${name || 'unnamed'}" is ${size} bytes; the maximum supported model size is ${limit} bytes.`);
    this.name = 'ModelInputSizeError';
  }
}

export function assertModelInputSize(name: string, size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_MODEL_INPUT_BYTES) {
    throw new ModelInputSizeError(name, size);
  }
}

export function assertModelFileSize(file: Pick<File, 'name' | 'size'>): void {
  assertModelInputSize(file.name, file.size);
}

export function getModelExtension(pathOrName: string | null | undefined): string {
  const raw = (pathOrName ?? '').trim();
  if (!raw) return '';

  const withoutQuery = raw.split(/[?#]/, 1)[0];
  const leaf = withoutQuery.split(/[\\/]/).pop() ?? '';
  const dot = leaf.lastIndexOf('.');
  if (dot <= 0 || dot === leaf.length - 1) return '';
  return leaf.slice(dot).toLowerCase();
}

export function detectModelFormat(pathOrName: string | null | undefined): ModelSourceFormat | '' {
  const ext = getModelExtension(pathOrName);
  for (const format of MODEL_SOURCE_FORMATS) {
    const extensions = MODEL_FORMAT_EXTENSIONS[format];
    if (extensions.includes(ext)) return format;
  }
  return '';
}

export function isSupportedModelFormat(pathOrName: string | null | undefined): boolean {
  return detectModelFormat(pathOrName) !== '';
}

export function supportedModelFormatsLabel(): string {
  return SUPPORTED_MODEL_EXTENSIONS.join('/');
}
