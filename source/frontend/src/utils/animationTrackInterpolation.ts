import * as THREE from 'three';

export type TrackInterpolation = THREE.InterpolationModes | 'gltf-cubic-spline';
type InterpolantFactory = ((result?: THREE.TypedArray | null) => THREE.Interpolant) & {
  isInterpolantFactoryMethodGLTFCubicSpline?: boolean;
};
type RuntimeTrack = THREE.KeyframeTrack & { createInterpolant: InterpolantFactory };

export function trackInterpolation(track: THREE.KeyframeTrack): TrackInterpolation {
  if ((track as RuntimeTrack).createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline) return 'gltf-cubic-spline';
  const mode = track.getInterpolation();
  if (mode === undefined) throw new Error(`Transfer cannot serialize the custom interpolation on ${track.name}.`);
  return mode;
}

export function trackSampleSize(track: THREE.KeyframeTrack): number {
  return track.getValueSize() / ((track as RuntimeTrack).createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline ? 3 : 1);
}

export function createTrackInterpolant(track: THREE.KeyframeTrack): THREE.Interpolant {
  return (track as RuntimeTrack).createInterpolant();
}

/** glTF Hermite values are [in tangent, value, out tangent] per key, in seconds. */
class GltfCubicSplineInterpolant extends THREE.Interpolant {
  private readonly rotation: THREE.Quaternion | null;

  constructor(track: THREE.KeyframeTrack, result?: THREE.TypedArray | null) {
    super(track.times, track.values, track.getValueSize() / 3, result ?? undefined);
    this.rotation = track.ValueTypeName === 'quaternion' ? new THREE.Quaternion() : null;
  }

  copySampleValue_(index: number): THREE.TypedArray {
    const offset = (index * 3 + 1) * this.valueSize;
    const result = this.resultBuffer as THREE.TypedArray, values = this.sampleValues as Float32Array;
    for (let i = 0; i < this.valueSize; i++) result[i] = values[offset + i];
    return result;
  }

  interpolate_(upper: number, start: number, time: number, end: number): THREE.TypedArray {
    const span = end - start, t = (time - start) / span, t2 = t * t, t3 = t2 * t;
    const size = this.valueSize, left = (upper - 1) * size * 3, right = upper * size * 3;
    const values = this.sampleValues as Float32Array, result = this.resultBuffer as THREE.TypedArray;
    for (let i = 0; i < size; i++) {
      result[i] = (2*t3 - 3*t2 + 1) * values[left + size + i]
        + (t3 - 2*t2 + t) * span * values[left + 2*size + i]
        + (-2*t3 + 3*t2) * values[right + size + i]
        + (t3 - t2) * span * values[right + i];
    }
    this.rotation?.fromArray(result).normalize().toArray(result);
    return result;
  }
}

export function restoreTrackInterpolation(track: THREE.KeyframeTrack, mode: TrackInterpolation): void {
  if (mode !== 'gltf-cubic-spline') { track.setInterpolation(mode); return; }
  const size = track.getValueSize() / 3;
  if (!(track.values instanceof Float32Array) || !Number.isInteger(size) || size < 1
    || (track.ValueTypeName === 'quaternion' && size !== 4)) {
    throw new Error(`Invalid glTF cubic-spline values on ${track.name}.`);
  }
  (track as RuntimeTrack).createInterpolant = Object.assign(function(this: THREE.KeyframeTrack, result?: THREE.TypedArray | null) {
    return new GltfCubicSplineInterpolant(this, result);
  }, { isInterpolantFactoryMethodGLTFCubicSpline: true });
}
