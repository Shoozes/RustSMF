import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {sha256} from './installed-sable-fixtures.mjs';

// The existing test parser and Sable checks inspect accessors/skin/motion
// directly. No application loader, exporter, retarget code or engine is used.
const require=createRequire(new URL('../source/frontend/package.json',import.meta.url)),ts=require('typescript');
const helpers=new Map();
function helper(name){
 if(helpers.has(name))return helpers.get(name);
 const url=new URL(`../source/frontend/tests/helpers/${name}.ts`,import.meta.url),module={exports:{}};
 const code=fs.readFileSync(url,'utf8').replaceAll('import.meta.url',JSON.stringify(url.href));
 const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',compiled)(id=>id==='./asset-evidence'?helper('asset-evidence'):require(id),module,module.exports);
 helpers.set(name,module.exports);return module.exports;
}
export const {readAssetEvidence,sampleTrack}=helper('asset-evidence');
const {expectCatContinuity,catWorldMatrices,catSkinnedVertices}=helper('black-cat-evidence');
const {Quaternion,Vector3}=require('three');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
export function assertSableSession(r){
 assert.equal(r.schema,'rustsmf.installed-sabletransfer-session.v1');assert.equal(r.scenario,'SableTransfer');
 assert.equal(r.status,'passed');assert.equal(r.probe?.status,'passed');const s=r.probe.sable;assert.equal(s?.status,'passed');
 for(const key of ['pausedAtZero','animalSuggestions','correctionInvalidatedPreview','correctionReviewed','previewAtMidpoint','ambiguousUnresolved','applied','reopened'])assert.equal(s[key],true,key);
 assert.match(s.suggestedUi,/RIG_MAP_ANIMAL_REVIEW/);assert.match(s.ambiguousUi,/RIG_MAP_ANIMAL_CHAIN_UNRESOLVED/);
 assert.match(s.reopenedUi,/Loaded:/);assert.match(s.reopenedUi,/Workspace: Model/);
 if(s.reopenWarningShown)assert.equal(s.reopenConfirmedTaskSnapshot,true,'Owned saved project replacement was explicitly confirmed');
 assert.equal(JSON.parse(s.initialProfileReadback).retarget.manualMap.FrontUpper_L,'ForeUpper_R');
 assert.equal(JSON.parse(s.correctedProfileReadback).retarget.manualMap.FrontUpper_L,'ForeUpper_L');
 assert.match(s.correctionRoute,/Profile JSON/);
 assert.match(s.previewUi,/Preview time/);assert.doesNotMatch(s.previewUi,/Animation keyframe lane/);
 assert.equal(r.cleanup.activeJobProcesses,0);for(const key of ['jobTerminated','jobHandleClosed','workerHandleClosed','desktopClosed','inputHandleClosed'])assert.equal(r.cleanup[key],true,key);
 assert.equal(r.inputDesktopChanged,false);assert.equal(r.inputDesktopOwnedPickers,0);assert.ok(r.inputDesktopSamples>0);
 assert.equal(r.protectedRecovery?.kind,'canonical-known-folder');assert.equal(r.protectedRecovery.unchanged,true);assert.deepEqual(r.protectedRecovery.after,r.protectedRecovery.before);
 assert.equal(r.nativeProfile?.schema,'rustsmf.profile-session.v1');assert.equal(r.nativeProfile.pid,r.probe.pid);assert.equal(r.privateRecovery?.exists,true);assert.ok(r.privateRecovery.files.some(f=>f.name==='rustsmf-autosave.rsproj'));
 assert.ok(s.submissions.length>=11);for(const submission of s.submissions){assert.equal(submission.closed,true);assert.ok(!submission.error);}
 return s;
}
export function assertMappingEvidence(inputs,suggested,corrected,ambiguous){
 for(const profile of [suggested,corrected,ambiguous])assert.equal(profile.$schema,'rustsmf.retarget-profile.v1');
 assert.deepEqual(suggested.retarget.manualMap,inputs.motion.aliases,'All 24 reviewed aliases');
 assert.deepEqual(corrected.retarget.manualMap,inputs.motion.aliases,'Explicit correction restores only the intended mapping');
 const map=ambiguous.retarget.manualMap;
 for(const [source,target] of Object.entries(map)){assert.equal(target,inputs.ambiguous.aliases[source]);assert.ok(!source.startsWith('Tail')&&source!=='OpaqueLink'&&!target.startsWith('Tail'),'Unresolved tail cannot be rescued/guessed');}
 assert.equal(Object.keys(map).length,19,'The five ambiguous tail bones remain unmapped');
}
export function assertTransferredMotion(bytes,motionBytes,aliases){
 const out=readAssetEvidence(bytes),source=readAssetEvidence(motionBytes);
 assert.deepEqual(out.clips.map(c=>c.name).sort(),['Idle','Walk','Run','Sit','Installed Sable Motion'].sort());
 const clip=out.clips.find(c=>c.name==='Installed Sable Motion');assert.equal(clip.duration,1);
 // Same rest/hierarchy, renamed chains only: independent source world motion is
 // the oracle at every 30 Hz key and midpoint, including both endpoints.
 let maximumPositionDifference=0,maximumAngleDifference=0,maximumSkinDifference=0,skinSamples=0;
 const times=new Set(Array.from({length:61},(_,i)=>i/60));for(const track of clip.tracks)for(const time of track.times)times.add(time);
 for(const time of times){const actual=catWorldMatrices(bytes,clip.name,time),expected=catWorldMatrices(motionBytes,source.clips[0].name,time);
  for(const [from,to] of Object.entries(aliases)){
   const ap=new Vector3(),aq=new Quaternion(),as=new Vector3(),ep=new Vector3(),eq=new Quaternion(),es=new Vector3();
   assert.ok(actual.has(to)&&expected.has(from));actual.get(to).decompose(ap,aq,as);expected.get(from).decompose(ep,eq,es);
   maximumPositionDifference=Math.max(maximumPositionDifference,ap.distanceTo(ep));maximumAngleDifference=Math.max(maximumAngleDifference,aq.normalize().angleTo(eq.normalize()));assert.ok(as.distanceTo(es)<2e-5);
  }
  const av=catSkinnedVertices(bytes,clip.name,time),ev=catSkinnedVertices(motionBytes,source.clips[0].name,time);assert.equal(av.length,ev.length);
  for(let i=0;i<av.length;i++)maximumSkinDifference=Math.max(maximumSkinDifference,av[i].distanceTo(ev[i]));skinSamples+=av.length;
 }
 assert.ok(maximumPositionDifference<2e-5,`world translation drift ${maximumPositionDifference}`);assert.ok(maximumAngleDifference<2e-5,`world rotation drift ${maximumAngleDifference}`);assert.ok(maximumSkinDifference<2e-5,`world skin drift ${maximumSkinDifference}`);
 return {times:times.size,skinSamples,maximumPositionDifference,maximumAngleDifference,maximumSkinDifference,tolerance:2e-5};
}
function originalClips(bytes){
 const jlen=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+jlen));doc.animations=doc.animations.filter(a=>a.name!=='Installed Sable Motion');
 const json=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(j);const header=Buffer.from(bytes.subarray(0,20)),bin=bytes.subarray(20+jlen);header.writeUInt32LE(20+j.length+bin.length,8);header.writeUInt32LE(j.length,12);return Buffer.concat([header,j,bin]);
}
export function verifyInstalledSable(receiptPath){
 const receiptBytes=fs.readFileSync(receiptPath),r=read(receiptPath),s=assertSableSession(r),root=path.dirname(path.resolve(receiptPath));
 const manifestBytes=fs.readFileSync(r.transferManifest);assert.equal(sha256(manifestBytes),r.transferManifestSha256);const inputs=read(r.transferManifest);
 assert.equal(inputs.schema,'rustsmf.installed-sable-inputs.v1');assert.equal(inputs.target.path,r.fixture);assert.equal(inputs.target.sha256,r.fixtureSha256.toLowerCase());
 for(const input of [inputs.target,inputs.motion,inputs.ambiguous])assert.equal(sha256(fs.readFileSync(input.path)),input.sha256);
 assert.equal(sha256(fs.readFileSync(r.executable)),r.executableSha256,'Tested installed executable remains identified');
 const profile=path.join(root,'profile');for(const [actual,expected] of [[r.profile,profile],[r.nativeProfile.root,profile],[r.nativeProfile.nativeRecovery,path.join(profile,'native','rustsmf-recovery')],[r.nativeProfile.webview,path.join(profile,'webview')]])assert.equal(path.resolve(actual).toLowerCase(),path.resolve(expected).toLowerCase());
 for(const file of r.privateRecovery.files){assert.ok(['rustsmf-autosave.rsproj','rustsmf-autosave.rsproj.bak1','rustsmf-autosave.rsproj.bak2'].includes(file.name));assert.equal(sha256(fs.readFileSync(path.join(profile,'native','rustsmf-recovery',file.name))),file.sha256);}
 const keys=['baseline','previewExport','suggestedMapping','correctedMapping','correctedProfile','committed','project','reopenedExport','ambiguousMapping','afterDiscard'],outputs=keys.map(key=>{const p=path.resolve(s[key]);assert.equal(path.dirname(p),root,'Output ownership');const b=fs.readFileSync(p);return {key,path:p,sha256:sha256(b),bytes:b.length};});
 assertMappingEvidence(inputs,read(s.suggestedMapping),read(s.correctedMapping),read(s.ambiguousMapping));
 assert.deepEqual(read(s.correctedProfile).retarget.manualMap,{FrontUpper_L:'ForeUpper_L'},'Explicit corrected profile saved independently of project');
 const original=fs.readFileSync(inputs.target.path),baseline=fs.readFileSync(s.baseline),preview=fs.readFileSync(s.previewExport);expectCatContinuity(baseline,original);expectCatContinuity(preview,baseline);
 assert.deepEqual(readAssetEvidence(preview),readAssetEvidence(baseline),'Preview leaves canonical project/export unchanged');
 const committed=fs.readFileSync(s.committed),reopened=fs.readFileSync(s.reopenedExport),discarded=fs.readFileSync(s.afterDiscard),project=read(s.project);
 assert.equal(project.state.currentClipName,'Installed Sable Motion');const embedded=Buffer.from(project.asset.bytesBase64,'base64');
 expectCatContinuity(originalClips(committed),baseline);
 for(const [label,bytes] of [['saved project',embedded],['reopened',reopened],['ambiguous discard',discarded]])assert.deepEqual(readAssetEvidence(bytes),readAssetEvidence(committed),label+' retains all independent accessors and motion');
 const motion=assertTransferredMotion(committed,fs.readFileSync(inputs.motion.path),inputs.motion.aliases);
 return {schema:'rustsmf.installed-sable-independent.v1',status:'passed',receipt:{path:path.resolve(receiptPath),sha256:sha256(receiptBytes)},fixture:inputs.target,outputs,originalClips:4,committedClips:5,reviewedMappings:24,ambiguousMappings:19,unresolvedTailBones:5,motion,scope:'Native installed transfer/correction/save/reopen with independent accessor, texture, skin and world-motion inspection; no app parser, runtime hook, consumer engine or private producer recipe. Pixels are a separate observation.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const i=process.argv.indexOf('--receipt');assert.ok(i>=0&&process.argv[i+1],'--receipt required');const result=verifyInstalledSable(process.argv[i+1]);const o=process.argv.indexOf('--out');if(o>=0)fs.writeFileSync(process.argv[o+1],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,reviewedMappings:result.reviewedMappings,unresolvedTailBones:result.unresolvedTailBones,committedClips:result.committedClips,skinSamples:result.motion.skinSamples,maximumSkinDifference:result.motion.maximumSkinDifference}));}catch(error){console.error(String(error.stack??error).slice(0,3500));process.exitCode=1;}
}
