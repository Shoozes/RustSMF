import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { loadDAE, loadFBX, loadGLB } from '../loaders';
import { detectModelFormat } from '../utils/modelFormat';
import { createModelResourceBundle } from '../utils/modelResourceBundle';
import { disposeThreeObject } from '../utils/threeDisposal';
import { mergeRetargetClips, profileClipOptions, type RetargetProfile } from '../utils/retargetProfile';
import { poseRangeSummary } from '../utils/poseRanges';
import { createRetargetJobClient, RetargetCancelledError, type RetargetJob, type TransferProgress } from '../workers/retargetJobClient';
import { assertTransferBoneCount, clipMetadata, rememberRetargetRest, restoreClip, snapshotClip, snapshotOptions, snapshotSkeleton } from '../workers/retargetSnapshot';
import type { AnalysisResultV1, ConventionV1, SkeletonSnapshotV1 } from '../workers/retargetAnalysisTypes';
import type { AnimationWorkspaceHistorySnapshot } from './editorSnapshots';
import type { TauriClient } from '../backend-client/tauri';

export interface TransferPreview { id:number; clips:THREE.AnimationClip[]; rest:SkeletonSnapshotV1; activeClip?:number }
export interface TransferPreviewPlayback { time:number; playing:boolean; speed:number; seekRevision:number }
const initialPlayback:TransferPreviewPlayback={time:0,playing:true,speed:1,seekRevision:0};
export interface TransferReview {
  phase:'idle'|'preparing'|'analysis'|'bake'|'review'|'preview'|'error';
  source:string; progress:TransferProgress|null; analysis:AnalysisResultV1|null; error:string;
  sourceConvention:ConventionV1; targetConvention:ConventionV1; overrides:Record<string,string>;
  sourceBones:string[]; targetBones:string[]; clipCount:number;
  reportNotes:string[];
}
const initial:TransferReview={phase:'idle',source:'',progress:null,analysis:null,error:'',
  sourceConvention:'auto',targetConvention:'auto',overrides:{},sourceBones:[],targetBones:[],clipCount:0,reportNotes:[]};
interface Options {
  root:THREE.Group|null; skeleton?:THREE.Skeleton; authoringRevision:number; mode:string;
  getClient:()=>Promise<TauriClient>;
  capture:()=>AnimationWorkspaceHistorySnapshot;
  apply:(before:AnimationWorkspaceHistorySnapshot,after:AnimationWorkspaceHistorySnapshot,profile?:RetargetProfile)=>void;
  setStatus:(message:string)=>void;
}
interface Prepared {
  source:SkeletonSnapshotV1; target:SkeletonSnapshotV1; sourceClips:THREE.AnimationClip[];
  targetClips:THREE.AnimationClip[]; before:AnimationWorkspaceHistorySnapshot; profile?:RetargetProfile;
  revision:number; root:THREE.Group; skeleton:THREE.Skeleton;
  sourceName:string;
}

export function useRetargetTransfer(options:Options) {
  const latest=useRef(options); latest.current=options;
  const [state,setState]=useState<TransferReview>(initial), [preview,setPreview]=useState<TransferPreview|null>(null);
  const [previewPlayback,setPreviewPlayback]=useState<TransferPreviewPlayback>(initialPlayback);
  const previewRef=useRef(preview);previewRef.current=preview;
  const prepared=useRef<Prepared|null>(null), candidate=useRef<AnimationWorkspaceHistorySnapshot|null>(null);
  const stateRef=useRef(state);stateRef.current=state;
  const clientRef=useRef<ReturnType<typeof createRetargetJobClient>|null>(null);
  if(!clientRef.current) clientRef.current=createRetargetJobClient({onProgress:progress=>setState(value=>({...value,phase:progress.phase,progress}))});
  const jobRef=useRef<RetargetJob|null>(null);
  const valid=useCallback((job:RetargetJob,data?:Prepared)=>!!clientRef.current?.isCurrent(job) && latest.current.mode==='animate' &&
    job.revision===latest.current.authoringRevision && (!data || (data.root===latest.current.root && data.skeleton===latest.current.skeleton)),[]);
  const discard=useCallback((message='Transfer discarded.')=>{
    clientRef.current?.cancel();jobRef.current=null;prepared.current=null;candidate.current=null;setPreview(null);setState(initial);
    latest.current.setStatus(message);
  },[]);
  const invalidate=useCallback(()=>{
    if(jobRef.current || prepared.current)discard('Transfer cleared after an input change. Choose source clips to review again.');
  },[discard]);
  useEffect(()=>{invalidate();},[options.authoringRevision,options.root,options.skeleton,invalidate]);
  useEffect(()=>{if(options.mode!=='animate')invalidate();},[options.mode,invalidate]);
  useEffect(()=>{
    if(!clientRef.current)clientRef.current=createRetargetJobClient({onProgress:progress=>setState(value=>({...value,phase:progress.phase,progress}))});
    const client=clientRef.current;
    return()=>{client.dispose();clientRef.current=null;jobRef.current=null;prepared.current=null;candidate.current=null;};
  },[]);

  const run=useCallback(async(data:Prepared,review:TransferReview)=>{
    const client=clientRef.current!,job=client.start(data.revision);jobRef.current=job;
    candidate.current=null;setPreview(null);
    setState({...review,phase:'analysis',error:'',analysis:null,progress:null,reportNotes:[]});
    try{
      const selected=data.profile?.retarget.clips?.length
        ? data.sourceClips.filter(clip=>data.profile!.retarget.clips!.includes(clip.name)):data.sourceClips;
      if(!selected.length || (data.profile?.retarget.clips && selected.length!==data.profile.retarget.clips.length))throw new Error('Profile selects missing source clips.');
      const analysis=await client.analyze(job,{apiVersion:1,source:data.source,target:data.target,
        sourceConvention:review.sourceConvention,targetConvention:review.targetConvention,
        manualMap:review.overrides,allowFuzzy:data.profile?.retarget.allowFuzzy??true,clips:selected.map(clipMetadata)});
      if(!valid(job,data))return;
      setState(value=>({...value,analysis,clipCount:selected.length,phase:'review',progress:null}));
      if(analysis.status==='blocked' || !analysis.mapping.ok){latest.current.setStatus('Review the transfer mapping before previewing.');return;}
      const result=await client.bake(job,{source:data.source,target:data.target,mapping:analysis.mapping,
        clips:selected.map(clip=>({clip:snapshotClip(clip),options:snapshotOptions(data.profile
          ?profileClipOptions(data.profile,clip,data.sourceClips,data.targetClips):{clipName:clip.name||'retargeted_clip'})}))});
      if(!valid(job,data))return;
      const added=result.clips.map(restoreClip);
      candidate.current={...data.before,baseClips:mergeRetargetClips(data.targetClips,added,data.profile?.retarget.replaceClips),currentClipName:added[0].name,currentTime:0};
      setPreviewPlayback(initialPlayback);
      setPreview({id:job.jobId,clips:added,rest:data.target});
      const reportNotes=result.reports.flatMap(report=>report.poseRanges?.issues.length?[poseRangeSummary(report.poseRanges)]:[]);
      setState(value=>({...value,phase:'preview',progress:null,error:'',reportNotes}));
      latest.current.setStatus(`Previewing ${added.length} transferred clip${added.length===1?'':'s'}. Apply to keep.`);
    }catch(cause){
      if(!valid(job,data) || cause instanceof RetargetCancelledError)return;
      const message=cause instanceof Error?cause.message:String(cause);
      setState(value=>({...value,phase:'error',error:message,progress:null}));latest.current.setStatus(`Transfer: ${message}`);
    }
  },[valid]);
  const chooseSource=useCallback(async(files:readonly File[],profile?:RetargetProfile)=>{
    const {root,skeleton,authoringRevision}=latest.current;
    if(!files.length)return;
    if(!root || !skeleton?.bones.length){latest.current.setStatus('Load a skinned target model first.');return;}
    const conventions={sourceConvention:stateRef.current.sourceConvention,targetConvention:stateRef.current.targetConvention};
    discard('Reading source clips…');
    const client=clientRef.current!,job=client.start(authoringRevision);jobRef.current=job;
    const review={...initial,...conventions,phase:'preparing' as const,source:files[0].name,overrides:{...profile?.retarget.manualMap}};
    setState(review);
    try{
      const data=await client.preparation(job,async()=>{
        assertTransferBoneCount(skeleton.bones.length);
        const result=await (await latest.current.getClient()).readBrowserModelFiles(files);
        if(!valid(job))throw new RetargetCancelledError();
        if(result.error)throw new Error(result.error);
        const format=detectModelFormat(result.name||'');
        if(!['fbx','dae','glb'].includes(format))throw new Error('Choose an FBX, DAE, GLB, or GLTF animation source.');
        if(!result.files?.length)throw new Error('The source has no readable files.');
        const entries=result.files.map(file=>{if(!file.data)throw new Error(`Source resource ${file.name} has no readable bytes.`);return{name:file.name,data:file.data};});
        const bundle=createModelResourceBundle(entries[0],entries.slice(1));
        const source=await(format==='fbx'?loadFBX(bundle):format==='dae'?loadDAE(bundle):loadGLB(bundle));
        try{
          if(!valid(job))throw new RetargetCancelledError();
          if(!source.skeleton?.bones.length)throw new Error('The animation source has no skeleton.');
          if(!source.clips.length)throw new Error('The animation source has no clips.');
          rememberRetargetRest(source.skeleton);
          const before=latest.current.capture();
          return {root,skeleton,revision:authoringRevision,profile,before,sourceName:result.name??files[0].name,
            source:snapshotSkeleton(source.skeleton),target:snapshotSkeleton(skeleton),sourceClips:source.clips.map(clip=>clip.clone()),
            targetClips:before.baseClips.map(clip=>{const copy=clip.clone();copy.name=profile?.targetClipNames[clip.name]??clip.name;return copy;})};
        }finally{source.mixer.stopAllAction();disposeThreeObject(source.root);}
      });
      if(!valid(job,data))return;
      prepared.current=data;
      const details={...review,source:data.sourceName,sourceBones:data.source.bones.map(i=>data.source.nodes[i].name),targetBones:data.target.bones.map(i=>data.target.nodes[i].name)};
      await run(data,details);
    }catch(cause){
      if(!valid(job) || cause instanceof RetargetCancelledError)return;
      const message=cause instanceof Error?cause.message:String(cause);
      setState(value=>({...value,phase:'error',error:message,progress:null}));latest.current.setStatus(`Transfer: ${message}`);
    }
  },[discard,run,valid]);
  const updateReview=useCallback((change:Partial<Pick<TransferReview,'sourceConvention'|'targetConvention'|'overrides'>>)=>{
    clientRef.current?.cancel();jobRef.current=null;candidate.current=null;setPreview(null);
    setState(value=>({...value,...change,phase:value.sourceBones.length?'review':'idle',analysis:null,error:'',progress:null,reportNotes:[]}));
  },[]);
  const review=useCallback(()=>{if(prepared.current)void run(prepared.current,stateRef.current);},[run]);
  const exportMapping=useCallback(async()=>{
    const data=prepared.current,mapping=stateRef.current.analysis?.mapping;
    if(!data || !mapping?.ok)return;
    try{
      const {saveFile}=await import('../backend-client/tauri');
      const profile={ $schema:'rustsmf.retarget-profile.v1',targetClipNames:data.profile?.targetClipNames??{},
        retarget:{...data.profile?.retarget,manualMap:{...mapping.map}} };
      await saveFile(new TextEncoder().encode(JSON.stringify(profile,null,2)+'\n'),'retarget-profile.json');
    }catch(cause){setState(value=>({...value,error:cause instanceof Error?cause.message:String(cause)}));}
  },[]);
  const apply=useCallback(()=>{
    const data=prepared.current,after=candidate.current,job=jobRef.current;
    if(!data || !after || !job || !valid(job,data)) {invalidate();return;}
    try{
      // Clear the preview before committing, so no second Apply can reuse the result.
      candidate.current=null;setPreview(null);
      latest.current.apply(data.before,after,data.profile);
      const count=stateRef.current.clipCount;discard(`Retargeted ${count} clip${count===1?'':'s'}${data.profile?' using the saved profile':''}.`);
    }catch(cause){const error=cause instanceof Error?cause.message:String(cause);setState(value=>({...value,phase:'error',error}));}
  },[discard,invalidate,valid]);
  const selectPreviewClip=(index:number)=>{
    if(!previewRef.current || !Number.isInteger(index) || index<0 || index>=previewRef.current.clips.length)return;
    setPreviewPlayback(initialPlayback);setPreview(value=>value?{...value,activeClip:index}:null);
  };
  const togglePreviewPlayback=useCallback(()=>setPreviewPlayback(value=>({...value,playing:!value.playing})),[]);
  const seekPreview=useCallback((time:number)=>{
    const current=previewRef.current;if(!current || !Number.isFinite(time))return;
    const duration=current.clips[current.activeClip??0].duration;
    setPreviewPlayback(value=>({...value,time:Math.min(duration,Math.max(0,time)),playing:false,seekRevision:value.seekRevision+1}));
  },[]);
  const setPreviewSpeed=useCallback((speed:number)=>{
    if(Number.isFinite(speed) && speed>0 && speed<=8)setPreviewPlayback(value=>({...value,speed}));
  },[]);
  const reportPreviewTime=useCallback((id:number,time:number)=>{
    if(jobRef.current?.jobId!==id || previewRef.current?.id!==id || !Number.isFinite(time))return;
    setPreviewPlayback(value=>value.playing?{...value,time}:value);
  },[]);
  return {state,preview,previewPlayback,chooseSource,apply,discard:()=>discard(),cancel:()=>discard('Transfer canceled; your work is unchanged.'),invalidate,updateReview,review,exportMapping,selectPreviewClip,
    togglePreviewPlayback,seekPreview,setPreviewSpeed,reportPreviewTime};
}
