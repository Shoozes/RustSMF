export type SupportedImageMimeType = 'image/png' | 'image/jpeg';

export interface ImageDimensions {
  width: number;
  height: number;
  pixelCount: number;
  decodedByteLength: number;
}

export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 16_777_216;
export const MAX_IMAGE_DECODED_BYTES = MAX_IMAGE_PIXELS * 4;
export const MAX_AGGREGATE_DECODED_IMAGE_BYTES = 256 * 1024 * 1024;
export const MAX_JPEG_DECODER_MEMORY_MB = 128;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export function sniffImageMimeType(bytes: Uint8Array): SupportedImageMimeType | null {
  if (hasPngSignature(bytes)) return 'image/png';
  if (hasJpegSignature(bytes)) return 'image/jpeg';
  return null;
}

export function resolveImageMimeType(bytes: Uint8Array, declaredType = ''): SupportedImageMimeType {
  const detected = sniffImageMimeType(bytes);
  if (!detected) {
    throw new Error('Image payload is not a supported PNG or JPEG image.');
  }

  const declared = declaredType.split(';', 1)[0].trim().toLowerCase();
  if (declared.startsWith('image/') && declared !== detected) {
    throw new Error('Image payload signature ' + detected + ' does not match declared MIME type ' + declared + '.');
  }
  return detected;
}

export function assertImageDimensions(width: number, height: number, label = 'Image'): ImageDimensions {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(label + ' dimensions must be positive integers.');
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(label + ' dimensions ' + width + 'x' + height + ' exceed the ' + MAX_IMAGE_DIMENSION + '-pixel edge limit.');
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_IMAGE_PIXELS) {
    throw new Error(label + ' dimensions ' + width + 'x' + height + ' exceed the ' + MAX_IMAGE_PIXELS + '-pixel limit.');
  }
  return {
    width,
    height,
    pixelCount,
    decodedByteLength: pixelCount * 4,
  };
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3];
}

function readPngDimensions(bytes: Uint8Array, label: string): ImageDimensions {
  if (bytes.byteLength < 33) {
    throw new Error(label + ' has a truncated PNG header.');
  }
  if (readUint32BigEndian(bytes, 8) !== 13
    || bytes[12] !== 0x49
    || bytes[13] !== 0x48
    || bytes[14] !== 0x44
    || bytes[15] !== 0x52) {
    throw new Error(label + ' has an invalid PNG IHDR chunk.');
  }
  return assertImageDimensions(
    readUint32BigEndian(bytes, 16),
    readUint32BigEndian(bytes, 20),
    label,
  );
}

function isJpegFrameMarker(marker: number): boolean {
  return marker === 0xc0
    || marker === 0xc1
    || marker === 0xc2
    || marker === 0xc3
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf);
}

function readJpegDimensions(bytes: Uint8Array, label: string): ImageDimensions {
  let offset = 2;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      throw new Error(label + ' has an invalid JPEG marker sequence.');
    }
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      throw new Error(label + ' has an invalid JPEG marker before its frame header.');
    }
    if (marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda) {
      throw new Error(label + ' is missing a JPEG frame header.');
    }
    if (offset + 2 > bytes.byteLength) {
      throw new Error(label + ' has a truncated JPEG segment length.');
    }
    const segmentLength = bytes[offset] * 0x100 + bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      throw new Error(label + ' has a truncated JPEG segment.');
    }
    if (isJpegFrameMarker(marker)) {
      if (segmentLength < 8) {
        throw new Error(label + ' has a truncated JPEG frame header.');
      }
      const height = bytes[offset + 3] * 0x100 + bytes[offset + 4];
      const width = bytes[offset + 5] * 0x100 + bytes[offset + 6];
      const componentCount = bytes[offset + 7];
      if (componentCount <= 0 || segmentLength !== 8 + componentCount * 3) {
        throw new Error(label + ' has an invalid JPEG frame header.');
      }
      return assertImageDimensions(width, height, label);
    }
    offset += segmentLength;
  }
  throw new Error(label + ' is missing a JPEG frame header.');
}

export function inspectImagePayload(
  bytes: Uint8Array,
  mimeType: string,
  label = 'Image',
): ImageDimensions {
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
    throw new Error(label + ' has unsupported MIME type ' + (mimeType || '(missing)') + '.');
  }
  const detected = sniffImageMimeType(bytes);
  if (detected !== mimeType) {
    throw new Error(label + ' payload signature ' + (detected ?? '(unknown)')
      + ' does not match declared MIME type ' + mimeType + '.');
  }
  return mimeType === 'image/png'
    ? readPngDimensions(bytes, label)
    : readJpegDimensions(bytes, label);
}

export class ImageByteBudget {
  private usedBytes = 0;

  constructor(
    private readonly purpose: string,
    private readonly maximumBytes = MAX_AGGREGATE_DECODED_IMAGE_BYTES,
  ) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
      throw new Error('Image byte budget must be a positive safe integer.');
    }
  }

  reserve(dimensions: ImageDimensions, label = 'Image'): ImageDimensions {
    const checked = assertImageDimensions(dimensions.width, dimensions.height, label);
    if (checked.decodedByteLength > this.maximumBytes - this.usedBytes) {
      throw new Error(
        this.purpose + ' aggregate limit of ' + this.maximumBytes
        + ' bytes would be exceeded by ' + label + ' (' + checked.decodedByteLength + ' decoded RGBA bytes).',
      );
    }
    this.usedBytes += checked.decodedByteLength;
    return checked;
  }

  get totalBytes(): number {
    return this.usedBytes;
  }
}
