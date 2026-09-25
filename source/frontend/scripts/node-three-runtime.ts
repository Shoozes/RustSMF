import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { installFileReaderTestPolyfill } from '../src/test/installFileReaderTestPolyfill';

interface DecodedNodeImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function decodeNodeImage(bytes: Uint8Array, contentType = ''): DecodedNodeImage {
  const buffer = Buffer.from(bytes);
  if (contentType.includes('png') || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    let offset = 8;
    while (offset + 12 <= buffer.byteLength) {
      const chunkLength = buffer.readUInt32BE(offset);
      const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
      offset += chunkLength + 12;
      if (chunkType === 'IEND') break;
    }
    const decoded = PNG.sync.read(buffer.subarray(0, offset));
    return { width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) };
  }
  if (contentType.includes('jpeg') || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) };
  }
  throw new Error(`Node Three runtime cannot decode image type ${contentType || '(unknown)'}.`);
}

class NodeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: ArrayLike<number> | ArrayBufferView, width: number, height: number) {
    this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data as ArrayLike<number>);
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
  private flipped = false;

  constructor(private readonly canvas: NodeCanvas) {}

  translate(_x: number, _y: number): void {}
  scale(_x: number, y: number): void { if (y < 0) this.flipped = true; }

  putImageData(image: NodeImageData, x: number, y: number): void {
    this.pixels = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4);
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
    this.putImageData(new NodeImageData(image.data, image.width, image.height), 0, 0);
  }

  getImageData(_x = 0, _y = 0, width = this.canvas.width, height = this.canvas.height): NodeImageData {
    return new NodeImageData(this.pixels.slice(0, width * height * 4), width, height);
  }
}

function encodePng(width: number, height: number, pixels: ArrayLike<number>): Uint8Array {
  const image = new PNG({ width, height });
  image.data.set(pixels);
  return PNG.sync.write(image);
}

function pngBlobPart(width: number, height: number, pixels: ArrayLike<number>): ArrayBuffer {
  const encoded = encodePng(width, height, pixels);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return owned.buffer as ArrayBuffer;
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

  toBlob(callback: (blob: Blob | null) => void, type = 'image/png'): void {
    try {
      const context = this.getContext('2d');
      const pixels = context?.getImageData(0, 0, this.width, this.height).data;
      if (!pixels) throw new Error('Canvas image data is unavailable.');
      callback(new Blob([pngBlobPart(this.width, this.height, pixels)], { type }));
    } catch {
      callback(null);
    }
  }

  async convertToBlob(options: BlobPropertyBag = {}): Promise<Blob> {
    return new Promise((resolve, reject) => this.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas encoding failed.')), options.type));
  }

  toDataURL(type = 'image/png'): string {
    const context = this.getContext('2d');
    const pixels = context?.getImageData(0, 0, this.width, this.height).data;
    if (!pixels) return `data:${type};base64,`;
    return `data:${type};base64,${Buffer.from(encodePng(this.width, this.height, pixels)).toString('base64')}`;
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
