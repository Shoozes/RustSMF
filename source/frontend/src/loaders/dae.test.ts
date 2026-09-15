import * as THREE from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDaeGeometryNormals } from './dae';

test('DAE geometry normalization computes missing normals without replacing existing normals', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.deleteAttribute('normal');
  assert.equal(ensureDaeGeometryNormals(geometry), true);
  assert.equal(geometry.getAttribute('normal')?.count, geometry.getAttribute('position')?.count);
  assert.equal(ensureDaeGeometryNormals(geometry), false);
  geometry.dispose();
});
