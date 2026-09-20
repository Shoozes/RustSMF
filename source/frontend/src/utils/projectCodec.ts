import {
  MAX_MODEL_INPUT_BYTES,
  MODEL_SOURCE_FORMATS,
  type ModelSourceFormat,
} from './modelFormat';
import { normalizeRigMetadata, type RigMetadata } from './rigMetadata';

export const PROJECT_KIND = 'rustsmf-project';
export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_EXTENSION = '.rsproj';

export interface ProjectState {
  readonly selected: string;
  readonly currentClipName: string;
  readonly currentTime: number;
  readonly playbackSpeed: number;
  readonly isPlaying: boolean;
  readonly sourceFormat: ModelSourceFormat | '';
  readonly rigMetadata?: RigMetadata;
}

export interface ProjectDocument {
  readonly kind: typeof PROJECT_KIND;
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly name: string;
  readonly asset: {
    readonly format: 'glb';
    readonly bytesBase64: string;
  };
  readonly state: ProjectState;
}

function invalidProject(message: string): never {
  throw new Error(`PROJECT_INVALID: ${message}`);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    invalidProject('asset bytes are not valid base64.');
  }
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    invalidProject('asset bytes could not be decoded.');
  }
  if (decoded.length > MAX_MODEL_INPUT_BYTES) {
    invalidProject('embedded asset exceeds the model input limit.');
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidProject(`${label} must be finite.`);
  return value;
}

function stringValue(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== 'string' || value.length > maximum) invalidProject(`${label} must be a bounded string.`);
  return value;
}

function validateState(value: unknown): ProjectState {
  if (!value || typeof value !== 'object') invalidProject('state is missing.');
  const state = value as Record<string, unknown>;
  const sourceFormat = state.sourceFormat;
  if (sourceFormat !== '' && !MODEL_SOURCE_FORMATS.includes(sourceFormat as ModelSourceFormat)) {
    invalidProject('state.sourceFormat is unsupported.');
  }
  if (typeof state.isPlaying !== 'boolean') invalidProject('state.isPlaying must be boolean.');
  return {
    selected: stringValue(state.selected, 'state.selected'),
    currentClipName: stringValue(state.currentClipName, 'state.currentClipName'),
    currentTime: Math.max(0, finiteNumber(state.currentTime, 'state.currentTime')),
    playbackSpeed: finiteNumber(state.playbackSpeed, 'state.playbackSpeed'),
    isPlaying: state.isPlaying,
    sourceFormat: sourceFormat as ProjectState['sourceFormat'],
    rigMetadata: normalizeRigMetadata(state.rigMetadata),
  };
}

export function createProjectDocument(input: {
  name: string;
  assetBytes: Uint8Array;
  state: ProjectState;
}): ProjectDocument {
  if (!input.name.trim()) invalidProject('project name is empty.');
  if (!(input.assetBytes instanceof Uint8Array) || input.assetBytes.byteLength === 0) {
    invalidProject('embedded asset is empty.');
  }
  if (input.assetBytes.byteLength > MAX_MODEL_INPUT_BYTES) {
    invalidProject('embedded asset exceeds the model input limit.');
  }
  const state = validateState(input.state);
  return {
    kind: PROJECT_KIND,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: input.name.trim().slice(0, 256),
    asset: { format: 'glb', bytesBase64: encodeBase64(input.assetBytes) },
    state,
  };
}

export function encodeProjectDocument(document: ProjectDocument): Uint8Array {
  const validated = decodeProjectDocument(new TextEncoder().encode(JSON.stringify(document)));
  return new TextEncoder().encode(JSON.stringify(validated));
}

export function decodeProjectDocument(input: Uint8Array | string): ProjectDocument {
  let text: string;
  try {
    text = typeof input === 'string' ? input : new TextDecoder().decode(input);
  } catch {
    invalidProject('project text could not be decoded.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalidProject('project JSON is malformed.');
  }
  if (!parsed || typeof parsed !== 'object') invalidProject('project envelope is not an object.');
  const document = parsed as Record<string, unknown>;
  if (document.kind !== PROJECT_KIND) invalidProject('project kind is not RustSMF.');
  if (document.schemaVersion !== PROJECT_SCHEMA_VERSION) invalidProject('project schema version is unsupported.');
  if (!document.asset || typeof document.asset !== 'object') invalidProject('asset is missing.');
  const asset = document.asset as Record<string, unknown>;
  if (asset.format !== 'glb') invalidProject('only GLB project snapshots are supported.');
  const bytesBase64 = stringValue(
    asset.bytesBase64,
    'asset.bytesBase64',
    Math.ceil(MAX_MODEL_INPUT_BYTES / 3) * 4 + 4,
  );
  const assetBytes = decodeBase64(bytesBase64);
  if (assetBytes.byteLength === 0) invalidProject('embedded asset is empty.');
  return {
    kind: PROJECT_KIND,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: stringValue(document.name, 'name'),
    asset: { format: 'glb', bytesBase64 },
    state: validateState(document.state),
  };
}

export function projectAssetBytes(document: ProjectDocument): Uint8Array {
  return decodeBase64(document.asset.bytesBase64);
}
