import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import { retargetAnimationClip } from '../utils/animationRetarget';
import { buildRigMap } from '../utils/rigMapping';
import { RETARGET_OPTIONS, RETARGET_REPORTS } from './retargetInventory';
const root = fileURLToPath(new URL('../../../../',import.meta.url));
test('every current solver option and report field has a classified migration guard',()=>{
  const filename=path.join(root,'source/frontend/src/utils/animationRetarget.ts');
  const ast=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);
  for(const [name,registry] of [['AnimationRetargetOptions',RETARGET_OPTIONS],['AnimationRetargetReport',RETARGET_REPORTS]] as const){
    const declaration=ast.statements.find(node=>ts.isInterfaceDeclaration(node)&&node.name.text===name) as ts.InterfaceDeclaration;
    const fields=declaration.members.map(member=>(member.name as ts.Identifier).text).sort();
    assert.deepEqual(Object.keys(registry).sort(),fields);
    for(const value of Object.values(registry)){
      assert.ok(value.default.length>0);assert.ok(['core','advanced'].includes(value.slice));
      assert.ok(fs.existsSync(path.join(root,value.guard)),value.guard);
    }
  }
  for(const value of Object.values(RETARGET_OPTIONS)){assert.ok(value.adapter);assert.ok(value.refusal);}
});

test('inventory null/empty defaults match the actual retained TypeScript solver report',()=>{
  const rig=()=>{const root=new THREE.Bone();root.name='Root';const tip=new THREE.Bone();tip.name='Tip';tip.position.y=1;root.add(tip);root.updateMatrixWorld(true);return new THREE.Skeleton([root,tip]);};
  const source=rig(),target=rig();
  try {
    const mapping=buildRigMap(source,target,{manualMap:{Root:'Root',Tip:'Tip'}});
    const clip=new THREE.AnimationClip('Defaults',1,[new THREE.VectorKeyframeTrack('Root.position',[0,1],[0,0,0,1,0,0])]);
    const {report}=retargetAnimationClip(clip,source,target,mapping);
    assert.deepEqual(report.localReferenceCorrections,{});
    assert.equal(RETARGET_REPORTS.localReferenceCorrections.default,'empty object');
    for(const key of ['naturalMotion','poseRecovery','sampleRateHz','directionTransferBones','sourceReferenceClip','targetReferenceClip'] as const){
      assert.equal(report[key],null,key);assert.match(RETARGET_REPORTS[key].default,/^null /);
    }
  } finally {source.dispose();target.dispose();}
});
