import {test, expect} from '@playwright/test';
import {readdirSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {advancedFixtures, advancedReference} from '../scripts/retarget-advanced-fixtures';
import {coreBakeFixtures} from '../scripts/retarget-bake-fixtures';
import {productionInput} from '../scripts/retarget-production-fixtures';
import {restoreRustBake} from '../src/workers/retargetRustRuntime';
import type {BakeInput} from '../src/workers/retargetProtocol';

test('production worker runs the complete Rust WASM corpus with typed owned results and progress', async ({page}) => {
  test.setTimeout(60000);
  const assets=resolve('dist/assets'),workerName=readdirSync(assets).find(n=>/^retargetWorker-[^.]+\.js$/.test(n))!;
  const wasm=readdirSync(assets).filter(n=>/^retarget_core_bg-[^.]+\.wasm$/.test(n));
  expect(wasm).toHaveLength(1);expect(statSync(resolve(assets,wasm[0])).size).toBeLessThanOrEqual(1024*1024);
  const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('/');expect(requests.filter(url=>url.endsWith('.wasm'))).toEqual([]);
  const fixtures=[...advancedFixtures().positives,...coreBakeFixtures().positives];
  for(const f of fixtures){
    const input=productionInput(f.input),expected=restoreRustBake(advancedReference(input),f.input);
    const result=await page.evaluate(async({workerName,input})=>{
      // JSON transport to the test page must restore the copied typed buffers.
      const copy=(c:BakeInput['clips'][number]['clip'])=>({...c,tracks:c.tracks.map(t=>({...t,times:Float32Array.from(Object.values(t.times)),values:Float32Array.from(Object.values(t.values) as number[])}))});
      input.clips=input.clips.map(j=>({clip:copy(j.clip),options:{...j.options,
        ...(j.options.sourceReferenceClip?{sourceReferenceClip:copy(j.options.sourceReferenceClip)}:{}),
        ...(j.options.targetReferenceClip?{targetReferenceClip:copy(j.options.targetReferenceClip)}:{}),
        ...(j.options.endpointTargetClips?{endpointTargetClips:j.options.endpointTargetClips.map(copy)}:{})}}));
      const before=JSON.stringify(input),progress:number[]=[];
      const worker=new Worker(`/assets/${workerName}`,{type:'module'});
      try {
        const value=await new Promise<unknown>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('production worker timeout')),10000);
          worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
          worker.onmessage=e=>{
            if(e.data.jobId!==17 || e.data.revision!==29){clearTimeout(timer);reject(new Error('identity mismatch'));return;}
            if(e.data.type==='progress'){progress.push(e.data.completed);return;}
            clearTimeout(timer);if(e.data.type==='error')reject(new Error(e.data.message));else resolve(e.data.value);
          };
          worker.postMessage({jobId:17,revision:29,phase:'bake',input});
        });
        return {value:JSON.parse(JSON.stringify(value)),progress,unchanged:before===JSON.stringify(input)};
      } finally {worker.terminate();}
    },{workerName,input});
    expect(result.unchanged,f.name).toBe(true);expect(result.progress,f.name).toEqual(Array.from({length:input.clips.length+1},(_,i)=>i));
    // Parsed production Float32 buffers are compared independently of the worker adapter.
    const reference=expected;
    const compare=(actual:unknown,wanted:unknown,path:string):void=>{
      if(typeof actual==='number' && typeof wanted==='number'){
        if(Math.abs(actual-wanted)>1e-6*Math.max(1,Math.abs(wanted)))throw new Error(`${f.name}:${path}: ${actual} != ${wanted}`);return;
      }
      if(actual && wanted && typeof actual==='object' && typeof wanted==='object'){
        assert.deepEqual(Object.keys(actual).sort(),Object.keys(wanted).sort(),`${f.name}:${path}`);
        for(const key of Object.keys(wanted))compare(Reflect.get(actual,key),Reflect.get(wanted,key),`${path}.${key}`);return;
      }
      assert.deepEqual(actual,wanted,`${f.name}:${path}`);
    };
    compare(result.value,JSON.parse(JSON.stringify(reference)),'result');
  }
  expect(requests.some(url=>url.endsWith('.wasm'))).toBe(true);expect(errors).toEqual([]);
});
