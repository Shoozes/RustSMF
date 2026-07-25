import {
  bytesToArrayBuffer,
  exportSMFToBuffer,
  importSMF,
  type SmfCodecProgress,
} from '../loaders';
import { collectImportedSmfTransferables } from '../loaders/smfData';
import type { SmfCodecRequest, SmfCodecResponse } from './smfCodecProtocol';

export interface SmfCodecRuntimeResult {
  response: Extract<SmfCodecResponse, { type: 'success' }>;
  transferables: ArrayBuffer[];
}

export function executeSmfCodecRequest(
  request: SmfCodecRequest,
  onProgress: (response: Extract<SmfCodecResponse, { type: 'progress' }>) => void,
): SmfCodecRuntimeResult {
  const report = (progress: SmfCodecProgress): void => {
    onProgress({
      type: 'progress',
      requestId: request.requestId,
      operation: request.operation,
      progress,
    });
  };

  if (request.operation === 'import') {
    const data = importSMF(request.buffer, report);
    return {
      response: {
        type: 'success',
        requestId: request.requestId,
        operation: 'import',
        data,
      },
      transferables: collectImportedSmfTransferables(data),
    };
  }

  const bytes = exportSMFToBuffer(request.data, report);
  const buffer = bytesToArrayBuffer(bytes);
  return {
    response: {
      type: 'success',
      requestId: request.requestId,
      operation: 'export',
      buffer,
    },
    transferables: [buffer],
  };
}
