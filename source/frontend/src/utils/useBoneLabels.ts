import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { makeBoneLabel } from './boneLabels';
import { disposeThreeObject } from './threeDisposal';

/**
 * Custom hook to manage optional per-bone labels (AxesHelper + name sprites) in the viewport.
 * Handles creation, attachment to bones, cleanup, and disposal on toggle/skeleton change.
 * Extracted for modularity; reduces ThreeViewport size and keeps label logic isolated.
 * Call unconditionally in component; internally no-ops when !enabled.
 */
export function useBoneLabels(boneLabelsEnabled: boolean, skeleton?: THREE.Skeleton) {
  return useBoneLabelsWithScale(boneLabelsEnabled, skeleton, 1);
}

export function useBoneLabelsWithScale(
  boneLabelsEnabled: boolean,
  skeleton: THREE.Skeleton | undefined,
  scale: number,
  showIndexLabels = false,
) {
  const boneLabelsRef = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    // cleanup previous (dispose textures + children for no leak)
    boneLabelsRef.current.forEach((label) => {
      if (label.parent) label.parent.remove(label);
      label.traverse((child) => {
        if (child instanceof THREE.Sprite) {
          const m = child.material as THREE.SpriteMaterial;
          if (m.map) m.map.dispose();
        }
      });
      disposeThreeObject(label);
    });
    boneLabelsRef.current = [];

    if (!boneLabelsEnabled || !skeleton) return;

    const markerScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const created: THREE.Object3D[] = [];
    skeleton.bones.forEach((bone, index) => {
      const labelText = showIndexLabels ? String(index) : bone.name;
      const label = makeBoneLabel(labelText, { scale: markerScale });
      bone.add(label);
      created.push(label);
    });
    boneLabelsRef.current = created;

    return () => {
      created.forEach((label) => {
        if (label.parent) label.parent.remove(label);
        // Dispose any sprite textures inside the label group
        label.traverse((child) => {
          if (child instanceof THREE.Sprite) {
            const m = child.material as THREE.SpriteMaterial;
            if (m.map) m.map.dispose();
          }
        });
        disposeThreeObject(label);
      });
    };
  }, [boneLabelsEnabled, skeleton, scale, showIndexLabels]);
}
