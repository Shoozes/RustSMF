import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { exportGLB, loadGLB } from '../loaders/glb';
import { installFileReaderTestPolyfill } from '../test/installFileReaderTestPolyfill';
import { disposeThreeObject } from './threeDisposal';
import {
  applyModelOutlinerSnapshot,
  attachLoadedStaticModel,
  captureModelOutlinerSnapshot,
  deleteModelObject,
  duplicateModelObject,
  getModelObjectReorderAvailability,
  renameModelObject,
  reorderModelObject,
  sameModelOutlinerSnapshot,
} from './modelAuthoring';

function makeModelRoot(): { root: THREE.Group; group: THREE.Group; mesh: THREE.Mesh } {
  const root = new THREE.Group();
  root.name = 'SceneRoot';
  const group = new THREE.Group();
  group.name = 'Body';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = 'Armor';
  root.add(group);
  group.add(mesh);
  return { root, group, mesh };
}

function addRootSibling(root: THREE.Group): THREE.Mesh {
  const sibling = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial());
  sibling.name = 'Cape';
  root.add(sibling);
  return sibling;
}

describe('model outliner snapshots', () => {
  it('captures and restores names, visibility, and valid selection together', () => {
    const { root, group, mesh } = makeModelRoot();
    const ids = [group.uuid, mesh.uuid];
    const before = captureModelOutlinerSnapshot(root, ids, [mesh.uuid, 'missing']);
    const clone = captureModelOutlinerSnapshot(root, ids, [mesh.uuid]);
    assert.equal(sameModelOutlinerSnapshot(before, clone), true);

    group.visible = false;
    mesh.name = 'Changed';
    const after = captureModelOutlinerSnapshot(root, ids, [group.uuid]);
    assert.equal(sameModelOutlinerSnapshot(before, after), false);

    const applied = applyModelOutlinerSnapshot(root, before, ids);
    assert.equal(applied.visibilityChanges, 1);
    assert.equal(applied.nameChanges, 1);
    assert.equal(applied.orderChanges, 0);
    assert.equal(applied.changes, 2);
    assert.deepEqual(applied.selectedIds, [mesh.uuid]);
    assert.equal(group.visible, true);
    assert.equal(mesh.name, 'Armor');
  });
});

describe('attachLoadedStaticModel', () => {
  it('attaches only to the model root that owned the async request', () => {
    const expectedRoot = new THREE.Group();
    const replacementRoot = new THREE.Group();
    const staleObject = new THREE.Group();
    const stale = attachLoadedStaticModel(expectedRoot, replacementRoot, staleObject);

    assert.deepEqual(stale, {
      ok: false,
      reason: 'stale-root',
      message: 'Static append cancelled because the primary model changed while loading.',
    });
    assert.equal(staleObject.parent, null);
    assert.equal(expectedRoot.children.length, 0);

    const currentObject = new THREE.Group();
    const attached = attachLoadedStaticModel(expectedRoot, expectedRoot, currentObject);
    assert.equal(attached.ok, true);
    assert.equal(currentObject.parent, expectedRoot);
    assert.equal(expectedRoot.children[0], currentObject);
  });
});

describe('reorderModelObject', () => {
  it('reorders only eligible siblings and restores their exact parent order', () => {
    const { root, group, mesh } = makeModelRoot();
    const sibling = addRootSibling(root);
    const helper = new THREE.Bone();
    helper.name = 'HelperBone';
    root.children.splice(1, 0, helper);
    helper.parent = root;
    const ids = [group.uuid, mesh.uuid, sibling.uuid];
    const before = captureModelOutlinerSnapshot(root, ids, [group.uuid], [root.uuid]);

    assert.deepEqual(getModelObjectReorderAvailability(root, group.uuid), {
      canMoveEarlier: false,
      canMoveLater: true,
    });
    const moved = reorderModelObject(root, group.uuid, 'later', 'glb');
    assert.equal(moved.ok, true);
    assert.deepEqual(root.children.map((child) => child.name), ['Cape', 'HelperBone', 'Body']);
    const after = captureModelOutlinerSnapshot(root, ids, [group.uuid], [root.uuid]);
    assert.equal(sameModelOutlinerSnapshot(before, after), false);

    const undone = applyModelOutlinerSnapshot(root, before, ids);
    assert.equal(undone.orderChanges, 1);
    assert.deepEqual(root.children.map((child) => child.name), ['Body', 'HelperBone', 'Cape']);
    const redone = applyModelOutlinerSnapshot(root, after, ids);
    assert.equal(redone.orderChanges, 1);
    assert.deepEqual(root.children.map((child) => child.name), ['Cape', 'HelperBone', 'Body']);

    const malformed = {
      ...before,
      childOrderByParentId: { [root.uuid]: [group.uuid, group.uuid, sibling.uuid] },
    };
    const rejected = applyModelOutlinerSnapshot(root, malformed, ids);
    assert.equal(rejected.orderChanges, 0);
    assert.deepEqual(root.children.map((child) => child.name), ['Cape', 'HelperBone', 'Body']);
  });

  it('preserves authored sibling order through GLB export and re-import', async () => {
    const { root, group } = makeModelRoot();
    addRootSibling(root);
    const moved = reorderModelObject(root, group.uuid, 'later', 'obj');
    assert.equal(moved.ok, true);

    installFileReaderTestPolyfill();
    const bytes = await exportGLB(root);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const loaded = await loadGLB(buffer);
    try {
      const exportedRoot = loaded.root.getObjectByName('SceneRoot') ?? loaded.root;
      assert.deepEqual(exportedRoot.children.map((child) => child.name), ['Cape', 'Body']);
    } finally {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
      disposeThreeObject(root);
    }
  });

  it('blocks unsupported sources and sibling-boundary moves without mutation', () => {
    const { root, group } = makeModelRoot();
    addRootSibling(root);
    const sourceOwned = reorderModelObject(root, group.uuid, 'later', 'smf');
    assert.equal(sourceOwned.ok, false);
    if (!sourceOwned.ok) assert.equal(sourceOwned.reason, 'unsupported-source');

    const boundary = reorderModelObject(root, group.uuid, 'earlier', 'obj');
    assert.equal(boundary.ok, false);
    if (!boundary.ok) assert.equal(boundary.reason, 'boundary');
    assert.deepEqual(root.children.map((child) => child.name), ['Body', 'Cape']);
  });
});

describe('duplicateModelObject and deleteModelObject', () => {
  it('duplicates static submodels and restores the exact parent index through structural snapshots', () => {
    const { root, group, mesh } = makeModelRoot();
    const sibling = addRootSibling(root);
    const beforeState = captureModelOutlinerSnapshot(root, [group.uuid, mesh.uuid, sibling.uuid], [group.uuid], [root.uuid]);
    const result = duplicateModelObject(root, sibling.uuid, [], 'obj');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.notEqual(result.object, result.sourceObject);
    assert.notEqual(Reflect.get(result.object, 'geometry'), Reflect.get(result.sourceObject, 'geometry'));
    assert.notEqual(Reflect.get(result.object, 'material'), Reflect.get(result.sourceObject, 'material'));

    const operation = {
      object: result.object,
      parentId: result.parentId,
      childIndex: result.childIndex,
    };
    const before = { ...beforeState, structuralOperation: { ...operation, kind: 'remove' as const } };
    const after = captureModelOutlinerSnapshot(
      root,
      [group.uuid, mesh.uuid, sibling.uuid, result.object.uuid],
      [result.object.uuid],
      [root.uuid],
      { ...operation, kind: 'insert' },
    );
    assert.deepEqual(root.children.map((child) => child.name), ['Body', 'Cape', 'Cape Copy']);

    const undone = applyModelOutlinerSnapshot(root, before, [group.uuid, mesh.uuid, sibling.uuid, result.object.uuid]);
    assert.equal(undone.changes, 1);
    assert.deepEqual(root.children.map((child) => child.name), ['Body', 'Cape']);
    const redone = applyModelOutlinerSnapshot(root, after, [group.uuid, mesh.uuid, sibling.uuid]);
    assert.equal(redone.changes, 1);
    assert.deepEqual(root.children.map((child) => child.name), ['Body', 'Cape', 'Cape Copy']);
  });

  it('deletes static submodels but blocks skinned and animated targets before mutation', () => {
    const { root, mesh } = makeModelRoot();
    const clip = new THREE.AnimationClip('Move', 1, [
      new THREE.VectorKeyframeTrack('Armor.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const animated = deleteModelObject(root, mesh.uuid, [clip], 'obj');
    assert.equal(animated.ok, false);
    if (!animated.ok) assert.equal(animated.reason, 'animated-target');
    assert.equal(mesh.parent?.name, 'Body');

    const staticRoot = new THREE.Group();
    const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    skinned.name = 'Skinned';
    staticRoot.add(skinned);
    const duplicate = duplicateModelObject(staticRoot, skinned.uuid, [], 'glb');
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.reason, 'unsupported-subtree');
    assert.equal(staticRoot.children.length, 1);

    const animatedDuplicate = duplicateModelObject(root, mesh.uuid, [clip], 'obj');
    assert.equal(animatedDuplicate.ok, false);
    if (!animatedDuplicate.ok) assert.equal(animatedDuplicate.reason, 'animated-target');
    assert.equal(mesh.parent?.name, 'Body');
  });
});

describe('renameModelObject', () => {
  it('renames one compatible unanimated submodel', () => {
    const { root, mesh } = makeModelRoot();
    const result = renameModelObject(root, mesh.uuid, 'Armor_Low', [], 'obj');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.previousName, 'Armor');
    assert.equal(result.name, 'Armor_Low');
    assert.equal(mesh.name, 'Armor_Low');
  });

  it('preserves a successful rename through GLB export and re-import', async () => {
    const { root, mesh } = makeModelRoot();
    const result = renameModelObject(root, mesh.uuid, 'Armor_Exported', [], 'obj');
    assert.equal(result.ok, true);

    installFileReaderTestPolyfill();
    const bytes = await exportGLB(root);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const loaded = await loadGLB(buffer);
    try {
      assert.ok(loaded.root.getObjectByName('Armor_Exported'));
    } finally {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
      disposeThreeObject(root);
    }
  });

  it('rejects source-owned, reserved, and duplicate names without mutation', () => {
    const { root, group, mesh } = makeModelRoot();
    const sourceOwned = renameModelObject(root, mesh.uuid, 'Other', [], 'smf');
    assert.equal(sourceOwned.ok, false);
    if (!sourceOwned.ok) assert.equal(sourceOwned.reason, 'unsupported-source');

    const reserved = renameModelObject(root, mesh.uuid, 'Other.Part', [], 'obj');
    assert.equal(reserved.ok, false);
    if (!reserved.ok) assert.equal(reserved.reason, 'invalid-name');

    const duplicate = renameModelObject(root, mesh.uuid, group.name, [], 'obj');
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.reason, 'duplicate-name');
    assert.equal(mesh.name, 'Armor');
  });

  it('blocks names that own animation tracks instead of breaking bindings', () => {
    const { root, mesh } = makeModelRoot();
    const clip = new THREE.AnimationClip('Move', 1, [
      new THREE.VectorKeyframeTrack('Armor.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const result = renameModelObject(root, mesh.uuid, 'Armor_New', [clip], 'glb');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'animated-target');
    assert.equal(mesh.name, 'Armor');
  });
});
