import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { installFileReaderTestPolyfill } from '../src/test/installFileReaderTestPolyfill';
import {
  assertImageDimensions,
  ImageByteBudget,
  inspectImagePayload,
  MAX_IMAGE_PIXELS,
  MAX_JPEG_DECODER_MEMORY_MB,
  resolveImageMimeType,
  type SupportedImageMimeType,
} from '../src/utils/imagePayload';

interface DecodedNodeImage {
  width: number;
  height: number;
  data: Uint8Array;
}

let decodedImageBudget = new ImageByteBudget('Node Three decoded-image');
let canvasAllocationBudget = new ImageByteBudget('Node Three canvas');

function decodeNodeImage(bytes: Uint8Array, contentType = ''): DecodedNodeImage {
  const mimeType = resolveImageMimeType(bytes, contentType);
  const dimensions = inspectImagePayload(bytes, mimeType, 'Node Three image');
  decodedImageBudget.reserve(dimensions, 'Node Three image');
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png') {
    let offset = 8;
    while (offset + 12 <= buffer.byteLength) {
      const chunkLength = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
      if (chunkLength > buffer.byteLength - offset - 12) {
        throw new Error('Node Three image has a truncated PNG chunk.');
      }
      offset += chunkLength + 12;
      if (chunkType === 'IEND') break;
    }
    const decoded = PNG.sync.read(buffer.subarray(0, offset));
    if (decoded.width !== dimensions.width || decoded.height !== dimensions.height
      || decoded.data.byteLength !== dimensions.decodedByteLength) {
      throw new Error('Node Three PNG decoder returned dimensions outside the inspected image header.');
    }
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  if (mimeType === 'image/jpeg') {
    const decoded = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000,
      maxMemoryUsageInMB: MAX_JPEG_DECODER_MEMORY_MB,
    });
    if (decoded.width !== dimensions.width || decoded.height !== dimensions.height
      || decoded.data.byteLength !== dimensions.decodedByteLength) {
      throw new Error('Node Three JPEG decoder returned dimensions outside the inspected image header.');
    }
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  throw new Error(`Node Three runtime cannot decode image type ${contentType || '(unknown)'}.`);
}

class NodeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(
    data: ArrayLike<number> | ArrayBufferView,
    width: number,
    height: number,
    accountAllocation = true,
  ) {
    const dimensions = assertImageDimensions(width, height, 'Canvas ImageData');
    const values = data as ArrayLike<number>;
    if (values.length !== dimensions.decodedByteLength) {
      throw new Error('Canvas ImageData byte length does not match its dimensions.');
    }
    if (data instanceof Uint8ClampedArray) {
      this.data = data;
    } else if (data instanceof Uint8Array) {
      this.data = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    } else {
      if (accountAllocation) canvasAllocationBudget.reserve(dimensions, 'Canvas ImageData');
      this.data = new Uint8ClampedArray(values);
    }
    this.width = width;
    this.height = height;
  }
}

type NodeImageEvent = { type: string; target: NodeImage };
type NodeImageListener = (this: NodeImage, event: NodeImageEvent) => void;

class NodeImage {
  data: Uint8Array | undefined;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  crossOrigin: string | null = null;
  private source = '';
  private readonly listeners = new Map<string, Set<NodeImageListener>>();

  get src(): string { return this.source; }

  set src(value: string) {
    this.source = value;
    this.complete = false;
    void this.load(value);
  }

  addEventListener(
    type: string,
    listener: NodeImageListener,
    options?: boolean | { once?: boolean },
  ): void {
    const once = typeof options === 'object' && options?.once === true;
    const wrapped: NodeImageListener = once
      ? function (this: NodeImage, event: NodeImageEvent) {
        this.removeEventListener(type, wrapped);
        listener.call(this, event);
      }
      : listener;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(wrapped);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: NodeImageListener,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  private dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener.call(this, { type, target: this });
  }

  private async load(source: string): Promise<void> {
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Image request returned ${response.status}.`);
      const decoded = decodeNodeImage(new Uint8Array(await response.arrayBuffer()), response.headers.get('content-type') ?? '');
      this.data = decoded.data;
      this.width = decoded.width;
      this.height = decoded.height;
      this.naturalWidth = decoded.width;
      this.naturalHeight = decoded.height;
      this.complete = true;
      this.dispatch('load');
    } catch {
      this.complete = true;
      this.dispatch('error');
    }
  }
}

class NodeImageBitmap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(image: DecodedNodeImage) {
    this.width = image.width;
    this.height = image.height;
    this.data = image.data;
  }

  close(): void {}
}

class NodeCanvasContext {
  private pixels = new Uint8ClampedArray();
  private allocatedWidth = 0;
  private allocatedHeight = 0;
  private flipped = false;

  constructor(private readonly canvas: NodeCanvas) {}

  translate(_x: number, _y: number): void {}
  scale(_x: number, y: number): void { if (y < 0) this.flipped = true; }

  private ensurePixels(): void {
    const dimensions = assertImageDimensions(this.canvas.width, this.canvas.height, 'Node Three canvas');
    if (this.allocatedWidth === dimensions.width
      && this.allocatedHeight === dimensions.height
      && this.pixels.byteLength === dimensions.decodedByteLength) return;
    canvasAllocationBudget.reserve(dimensions, 'Node Three canvas backing pixels');
    this.pixels = new Uint8ClampedArray(dimensions.decodedByteLength);
    this.allocatedWidth = dimensions.width;
    this.allocatedHeight = dimensions.height;
  }

  putImageData(image: NodeImageData, x: number, y: number): void {
    const source = assertImageDimensions(image.width, image.height, 'Node Three source image');
    if (image.data.byteLength !== source.decodedByteLength) {
      throw new Error('Node Three source image byte length does not match its dimensions.');
    }
    this.ensurePixels();
    for (let row = 0; row < this.canvas.height; row += 1) {
      for (let column = 0; column < this.canvas.width; column += 1) {
        const sourceX = Math.min(image.width - 1, Math.floor(column * image.width / this.canvas.width));
        const sourceY = Math.min(image.height - 1, Math.floor(row * image.height / this.canvas.height));
        const destinationY = this.flipped ? this.canvas.height - 1 - row : row;
        const source = (sourceY * image.width + sourceX) * 4;
        const destination = ((destinationY + y) * this.canvas.width + column + x) * 4;
        this.pixels.set(image.data.subarray(source, source + 4), destination);
      }
    }
  }

  drawImage(image: NodeImage, ..._args: number[]): void {
    if (!image.data || image.width <= 0 || image.height <= 0) throw new Error('Image pixels are not ready.');
    this.putImageData(new NodeImageData(image.data, image.width, image.height, false), 0, 0);
  }

  getImageData(_x = 0, _y = 0, width = this.canvas.width, height = this.canvas.height): NodeImageData {
    const dimensions = assertImageDimensions(width, height, 'Node Three canvas read');
    this.ensurePixels();
    if (width > this.canvas.width || height > this.canvas.height) {
      throw new Error('Node Three canvas read exceeds the canvas dimensions.');
    }
    return new NodeImageData(this.pixels.subarray(0, dimensions.decodedByteLength), width, height, false);
  }
}

function canvasMimeType(requested = 'image/png'): SupportedImageMimeType {
  const normalized = requested.split(';', 1)[0].trim().toLowerCase() || 'image/png';
  if (normalized !== 'image/png' && normalized !== 'image/jpeg') {
    throw new Error('Node Three canvas cannot encode unsupported MIME type ' + normalized + '.');
  }
  return normalized;
}

function jpegQuality(quality?: number): number {
  const normalized = quality === undefined || !Number.isFinite(quality)
    ? 0.92
    : Math.max(0, Math.min(1, quality));
  return Math.round(normalized * 100);
}

function encodeImage(
  width: number,
  height: number,
  pixels: ArrayLike<number>,
  mimeType: SupportedImageMimeType,
  quality?: number,
): Uint8Array {
  const dimensions = assertImageDimensions(width, height, 'Node Three canvas output');
  if (pixels.length !== dimensions.decodedByteLength) {
    throw new Error('Node Three canvas pixel byte length does not match its dimensions.');
  }
  if (mimeType === 'image/png') {
    canvasAllocationBudget.reserve(dimensions, 'Node Three PNG encoder pixels');
    const image = new PNG({ width, height });
    image.data.set(pixels);
    return PNG.sync.write(image);
  }
  let data: Buffer;
  if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
    data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  } else {
    canvasAllocationBudget.reserve(dimensions, 'Node Three JPEG encoder pixels');
    const normalized = Uint8Array.from(pixels);
    data = Buffer.from(normalized.buffer, normalized.byteOffset, normalized.byteLength);
  }
  return jpeg.encode({ data, width, height }, jpegQuality(quality)).data;
}

class NodeCanvas {
  width = 1;
  height = 1;
  readonly style: Record<string, string> = {};
  private context: NodeCanvasContext | undefined;

  getContext(kind: string): NodeCanvasContext | null {
    if (kind !== '2d') return null;
    this.context ??= new NodeCanvasContext(this);
    return this.context;
  }

  toBlob(callback: (blob: Blob | null) => void, type = 'image/png', quality?: number): void {
    const mimeType = canvasMimeType(type);
    try {
      const context = this.getContext('2d');
      const pixels = context?.getImageData(0, 0, this.width, this.height).data;
      if (!pixels) throw new Error('Canvas image data is unavailable.');
      const encoded = encodeImage(this.width, this.height, pixels, mimeType, quality);
      const blobPart = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
      callback(new Blob([blobPart], { type: mimeType }));
    } catch {
      callback(null);
    }
  }

  async convertToBlob(options: BlobPropertyBag & { quality?: number } = {}): Promise<Blob> {
    return new Promise((resolve, reject) => this.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas encoding failed.')),
      options.type,
      options.quality,
    ));
  }

  toDataURL(type = 'image/png', quality?: number): string {
    const mimeType = canvasMimeType(type);
    const context = this.getContext('2d');
    const pixels = context?.getImageData(0, 0, this.width, this.height).data;
    if (!pixels) throw new Error('Canvas image data is unavailable.');
    const encoded = encodeImage(this.width, this.height, pixels, mimeType, quality);
    return 'data:' + mimeType + ';base64,' + Buffer.from(encoded).toString('base64');
  }
}

function installNodeImageDom(): void {
  if (typeof globalThis.ImageData === 'undefined') Reflect.set(globalThis, 'ImageData', NodeImageData);
  if (typeof globalThis.document === 'undefined') {
    Reflect.set(globalThis, 'document', {
      createElementNS(_namespace: string, name: string) {
        if (name === 'img') return new NodeImage();
        if (name === 'canvas') return new NodeCanvas();
        throw new Error(`Unsupported Node Three DOM element ${name}.`);
      },
      createElement(name: string) {
        if (name === 'canvas') return new NodeCanvas();
        if (name === 'img') return new NodeImage();
        throw new Error(`Unsupported Node Three DOM element ${name}.`);
      },
    });
  }
  if (!Reflect.has(globalThis, 'window')) Reflect.set(globalThis, 'window', globalThis);
}

export function installNodeThreeRuntime(): void {
  decodedImageBudget = new ImageByteBudget('Node Three decoded-image');
  canvasAllocationBudget = new ImageByteBudget('Node Three canvas');
  installFileReaderTestPolyfill();
  installNodeImageDom();
  if (typeof globalThis.ProgressEvent === 'undefined') {
    class NodeProgressEvent {
      readonly type: string;
      readonly lengthComputable: boolean;
      readonly loaded: number;
      readonly total: number;
      constructor(type: string, init: { lengthComputable?: boolean; loaded?: number; total?: number } = {}) {
        this.type = type;
        this.lengthComputable = init.lengthComputable ?? false;
        this.loaded = init.loaded ?? 0;
        this.total = init.total ?? 0;
      }
    }
    Reflect.set(globalThis, 'ProgressEvent', NodeProgressEvent);
  }
  if (typeof globalThis.createImageBitmap === 'undefined') {
    Reflect.set(globalThis, 'createImageBitmap', async (source: Blob | NodeImage) => {
      if (source instanceof Blob) {
        const responseBytes = new Uint8Array(await source.arrayBuffer());
        return new NodeImageBitmap(decodeNodeImage(responseBytes, source.type));
      }
      if (source.data && source.width > 0 && source.height > 0) {
        return new NodeImageBitmap({ width: source.width, height: source.height, data: source.data });
      }
      throw new Error('Node Three runtime cannot create a bitmap from this image source.');
    });
  }
  if (!Reflect.has(globalThis, 'self')) Reflect.set(globalThis, 'self', globalThis);
}
