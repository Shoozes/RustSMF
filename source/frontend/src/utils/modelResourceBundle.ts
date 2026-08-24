import { bytesToArrayBuffer } from '../loaders/smfBinary';
import { MAX_MODEL_INPUT_BYTES } from './modelFormat';

export const MAX_MODEL_RESOURCE_FILES = 64;
export const MAX_MODEL_RESOURCE_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_MODEL_RESOURCE_BUNDLE_BYTES = 256 * 1024 * 1024;

export type ModelResourceErrorCode =
  | 'RESOURCE_URI_INVALID'
  | 'RESOURCE_URI_REMOTE'
  | 'RESOURCE_URI_DATA'
  | 'RESOURCE_URI_TRAVERSAL'
  | 'RESOURCE_MISSING'
  | 'RESOURCE_AMBIGUOUS'
  | 'RESOURCE_FILE_TOO_LARGE'
  | 'RESOURCE_BUNDLE_TOO_LARGE'
  | 'RESOURCE_BUNDLE_TOO_MANY_FILES'
  | 'RESOURCE_DUPLICATE';

export class ModelResourceError extends Error {
  readonly code: ModelResourceErrorCode;
  readonly resourceName?: string;

  constructor(code: ModelResourceErrorCode, message: string, resourceName?: string) {
    super(message);
    this.name = 'ModelResourceError';
    this.code = code;
    this.resourceName = resourceName;
  }
}

export interface ModelResourceFile {
  readonly name: string;
  readonly data: Uint8Array;
}

export interface ModelResourceBundle {
  readonly primary: ModelResourceFile;
  readonly files: readonly ModelResourceFile[];
  readonly totalBytes: number;
}

export interface ResourceUrlRegistry {
  readonly resolve: (uri: string) => string;
  readonly dispose: () => void;
}

function decodeResourceUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    throw new ModelResourceError(
      'RESOURCE_URI_INVALID',
      `Resource URI "${uri}" is not valid percent-encoded text.`,
      uri,
    );
  }
}

function assertAllowedUriScheme(uri: string): void {
  if (/^data:/i.test(uri)) {
    return;
  }
  if (/^(?:https?|file|blob|javascript):/i.test(uri) || /^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    throw new ModelResourceError(
      'RESOURCE_URI_REMOTE',
      `External resource URI "${uri}" is not allowed; select the resource as part of the model bundle.`,
      uri,
    );
  }
}

export function normalizeResourceName(rawName: string): string {
  const raw = rawName.trim();
  if (!raw) {
    throw new ModelResourceError('RESOURCE_URI_INVALID', 'Resource name cannot be empty.', rawName);
  }
  const slashRaw = raw.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(slashRaw)) {
    throw new ModelResourceError(
      'RESOURCE_URI_TRAVERSAL',
      `Absolute resource path "${rawName}" is not allowed.`,
      rawName,
    );
  }
  assertAllowedUriScheme(raw);
  if (/^data:/i.test(raw)) {
    throw new ModelResourceError('RESOURCE_URI_DATA', 'Embedded data URIs are not file names.', rawName);
  }

  const decoded = decodeResourceUri(slashRaw);
  if (decoded.includes('?') || decoded.includes('#')) {
    throw new ModelResourceError(
      'RESOURCE_URI_INVALID',
      `Resource name "${rawName}" must not contain a query or fragment.`,
      rawName,
    );
  }
  if (decoded.startsWith('/') || decoded.startsWith('//') || /^[A-Za-z]:\//.test(decoded)) {
    throw new ModelResourceError(
      'RESOURCE_URI_TRAVERSAL',
      `Absolute resource path "${rawName}" is not allowed.`,
      rawName,
    );
  }

  const segments: string[] = [];
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      throw new ModelResourceError(
        'RESOURCE_URI_TRAVERSAL',
        `Resource path "${rawName}" escapes the selected model bundle.`,
        rawName,
      );
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new ModelResourceError('RESOURCE_URI_INVALID', `Resource name "${rawName}" is empty.`, rawName);
  }
  return segments.join('/');
}

function resourceKey(name: string): string {
  return normalizeResourceName(name).toLocaleLowerCase('en-US');
}

function validateFile(file: ModelResourceFile, limit = MAX_MODEL_RESOURCE_FILE_BYTES): ModelResourceFile {
  const name = normalizeResourceName(file.name);
  const data = file.data;
  if (!(data instanceof Uint8Array)) {
    throw new ModelResourceError('RESOURCE_URI_INVALID', `Resource "${name}" has no binary data.`, name);
  }
  if (data.byteLength > limit) {
    throw new ModelResourceError(
      'RESOURCE_FILE_TOO_LARGE',
      `Resource "${name}" is ${data.byteLength} bytes; the limit is ${limit} bytes.`,
      name,
    );
  }
  return { name, data };
}

export function createModelResourceBundle(
  primary: ModelResourceFile,
  sidecars: readonly ModelResourceFile[] = [],
): ModelResourceBundle {
  const files = [validateFile(primary, MAX_MODEL_INPUT_BYTES), ...sidecars.map((file) => validateFile(file))];
  if (files.length > MAX_MODEL_RESOURCE_FILES) {
    throw new ModelResourceError(
      'RESOURCE_BUNDLE_TOO_MANY_FILES',
      `Model bundle contains ${files.length} files; the maximum is ${MAX_MODEL_RESOURCE_FILES}.`,
    );
  }

  const exactNames = new Set<string>();
  const caseFoldedNames = new Map<string, string>();
  let totalBytes = 0;
  for (const file of files) {
    const exact = file.name;
    if (exactNames.has(exact)) {
      throw new ModelResourceError('RESOURCE_DUPLICATE', `Model bundle contains duplicate resource "${exact}".`, exact);
    }
    exactNames.add(exact);
    const folded = resourceKey(exact);
    const prior = caseFoldedNames.get(folded);
    if (prior && prior !== exact) {
      throw new ModelResourceError(
        'RESOURCE_AMBIGUOUS',
        `Model bundle contains case-ambiguous resources "${prior}" and "${exact}".`,
        exact,
      );
    }
    caseFoldedNames.set(folded, exact);
    totalBytes += file.data.byteLength;
    if (totalBytes > MAX_MODEL_RESOURCE_BUNDLE_BYTES) {
      throw new ModelResourceError(
        'RESOURCE_BUNDLE_TOO_LARGE',
        `Model bundle is larger than the ${MAX_MODEL_RESOURCE_BUNDLE_BYTES}-byte aggregate limit.`,
      );
    }
  }

  if (files[0].name.toLocaleLowerCase('en-US') !== normalizeResourceName(primary.name).toLocaleLowerCase('en-US')) {
    throw new ModelResourceError('RESOURCE_URI_INVALID', 'Primary model resource name was normalized inconsistently.');
  }

  return {
    primary: files[0],
    files,
    totalBytes,
  };
}

function resolveBundleFile(bundle: ModelResourceBundle, uri: string): ModelResourceFile {
  if (/^data:/i.test(uri)) {
    throw new ModelResourceError(
      'RESOURCE_URI_DATA',
      'Embedded data URIs are handled by the loader and are not bundle files.',
      uri,
    );
  }
  assertAllowedUriScheme(uri);
  const normalized = normalizeResourceName(uri);
  const exact = bundle.files.find((file) => file.name === normalized);
  if (exact) return exact;
  const matches = bundle.files.filter((file) => resourceKey(file.name) === resourceKey(normalized));
  if (matches.length > 1) {
    throw new ModelResourceError(
      'RESOURCE_AMBIGUOUS',
      `Resource URI "${uri}" matches multiple selected files.`,
      uri,
    );
  }
  if (matches.length === 1) return matches[0];
  throw new ModelResourceError(
    'RESOURCE_MISSING',
    `Resource URI "${uri}" was not found in the selected model bundle.`,
    uri,
  );
}

export function resolveModelResource(bundle: ModelResourceBundle, uri: string): ModelResourceFile | null {
  if (/^data:/i.test(uri)) return null;
  return resolveBundleFile(bundle, uri);
}

export function createResourceUrlRegistry(bundle: ModelResourceBundle): ResourceUrlRegistry {
  const urls = new Map<string, string>();
  let disposed = false;

  const resolve = (uri: string): string => {
    if (/^data:/i.test(uri)) return uri;
    // GLTFLoader creates blob URLs for embedded GLB image bufferViews. They
    // are loader-owned URLs, not external bundle requests.
    if (/^blob:/i.test(uri)) return uri;
    if (disposed) {
      throw new ModelResourceError('RESOURCE_URI_INVALID', 'Resource URL registry has already been disposed.', uri);
    }
    const file = resolveBundleFile(bundle, uri);
    const key = resourceKey(file.name);
    const existing = urls.get(key);
    if (existing) return existing;
    const url = URL.createObjectURL(new Blob([bytesToArrayBuffer(file.data)]));
    urls.set(key, url);
    return url;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  };

  return { resolve, dispose };
}

export function modelResourceBundleSummary(bundle: ModelResourceBundle): string {
  const sidecarCount = Math.max(0, bundle.files.length - 1);
  return sidecarCount === 0
    ? 'self-contained model bundle'
    : `${sidecarCount} sidecar resource${sidecarCount === 1 ? '' : 's'} (${bundle.totalBytes} bytes total)`;
}
