import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyPreparedMaterialRepair,
  assertMaterialRepairPreservedModel,
  captureMaterialRepairFingerprint,
  describeTargetMeshes,
  parseMtlMaterialDefinitions,
  parseObjMaterialReference,
  planMaterialRepair,
  prepareMaterialRepair,
} from './materialRepair';

const OBJ = [
  'mtllib fighter.mtl',
  'o fighter_mesh',
  'v 0 0 0',
  'v 1 0 0',
  'v 1 1 0',
  'v 0 1 0',
  'usemtl fighter_mat',
  'f 1/1 2/2 3/3 4/4',
].join('\n');

const MTL = [
  'newmtl fighter_mat',
  'Kd 0.5 0.6 0.7',
  'map_Kd fighter_basecolor.JPEG',
  'map_Bump -bm 1 fighter_normal.PNG',
  'map_Pr fighter_roughness.PNG',
  'map_Pm fighter_metallic.PNG',
].join('\n');

function makeTarget(): { root: THREE.Group; mesh: THREE.SkinnedMesh; clip: THREE.AnimationClip } {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(24).fill(0), 4));
  const weights = new Array(24).fill(0);
  for (let index = 0; index < weights.length; index += 4) weights[index] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const bone = new THREE.Bone();
  bone.name = 'mixamorigHips';
  root.add(bone);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ name: '__DEFAULT' }));
  mesh.name = 'fighter_mesh';
  root.add(mesh);
  mesh.bind(new THREE.Skeleton([bone]));
  const clip = new THREE.AnimationClip('idle', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  return { root, mesh, clip };
}

test('OBJ/MTL reference produces a deterministic name and geometry repair plan', () => {
  const reference = parseObjMaterialReference(OBJ, MTL, [
    'fighter_basecolor.JPEG',
    'fighter_normal.PNG',
    'fighter_roughness.PNG',
    'fighter_metallic.PNG',
  ]);
  const { root } = makeTarget();
  const plan = planMaterialRepair(describeTargetMeshes(root), reference.meshes);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.assignments.map((assignment) => ({
    target: assignment.targetMeshName,
    reference: assignment.referenceMeshName,
    method: assignment.method,
  })), [{ target: 'fighter_mesh', reference: 'fighter_mesh', method: 'name-and-geometry' }]);
  assert.deepEqual(reference.materials[0].textures, {
    baseColor: 'fighter_basecolor.JPEG',
    normal: 'fighter_normal.PNG',
    roughness: 'fighter_roughness.PNG',
    metallic: 'fighter_metallic.PNG',
  });
});

test('material repair changes only material assignments', async () => {
  const reference = parseObjMaterialReference(OBJ, MTL, []);
  const { root, mesh, clip } = makeTarget();
  const before = captureMaterialRepairFingerprint(root, [clip]);
  const prepared = await prepareMaterialRepair(root, reference);
  applyPreparedMaterialRepair(prepared);
  assertMaterialRepairPreservedModel(before, root, [clip]);
  assert.equal(Array.isArray(mesh.material), false);
  assert.equal((mesh.material as THREE.Material).name, 'fighter_mat');
});

test('material preservation ignores a concurrently evaluated animation pose', () => {
  const { root, mesh, clip } = makeTarget();
  const before = captureMaterialRepairFingerprint(root, [clip]);
  mesh.skeleton.bones[0].quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  assert.doesNotThrow(() => assertMaterialRepairPreservedModel(before, root, [clip]));
});

test('ambiguous inferred texture names fail closed', () => {
  assert.throws(() => parseMtlMaterialDefinitions('newmtl fighter_mat', [
    'fighter_basecolor.jpg',
    'fighter_albedo.png',
  ]), /multiple inferred baseColor texture candidates/);
});

test('same geometry signatures without unique names fail as ambiguous', () => {
  const { root } = makeTarget();
  const targets = describeTargetMeshes(root);
  const reference = parseObjMaterialReference(OBJ, MTL, []).meshes[0];
  const plan = planMaterialRepair(targets, [
    { ...reference, name: 'one' },
    { ...reference, name: 'two' },
  ]);
  assert.equal(plan.ok, false);
  assert.ok(plan.diagnostics.some((item) => item.code === 'MATERIAL_REPAIR_AMBIGUOUS_MATCH'));
});

test('material repair disposes textures acquired before a later texture load fails', async () => {
  const reference = parseObjMaterialReference(OBJ, MTL, []);
  const { root } = makeTarget();
  const texture = new THREE.Texture();
  let disposeCount = 0;
  texture.addEventListener('dispose', () => {
    disposeCount += 1;
  });

  await assert.rejects(
    prepareMaterialRepair(root, reference, async (_resource, semantic) => {
      if (semantic === 'normal') throw new Error('normal texture failed');
      return texture;
    }),
    /normal texture failed/,
  );
  assert.equal(disposeCount, 1);
});
