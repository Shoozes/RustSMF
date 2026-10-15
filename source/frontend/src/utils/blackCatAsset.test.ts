import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { BLACK_CAT_MANIFEST, CAT_CLIPS, blackCatBytes, catWorldMatrices, catSkinnedVertices, catSampleTimes, expectCatLoop, expectCatMotionContinuity } from '../../tests/helpers/black-cat-evidence';
import { expectMotion, readAssetEvidence } from '../../tests/helpers/asset-evidence';
import { parseRetargetProfile } from './retargetProfile';
import { buildRigMap } from './rigMapping';
import { loadGLB } from '../loaders/glb';
import { disposeThreeObject } from './threeDisposal';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { PNG } from 'pngjs';

test('original cat files match their portable manifest and contain no external resources', () => {
  const manifest = JSON.parse(fs.readFileSync(BLACK_CAT_MANIFEST, 'utf8'));
  assert.equal(manifest.id, 'SAMPLE-SABLE-001'); assert.equal(manifest.license, 'MIT');
  const generator = fs.readFileSync(path.join(path.dirname(BLACK_CAT_MANIFEST), manifest.generator.path));
  assert.ok(!generator.includes(13), 'the hashed recipe uses canonical LF on every checkout');
  assert.match(fs.readFileSync(path.resolve(path.dirname(BLACK_CAT_MANIFEST), '../../.gitattributes'), 'utf8'), /^\/examples\/black-cat\/build_black_cat\.py text eol=lf$/m);
  assert.equal(createHash('sha256').update(generator).digest('hex'), manifest.generator.sha256);
  const profile = parseRetargetProfile(fs.readFileSync(path.join(path.dirname(BLACK_CAT_MANIFEST), 'sable.retarget-profile.json'), 'utf8'));
  assert.deepEqual(profile.retarget.manualMap, Object.fromEntries(manifest.joints.map((name: string) => [name, name])));
  assert.deepEqual(profile.retarget.clips, ['Idle', 'Walk', 'Run']);
  assert.equal(profile.retarget.replaceClips, undefined);
  assert.deepEqual(profile.retarget.clipNames, { Idle: 'Sable_Transfer_Idle', Walk: 'Sable_Transfer_Walk', Run: 'Sable_Transfer_Run' });
  assert.equal(manifest.topology.main_connected_body.components, 1);
  assert.equal(manifest.topology.main_connected_body.non_manifold_edges, 0);
  assert.equal(manifest.topology.complete_mesh.boundary_edges, 0);
  for (const [name, record] of Object.entries(manifest.files) as [string, { bytes: number; sha256: string }][]) {
    const data = fs.readFileSync(path.join(path.dirname(BLACK_CAT_MANIFEST), name));
    assert.equal(data.length, record.bytes); assert.equal(createHash('sha256').update(data).digest('hex'), record.sha256);
  }
  const bytes = blackCatBytes();
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(json.buffers.every((buffer: { uri?: string }) => !buffer.uri));
  assert.equal(json.images?.length ?? 0, 1); assert.equal(json.cameras?.length ?? 0, 0);
  assert.ok(json.images.every((image: { uri?: string; mimeType: string }) => !image.uri && image.mimeType === 'image/png'));
  assert.equal(manifest.provenance.draft, 'CAT-TRIPO-002');
  const texture = readAssetEvidence(bytes).images[0];
  const decoded = PNG.sync.read(Buffer.from(texture.signature, 'hex'));
  assert.deepEqual([decoded.width, decoded.height], [1024, 1024]);
  assert.ok(bytes.length < 2 * 1024 * 1024, 'sample leaves room for base64 project data within browser recovery quota');
  assert.ok(new Set(decoded.data).size > 64, 'atlas has decoded color detail');
});

test('original cat has an explicit quadruped hierarchy, finite normalized raw skin, UVs and authored materials', () => {
  const evidence = readAssetEvidence(blackCatBytes());
  assert.equal(evidence.joints.length, 24); assert.equal(new Set(evidence.joints).size, 24);
  assert.ok(evidence.joints.every(name => /^[A-Za-z][A-Za-z0-9_]*$/.test(name)));
  const body = evidence.primitives[0];
  assert.equal(body.indices.length / 3, 9434);
  // Weld exported UV seams by position independently of Blender's topology report.
  const points = new Map<string, number>(), welded: number[] = [], neighbors: Set<number>[] = [];
  for (let v = 0; v < body.attributes.POSITION.length / 3; v++) {
    const key = body.attributes.POSITION.slice(v * 3, v * 3 + 3).map(value => value.toFixed(6)).join(',');
    if (!points.has(key)) { points.set(key, points.size); neighbors.push(new Set()); }
    welded.push(points.get(key)!);
  }
  const edges = new Map<string, number>();
  for (let i = 0; i < body.indices.length; i += 3) {
    const triangle = body.indices.slice(i, i + 3).map(index => welded[index]);
    assert.equal(new Set(triangle).size, 3);
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      neighbors[a].add(b); neighbors[b].add(a);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.equal(points.size, 4721); assert.ok([...edges.values()].every(count => count === 2));
  const remaining = new Set(neighbors.map((_, index) => index)), sizes: number[] = [];
  while (remaining.size) {
    const pending = [remaining.values().next().value!]; remaining.delete(pending[0]); let size = 0;
    while (pending.length) {
      size++;
      for (const next of neighbors[pending.pop()!]) if (remaining.delete(next)) pending.push(next);
    }
    sizes.push(size);
  }
  assert.deepEqual(sizes.sort((a, b) => b - a), [4249, 236, 236], 'one connected body/tail and two closed eye surfaces');
  assert.deepEqual(evidence.primitives.map(p => (p.material as { name: string }).name), ['Sable coat']);
  for (const side of ['L', 'R']) {
    for (const [name, parent] of [['ForeUpper', 'Spine'], ['ForeLower', `ForeUpper_${side}`], ['ForePaw', `ForeLower_${side}`], ['HindUpper', 'Pelvis'], ['HindLower', `HindUpper_${side}`], ['HindFoot', `HindLower_${side}`], ['HindPaw', `HindFoot_${side}`]]) {
      assert.deepEqual(evidence.hierarchy.find(joint => joint.name === `${name}_${side}`), { name: `${name}_${side}`, parent });
    }
  }
  assert.equal(evidence.primitives.length, 1);
  for (const primitive of evidence.primitives) {
    const a = primitive.attributes; assert.ok(a.TEXCOORD_0.length > 0);
    assert.ok(a.JOINTS_0.every(value => Number.isInteger(value) && value >= 0 && value < 24));
    for (let i = 0; i < a.WEIGHTS_0.length; i += 4) {
      assert.ok(a.WEIGHTS_0.slice(i, i + 4).every(weight => weight >= 0 && weight <= 1));
      assert.ok(Math.abs(a.WEIGHTS_0.slice(i, i + 4).reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
    }
  }
});

test('original cat inner soles stay assigned to paw bones rather than torso bones', () => {
  const evidence = readAssetEvidence(blackCatBytes()); let vertices = 0;
  for (const primitive of evidence.primitives) {
    const a = primitive.attributes;
    // Exported mesh coordinates are meters: four centimeters covers the soles.
    for (let v = 0; v < a.POSITION.length / 3; v++) if (a.POSITION[v * 3 + 1] < .04) {
      const pawWeight = [0, 1, 2, 3].reduce((sum, slot) => sum + (/^(Fore|Hind)Paw_[LR]$/.test(evidence.joints[a.JOINTS_0[v * 4 + slot]]) ? a.WEIGHTS_0[v * 4 + slot] : 0), 0);
      assert.ok(pawWeight > .999, `sole vertex ${v} has only ${pawWeight} paw influence`); vertices++;
    }
  }
  assert.ok(vertices > 50);
});

test('independent skin samples retain the floor, planted Idle paws and actual gait lift', () => {
  const bytes = blackCatBytes();
  for (const [clip, duration] of Object.entries(CAT_CLIPS)) for (const time of catSampleTimes(duration)) {
    const vertices = catSkinnedVertices(bytes, clip, time);
    const minimum = Math.min(...vertices.map(v => v.y));
    assert.ok(minimum > -1e-4, `${clip} at ${time}s: below floor by ${minimum}`);
    assert.ok(vertices.every(v => [v.x, v.y, v.z].every(Number.isFinite)));
  }
  const joint = (clip: string, time: number, name = 'ForePaw_L') => new Vector3().setFromMatrixPosition(catWorldMatrices(bytes, clip, time).get(name)!);
  for (const name of ['ForePaw_L', 'ForePaw_R', 'HindPaw_L', 'HindPaw_R']) {
    assert.ok(joint('Idle', 0, name).distanceTo(joint('Idle', 1.5, name)) < 2e-5);
  }
  for (const name of ['ForePaw_L', 'ForePaw_R']) assert.ok(joint('Sit', 0, name).distanceTo(joint('Sit', 2, name)) < 2e-5, 'Sit keeps front paws planted');
  const pelvis = (time: number) => new Vector3().setFromMatrixPosition(catWorldMatrices(bytes, 'Sit', time).get('Pelvis')!);
  assert.ok(Math.abs(pelvis(2).y - .117) < 2e-5 && Math.abs(pelvis(2).z - .084) < 2e-5, 'Sit lowers and tucks the haunches under the torso');
  assert.ok(Math.abs(joint('Walk', 1).y - (.03+.036*Math.sin(Math.PI*((1/1.2-.66)/.34))**2)) < 2e-5);
  assert.ok(Math.abs(joint('Run', 17/30).y - (.0303+.054*Math.sin(Math.PI*((17/30/.8-.4)/.6))**2)) < 2e-5);
  // A receiving root advancing +Z cancels the in-place stance's backward travel.
  const start = joint('Walk', 0);
  const later = joint('Walk', .4);
  assert.ok(Math.abs(later.z - start.z + .3 * .28 / .66 * (.4 / 1.2)) < 2e-5);
});

test('four original clips have known durations, vertical root motion, loop closure and a held Sit endpoint', () => {
  const bytes = blackCatBytes(), evidence = readAssetEvidence(bytes);
  assert.deepEqual(evidence.clips.map(c => c.name).sort(), Object.keys(CAT_CLIPS).sort());
  for (const clip of evidence.clips) { assert.ok(Math.abs(clip.duration - CAT_CLIPS[clip.name as keyof typeof CAT_CLIPS]) < 1e-6); expectMotion(clip); }
  for (const clip of ['Idle', 'Walk', 'Run'] as const) expectCatLoop(bytes, clip);
  const root = (clip: string, time: number) => new Vector3().setFromMatrixPosition(catWorldMatrices(bytes, clip, time).get('Root')!);
  assert.ok(Math.abs(root('Idle', 1.5).y - .0042) < 1e-5);
  assert.ok(Math.abs(root('Run', .4).y - .021) < 1e-5);
  assert.ok(Math.abs(root('Sit', 2).y + .126) < 1e-5);
  const hold = catWorldMatrices(bytes, 'Sit', 1.8), end = catWorldMatrices(bytes, 'Sit', 2);
  for (const name of evidence.joints) assert.ok(hold.get(name)!.elements.every((v, i) => Math.abs(v - end.get(name)!.elements[i]) < 2e-5), `Sit does not hold ${name}`);
});

function changeKey(clipName: string, bone: string, channel: string, key: number, values: number[]): Buffer {
  const bytes = Buffer.from(blackCatBytes());
  const jsonLength = bytes.readUInt32LE(12), doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const clip = doc.animations.find((value: { name: string }) => value.name === clipName);
  const target = clip.channels.find((value: { target: { node: number; path: string } }) => doc.nodes[value.target.node].name === bone && value.target.path === channel);
  const accessor = doc.accessors[clip.samplers[target.sampler].output], view = doc.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  const index = key < 0 ? accessor.count + key : key;
  const offset = 20 + jsonLength + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * values.length * 4;
  values.forEach((value, i) => bytes.writeFloatLE(value, offset + i * 4));
  return bytes;
}

test('loop and continuity guards reject terminal rotations, scales and unsampled interior keys', () => {
  const rotated = changeKey('Idle', 'Tail05', 'rotation', -1, [Math.sin(.2), 0, 0, Math.cos(.2)]);
  // A terminal joint rotates in place: checking joint origins alone misses its skin seam.
  const first = catWorldMatrices(rotated, 'Idle', 0), last = catWorldMatrices(rotated, 'Idle', 3);
  for (const name of readAssetEvidence(rotated).joints) assert.ok(new Vector3().setFromMatrixPosition(first.get(name)!).distanceTo(new Vector3().setFromMatrixPosition(last.get(name)!)) < 2e-5);
  assert.throws(() => expectCatLoop(rotated, 'Idle'), /seam Tail05 rotation/);
  const scaled = changeKey('Idle', 'Tail05', 'scale', -1, [1.2, 1, 1]);
  assert.throws(() => expectCatLoop(scaled, 'Idle'), /seam Tail05 scale/);
  const interior = changeKey('Walk', 'Root', 'translation', 1, [0, .02, 0]);
  assert.throws(() => expectCatMotionContinuity(interior, blackCatBytes()), /Walk motion .*Root position/);
});

test('Sable loads with explicit mappings and its actual Three mixer matches independently sampled Sit joints', async () => {
  installNodeThreeRuntime();
  const bytes = blackCatBytes(), model = await loadGLB(Uint8Array.from(bytes).buffer);
  try {
    const profile = parseRetargetProfile(fs.readFileSync(path.join(path.dirname(BLACK_CAT_MANIFEST), 'sable.retarget-profile.json'), 'utf8'));
    const map = buildRigMap(model.skeleton!, model.skeleton!, { manualMap: profile.retarget.manualMap, allowFuzzy: false });
    assert.equal(map.ok, true); assert.equal(map.decisions.length, 24);
    assert.ok(map.decisions.every(decision => decision.method === 'manual' && decision.source === decision.target));
    assert.deepEqual(map.map, profile.retarget.manualMap);
    const clip = model.clips.find(value => value.name === 'Sit')!;
    const action = model.mixer.clipAction(clip); action.play(); action.paused = true; action.time = 2;
    model.mixer.update(0); model.root.updateMatrixWorld(true);
    const expected = catWorldMatrices(bytes, 'Sit', 2);
    for (const bone of model.skeleton!.bones) {
      assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(new Vector3().setFromMatrixPosition(expected.get(bone.name)!)) < 2e-5, `Sit joint ${bone.name}`);
    }
  } finally {
    model.mixer.stopAllAction(); model.mixer.uncacheRoot(model.root); disposeThreeObject(model.root);
  }
});
