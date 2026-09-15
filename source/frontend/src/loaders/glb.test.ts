import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { createSkinnedGlbFixtureInput } from '../../tests/helpers/skinned-glb-fixture';
import { disposeThreeObject } from '../utils/threeDisposal';
import { exportGLB, loadGLB, validateExportedGLB } from './glb';
import { buildGlbContainer, parseGlbContainer as parseGlb } from '../utils/glbContainer';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

describe('GLB recovery export validation', () => {
  it('preserves authored unit weights across animation-only cycles but repairs malformed weights', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    for (const malformed of [false, true]) {
      const model = await loadGLB(toArrayBuffer(fixture.buffer));
      const tuple = malformed ? [2, 1, 0, 0] : [0.00048392722965218127, 0.9995160102844238, 0, 0];
      const weights = model.skinnedMeshes[0].geometry.attributes.skinWeight;
      for (let i = 0; i < weights.count; i++) weights.setXYZW(i, tuple[0], tuple[1], tuple[2], tuple[3]);
      let bytes = await exportGLB(model.root, model.clips);
      disposeThreeObject(model.root);
      for (let pass = 0; pass < 3; pass++) {
        const loaded = await loadGLB(toArrayBuffer(Buffer.from(bytes)));
        try {
          const actual = loaded.skinnedMeshes[0].geometry.attributes.skinWeight;
          const expected = malformed ? [Math.fround(2 / 3), Math.fround(1 / 3), 0, 0] : tuple;
          for (let i = 0; i < actual.count; i++) {
            assert.deepStrictEqual([actual.getX(i), actual.getY(i), actual.getZ(i), actual.getW(i)], expected);
          }
          bytes = await exportGLB(loaded.root, loaded.clips);
        } finally { disposeThreeObject(loaded.root); }
      }
    }
  });

  it('repeated exports preserve node count, skin bindings and clips', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    let bytes: Uint8Array = new Uint8Array(fixture.buffer);
    const initial = parseGlb(bytes).json.nodes as unknown[];
    let baseline: unknown;
    for (let pass = 0; pass < 4; pass++) {
      const model = await loadGLB(toArrayBuffer(Buffer.from(bytes)));
      try {
        const parent = model.skinnedMeshes[0].parent;
        const state = {
          bones: model.skeleton!.bones.map(bone => [bone.name, bone.parent?.name, bone.position.toArray(), bone.quaternion.toArray()]),
          inverseBind: model.skeleton!.boneInverses.map(matrix => matrix.toArray()),
          weights: Array.from(model.skinnedMeshes[0].geometry.attributes.skinWeight.array),
          clips: model.clips.map(clip => ({ name: clip.name, tracks: clip.tracks.map(track => [track.name, Array.from(track.times), Array.from(track.values)]) })),
        };
        if (pass === 0) baseline = state; else assert.deepStrictEqual(state, baseline);
        bytes = await exportGLB(model.root, model.clips);
        assert.equal(model.skinnedMeshes[0].parent, parent, 'Export does not reparent mounted meshes');
        assert.equal((parseGlb(bytes).json.nodes as unknown[]).length, initial.length, 'No wrapper growth');
      } finally { model.mixer.stopAllAction(); disposeThreeObject(model.root); }
    }
  });

  it('preserves authored wrapper names and scene metadata across static exports', async () => {
    const root = new THREE.Group(); root.name = 'AuxScene';
    const group = new THREE.Group(); group.name = 'GLB_Root'; root.add(group);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    let bytes = await exportGLB(root);
    disposeThreeObject(root);
    const authored = parseGlb(bytes);
    (authored.json.scenes as Array<{ name: string }>)[0].name = 'FixtureScene';
    bytes = buildGlbContainer(authored.json, authored.binary);
    const count = (parseGlb(bytes).json.nodes as unknown[]).length;
    for (let pass = 0; pass < 3; pass++) {
      const model = await loadGLB(toArrayBuffer(Buffer.from(bytes)));
      try {
        model.root.userData.author = 'fixture';
        bytes = await exportGLB(model.root);
        const json = parseGlb(bytes).json;
        const nodes = json.nodes as Array<{ name?: string }>;
        assert.equal(nodes.length, count);
        assert.equal(nodes.filter(node => node.name === 'AuxScene').length, 1);
        assert.equal(nodes.filter(node => node.name === 'GLB_Root').length, 1);
        assert.equal((json.scenes as Array<{ extras: { author: string } }>)[0].extras.author, 'fixture');
      } finally { disposeThreeObject(model.root); }
    }
  });

  it('retains edited or animated scene roots as real nodes without further growth', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    for (const mode of ['transform', 'matrix', 'animation']) {
      const model = await loadGLB(toArrayBuffer(fixture.buffer));
      let bytes: Uint8Array;
      try {
        model.root.name = 'EditedRoot';
        if (mode === 'matrix') { model.root.matrixAutoUpdate = false; model.root.matrix.makeTranslation(2, 3, 4); }
        else model.root.position.set(2, 3, 4);
        const clips = mode === 'animation' ? [new THREE.AnimationClip('Root Motion', 1, [
          new THREE.VectorKeyframeTrack('.position', [0, 1], [2, 3, 4, 5, 3, 4]),
        ])] : model.clips;
        if (mode === 'matrix') {
          await assert.rejects(exportGLB(model.root, clips), /matrix-only transform/);
          bytes = await exportGLB(model.root, []);
        } else bytes = await exportGLB(model.root, clips);
      } finally { disposeThreeObject(model.root); }
      const count = (parseGlb(bytes).json.nodes as unknown[]).length;
      const loaded = await loadGLB(toArrayBuffer(Buffer.from(bytes)));
      try {
        const edited = loaded.root.getObjectByName('EditedRoot')!;
        assert.ok(edited);
        assert.deepEqual(edited.position.toArray(), [2, 3, 4], mode);
        if (mode === 'animation') {
          const action = loaded.mixer.clipAction(loaded.clips[0]); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
          loaded.mixer.setTime(1); assert.equal(edited.position.x, 5);
          loaded.mixer.stopAllAction();
        }
        const replay = await exportGLB(loaded.root, loaded.clips);
        assert.equal((parseGlb(replay).json.nodes as unknown[]).length, count);
      } finally { loaded.mixer.stopAllAction(); disposeThreeObject(loaded.root); }
    }
  });

  it('reparses an exported skinned model and preserves its animation structure', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    const source = await loadGLB(toArrayBuffer(fixture.buffer));
    try {
      const bytes = await exportGLB(source.root, source.clips);
      const summary = await validateExportedGLB(bytes, source.root, source.clips);

      assert.equal(summary.boneCount, 2);
      assert.equal(summary.skinnedMeshCount, 1);
      assert.equal(summary.clipCount, 1);
      assert.deepEqual(summary.clipNames, ['FixtureBend']);
      assert.deepEqual(summary.trackCounts, [2]);
    } finally {
      source.mixer.stopAllAction();
      disposeThreeObject(source.root);
    }
  });

  it('blocks a file that drops an expected animation clip', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    const source = await loadGLB(toArrayBuffer(fixture.buffer));
    try {
      const bytes = await exportGLB(source.root, []);
      await assert.rejects(
        validateExportedGLB(bytes, source.root, source.clips),
        /clip count changed from 1 to 0/,
      );
    } finally {
      source.mixer.stopAllAction();
      disposeThreeObject(source.root);
    }
  });

  it('blocks non-finite animation data before save', async () => {
    const root = new THREE.Group();
    root.name = 'FiniteGuardRoot';
    const clip = new THREE.AnimationClip('Broken', 1, [
      new THREE.VectorKeyframeTrack('FiniteGuardRoot.position', [0, 1], [0, 0, 0, Number.NaN, 0, 0]),
    ]);

    await assert.rejects(
      validateExportedGLB(new Uint8Array([1]), root, [clip]),
      /non-finite value/,
    );
  });
});
