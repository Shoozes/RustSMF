import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sableMotion} from './installed-sable-fixtures.mjs';
import {readAssetEvidence,sampleTrack,assertSableSession,assertMappingEvidence,assertTransferredMotion} from './installed-sable-proof.mjs';

const target=fs.readFileSync(new URL('../examples/black-cat/sable.glb',import.meta.url)),valid=sableMotion(target),ambiguous=sableMotion(target,true);
function doc(bytes){return JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));}
function replaceDoc(bytes,json){const b=Buffer.from(JSON.stringify(json)),j=Buffer.alloc(Math.ceil(b.length/4)*4,32);b.copy(j);const h=Buffer.from(bytes.subarray(0,20)),bin=bytes.subarray(20+bytes.readUInt32LE(12));h.writeUInt32LE(20+j.length+bin.length,8);h.writeUInt32LE(j.length,12);return Buffer.concat([h,j,bin]);}
test('Sable fixtures preserve the original mesh/skin and author only known motion and naming variants',()=>{
 const before=readAssetEvidence(target),motion=readAssetEvidence(valid.bytes),unclear=readAssetEvidence(ambiguous.bytes);
 assert.deepEqual(motion.primitives,before.primitives);assert.deepEqual(motion.binds,before.binds);assert.deepEqual(motion.images,before.images);
 assert.deepEqual(unclear.primitives,motion.primitives);assert.deepEqual(doc(ambiguous.bytes).animations[0].channels,doc(valid.bytes).animations[0].channels);
 assert.equal(motion.joints.length,24);assert.equal(unclear.joints.includes('OpaqueLink'),true);assert.equal(unclear.joints.includes('Tail003'),false);
 for(const track of motion.clips[0].tracks){const q=sampleTrack(track,0),end=sampleTrack(track,1),mid=sampleTrack(track,.5);assert.deepEqual(q,end);const dot=Math.abs(q.reduce((sum,v,i)=>sum+v*mid[i],0)/(Math.hypot(...q)*Math.hypot(...mid)));assert.ok(Math.abs(2*Math.acos(dot)-Math.PI/15)<1e-6);}
});
test('independent mapping guard refuses inferred mappings through the interrupted tail',()=>{
 const inputs={motion:valid,ambiguous},profile=map=>({$schema:'rustsmf.retarget-profile.v1',retarget:{manualMap:map}});
 const map=Object.fromEntries(Object.entries(ambiguous.aliases).filter(([from])=>!from.startsWith('Tail')&&from!=='OpaqueLink'));
 assertMappingEvidence(inputs,profile(valid.aliases),profile(valid.aliases),profile(map));
 assert.throws(()=>assertMappingEvidence(inputs,profile(valid.aliases),profile(valid.aliases),profile({...map,OpaqueLink:'Tail03'})),/Unresolved tail/);
 assert.throws(()=>assertMappingEvidence(inputs,profile(valid.aliases),profile({...valid.aliases,FrontUpper_L:'ForeUpper_R'}),profile(map)),/Explicit correction/);
});
test('independent motion guard rejects an unchanged canonical clip masquerading as the transfer',()=>{
 const d=doc(valid.bytes);for(const node of d.nodes)node.name=valid.aliases[node.name]??node.name;d.animations=[...doc(target).animations,...d.animations];
 const known=replaceDoc(valid.bytes,d);const result=assertTransferredMotion(known,valid.bytes,valid.aliases);assert.ok(result.skinSamples>0);assert.ok(result.maximumSkinDifference<1e-12);
 const bad=structuredClone(d);bad.animations.at(-1).channels=bad.animations.at(-1).channels.filter(c=>d.nodes[c.target.node].name!=='ForeUpper_L');
 assert.throws(()=>assertTransferredMotion(replaceDoc(valid.bytes,bad),valid.bytes,valid.aliases),/world (translation|rotation|skin) drift/);
});
function receipt(){return {schema:'rustsmf.installed-sabletransfer-session.v1',scenario:'SableTransfer',status:'passed',probe:{status:'passed',pid:42,sable:{status:'passed',pausedAtZero:true,animalSuggestions:true,correctionInvalidatedPreview:true,correctionReviewed:true,previewAtMidpoint:true,ambiguousUnresolved:true,applied:true,reopened:true,suggestedUi:'RIG_MAP_ANIMAL_REVIEW',ambiguousUi:'RIG_MAP_ANIMAL_CHAIN_UNRESOLVED',previewUi:'Preview time',reopenedUi:'Workspace: Model\nLoaded: Sable',correctionRoute:'Public Profile JSON',initialProfileReadback:'{"retarget":{"manualMap":{"FrontUpper_L":"ForeUpper_R"}}}',correctedProfileReadback:'{"retarget":{"manualMap":{"FrontUpper_L":"ForeUpper_L"}}}',submissions:Array.from({length:11},()=>({closed:true}))}},cleanup:{activeJobProcesses:0,jobTerminated:true,jobHandleClosed:true,workerHandleClosed:true,desktopClosed:true,inputHandleClosed:true},inputDesktopChanged:false,inputDesktopOwnedPickers:0,inputDesktopSamples:1,protectedRecovery:{kind:'canonical-known-folder',unchanged:true,before:{files:[]},after:{files:[]}},nativeProfile:{schema:'rustsmf.profile-session.v1',pid:42},privateRecovery:{exists:true,files:[{name:'rustsmf-autosave.rsproj'}]}};}
test('installed proof cannot pass incomplete preview, unsafe recovery, active jobs or failed native submission',()=>{
 assertSableSession(receipt());
 for(const mutate of [r=>r.probe.sable.previewAtMidpoint=false,r=>r.probe.sable.reopened=false,r=>r.probe.sable.reopenedUi='Opening RustSMF project...',r=>r.probe.sable.correctedProfileReadback=r.probe.sable.initialProfileReadback,r=>r.cleanup.activeJobProcesses=1,r=>r.protectedRecovery.kind='test-sentinel',r=>r.protectedRecovery.after.files.push('changed'),r=>r.probe.sable.submissions[0].closed=false,r=>r.probe.sable.ambiguousUi='guess',r=>r.nativeProfile.pid=43]){const r=receipt();mutate(r);assert.throws(()=>assertSableSession(r));}
});
