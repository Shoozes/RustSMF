import { unpackModelArchive, MAX_MODEL_ARCHIVE_BYTES } from '../utils/modelArchive';
import type { ArchiveReply } from './modelArchiveClient';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ input: Blob | Uint8Array }>) => void) | null;
  postMessage: (reply: ArchiveReply, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data: { input } }) => {
  try {
    const size = input instanceof Blob ? input.size : input.byteLength;
    if (size > MAX_MODEL_ARCHIVE_BYTES) throw new Error('ZIP exceeds the 256 MiB input limit.');
    const bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : input;
    const files = await unpackModelArchive(bytes, {
      onProgress: (completed, total) => scope.postMessage({ type: 'progress', completed, total }),
    });
    scope.postMessage({ type: 'result', files }, [...new Set(files.map(file => file.data.buffer as ArrayBuffer))]);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'ZIP could not be opened.' });
  }
};
