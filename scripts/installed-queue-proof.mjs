import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

// Reuse the independent test parser with the project's pinned TypeScript, also
// on supported Node releases that do not strip TypeScript during module loading.
const require=createRequire(new URL('../source/frontend/package.json',import.meta.url));
const ts=require('typescript'),parser={exports:{}};
const compiled=ts.transpileModule(fs.readFileSync(new URL('../source/frontend/tests/helpers/asset-evidence.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',compiled)(require,parser,parser.exports);
const {readAssetEvidence,sampleTrack}=parser.exports;
const {Matrix4,Quaternion,Vector3}=require('three');

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const tolerance=1e-5;
function asset(file){const bytes=fs.readFileSync(file);return {file,bytes,hash:hash(bytes),evidence:readAssetEvidence(bytes),doc:JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)))};}
function close(a,b,label){assert.equal(a.length,b.length,label+' length');let max=0;for(let i=0;i<a.length;i++){assert.ok(Number.isFinite(a[i])&&Number.isFinite(b[i]),label+' finite');max=Math.max(max,Math.abs(a[i]-b[i]));}assert.ok(max<=tolerance,`${label}: ${max} > ${tolerance}`);return max;}
function compare(a,b){
 const x=a.evidence,y=b.evidence;assert.deepEqual(y.joints,x.joints);assert.deepEqual(y.hierarchy,x.hierarchy);assert.equal(y.primitives.length,x.primitives.length);
 let attributes=0,binds=0,animation=0,samples=0;
 for(let i=0;i<x.primitives.length;i++){
  const s=x.primitives[i],v=y.primitives[i];assert.deepEqual(v.indices,s.indices);assert.deepEqual(v.material,s.material);
  for(const key of Object.keys(s.attributes))attributes=Math.max(attributes,close(v.attributes[key],s.attributes[key],`primitive${i}/${key}`));
  for(const key of Object.keys(v.attributes))assert.ok(key in s.attributes||key==='TANGENT','Undeclared generated attribute '+key);
 }
 assert.equal(x.binds.length,1,'This bounded proof selects a single-source-skin fixture.');
 for(const bind of y.binds)binds=Math.max(binds,close(bind,x.binds[0],'inverse binds'));
 assert.deepEqual(y.clips.map(c=>c.name),x.clips.map(c=>c.name));
 for(let i=0;i<x.clips.length;i++){
  const s=x.clips[i],v=y.clips[i];assert.ok(Math.abs(v.duration-s.duration)<=tolerance);
  assert.deepEqual(v.tracks.map(t=>[t.bone,t.path]),s.tracks.map(t=>[t.bone,t.path]));
  for(let j=0;j<s.tracks.length;j++){
   assert.equal(v.tracks[j].interpolation,s.tracks[j].interpolation);
   for(const time of new Set([0,s.duration/2,s.duration,...s.tracks[j].times,...v.tracks[j].times])){
    const before=sampleTrack(s.tracks[j],time),after=sampleTrack(v.tracks[j],time);
    if(s.tracks[j].path==='rotation'&&before.reduce((sum,k,index)=>sum+k*after[index],0)<0)after.forEach((k,index)=>after[index]=-k);
    animation=Math.max(animation,close(after,before,'animation samples'));samples++;
   }
  }
 }
 assert.deepEqual(y.images,x.images);
 return {maximumAttributeDifference:attributes,maximumBindDifference:binds,maximumAnimationDifference:animation,animationSamples:samples};
}
function points(asset,clip,time){
 const {doc,evidence:e}=asset,poses=e.poses.map(p=>({translation:[...p.translation],rotation:[...p.rotation],scale:[...p.scale]}));
 for(const track of e.clips[clip].tracks){const index=doc.nodes.findIndex(n=>n.name===track.bone);assert.ok(index>=0,'Unique named animated node');poses[index][track.path]=sampleTrack(track,time);}
 const parents=new Map();doc.nodes.forEach((n,i)=>n.children?.forEach(c=>parents.set(c,i)));const worlds=new Map();
 function world(i){if(worlds.has(i))return worlds.get(i);const p=poses[i],m=new Matrix4().compose(new Vector3().fromArray(p.translation),new Quaternion().fromArray(p.rotation).normalize(),new Vector3().fromArray(p.scale));if(parents.has(i))m.premultiply(world(parents.get(i)));worlds.set(i,m);return m;}
 const all=[];let primitive=0;
 for(let i=0;i<doc.nodes.length;i++){
  const node=doc.nodes[i];if(node.mesh===undefined)continue;
  for(const ignored of doc.meshes[node.mesh].primitives){
   void ignored;const p=e.primitives[primitive++],out=[];
   const vertices=p.indices.length?[...new Set(p.indices)]:Array.from({length:p.attributes.POSITION.length/3},(_,k)=>k);
   for(const vertex of vertices){const point=new Vector3().fromArray(p.attributes.POSITION,vertex*3),resolved=new Vector3();
    if(node.skin!==undefined){const skin=doc.skins[node.skin],bind=e.binds[node.skin];
     for(let k=0;k<4;k++){const weight=p.attributes.WEIGHTS_0[vertex*4+k];if(!weight)continue;const j=p.attributes.JOINTS_0[vertex*4+k];const matrix=world(skin.joints[j]).clone().multiply(new Matrix4().fromArray(bind,j*16));resolved.addScaledVector(point.clone().applyMatrix4(matrix),weight);}
    }else resolved.copy(point).applyMatrix4(world(i));
    out.push(...resolved.toArray());
   }all.push(out);
  }
 }
 return all;
}
export function verifyInstalledQueue(receiptPath){
 const bytes=fs.readFileSync(receiptPath),r=read(receiptPath),q=r.probe?.queue;
 assert.equal(r.status,'passed');assert.equal(r.scenario,'QueueWriteRetry');assert.equal(r.probe.status,'passed');assert.equal(q.status,'passed');
 for(const key of ['nativeWriteFailure','obstructionAcquired','obstructionReleased','completedOutputUnchanged','retrySucceeded','dirtyBeforeFailure','dirtyAfterFailure','pausedAtZero'])assert.equal(q[key],true,key);
 assert.match(q.failedUi,/Failed to install staged export[\s\S]*os error 32/);
 assert.equal(r.cleanup.activeJobProcesses,0);for(const key of ['jobTerminated','jobHandleClosed','workerHandleClosed','desktopClosed','inputHandleClosed'])assert.equal(r.cleanup[key],true,key);
 assert.equal(r.inputDesktopChanged,false);assert.equal(r.inputDesktopOwnedPickers,0);
 assert.equal(r.protectedRecovery?.kind,'canonical-known-folder','Canonical native recovery guard required');
 assert.equal(r.protectedRecovery.unchanged,true,'Default native recovery must remain unchanged');
 assert.deepEqual(r.protectedRecovery.after,r.protectedRecovery.before,'Protected recovery metadata');
 assert.equal(r.nativeProfile?.schema,'rustsmf.profile-session.v1','Native profile attestation required');
 assert.equal(r.nativeProfile.pid,r.probe.pid,'Profile belongs to the tested app');
 const profile=path.join(path.dirname(path.resolve(receiptPath)),'profile');
 for(const [actual,expected] of [[r.profile,profile],[r.nativeProfile.root,profile],[r.nativeProfile.nativeRecovery,path.join(profile,'native','rustsmf-recovery')],[r.nativeProfile.webview,path.join(profile,'webview')]])assert.equal(path.resolve(actual).toLowerCase(),path.resolve(expected).toLowerCase(),'Native profile ownership');
 assert.equal(r.privateRecovery?.exists,true,'Private recovery directory required');
 assert.ok(r.privateRecovery.files.some(f=>f.name==='rustsmf-autosave.rsproj'),'Actual private autosave required');
 for(const file of r.privateRecovery.files){
  assert.ok(['rustsmf-autosave.rsproj','rustsmf-autosave.rsproj.bak1','rustsmf-autosave.rsproj.bak2'].includes(file.name),'Recovery generation ownership');
  const full=path.join(profile,'native','rustsmf-recovery',file.name);assert.equal(hash(fs.readFileSync(full)),file.sha256,'Retained private recovery bytes');
 }
 const source=asset(r.fixture);assert.equal(source.hash,r.fixtureSha256.toLowerCase());
 const root=path.dirname(path.resolve(receiptPath));
 for(const file of [q.outputA,q.outputB,q.failedStageCopy,q.liveExport,q.obstructionPath])assert.equal(path.dirname(path.resolve(file)),root,'Output ownership');
 assert.equal(fs.existsSync(q.obstructionPath),false,'Owned obstruction stage removed');
 const a=asset(q.outputA),b=asset(q.outputB),failed=asset(q.failedStageCopy),live=asset(q.liveExport);
 assert.match(q.outputAModifiedTicks,/^[0-9]+$/,'Modification ticks must retain exact integer precision');
 assert.equal(fs.statSync(q.outputA,{bigint:true}).mtimeNs/100n+621355968000000000n,BigInt(q.outputAModifiedTicks),'A modification time unchanged');
 assert.equal(a.hash,q.hashA);assert.equal(b.hash,q.hashB);assert.equal(b.hash,failed.hash,'Retry emits the original failed captured bytes');
 assert.ok(!b.evidence.primitives.some(p=>p.name==='queue-live-edited'),'Queued captures retain their pre-edit names');
 assert.ok(live.evidence.primitives.some(p=>p.name==='queue-live-edited'),'Live authored model retained after failure/retry');
 const results=[a,b,live].map(value=>({file:value.file,...compare(source,value)}));let maximumWorldSkinDifference=0,worldSamples=0;
 for(let clip=0;clip<source.evidence.clips.length;clip++)for(let sample=0;sample<=8;sample++){
  const time=source.evidence.clips[clip].duration*sample/8,expected=points(source,clip,time);
  for(const output of [a,b,live]){const actual=points(output,clip,time);assert.equal(actual.length,expected.length);for(let i=0;i<expected.length;i++){maximumWorldSkinDifference=Math.max(maximumWorldSkinDifference,close(actual[i],expected[i],'world skin'));worldSamples+=actual[i].length/3;}}
 }
 return {schema:'rustsmf.installed-queue-independent.v1',status:'passed',receipt:{path:path.resolve(receiptPath),sha256:hash(bytes)},fixture:{path:source.file,sha256:source.hash},outputs:[a,b,failed,live].map(v=>({path:v.file,bytes:v.bytes.length,sha256:v.hash})),results,joints:source.evidence.joints.length,primitives:source.evidence.primitives.length,clips:source.evidence.clips.map(c=>c.name),maximumWorldSkinDifference,worldSamples,tolerance,scope:'Independent accessor, index/material/skin/bind, track and sampled world-skin comparison. Import primitive splitting, generated tangent attributes and the single explicit live rename are recorded; no app parser/validator or consumer engine is used.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const i=process.argv.indexOf('--receipt');assert.ok(i>=0&&process.argv[i+1],'--receipt required');const result=verifyInstalledQueue(process.argv[i+1]);const o=process.argv.indexOf('--out');if(o>=0)fs.writeFileSync(process.argv[o+1],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,primitives:result.primitives,clips:result.clips,worldSamples:result.worldSamples,maximumWorldSkinDifference:result.maximumWorldSkinDifference}));}
 catch(error){console.error(String(error.stack??error).slice(0,3000));process.exitCode=1;}
}
