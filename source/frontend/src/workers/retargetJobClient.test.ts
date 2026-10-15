import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetargetJobClient, RetargetCancelledError, type RetargetWorkerPort } from './retargetJobClient';
import type { AnalysisInputV1, AnalysisResultV1 } from './retargetAnalysisTypes';
import type { RetargetRequest } from './retargetProtocol';

const input:AnalysisInputV1={apiVersion:1,source:{nodes:[],bones:[]},target:{nodes:[],bones:[]},manualMap:{},sourceConvention:'auto',targetConvention:'auto',allowFuzzy:false,clips:[]};
const result:AnalysisResultV1={apiVersion:1,status:'ready',mapping:{ok:true,map:{hips:'pelvis'},decisions:[],diagnostics:[],sourceUp:null,targetUp:null,sourceLateral:null,targetLateral:null,upCorrection:null,orientationCorrection:null},diagnostics:[],proportions:null};
class Port implements RetargetWorkerPort {
  onmessage:RetargetWorkerPort['onmessage']=null;onerror:RetargetWorkerPort['onerror']=null;onmessageerror:RetargetWorkerPort['onmessageerror']=null;
  request:RetargetRequest|null=null;terminated=false;transfers:Transferable[]=[];
  postMessage(request:RetargetRequest,transfers:Transferable[]){this.request=request;this.transfers=transfers;}
  terminate(){this.terminated=true;}
  respond(value:unknown=result,id=this.request!){this.onmessage?.(new MessageEvent('message',{data:{jobId:id.jobId,revision:id.revision,phase:id.phase,type:id.phase,value}}));}
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('analysis correlates identity/revision, rejects bad payloads and releases workers',async()=>{
  const port=new Port(),client=createRetargetJobClient({native:false,workerFactory:()=>port});
  const job=client.start(9),pending=client.analyze(job,input);await tick();
  port.respond(result,{...port.request!,revision:8});assert.equal(port.terminated,false);
  port.respond();assert.deepEqual(await pending,result);assert.equal(port.terminated,true);assert.equal(port.onmessage,null);
  const next=client.analyze(job,input);await tick();port.respond({apiVersion:2});await assert.rejects(next,/invalid API/);client.dispose();
});
test('cancel during preparation releases promptly and a late completion cannot revive work',async()=>{
  const client=createRetargetJobClient(),job=client.start(1);let complete!:(value:number)=>void;
  const pending=client.preparation(job,()=>new Promise<number>(resolve=>{complete=resolve;}));await tick();
  client.cancel();await assert.rejects(pending,RetargetCancelledError);complete(5);await tick();assert.equal(client.isCurrent(job),false);client.dispose();
});
test('cancel, replacement and disposal terminate analysis or baking workers',async()=>{
  for(const phase of ['analysis','bake'] as const)for(const action of ['cancel','replace','dispose']){
    const port=new Port(),client=createRetargetJobClient({native:false,workerFactory:()=>port}),job=client.start(1);
    const pending=phase==='analysis'?client.analyze(job,input):client.bake(job,{source:input.source,target:input.target,mapping:result.mapping,clips:[]});
    await tick();const stale=port.onmessage;
    if(action==='replace')client.start(2);else if(action==='dispose')client.dispose();else client.cancel();
    await assert.rejects(pending,RetargetCancelledError);assert.equal(port.terminated,true);
    stale?.(new MessageEvent('message',{data:{jobId:job.jobId,revision:1,phase,type:phase,value:result}}));assert.equal(client.isCurrent(job),false);client.dispose();
  }
});
test('timeout, runtime errors and post failures release workers without a synchronous fallback',async()=>{
  const port=new Port(),client=createRetargetJobClient({native:false,workerFactory:()=>port,timeoutMs:10});
  await assert.rejects(client.analyze(client.start(1),input),/timed out/);assert.equal(port.terminated,true);
  const failed=client.analyze(client.start(2),input);await tick();port.onerror?.({message:'WASM unreachable'} as ErrorEvent);await assert.rejects(failed,/WASM unreachable/);
  port.postMessage=()=>{throw new Error('clone failed');};await assert.rejects(client.analyze(client.start(3),input),/clone failed/);assert.equal(port.terminated,true);
  client.dispose();const unavailable=createRetargetJobClient({workerFactory:()=>{throw new Error('denied');}});
  await assert.rejects(unavailable.analyze(unavailable.start(1),input),/could not start/);unavailable.dispose();
});
test('native cancellation calls the cooperative command and rejects late native results',async()=>{
  const calls:string[]=[];let complete!:(value:unknown)=>void;
  const invoke=async<T,>(command:string):Promise<T>=>{calls.push(command);return(command==='retarget_preflight_v1'?await new Promise<unknown>(resolve=>{complete=resolve;}):undefined) as T;};
  const client=createRetargetJobClient({native:true,invoke}),job=client.start(4),pending=client.analyze(job,input);await tick();
  client.cancel();await assert.rejects(pending,RetargetCancelledError);complete(result);await tick();
  assert.deepEqual(calls,['retarget_preflight_v1','cancel_retarget_preflight_v1']);assert.equal(client.isCurrent(job),false);client.dispose();
});
