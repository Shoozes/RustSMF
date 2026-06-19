import type { ImportedSmf } from './smf';

export type SmfDiagnosticLevel = 'info' | 'warning' | 'error';

export interface SmfDiagnostic {
  level: SmfDiagnosticLevel;
  code: string;
  message: string;
  target?: string;
}

export interface SmfDiagnosticReport {
  canExportSmf: boolean;
  diagnostics: SmfDiagnostic[];
}

export interface SmfRoundtripSummary {
  meshes: number;
  textures: number;
  bones: number;
  animations: number;
  vertices: number;
  triangles: number;
  animationFrames: number;
}

export interface SmfRoundtripReport {
  ok: boolean;
  before: SmfRoundtripSummary;
  after: SmfRoundtripSummary;
  vertexPositionMaxDelta: number;
  vertexNormalMaxDelta: number;
  bonePoseMaxDelta: number;
  meshBoundsMaxDelta: number;
  bonePoseSamplesChecked: number;
  messages: string[];
}

function maxDelta(a: Float32Array, b: Float32Array, offset = 1): number {
  const length = Math.min(a.length, b.length);
  let max = 0;
  for (let i = 0; i < length; i++) {
    const diff = Math.abs(a[i] - b[i]);
    if (diff > max) {
      max = diff;
    }
  }
  if (offset <= 0) return max;
  const remainder = Math.abs((a.length - b.length) * offset);
  return Math.max(max, remainder);
}

function maxQuatDelta(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let max = 0;
  for (let i = 0; i < length; i++) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta > max) {
      max = delta;
    }
  }
  return max;
}

function computeBounds(positions: Float32Array): [number, number, number, number, number, number] | null {
  if (!positions || positions.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

function maxBoundsDelta(
  before: [number, number, number, number, number, number],
  after: [number, number, number, number, number, number],
): number {
  let max = 0;
  for (let i = 0; i < before.length; i++) {
    const delta = Math.abs(before[i] - after[i]);
    if (delta > max) max = delta;
  }
  return max;
}

export function makeDiagnosticReport(diagnostics: SmfDiagnostic[]): SmfDiagnosticReport {
  return {
    diagnostics,
    canExportSmf: diagnostics.every((item) => item.level !== 'error'),
  };
}

export function pushDiagnostic(
  diagnostics: SmfDiagnostic[],
  level: SmfDiagnosticLevel,
  code: string,
  message: string,
  target?: string,
): void {
  diagnostics.push({ level, code, message, target });
}

export function summarizeImportedSmf(smf: ImportedSmf): SmfRoundtripSummary {
  return {
    meshes: smf.meshes.length,
    textures: smf.textures.length,
    bones: smf.bones.length,
    animations: smf.animations.length,
    vertices: smf.meshes.reduce((sum, mesh) => sum + mesh.verts, 0),
    triangles: smf.meshes.reduce((sum, mesh) => sum + mesh.triangles.length, 0),
    animationFrames: smf.animations.reduce((sum, animation) => sum + animation.frames.length, 0),
  };
}

export function compareSmfRoundtrip(beforeSmf: ImportedSmf, afterSmf: ImportedSmf): SmfRoundtripReport {
  const before = summarizeImportedSmf(beforeSmf);
  const after = summarizeImportedSmf(afterSmf);
  const messages: string[] = [];
  let vertexPositionMaxDelta = 0;
  let vertexNormalMaxDelta = 0;
  let bonePoseMaxDelta = 0;
  let meshBoundsMaxDelta = 0;
  let bonePoseSamplesChecked = 0;
  const poseTolerance = 5e-4;
  const meshBoundsTolerance = 1e-4;

  for (const key of Object.keys(before) as (keyof SmfRoundtripSummary)[]) {
    if (before[key] !== after[key]) {
      messages.push(`${key}: expected ${before[key]}, got ${after[key]}`);
    }
  }

  const countToCheck = Math.min(beforeSmf.meshes.length, afterSmf.meshes.length);
  for (let m = 0; m < countToCheck; m++) {
    const beforeMesh = beforeSmf.meshes[m];
    const afterMesh = afterSmf.meshes[m];
    const meshPosDelta = maxDelta(beforeMesh.positions, afterMesh.positions, 1);
    const meshNormalDelta = maxDelta(beforeMesh.normals, afterMesh.normals, 1);

    if (meshPosDelta > vertexPositionMaxDelta) {
      vertexPositionMaxDelta = meshPosDelta;
    }
    if (meshNormalDelta > vertexNormalMaxDelta) {
      vertexNormalMaxDelta = meshNormalDelta;
    }
    const beforeBounds = computeBounds(beforeMesh.positions);
    const afterBounds = computeBounds(afterMesh.positions);
    if (beforeBounds && afterBounds) {
      const boundsDelta = maxBoundsDelta(beforeBounds, afterBounds);
      if (boundsDelta > meshBoundsMaxDelta) {
        meshBoundsMaxDelta = boundsDelta;
      }
      if (boundsDelta > meshBoundsTolerance) {
        messages.push(`mesh ${m} bounds differ beyond tolerance (${boundsDelta.toFixed(6)}).`);
      }
    } else if (beforeBounds || afterBounds) {
      messages.push(`mesh ${m} bounds missing parity after reimport.`);
      meshBoundsMaxDelta = meshBoundsTolerance;
    }

    if (meshPosDelta > 1e-4) {
      messages.push(`mesh ${m} positions differ beyond tolerance (${meshPosDelta.toFixed(6)}).`);
    }
    if (meshNormalDelta > 1e-4) {
      messages.push(`mesh ${m} normals differ beyond tolerance (${meshNormalDelta.toFixed(6)}).`);
    }
  }

  const frameLimit = Math.min(beforeSmf.animations.length, afterSmf.animations.length);
  for (let a = 0; a < frameLimit; a++) {
    const beforeAnim = beforeSmf.animations[a];
    const afterAnim = afterSmf.animations[a];

    const frameCount = Math.min(beforeAnim.frames.length, afterAnim.frames.length);
    if (frameCount === 0) {
      continue;
    }
    if (beforeAnim.frames[0].length === 0 || afterAnim.frames[0].length === 0) {
      continue;
    }

    const boneCount = Math.min(
      beforeAnim.frames[0].length,
      afterAnim.frames[0].length,
      beforeAnim.nodeCount,
      afterAnim.nodeCount,
    );

    const frameCountTolerance = 1e-6;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const beforeTimes = beforeAnim.times[frameIndex];
      const afterTimes = afterAnim.times[frameIndex];
      if (beforeTimes !== afterTimes && Math.abs(beforeTimes - afterTimes) > frameCountTolerance) {
        messages.push(
          `animation ${a} timestamp drift at frame ${frameIndex} (${Math.abs(beforeTimes - afterTimes).toFixed(6)}).`
        );
      }
      const perFrameBones = Math.min(
        beforeAnim.frames[frameIndex]?.length ?? 0,
        afterAnim.frames[frameIndex]?.length ?? 0,
      );
      if (perFrameBones === 0) continue;

      const effectiveBoneCount = Math.min(perFrameBones, boneCount);
      if (effectiveBoneCount === 0) continue;
      for (let boneIndex = 0; boneIndex < effectiveBoneCount; boneIndex++) {
        const beforeBone = beforeAnim.frames[frameIndex]?.[boneIndex];
        const afterBone = afterAnim.frames[frameIndex]?.[boneIndex];
        if (!beforeBone || !afterBone) continue;

        const poseDelta = maxQuatDelta(beforeBone, afterBone);
        bonePoseSamplesChecked += 1;

        if (poseDelta > bonePoseMaxDelta) {
          bonePoseMaxDelta = poseDelta;
        }
        if (frameIndex === 0 || frameIndex === frameCount - 1) {
          if (poseDelta > poseTolerance) {
            const position = frameIndex === 0 ? 'first' : 'last';
            messages.push(
              `animation ${a} ${position} frame bone ${boneIndex} pose delta exceeds tolerance (${poseDelta.toFixed(6)}).`
            );
          }
        }
      }
    }

    if (beforeAnim.nodeCount !== afterAnim.nodeCount) {
      messages.push(
        `animation ${a} nodeCount drift: expected ${beforeAnim.nodeCount}, got ${afterAnim.nodeCount}`
      );
    }
    const durationDelta = Math.abs(beforeAnim.duration - afterAnim.duration);
    if (durationDelta > frameCountTolerance) {
      messages.push(`animation ${a} duration drift (${durationDelta.toFixed(6)}).`);
    }
    if (beforeAnim.interpolation !== afterAnim.interpolation) {
      messages.push(
        `animation ${a} interpolation drift: expected ${beforeAnim.interpolation}, got ${afterAnim.interpolation}`
      );
    }
    if (beforeAnim.sampleFrameMultiplier !== afterAnim.sampleFrameMultiplier) {
      messages.push(
        `animation ${a} sampleFrameMultiplier drift: expected ${beforeAnim.sampleFrameMultiplier}, got ${afterAnim.sampleFrameMultiplier}`
      );
    }
    if (beforeAnim.loop !== afterAnim.loop) {
      messages.push(
        `animation ${a} loop mode drift: expected ${beforeAnim.loop}, got ${afterAnim.loop}`
      );
    }
    const frameCountDelta = Math.abs(beforeAnim.times.length - afterAnim.times.length);
    if (frameCountDelta > 0) {
      messages.push(`animation ${a} frame timestamp count drift: expected ${beforeAnim.times.length}, got ${afterAnim.times.length}`);
    }

    if (beforeAnim.lockedBones.length !== afterAnim.lockedBones.length) {
      messages.push(
        `animation ${a} lockedBones count drift: expected ${beforeAnim.lockedBones.length}, got ${afterAnim.lockedBones.length}`
      );
    } else if (
      beforeAnim.lockedBones.some((beforeLock, index) => beforeLock !== afterAnim.lockedBones[index])
    ) {
      messages.push(`animation ${a} lockedBones drift.`);
    }
  }

  if (beforeSmf.animations.length !== afterSmf.animations.length) {
    messages.push(
      `animations: expected ${beforeSmf.animations.length}, got ${afterSmf.animations.length}.`
    );
  }

  if (messages.length === 0) {
    messages.push('SMF roundtrip summary matched after export and reimport.');
  }

  return {
    ok: messages.length === 1 && messages[0].startsWith('SMF roundtrip summary matched'),
    before,
    after,
    vertexPositionMaxDelta,
    vertexNormalMaxDelta,
    bonePoseMaxDelta,
    meshBoundsMaxDelta,
    bonePoseSamplesChecked,
    messages,
  };
}
