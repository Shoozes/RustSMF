import * as THREE from 'three';

/**
 * Creates the 3D highlight marker for a selected bone (red sphere + axes).
 * Used in ThreeViewport for visual feedback on bone selection (from list or raycast).
 * Cheap, no skin affect; follows via RAF position update on the group.
 * Extracted for modularity, consistent with boneLabels.
 */
export function makeBoneHighlightMarker(): THREE.Group {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.08),
    new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.85 })
  );
  group.add(sphere);
  const axes = new THREE.AxesHelper(0.25);
  (axes.material as any).depthTest = false;
  group.add(axes);
  return group;
}

/**
 * Updates the world position of a highlight group to follow a bone.
 * Extracted for testability and reuse in viewport RAF.
 */
export function updateHighlightPosition(highlight: THREE.Object3D, bone: THREE.Bone) {
  const wp = new THREE.Vector3();
  bone.getWorldPosition(wp);
  highlight.position.copy(wp);
}
