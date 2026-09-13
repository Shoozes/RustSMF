import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSkinnedGlbFixtureInput} from '../../tests/helpers/skinned-glb-fixture';
import {parseGlbContainer} from './glbContainer';

const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function patchGlb(bytes:Buffer,mutate:(json:Record<string,unknown>)=>void):Buffer{
  const {json,binary}=parseGlbContainer(bytes);mutate(json);
  const text=Buffer.from(JSON.stringify(json)),jsonChunk=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(jsonChunk);
  const binChunk=Buffer.alloc(Math.ceil(binary.length/4)*4);binChunk.set(binary);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+binChunk.length,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binChunk.length);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jsonChunk,binHeader,binChunk]);
}
test('pose-review CLI preserves outputs, rejects ambiguous/remote inputs and reproduces terminal-inclusive diagnostics',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'rustsmf-pose-review-'));
  try{
    const model=path.join(directory,'model.glb'),profile=path.join(directory,'profile.json'),report=path.join(directory,'report.json');
    const bytes=(await createSkinnedGlbFixtureInput()).buffer;await writeFile(model,bytes);
    const ranges={schema:'rustsmf.pose-ranges.v1',id:'fixture',policy:'report',joints:[{bone:'FixtureTip',referenceRotation:[0,0,0,1],twistAxis:[0,1,0],bendAxis:[1,0,0],flexionDegrees:[-5,5],lateralDegrees:[-5,5],twistDegrees:[-5,5],maximumSwingDegrees:5}]};
    await writeFile(profile,JSON.stringify(ranges));
    const run=(args:string[])=>{const result=spawnSync(process.execPath,['--import','tsx','scripts/pose-review-cli.ts',...args],{cwd:frontend,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});assert.equal(result.error,undefined);return result;};
    const args=['--model',model,'--profile',profile,'--report',report];
    let result=run(args);assert.equal(result.status,2,result.stderr);
    const first=await readFile(report,'utf8'),review=JSON.parse(first);assert.equal(review.status,'review-required');assert.ok(review.clips[0].issues.length);assert.equal(review.clips[0].times.at(-1),0.5);assert.equal(review.clips[0].sampleCount,31);
    const repeat=path.join(directory,'repeat.json');result=run([...args.slice(0,-1),repeat]);assert.equal(result.status,2,result.stderr);assert.equal(await readFile(repeat,'utf8'),first);
    result=run(args);assert.equal(result.status,1);assert.match(result.stderr,/Output already exists/);assert.equal(await readFile(report,'utf8'),first);
    const calibration=path.join(directory,'calibration.json');result=run(['--model',model,'--calibrate-mixamo',calibration,'--reference-clip','FixtureBend','--report',report]);assert.equal(result.status,1);await assert.rejects(access(calibration));
    const rejectedReport=path.join(directory,'rejected.json');
    for(const [mutate,message] of [
      [(json:Record<string,unknown>)=>{json.images=[{uri:'http://127.0.0.1:1/never-open.png'}];},/external URIs/],
      [(json:Record<string,unknown>)=>{const nodes=json.nodes as {name:string}[],joints=(json.skins as {joints:number[]}[])[0].joints;nodes[joints[1]].name=nodes[joints[0]].name;},/Ambiguous.*bone/],
      [(json:Record<string,unknown>)=>{const clips=json.animations as unknown[];clips.push(clips[0]);},/Ambiguous.*clip/],
    ] as const){
      await writeFile(model,patchGlb(bytes,mutate));result=run(['--model',model,'--profile',profile,'--report',rejectedReport]);assert.equal(result.status,1,result.stdout);assert.match(result.stderr,message);await assert.rejects(access(rejectedReport));
    }
    await writeFile(model,bytes);result=run(['--model',model,'--calibrate-mixamo',calibration,'--reference-clip','Missing','--report',rejectedReport]);assert.equal(result.status,1);assert.match(result.stderr,/Reference clip is missing/);await assert.rejects(access(calibration));
    for(const joint of ranges.joints){joint.flexionDegrees=[-180,180];joint.lateralDegrees=[-180,180];joint.twistDegrees=[-180,180];joint.maximumSwingDegrees=180;}
    await writeFile(profile,JSON.stringify(ranges));result=run(['--model',model,'--profile',profile,'--report',rejectedReport]);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(await readFile(rejectedReport,'utf8')).status,'within-profile');
  }finally{
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('rustsmf-pose-review-'));await rm(directory,{recursive:true,force:true});
  }
});
