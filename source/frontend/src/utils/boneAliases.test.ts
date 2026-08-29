import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { deriveMixamoMinimalBoneAliases, formatBoneDisplayName } from './boneAliases';

const layout = [
  ['SMF_Node_2', null], ['SMF_Node_3', 'SMF_Node_2'], ['SMF_Node_4', 'SMF_Node_3'],
  ['SMF_Node_6', 'SMF_Node_4'], ['SMF_Node_8', 'SMF_Node_6'], ['SMF_Node_10', 'SMF_Node_8'],
  ['SMF_Node_12', 'SMF_Node_4'], ['SMF_Node_13', 'SMF_Node_12'], ['SMF_Node_14', 'SMF_Node_13'],
  ['SMF_Node_15', 'SMF_Node_14'], ['SMF_Node_17', 'SMF_Node_4'], ['SMF_Node_18', 'SMF_Node_17'],
  ['SMF_Node_19', 'SMF_Node_18'], ['SMF_Node_21', 'SMF_Node_19'], ['SMF_Node_23', null],
  ['SMF_Node_24', 'SMF_Node_23'], ['SMF_Node_25', 'SMF_Node_24'], ['SMF_Node_27', 'SMF_Node_25'],
  ['SMF_Node_29', 'SMF_Node_27'], ['SMF_Node_31', null], ['SMF_Node_32', 'SMF_Node_31'],
  ['SMF_Node_33', 'SMF_Node_32'], ['SMF_Node_35', 'SMF_Node_33'], ['SMF_Node_37', 'SMF_Node_35'],
] as const;

function makeKnownSkeleton(): THREE.Bone[] {
  const root = new THREE.Group();
  const bones = new Map(layout.map(([name]) => [name, Object.assign(new THREE.Bone(), { name })]));
  for (const [name, parent] of layout) {
    (parent ? bones.get(parent) : root)?.add(bones.get(name)!);
  }
  return layout.map(([name]) => bones.get(name)!);
}

test('known indexed humanoid bones receive stable Mixamo display aliases', () => {
  const aliases = deriveMixamoMinimalBoneAliases(makeKnownSkeleton());
  assert.equal(aliases.size, 24);
  assert.equal(formatBoneDisplayName('SMF_Node_12', aliases), 'SMF_Node_12 · LeftArm');
  assert.equal(formatBoneDisplayName('SMF_Node_14', aliases), 'SMF_Node_14 · LeftHand');
});

test('unknown or structurally different indexed rigs do not receive guessed aliases', () => {
  const bones = makeKnownSkeleton();
  bones.find((bone) => bone.name === 'SMF_Node_14')!.name = 'CustomHand';
  assert.equal(deriveMixamoMinimalBoneAliases(bones).size, 0);
  assert.equal(formatBoneDisplayName('CustomHand', new Map()), 'CustomHand');
});
