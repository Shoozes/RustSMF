import { assertModelInputSize } from '../utils/modelFormat';

export class BinaryPayloadError extends Error {
  readonly code = 'INVALID_BINARY_PAYLOAD';

  constructor(message: string) {
    super(`Native binary payload is invalid: ${message}`);
    this.name = 'BinaryPayloadError';
  }
}

export function normalizeBinaryPayload(value: unknown, sourceName: string): Uint8Array {
  if (value instanceof Uint8Array) {
    assertModelInputSize(sourceName, value.byteLength);
    return value;
  }
  if (value instanceof ArrayBuffer) {
    assertModelInputSize(sourceName, value.byteLength);
    return new Uint8Array(value);
  }
  if (!Array.isArray(value)) {
    throw new BinaryPayloadError('expected an ArrayBuffer, Uint8Array, or byte array.');
  }

  assertModelInputSize(sourceName, value.length);
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const byte = value[index];
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new BinaryPayloadError(`byte ${index} must be an integer from 0 through 255.`);
    }
    bytes[index] = byte;
  }
  return bytes;
}

export function normalizeBinaryBundlePayload(value: unknown, sourceNames: readonly string[]): readonly Uint8Array[] {
  if (!Array.isArray(value)) {
    throw new BinaryPayloadError('expected a file payload array.');
  }
  if (value.length !== sourceNames.length) {
    const label = sourceNames.length === 1 ? 'file payload' : 'file payloads';
    throw new BinaryPayloadError(`expected ${sourceNames.length} ${label}; received ${value.length}.`);
  }
  return value.map((entry, index) => normalizeBinaryPayload(entry, sourceNames[index]));
}
