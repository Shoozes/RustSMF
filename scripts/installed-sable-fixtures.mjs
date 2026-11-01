import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Test-owned motion on the original MIT Sable rig. No producer recipe, app
// exporter, private motion, external checkout or consumer engine is involved.
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sableMotion(bytes,ambiguous=false){
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
 const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
 const offset=20+jsonLength;assert.equal(bytes.readUInt32LE(offset+4),0x004e4942);
 assert.equal(doc.skins.length,1);assert.equal(doc.skins[0].joints.length,24);
 const bins=[bytes.subarray(offset+8,offset+8+bytes.readUInt32LE(offset))];let length=bins[0].length;
 const add=(values,type)=>{
  const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeFloatLE(v,i*4));
  const view=doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:b.length})-1;bins.push(b);length+=b.length;
  return doc.accessors.push({bufferView:view,componentType:5126,count:values.length/(type==='VEC4'?4:1),type,...(type==='SCALAR'?{min:[0],max:[1]}:{})})-1;
 };
 const time=add([0,.5,1],'SCALAR'),channels=[],samplers=[];
 for(const name of ['ForeUpper_L','Tail03']){
  const node=doc.nodes.findIndex(n=>n.name===name);assert.ok(node>=0);
  const q=doc.nodes[node].rotation??[0,0,0,1],norm=Math.hypot(...q),[x,y,z,w]=q.map(v=>v/norm);
  // 12 degrees about the joint's local Z, rest at both endpoints.
  const s=Math.sin(Math.PI/30),c=Math.cos(Math.PI/30),middle=[x*c+y*s,y*c-x*s,z*c+w*s,w*c-z*s];
  const output=add([...q.map(v=>v/norm),...middle,...q.map(v=>v/norm)],'VEC4');
  samplers.push({input:time,output,interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node,path:'rotation'}});
 }
 const aliases={};
 for(const i of doc.skins[0].joints){const n=doc.nodes[i],original=n.name;
  n.name=n.name.replace(/^Fore/,'Front').replace(/^Hind/,'Rear').replace(/^Tail0/,'Tail00');
  if(ambiguous&&original==='Tail03')n.name='OpaqueLink';aliases[n.name]=original;
 }
 doc.animations=[{name:ambiguous?'Ambiguous Sable Motion':'Installed Sable Motion',samplers,channels}];
 doc.buffers=[{byteLength:length}];doc.asset.generator='RustSMF installed Sable test fixture v1';
 const json=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(j);
 const bin=Buffer.concat(bins),header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
 return {bytes:Buffer.concat([header,j,bh,bin]),aliases};
}
export function writeSableFixtures(output){
 fs.mkdirSync(output,{recursive:false});
 const original=path.resolve(import.meta.dirname,'../examples/black-cat/sable.glb'),source=fs.readFileSync(original);
 const manifest={schema:'rustsmf.installed-sable-inputs.v1',target:{path:original,sha256:sha256(source)},motion:null,ambiguous:null,scope:'Original Sable with two authored local-Z 12-degree triangular rotations; same mesh, skin, rest transforms and hierarchy. Ambiguous variant interrupts the deform tail chain with OpaqueLink. No optional engine or private producer fixtures.'};
 for(const [key,ambiguous] of [['motion',false],['ambiguous',true]]){
  const fixture=sableMotion(source,ambiguous),file=path.join(path.resolve(output),key+'.glb');fs.writeFileSync(file,fixture.bytes,{flag:'wx'});manifest[key]={path:file,sha256:sha256(fixture.bytes),bytes:fixture.bytes.length,aliases:fixture.aliases};
 }
 const file=path.join(output,'inputs.json');fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return {path:path.resolve(file),sha256:sha256(fs.readFileSync(file)),target:manifest.target};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const i=process.argv.indexOf('--out');assert.ok(i>=0&&process.argv[i+1],'--out <fresh absolute directory> required');assert.ok(path.isAbsolute(process.argv[i+1]));console.log(JSON.stringify(writeSableFixtures(process.argv[i+1])));
}
