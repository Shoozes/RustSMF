import type { AnalysisInputV1, AnalysisResultV1 } from './retargetAnalysisTypes';
import type { BakeInput, BakeOutput, JobIdentity, RetargetRequest } from './retargetProtocol';
import { responseIdentity } from './retargetProtocol';
import { clipTransferables } from './retargetSnapshot';

export type TransferPhase = 'preparing'|'analysis'|'bake';
export interface TransferProgress { phase:TransferPhase; completed:number; total:number }
export interface RetargetJob extends JobIdentity { signal:AbortSignal }
export class RetargetCancelledError extends Error {
  constructor() { super('Transfer canceled.'); this.name='RetargetCancelledError'; }
}
export interface RetargetWorkerPort {
  postMessage(value:RetargetRequest, transfers:Transferable[]):void;
  terminate():void;
  onmessage:((event:MessageEvent<unknown>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  onmessageerror:((event:MessageEvent<unknown>)=>void)|null;
}
interface ClientOptions {
  workerFactory?:()=>RetargetWorkerPort;
  native?:boolean;
  invoke?:<T>(command:string,args:Record<string,unknown>)=>Promise<T>;
  timeoutMs?:number;
  onProgress?:(progress:TransferProgress)=>void;
  progressChannel?:(receive:(value:unknown)=>void)=>Promise<{channel:unknown;dispose:()=>void}>;
}
let nextJobId=0;
const timeoutDefault=120_000;
const fail = (cause:unknown) => cause instanceof Error ? cause : new Error(String(cause));

export function validateAnalysis(value:unknown):AnalysisResultV1 {
  if (!value || typeof value!=='object') throw new Error('Retarget analysis returned no result.');
  const result=value as AnalysisResultV1;
  if (result.apiVersion!==1 || !['ready','needs-review','blocked'].includes(result.status) ||
    !result.mapping || typeof result.mapping.ok!=='boolean' || !result.mapping.map ||
    !Array.isArray(result.mapping.decisions) || !Array.isArray(result.diagnostics) ||
    Object.entries(result.mapping.map).some(([key,target])=>!key || typeof target!=='string' || !target) ||
    result.mapping.decisions.some(item=>typeof item.source!=='string' || typeof item.target!=='string' || !Number.isFinite(item.confidence)) ||
    result.diagnostics.some(item=>!['info','warning','error'].includes(item.level) || typeof item.code!=='string' || typeof item.message!=='string')) {
    throw new Error('Retarget analysis returned an invalid API v1 result. Rebuild the matching Rust/WASM runtime.');
  }
  return result;
}
function validateBake(value:unknown):BakeOutput {
  const output=value as BakeOutput;
  if (!output || !Array.isArray(output.clips) || !output.clips.length || output.clips.length>256 ||
    !Array.isArray(output.reports) || output.reports.length!==output.clips.length || output.clips.some(clip=>
      typeof clip.name!=='string' || !Number.isFinite(clip.duration) || !Array.isArray(clip.tracks) ||
      clip.tracks.some(track=>!(track.times instanceof Float32Array) || !track.times.length ||
        !(track.values instanceof Float32Array || Array.isArray(track.values))))) throw new Error('Retarget worker returned invalid clips.');
  return output;
}

/** One active transfer per editor. Each phase owns its timeout and worker lifetime. */
export function createRetargetJobClient(options:ClientOptions={}) {
  let active:{job:RetargetJob;controller:AbortController}|null=null, disposed=false;
  const timeoutMs=options.timeoutMs??timeoutDefault;
  const native=options.native??(typeof window!=='undefined' && !!(Reflect.get(window,'__TAURI__') || Reflect.get(window,'__TAURI_INTERNALS__')));
  const invoke=options.invoke??(async <T,>(command:string,args:Record<string,unknown>)=>{
    const {invokeCommand}=await import('../backend-client/tauri'); return invokeCommand<T>(command,args);
  });
  const current=(job:RetargetJob)=>!disposed && active?.job===job && !job.signal.aborted;
  const assertCurrent=(job:RetargetJob)=>{if(!current(job)) throw new RetargetCancelledError();};
  const cancel=()=>{active?.controller.abort();active=null;};
  const start=(revision:number):RetargetJob=>{
    if(disposed) throw new Error('Retarget client is disposed.');
    cancel(); const controller=new AbortController();
    const job={jobId:++nextJobId,revision,signal:controller.signal};active={job,controller};return job;
  };
  async function preparation<T>(job:RetargetJob,run:()=>Promise<T>):Promise<T> {
    assertCurrent(job); options.onProgress?.({phase:'preparing',completed:0,total:1});
    return bounded(job,'preparing',run);
  }
  function bounded<T>(job:RetargetJob,phase:TransferPhase,run:()=>Promise<T>,cleanup:()=>void=()=>{}):Promise<T> {
    assertCurrent(job);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(action:()=>void)=>{
        if(settled)return;settled=true;clearTimeout(timer);job.signal.removeEventListener('abort',abort);cleanup();action();
      };
      const abort=()=>finish(()=>reject(new RetargetCancelledError()));
      const timer=setTimeout(()=>finish(()=>reject(new Error(`Transfer ${phase} timed out after ${timeoutMs/1000}s. Cancel or choose fewer clips and try again.`))),timeoutMs);
      job.signal.addEventListener('abort',abort,{once:true});
      if(job.signal.aborted){abort();return;}
      Promise.resolve().then(()=>{assertCurrent(job);return run();}).then(value=>finish(()=>{
        try{assertCurrent(job);resolve(value);}catch(cause){reject(cause);}
      }),cause=>finish(()=>reject(fail(cause))));
    });
  }
  async function worker<T>(job:RetargetJob,request:RetargetRequest,read:(value:unknown)=>T):Promise<T> {
    assertCurrent(job);
    let port:RetargetWorkerPort;
    try{port=options.workerFactory?.()??new Worker(new URL('./retargetWorker.ts',import.meta.url),{type:'module',name:'rustsmf-retarget'});}
    catch(cause){throw new Error(`Transfer worker could not start: ${fail(cause).message}. Enable module workers and rebuild the application.`);}
    return bounded(job,request.phase,()=>new Promise<T>((resolve,reject)=>{
      let completed=-1;
      port.onmessage=event=>{
        const id=responseIdentity(event.data);
        if(!id || id.jobId!==job.jobId || id.revision!==job.revision)return;
        const response=event.data as Record<string,unknown>;
        if(id.phase!==request.phase){reject(new Error('Retarget worker returned the wrong phase.'));return;}
        if(id.type==='progress'){
          const count=response.completed,total=response.total;
          if(typeof count!=='number' || typeof total!=='number' || !Number.isSafeInteger(count) || !Number.isSafeInteger(total) || count<0 || count<completed || count>total || total!==(request.phase==='bake'?request.input.clips.length:1) || total<=0){reject(new Error('Retarget worker returned invalid progress.'));return;}
          completed=count;options.onProgress?.({phase:request.phase,completed:count,total});return;
        }
        if(id.type==='error'){reject(new Error(`Transfer ${request.phase} failed: ${String(response.message)}`));return;}
        if(id.type!==request.phase){reject(new Error('Retarget worker returned an invalid response.'));return;}
        try{resolve(read(response.value));}catch(cause){reject(cause);}
      };
      port.onerror=event=>reject(new Error(`Transfer worker failed: ${event.message || 'worker runtime unavailable'}. Rebuild the application and try again.`));
      port.onmessageerror=()=>reject(new Error('Transfer worker could not decode the result.'));
      try{
        const transfers=request.phase==='bake'?clipTransferables(request.input.clips.flatMap(item=>[item.clip,
          ...(item.options.sourceReferenceClip?[item.options.sourceReferenceClip]:[]),...(item.options.targetReferenceClip?[item.options.targetReferenceClip]:[]),...(item.options.endpointTargetClips??[])])):[];
        port.postMessage(request,transfers);
      }catch(cause){reject(cause);}
    }),()=>{port.onmessage=null;port.onerror=null;port.onmessageerror=null;port.terminate();});
  }
  async function analyze(job:RetargetJob,input:AnalysisInputV1):Promise<AnalysisResultV1> {
    assertCurrent(job);options.onProgress?.({phase:'analysis',completed:0,total:1});
    if(!native)return worker(job,{jobId:job.jobId,revision:job.revision,phase:'analysis',input},validateAnalysis);
    let finished=false;
    return bounded(job,'analysis',async()=>{
      const result=validateAnalysis(await invoke<unknown>('retarget_preflight_v1',{jobId:job.jobId,input}));finished=true;return result;
    },()=>{if(!finished)void invoke('cancel_retarget_preflight_v1',{jobId:job.jobId}).catch(()=>{});});
  }
  async function bake(job:RetargetJob,input:BakeInput):Promise<BakeOutput> {
    assertCurrent(job);options.onProgress?.({phase:'bake',completed:0,total:input.clips.length});
    if(!native)return worker(job,{jobId:job.jobId,revision:job.revision,phase:'bake',input},validateBake);
    let finished=false,closed=false,channel:{channel:unknown;dispose:()=>void}|undefined;
    return bounded(job,'bake',async()=>{
      const {rustBakeRequest,restoreRustBake}=await import('./retargetRustRuntime');
      assertCurrent(job);
      const request=rustBakeRequest(input);
      return new Promise<BakeOutput>((resolve,reject)=>{
        let completed=-1,invalidProgress=false;
        const refuseProgress=()=>{invalidProgress=true;reject(new Error('Retarget native command returned invalid progress.'));};
        const receive=(value:unknown)=>{
          if(closed || !current(job))return;
          if(!value || typeof value!=='object'){refuseProgress();return;}
          const p=value as Record<string,unknown>;
          if(!Number.isSafeInteger(p.jobId) || !Number.isSafeInteger(p.revision)){refuseProgress();return;}
          if(p.jobId!==job.jobId || p.revision!==job.revision)return;
          if(!Number.isSafeInteger(p.completed) || !Number.isSafeInteger(p.total) || (p.completed as number)<0 || (p.completed as number)<completed || (p.completed as number)>(p.total as number) || p.total!==input.clips.length){refuseProgress();return;}
          completed=p.completed as number;options.onProgress?.({phase:'bake',completed,total:p.total as number});
        };
        const setup=options.progressChannel??(async(receive:(value:unknown)=>void)=>{
          const {retargetProgressChannel}=await import('../backend-client/tauri');return retargetProgressChannel(receive);
        });
        void setup(receive).then(async value=>{
          channel=value;
          if(closed){channel.dispose();return;}
          assertCurrent(job);
          const raw=await invoke<unknown>('retarget_bake_v1',{jobId:job.jobId,revision:job.revision,input:JSON.stringify(request),progress:channel.channel});
          if(invalidProgress)return;
          assertCurrent(job);
          const response=raw as {jobId?:unknown;revision?:unknown;value?:unknown};
          if(!response || response.jobId!==job.jobId || response.revision!==job.revision)throw new Error('Retarget native command returned a stale result.');
          const result=restoreRustBake(response.value,request);finished=true;resolve(result);
        }).catch(reject);
      });
    },()=>{
      closed=true;channel?.dispose();
      if(!finished)void invoke('cancel_retarget_preflight_v1',{jobId:job.jobId}).catch(()=>{});
    });
  }
  return {start,preparation,analyze,bake,cancel,isCurrent:current,dispose:()=>{cancel();disposed=true;}};
}
export type RetargetJobClient=ReturnType<typeof createRetargetJobClient>;
