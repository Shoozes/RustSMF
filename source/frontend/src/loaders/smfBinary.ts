/**
 * Shared low-level binary helpers for SMF (and potential other binary paths).
 * bytesToArrayBuffer: safe copy for DataView / loader consumers (prevents shared buffer issues).
 * BinaryReader/Writer: bounded (actionable errors on truncate), used by smf.ts import/export.
 * Extracted/moved here during integrity to eliminate duplication across smf.ts, hooks, tauri bridge.
 */
export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export class BinaryReader {
  private dv: DataView;
  off = 0;

  constructor(buffer: ArrayBuffer) {
    this.dv = new DataView(buffer);
  }

  private ensure(n: number, label: string) {
    if (this.off + n <= this.dv.byteLength) return;
    throw new Error(`Unexpected end of SMF binary while reading ${label} at offset ${this.off}`);
  }

  u8() { this.ensure(1, 'u8'); const v = this.dv.getUint8(this.off); this.off += 1; return v; }
  u16() { this.ensure(2, 'u16'); const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  u32() { this.ensure(4, 'u32'); const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  f32() { this.ensure(4, 'f32'); const v = this.dv.getFloat32(this.off, true); this.off += 4; return v; }

  strZ() {
    let s = '';
    while (true) {
      const c = this.u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

export class BinaryWriter {
  private buf: ArrayBuffer;
  private dv: DataView;
  private off = 0;

  constructor(initialSize = 1024, _tag: string = '') {
    this.buf = new ArrayBuffer(initialSize);
    this.dv = new DataView(this.buf);
  }

  private ensure(n: number) {
    if (this.off + n <= this.buf.byteLength) return;
    const newSize = this.buf.byteLength + n + 1024;
    const bigger = new ArrayBuffer(newSize);
    new Uint8Array(bigger).set(new Uint8Array(this.buf));
    this.buf = bigger;
    this.dv = new DataView(this.buf);
  }

  u8(v: number) { this.ensure(1); this.dv.setUint8(this.off, v); this.off += 1; return this; }
  u16(v: number) { this.ensure(2); this.dv.setUint16(this.off, v, true); this.off += 2; return this; }
  u32(v: number) { this.ensure(4); this.dv.setUint32(this.off, v, true); this.off += 4; return this; }
  f32(v: number) { this.ensure(4); this.dv.setFloat32(this.off, v, true); this.off += 4; return this; }

  strZ(s: string) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
    this.u8(0);
    return this;
  }

  getBuffer() {
    return this.buf.slice(0, this.off);
  }

  patchU32(offset: number, value: number) {
    if (offset < 0 || offset + 4 > this.buf.byteLength) {
      throw new Error(`Cannot patch u32 outside buffer at offset ${offset}`);
    }
    this.dv.setUint32(offset, value, true);
  }
}
