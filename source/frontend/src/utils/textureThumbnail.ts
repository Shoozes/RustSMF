import * as THREE from 'three';

type NumericPixelData = {
  readonly length: number;
  readonly [index: number]: number;
};

type RawTextureImage = {
  data: NumericPixelData;
  width: number;
  height: number;
};

const isNumericPixelData = (value: unknown): value is NumericPixelData => {
  if (!value || typeof value !== 'object') return false;
  const length = Reflect.get(value, 'length');
  return typeof length === 'number' && Number.isFinite(length) && length >= 0;
};

const getRawTextureImage = (texture: THREE.Texture): RawTextureImage | null => {
  const image: unknown = texture.source.data;
  if (!image || typeof image !== 'object') return null;
  const data: unknown = Reflect.get(image, 'data');
  const width: unknown = Reflect.get(image, 'width');
  const height: unknown = Reflect.get(image, 'height');
  if (
    !isNumericPixelData(data)
    || typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
  ) {
    return null;
  }
  return { data, width, height };
};

const toByte = (value: number, normalized: boolean): number => {
  if (!Number.isFinite(value)) return 0;
  const scaled = normalized ? value * 255 : value;
  return Math.max(0, Math.min(255, Math.round(scaled)));
};

export function sampleTextureThumbnailPixels(
  texture: THREE.Texture,
  outputWidth: number,
  outputHeight: number,
): Uint8ClampedArray | null {
  const image = getRawTextureImage(texture);
  const width = Math.max(1, Math.floor(outputWidth));
  const height = Math.max(1, Math.floor(outputHeight));
  if (!image) return null;

  const sourcePixelCount = image.width * image.height;
  const channels = Math.floor(image.data.length / sourcePixelCount);
  if (channels < 1) return null;

  const normalized = texture.type === THREE.FloatType;
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sampledY = Math.min(image.height - 1, Math.floor((y / height) * image.height));
    const sourceY = texture.flipY ? image.height - 1 - sampledY : sampledY;
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x / width) * image.width));
      const sourceIndex = (sourceY * image.width + sourceX) * channels;
      const outputIndex = (y * width + x) * 4;
      const red = toByte(image.data[sourceIndex] ?? 0, normalized);
      const green = channels >= 2
        ? toByte(image.data[sourceIndex + 1] ?? 0, normalized)
        : red;
      const blue = channels >= 3
        ? toByte(image.data[sourceIndex + 2] ?? 0, normalized)
        : red;
      output[outputIndex] = red;
      output[outputIndex + 1] = green;
      output[outputIndex + 2] = blue;
      output[outputIndex + 3] = channels >= 4
        ? toByte(image.data[sourceIndex + 3] ?? 255, normalized)
        : 255;
    }
  }
  return output;
}

const isCanvasImageSource = (value: unknown): value is CanvasImageSource => (
  (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement)
  || (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement)
  || (typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement)
  || (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap)
  || (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas)
);

export function drawTextureThumbnail(
  canvas: HTMLCanvasElement,
  texture: THREE.Texture,
): boolean {
  const context = canvas.getContext('2d');
  if (!context) return false;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  const pixels = sampleTextureThumbnailPixels(texture, canvas.width, canvas.height);
  if (pixels) {
    const imageData = context.createImageData(canvas.width, canvas.height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
    return true;
  }

  const image: unknown = texture.source.data;
  if (!isCanvasImageSource(image)) return false;
  context.save();
  try {
    if (texture.flipY) {
      context.translate(0, canvas.height);
      context.scale(1, -1);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return true;
  } catch {
    return false;
  } finally {
    context.restore();
  }
}
