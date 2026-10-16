import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetargetJobClient, RetargetCancelledError, type RetargetWorkerPort } from './retargetJobClient';
import type { AnalysisInputV1, AnalysisResultV1 } from './retargetAnalysisTypes';
import type { RetargetRequest } from './retargetProtocol';
import {advancedFixtures} from '../../scripts/retarget-advanced-fixtures';
import {productionInput} from '../../scripts/retarget-production-fixtures';
import {restoreRustBake} from './retargetRustRuntime';

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

test('invalid worker progress is rejected before callbacks and releases the worker',async()=>{
  for(const [completed,total] of [[NaN,1],[0,NaN],[Infinity,1],[0,Infinity],[.5,1],[0,1.5],[-1,1],[2,1],[0,0]]){
    const port=new Port(),progress:Array<{completed:number;total:number}>=[];
    const client=createRetargetJobClient({native:false,workerFactory:()=>port,onProgress:value=>progress.push(value)});
    const pending=client.analyze(client.start(1),input);await tick();
    port.onmessage?.(new MessageEvent('message',{data:{...port.request,type:'progress',completed,total}}));
    port.respond();
    await assert.rejects(pending,/invalid progress/);
    assert.equal(progress.length,1,'invalid counts must not reach the UI callback');
    assert.equal(port.terminated,true);assert.equal(port.onmessage,null);client.dispose();
  }
});

test('valid integral worker progress completes normally',async()=>{
  const port=new Port(),progress:Array<{completed:number;total:number}>=[];
  const client=createRetargetJobClient({native:false,workerFactory:()=>port,onProgress:value=>progress.push(value)});
  const pending=client.analyze(client.start(1),input);await tick();
  for(const completed of [0,1])port.onmessage?.(new MessageEvent('message',{data:{...port.request,type:'progress',completed,total:1}}));
  port.respond();assert.deepEqual(await pending,result);
  assert.deepEqual(progress.map(p=>p.completed),[0,0,1]);assert.equal(port.terminated,true);client.dispose();
});

test('native bake owns its packet, validates correlated clips/reports and disposes progress',async()=>{
  const f=advancedFixtures().positives[0],input=productionInput(f.input),before=structuredClone(input);
  let disposed=0,receive!:(v:unknown)=>void;const calls:string[]=[],progress:number[]=[];
  const client=createRetargetJobClient({native:true,onProgress:p=>progress.push(p.completed),
    progressChannel:async fn=>{receive=fn;return{channel:'owned',dispose:()=>{disposed++;}};},
    invoke:async<T,>(command:string,args:Record<string,unknown>)=>{
      calls.push(command);assert.equal(command,'retarget_bake_v1');assert.deepEqual(JSON.parse(args.input as string),JSON.parse(JSON.stringify(f.input)));
      receive({jobId:args.jobId,revision:args.revision,completed:0,total:1});
      receive({jobId:args.jobId,revision:args.revision,completed:1,total:1});
      return {jobId:args.jobId,revision:args.revision,value:f.expected} as T;
    }});
  const result=await client.bake(client.start(8),input);
  assert.deepEqual(result,restoreRustBake(f.expected,f.input));assert.deepEqual(input,before);
  assert.deepEqual(calls,['retarget_bake_v1']);assert.deepEqual(progress,[0,0,1]);assert.equal(disposed,1);client.dispose();
});

test('native bake cancellation, replacement, timeout and disposal reject late replies and release channels',async()=>{
  const f=advancedFixtures().positives[0];
  for(const action of ['cancel','replace','dispose','timeout']){
    let complete!:(v:unknown)=>void,disposed=0;const calls:string[]=[];
    const client=createRetargetJobClient({native:true,timeoutMs:action==='timeout'?100:1000,
      progressChannel:async()=>({channel:'owned',dispose:()=>{disposed++;}}),
      invoke:async<T,>(cmd:string)=>{calls.push(cmd);return(cmd==='retarget_bake_v1'?await new Promise<unknown>(r=>{complete=r;}):true) as T;}});
    const job=client.start(1),pending=client.bake(job,productionInput(f.input));
    const checked=assert.rejects(pending,action==='timeout'?/timed out/:RetargetCancelledError);
    while(!complete)await tick();
    if(action==='cancel')client.cancel();else if(action==='replace')client.start(2);else if(action==='dispose')client.dispose();
    await checked;complete({jobId:job.jobId,revision:job.revision,value:f.expected});await tick();
    assert.deepEqual(calls,['retarget_bake_v1','cancel_retarget_preflight_v1']);assert.equal(disposed,1);client.dispose();
  }
});

test('native bake malformed progress/result fails closed and leaves a fresh job usable',async()=>{
  const f=advancedFixtures().positives[0];
  for(const fault of ['nan','fraction','regress','total','stale-result','invalid-report','invalid-track','runtime']){
    let receive!:(v:unknown)=>void,disposed=0;const calls:string[]=[];
    const client=createRetargetJobClient({native:true,progressChannel:async fn=>{receive=fn;return{channel:'owned',dispose:()=>{disposed++;}};},
      invoke:async<T,>(cmd:string,args:Record<string,unknown>)=>{
        calls.push(cmd);if(cmd!=='retarget_bake_v1')return true as T;
        if(fault==='runtime')throw new Error('native worker failed');
        if(['nan','fraction','regress','total'].includes(fault)){
          receive({jobId:args.jobId,revision:args.revision,completed:1,total:1});
          receive({jobId:args.jobId,revision:args.revision,completed:fault==='nan'?NaN:fault==='fraction'?.5:0,total:fault==='total'?2:1});
        }
        const value=structuredClone(f.expected);
        if(fault==='invalid-report')value.clips[0].report.sampleCount=NaN;
        if(fault==='invalid-track')value.clips[0].clip.tracks[0].values=[];
        return {jobId:args.jobId,revision:fault==='stale-result'?-1:args.revision,value} as T;
      }});
    const job=client.start(1);await assert.rejects(client.bake(job,productionInput(f.input)),/invalid|stale|worker failed/);
    assert.equal(disposed,1);assert.ok(calls.includes('cancel_retarget_preflight_v1'));
    assert.equal(client.isCurrent(client.start(2)),true);client.dispose();
  }
});

test('cancellation while creating a native progress channel disposes it without starting a late bake',async()=>{
  const f=advancedFixtures().positives[0];let release!:(value:{channel:unknown;dispose:()=>void})=>void,disposed=0;
  const calls:string[]=[];
  const client=createRetargetJobClient({native:true,
    progressChannel:()=>new Promise(resolve=>{release=resolve;}),
    invoke:async<T,>(cmd:string)=>{calls.push(cmd);return true as T;}});
  const pending=client.bake(client.start(1),productionInput(f.input));
  const checked=assert.rejects(pending,RetargetCancelledError);
  while(!release)await tick();client.cancel();await checked;
  release({channel:'late',dispose:()=>{disposed++;}});await tick();
  assert.deepEqual(calls,['cancel_retarget_preflight_v1']);assert.equal(disposed,1);client.dispose();
});
