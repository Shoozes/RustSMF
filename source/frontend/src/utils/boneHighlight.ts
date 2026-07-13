import * as THREE from 'three';

/**
 * Creates the 3D highlight marker for a selected bone (red sphere + axes).
 * Used in ThreeViewport for visual feedback on bone selection (from list or raycast).
 * Cheap, no skin affect; follows via RAF position update on the group.
 * Extracted for modularity, consistent with boneLabels.
 */
export function makeBoneHighlightMarker(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const markerScale = Math.max(0.25, scale);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.08 * markerScale),
    new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.85 })
  );
  group.add(sphere);
  const axes = new THREE.AxesHelper(0.25 * markerScale);
  axes.material.depthTest = false;
  group.add(axes);
  return group;
}

/**
 * Creates a lightweight endpoint-style helper for 3D bone manipulation.
 * Two opposing endpoint spheres plus a connecting line make mode precision work
 * easier to discover in rig/skin workflows.
 */
export function makeBoneEndpointHandle(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const markerScale = Math.max(0.25, scale);
  const endpointOffset = 0.16 * markerScale;
  const endpointRadius = 0.035 * markerScale;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(endpointRadius * 0.9, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, depthTest: false, transparent: true, opacity: 0.45 })
  );
  core.position.set(0, 0, 0);
  core.userData = { isEndpointDragHandle: true, endpointRole: 'core' };
  group.add(core);

  const endpointGeo = new THREE.SphereGeometry(endpointRadius, 12, 12);
  const endpointMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, depthTest: false, transparent: true, opacity: 0.95 });

  const start = new THREE.Mesh(endpointGeo, endpointMat);
  const end = new THREE.Mesh(endpointGeo, endpointMat.clone());
  start.position.set(0, -endpointOffset, 0);
  end.position.set(0, endpointOffset, 0);
  start.userData = { isEndpointDragHandle: true, endpointRole: 'start' };
  end.userData = { isEndpointDragHandle: true, endpointRole: 'end' };
  group.add(start, end);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -endpointOffset, 0),
    new THREE.Vector3(0, endpointOffset, 0),
  ]);
  const connector = new THREE.Line(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75 })
  );
  connector.userData = { isEndpointConnector: true };
  group.add(connector);

  group.userData = { isEndpointHandle: true, markerScale };

  return group;
}

export function makeRigIkTargetHandle(scale = 1): THREE.Group {
  const markerScale = Math.max(0.25, scale);
  const group = new THREE.Group();
  group.name = 'Rig IK Target';
  group.userData = { isRigIkTarget: true, markerScale };

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.07 * markerScale, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  sphere.userData.isRigIkTarget = true;
  group.add(sphere);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });
  const ringGeometry = new THREE.RingGeometry(0.11 * markerScale, 0.14 * markerScale, 24);
  const ringX = new THREE.Mesh(ringGeometry, ringMaterial);
  ringX.userData.isRigIkTarget = true;
  const ringY = new THREE.Mesh(ringGeometry.clone(), ringMaterial.clone());
  ringY.rotation.y = Math.PI / 2;
  ringY.userData.isRigIkTarget = true;
  group.add(ringX, ringY);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 192;
  labelCanvas.height = 48;
  const context = labelCanvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(15, 23, 42, 0.9)';
    context.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.fillStyle = '#fbbf24';
    context.font = 'bold 24px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('IK TARGET', labelCanvas.width / 2, labelCanvas.height / 2);
    const texture = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    label.position.set(0, 0.38 * markerScale, 0);
    label.scale.set(1.6 * markerScale, 0.4 * markerScale, 1);
    label.userData.isRigIkTarget = true;
    group.add(label);
  }
  return group;
}

/**
 * Creates a high-contrast hover marker that is visually stronger than the selected marker.
 * Reuses the base selection marker shape, then boosts saturation and opacity for precision modes.
 */
export function makeBoneHoverMarker(scale = 1): THREE.Group {
  const marker = makeBoneHighlightMarker(Math.max(0.35, scale) * 1.12);
  marker.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const material = child.material;
      material.color.set(0x93c5fd);
      material.opacity = 0.95;
      material.transparent = true;
      material.depthTest = false;
    }
    if (child instanceof THREE.AxesHelper && child.material && child.material instanceof THREE.LineBasicMaterial) {
      child.material.color.set(0xbfdbfe);
    }
  });
  marker.userData = {
    ...marker.userData,
    isHoverMarker: true,
    markerScale: Math.max(0.35, scale),
  };
  return marker;
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

/**
 * Follows a bone with an endpoint helper while preserving orientation.
 * Scale drives reach/visual prominence in precision modes.
 */
export function updateEndpointHandle(handle: THREE.Object3D, bone: THREE.Bone, scale = 1): void {
  const worldPos = new THREE.Vector3();
  const worldRot = new THREE.Quaternion();
  bone.getWorldPosition(worldPos);
  bone.getWorldQuaternion(worldRot);
  handle.position.copy(worldPos);
  handle.quaternion.copy(worldRot);
  const markerScale = Math.max(0.25, scale);
  handle.scale.setScalar(markerScale);
}
