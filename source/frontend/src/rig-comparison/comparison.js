import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const $=id=>document.getElementById(id), canvas=document.querySelector('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setScissorTest(true);
const views=[];let frame=0,playing=false,disposed=false,last=0,elapsed=0,animation;
const abort=new AbortController();
function selectClip(){
  playing=false;$('play').textContent='Play';frame=0;
  const durations=[];
  for(const view of views){
    view.mixer.stopAllAction();const clip=view.asset.animations.find(clip=>clip.name===$('clip').value);
    if(!clip)throw new Error(`Missing target clip: ${$('clip').value}`);
    view.action=view.mixer.clipAction(clip);view.action.setLoop(THREE.LoopOnce,1);view.action.clampWhenFinished=true;view.action.play();durations.push(clip.duration);
  }
  $('frame').max=String(Math.floor(Math.min(...durations)*60+1e-4));draw();
}
function draw(){
  if(disposed)return;
  const width=canvas.clientWidth,height=canvas.clientHeight;renderer.setSize(width,height,false);
  $('frame').value=String(frame);$('position').value=String(frame);
  views.forEach((view,index)=>{
    view.action.paused=false;view.mixer.setTime(Math.fround(frame/60));view.wrapper.updateMatrixWorld(true);
    const left=Math.floor(index*width/3),right=Math.floor((index+1)*width/3);
    const mode=$('view').value;view.camera.aspect=(right-left)/height;
    const distance=Math.max(6,5.2/(2*Math.tan(THREE.MathUtils.degToRad(17.5))*view.camera.aspect));
    view.camera.position.set(mode==='front'?0:distance*(mode==='side'?1:.707),1.5,mode==='side'?0:distance*(mode==='front'?1:.707));
    view.camera.lookAt(0,1,0);view.camera.updateProjectionMatrix();
    view.skeletons.forEach(helper=>{helper.visible=$('bones').checked;helper.updateMatrixWorld(true);});
    renderer.setViewport(left,0,right-left,height);renderer.setScissor(left,0,right-left,height);renderer.render(view.scene,view.camera);
  });
}
function tick(time){
  if(disposed)return;
  if(playing){elapsed+=Math.min((time-last)/1000,.1);if(elapsed>=1/30){frame=(frame+1)%(Number($('frame').max)+1);elapsed=0;draw();}}
  last=time;animation=requestAnimationFrame(tick);
}
const resize=new ResizeObserver(draw);resize.observe(canvas);
$('clip').onchange=()=>{try{selectClip();}catch(error){$('error').textContent=error.message;}};
$('frame').oninput=()=>{playing=false;$('play').textContent='Play';frame=Number($('frame').value);draw();};
$('play').onclick=()=>{playing=!playing;elapsed=0;$('play').textContent=playing?'Pause':'Play';};
$('view').onchange=draw;$('bones').onchange=draw;
try{
 const response=await fetch('/models.json',{signal:abort.signal});if(!response.ok)throw new Error('Cannot read comparison manifest');const info=await response.json();
 const loader=new GLTFLoader();
 for(const url of ['/source.glb','/fitted.glb','/template.glb']){
  const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw new Error(`Cannot load ${url}`);
  const asset=await loader.parseAsync(await response.arrayBuffer(),'');
  if(disposed)throw new Error('Comparison closed while loading');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8e8df');
  const wrapper=new THREE.Group();wrapper.add(asset.scene);scene.add(wrapper);
  const mixer=new THREE.AnimationMixer(asset.scene),clip=asset.animations.find(clip=>clip.name==='idle')??asset.animations[0];
  if(!clip)throw new Error('Model has no animation');mixer.clipAction(clip).play();mixer.setTime(0);asset.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(asset.scene,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Invalid model bounds');
  wrapper.scale.setScalar(2/size.y);wrapper.position.set(-center.x*wrapper.scale.x,-bounds.min.y*wrapper.scale.y,-center.z*wrapper.scale.z);
  scene.add(new THREE.HemisphereLight(0xffffff,0x6f7666,1.2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(4,8,6);scene.add(light);
  scene.add(new THREE.GridHelper(8,16,0x8e9c7a,0xc6cbbd));
  const skeletons=[];asset.scene.traverse(node=>{if(node.isSkinnedMesh&&!skeletons.length){const helper=new THREE.SkeletonHelper(node.skeleton.bones[0]);helper.visible=false;scene.add(helper);skeletons.push(helper);}});
  views.push({asset,scene,wrapper,mixer,skeletons,camera:new THREE.PerspectiveCamera(35,1,.01,100)});
 }
 const common=info.clips.filter(name=>views.every(view=>view.asset.animations.some(clip=>clip.name===name)));
 if(!common.length)throw new Error('No shared clips');for(const name of common){const option=document.createElement('option');option.value=name;option.textContent=name;$('clip').append(option);}
 $('clip').value=common.includes('attack')?'attack':common[0];selectClip();for(const id of ['clip','play','frame'])$(id).disabled=false;
 $('status').textContent='Shared frame • half-speed playback • equal displayed rest height • original materials';
 animation=requestAnimationFrame(tick);
}catch(error){$('error').textContent=error.message;}
addEventListener('pagehide',()=>{
 disposed=true;abort.abort();cancelAnimationFrame(animation);resize.disconnect();
 const disposedResources=new Set();for(const view of views){view.mixer.stopAllAction();view.mixer.uncacheRoot(view.asset.scene);view.scene.traverse(node=>{
  for(const resource of [node.geometry,node.skeleton,...(Array.isArray(node.material)?node.material:[node.material])]){
   if(resource?.dispose&&!disposedResources.has(resource)){
    for(const value of Object.values(resource)){if(value?.isTexture&&!disposedResources.has(value)){disposedResources.add(value);value.dispose();}}
    disposedResources.add(resource);resource.dispose();
   }
  }
 });}renderer.dispose();
});
