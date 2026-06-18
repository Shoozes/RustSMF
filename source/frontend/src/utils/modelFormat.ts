export type ModelSourceFormat = 'smf' | 'glb' | 'fbx' | 'obj';

export const MODEL_FORMAT_EXTENSIONS: Record<ModelSourceFormat, readonly string[]> = {
  smf: ['.smf'],
  glb: ['.glb', '.gltf'],
  fbx: ['.fbx'],
  obj: ['.obj'],
};

export const SUPPORTED_MODEL_EXTENSIONS = Object.values(MODEL_FORMAT_EXTENSIONS).flat();
export const SUPPORTED_MODEL_ACCEPT = SUPPORTED_MODEL_EXTENSIONS.join(',');

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
  for (const [format, extensions] of Object.entries(MODEL_FORMAT_EXTENSIONS) as Array<[ModelSourceFormat, readonly string[]]>) {
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
