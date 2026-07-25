/// <reference lib="webworker" />

import {
  isSmfCodecRequest,
  readSmfCodecOperation,
  readSmfCodecRequestId,
  serializeSmfCodecError,
  type SmfCodecOperation,
  type SmfCodecResponse,
} from './smfCodecProtocol';
import { executeSmfCodecRequest } from './smfCodecRuntime';

const workerScope = self as DedicatedWorkerGlobalScope;

function postResponse(response: SmfCodecResponse, transferables: Transferable[] = []): void {
  workerScope.postMessage(response, transferables);
}

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
  const requestId = readSmfCodecRequestId(event.data);
  if (!isSmfCodecRequest(event.data)) {
    if (requestId !== null) {
      postResponse({
        type: 'error',
        requestId,
        operation: readSmfCodecOperation(event.data) ?? 'import',
        error: {
          name: 'SmfCodecProtocolError',
          message: 'SMF worker received an invalid request payload.',
        },
      });
    }
    return;
  }

  const request = event.data;
  try {
    const result = executeSmfCodecRequest(request, postResponse);
    postResponse(result.response, result.transferables);
  } catch (error: unknown) {
    const operation: SmfCodecOperation = request.operation;
    postResponse({
      type: 'error',
      requestId: request.requestId,
      operation,
      error: serializeSmfCodecError(error),
    });
  }
});
