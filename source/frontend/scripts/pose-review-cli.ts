import {lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import * as THREE from 'three';
import {loadGLB,type LoadedModel} from '../src/loaders/glb';
import {bytesToArrayBuffer} from '../src/loaders/smfBinary';
import {parseGlbContainer} from '../src/utils/glbContainer';
import {calibrateMixamoPoseRanges} from '../src/utils/humanoidPoseRanges';
import {auditPoseRanges,parsePoseRangeProfile} from '../src/utils/poseRanges';
import {buildFittedComparisonSchedule,boundedFloat32SampleTime} from '../src/utils/fittedRigTiming';
import {disposeThreeObject} from '../src/utils/threeDisposal';
import {readFileBounded} from './bounded-file-read';
import {installNodeThreeRuntime} from './node-three-runtime';

const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
async function main(){
  const args=process.argv.slice(2),options=new Map<string,string>();
  for(let i=0;i<args.length;i+=2){
    if(!['--model','--profile','--calibrate-mixamo','--reference-clip','--report'].includes(args[i])||!args[i+1]||options.has(args[i]))throw new Error('Usage: pose-review --model <absolute embedded GLB> (--profile <absolute JSON> | --calibrate-mixamo <fresh absolute profile JSON> --reference-clip <name>) --report <fresh absolute JSON>');
    options.set(args[i],args[i+1]);
  }
  const modelPath=options.get('--model'),reportPath=options.get('--report'),profilePath=options.get('--profile'),calibrationPath=options.get('--calibrate-mixamo');
  if(!modelPath||!reportPath||Boolean(profilePath)===Boolean(calibrationPath))throw new Error('Model, report and exactly one profile mode are required');
  for(const file of [modelPath,reportPath,profilePath??calibrationPath!])if(!path.isAbsolute(file))throw new Error('All file paths must be absolute');
  if(profilePath&&options.has('--reference-clip'))throw new Error('Saved profiles already contain calibration; --reference-clip requires --calibrate-mixamo');
  if(calibrationPath&&!options.has('--reference-clip'))throw new Error('Choose a reviewed neutral reference clip for Mixamo calibration');
  if(new Set([modelPath,reportPath,profilePath??calibrationPath!].map(file=>path.resolve(file).toLowerCase())).size!==3)throw new Error('Input/profile/report paths must be distinct');
  for(const file of [reportPath,...(calibrationPath?[calibrationPath]:[])]){
    try{await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
    throw new Error(`Output already exists: ${file}`);
  }
  const bytes=await readFileBounded(modelPath,128*1024*1024),{json}=parseGlbContainer(bytes);
  if(json.buffers?.some(buffer=>buffer.uri)||json.images?.some(image=>image.uri))throw new Error('Pose review requires embedded GLB resources; external URIs are not opened');
  // GLTFLoader renames duplicate nodes. Reject ambiguous source identities before
  // that repair can silently redirect a saved calibration to another bone.
  if(!Array.isArray(json.nodes)||!Array.isArray(json.skins)||!json.skins.length)throw new Error('Pose review requires named skin joints');
  const nodes=json.nodes as {name?:unknown}[],skins=json.skins as {joints?:unknown}[];
  const jointSets=skins.map(skin=>{
    if(!Array.isArray(skin.joints)||!skin.joints.length||skin.joints.length>256||skin.joints.some(i=>!Number.isInteger(i)||i<0||i>=nodes.length)||new Set(skin.joints).size!==skin.joints.length)throw new Error('Expected 1–256 distinct valid skin joint indices');
    return [...new Set(skin.joints as number[])].sort((a,b)=>a-b);
  });
  if(jointSets.some(joints=>JSON.stringify(joints)!==JSON.stringify(jointSets[0])))throw new Error('Pose review requires one shared skeleton; split independent rigs');
  const sourceNameCounts=new Map<unknown,number>();for(const node of nodes)sourceNameCounts.set(node.name,(sourceNameCounts.get(node.name)??0)+1);
  for(const i of jointSets[0]){
    const name=nodes[i].name;
    if(typeof name!=='string'||!name.trim()||sourceNameCounts.get(name)!==1)throw new Error('Ambiguous or unnamed bone in source GLB');
  }
  const clipNames=json.animations?.map(clip=>clip.name)??[];
  if(!clipNames.length||clipNames.some(name=>typeof name!=='string'||!name.trim())||new Set(clipNames).size!==clipNames.length)throw new Error('Ambiguous or unnamed animation clip in source GLB');
  installNodeThreeRuntime();let model:LoadedModel|undefined;
  try{
    model=await loadGLB(bytesToArrayBuffer(bytes));const {skeleton,root,mixer,clips}=model;
    if(!skeleton||clips.length<1||clips.length>256)throw new Error('Pose review requires a skeleton and 1–256 clips');
    if(new Set(skeleton.bones.map(b=>b.name)).size!==skeleton.bones.length||new Set(clips.map(c=>c.name)).size!==clips.length)throw new Error('Ambiguous loaded bone or animation identity');
    const originals=skeleton.bones.map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));
    const restore=()=>{mixer.stopAllAction();for(const p of originals){p.bone.position.copy(p.position);p.bone.quaternion.copy(p.quaternion);p.bone.scale.copy(p.scale);}root.updateMatrixWorld(true);};
    let profile;
    if(calibrationPath){
      const reference=clips.find(clip=>clip.name===options.get('--reference-clip'));if(!reference)throw new Error('Reference clip is missing');
      mixer.clipAction(reference).play();mixer.setTime(0);root.updateMatrixWorld(true);
      profile=calibrateMixamoPoseRanges(skeleton);restore();
    }else profile=parsePoseRangeProfile(JSON.parse(new TextDecoder().decode(await readFileBounded(profilePath!,1024*1024))));
    const profileBytes=JSON.stringify(profile,null,2)+'\n';
    const names=new Map(skeleton.bones.map(bone=>[bone.name,bone]));
    const reports=[];let totalSamples=0;
    for(const clip of clips){
      restore();const times=buildFittedComparisonSchedule(clip.duration,60);totalSamples+=times.length;
      if(totalSamples>200000)throw new Error('Pose review exceeds 200000 samples; split the model clips');
      const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();let current=-1;
      const report=auditPoseRanges(profile,clip.name,times.length,new Set(names.keys()),(frame,bone)=>{
        if(frame!==current){mixer.setTime(boundedFloat32SampleTime(times[frame],clip.duration));current=frame;}
        return names.get(bone)!.quaternion.clone();
      });
      reports.push({...report,times});
    }
    restore();const flagged=reports.filter(report=>report.issues.length);
    const report={schema:'rustsmf.pose-review.v1',status:flagged.length?'review-required':'within-profile',scope:'calibrated angular envelopes; not medical ranges, skin/contact proof or visual acceptance',modelPath,modelSha256:sha(bytes),profileSha256:sha(profileBytes),profile,calibrationReference:options.get('--reference-clip')??null,sampleRateHz:60,totalSamples,clips:reports};
    if(calibrationPath)await writeFile(calibrationPath,profileBytes,{flag:'wx'});
    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,report:reportPath,clips:reports.length,flaggedClips:flagged.length,issues:flagged.reduce((n,r)=>n+r.issues.length,0)}));
    process.exitCode=flagged.length?2:0;
  }finally{if(model){model.mixer.stopAllAction();model.mixer.uncacheRoot(model.root);disposeThreeObject(model.root);}}
}
main().catch(error=>{console.error(JSON.stringify({status:'failed',error:error instanceof Error?error.message:String(error)}));process.exitCode=1;});
