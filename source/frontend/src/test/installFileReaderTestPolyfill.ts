type ReaderCallback = ((event: { target: NodeFileReader }) => void) | null;

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: ReaderCallback = null;
  onerror: ((error: unknown) => void) | null = null;

  async readAsArrayBuffer(blob: Blob): Promise<void> {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.({ target: this });
    } catch (error) {
      this.onerror?.(error);
    }
  }

  async readAsDataURL(blob: Blob): Promise<void> {
    try {
      const buffer = await blob.arrayBuffer();
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${encodeBase64(buffer)}`;
      this.onloadend?.({ target: this });
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

export function installFileReaderTestPolyfill(): void {
  if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
  }
}
