import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  getOrthographicPanDelta,
  refreshOrthoCameras,
} from './viewportLayout';

const assertVectorNear = (
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  epsilon = 0.000001,
): void => {
  assert.ok(actual.distanceTo(expected) <= epsilon, `${actual.toArray()} != ${expected.toArray()}`);
};

test('refreshOrthoCameras keeps every fixed view on one shared focus target', () => {
  const cameras = [
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
    new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100),
  ];
  const focus = new THREE.Vector3(4, 5, 6);
  refreshOrthoCameras(cameras, {
    center: new THREE.Vector3(1, 2, 3),
    maxDim: 3,
  }, focus);

  assertVectorNear(cameras[0].position, new THREE.Vector3(4, 5, 12));
  assertVectorNear(cameras[1].position, new THREE.Vector3(10, 5, 6));
  assertVectorNear(cameras[2].position, new THREE.Vector3(4, 11, 6));
  cameras.forEach((camera) => {
    const expectedDirection = focus.clone().sub(camera.position).normalize();
    assertVectorNear(camera.getWorldDirection(new THREE.Vector3()), expectedDirection);
  });
});

test('getOrthographicPanDelta maps screen drag into the active view plane', () => {
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
  camera.zoom = 2;
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const delta = getOrthographicPanDelta(camera, 10, 5, 100);
  assertVectorNear(delta, new THREE.Vector3(0.4, -0.2, 0));
  assert.ok(
    Math.abs(delta.dot(camera.getWorldDirection(new THREE.Vector3()))) <= 0.000001,
    'pan must not move along the camera depth axis',
  );
});
