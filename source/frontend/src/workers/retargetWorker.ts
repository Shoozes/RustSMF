/// <reference lib="webworker" />
import type { RetargetRequest, RetargetResponse } from './retargetProtocol';
import { responseIdentity } from './retargetProtocol';
import { clipTransferables } from './retargetSnapshot';

const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<unknown>) => {
  const id = responseIdentity({...event.data as object, type:'request'});
  if (!id) return;
  const request = event.data as RetargetRequest;
  const post = (response: RetargetResponse, transfers: Transferable[] = []) => scope.postMessage(response, transfers);
  const identity = {jobId:request.jobId, revision:request.revision, phase:request.phase};
  try {
    if (request.phase === 'analysis') {
      const {default:init, analyze_json_v1} = await import('../generated/retarget-core/retarget_core.js');
      await init();
      const value = JSON.parse(analyze_json_v1(JSON.stringify(request.input)));
      post({...identity, type:'analysis', value});
    } else if (request.phase === 'bake') {
      const [{default:init, bake_with_progress_json_v1}, {rustBakeRequest, restoreRustBake}] = await Promise.all([
        import('../generated/retarget-core/retarget_core.js'), import('./retargetRustRuntime')]);
      const portable = rustBakeRequest(request.input);
      await init();
      const value = restoreRustBake(JSON.parse(bake_with_progress_json_v1(JSON.stringify(portable),
        (completed:number,total:number) => post({...identity,type:'progress',completed,total}))), portable);
      post({...identity,type:'bake',value}, clipTransferables(value.clips));
    } else throw new Error('Unknown retarget phase.');
  } catch (cause) {
    post({...identity,type:'error',message:cause instanceof Error ? cause.message : String(cause)});
  }
};
