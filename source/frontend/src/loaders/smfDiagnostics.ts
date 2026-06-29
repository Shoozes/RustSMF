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
  materialTextures?: SmfMaterialTextureSummary[];
}

export interface SmfMaterialTextureSummary {
  meshName: string;
  materialIndex: number;
  mapType: string;
  textureName: string;
  width: number | null;
  height: number | null;
  source: string;
  isPowerOfTwo: boolean | null;
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

export type SmfRoundtripStatus = 'passed' | 'warning' | 'failed';
export type SmfRoundtripCheckLevel = 'pass' | 'warning' | 'error';

export interface SmfRoundtripCheck {
  level: SmfRoundtripCheckLevel;
  code: string;
  label: string;
  message: string;
  target?: string;
}

export interface SmfRoundtripReport {
  ok: boolean;
  status: SmfRoundtripStatus;
  before: SmfRoundtripSummary;
  after: SmfRoundtripSummary;
  checks: SmfRoundtripCheck[];
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

export function makeDiagnosticReport(
  diagnostics: SmfDiagnostic[],
  materialTextures: SmfMaterialTextureSummary[] = [],
): SmfDiagnosticReport {
  return {
    diagnostics,
    materialTextures,
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
  const checks: SmfRoundtripCheck[] = [];
  let vertexPositionMaxDelta = 0;
  let vertexNormalMaxDelta = 0;
  let bonePoseMaxDelta = 0;
  let meshBoundsMaxDelta = 0;
  let bonePoseSamplesChecked = 0;
  let countMismatchCount = 0;
  let geometryMismatchCount = 0;
  let boundsMismatchCount = 0;
  let timingMismatchCount = 0;
  let poseMismatchCount = 0;
  let animationMetadataMismatchCount = 0;
  const poseTolerance = 5e-4;
  const meshBoundsTolerance = 1e-4;
  const frameCountTolerance = 1e-6;

  const pushCheck = (
    level: SmfRoundtripCheckLevel,
    code: string,
    label: string,
    message: string,
    target?: string,
  ): void => {
    checks.push({ level, code, label, message, target });
  };

  const pushMismatch = (
    code: string,
    label: string,
    message: string,
    target?: string,
  ): void => {
    messages.push(message);
    pushCheck('error', code, label, message, target);
  };

  for (const key of Object.keys(before) as (keyof SmfRoundtripSummary)[]) {
    if (before[key] !== after[key]) {
      countMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_COUNT_MISMATCH',
        'Counts',
        `${key}: expected ${before[key]}, got ${after[key]}`,
        key,
      );
    }
  }

  if (countMismatchCount === 0) {
    pushCheck(
      'pass',
      'SMF_ROUNDTRIP_COUNTS_OK',
      'Counts',
      'Mesh, texture, bone, animation, vertex, triangle, and frame counts match.',
    );
  }

  const countToCheck = Math.min(beforeSmf.meshes.length, afterSmf.meshes.length);
  for (let m = 0; m < countToCheck; m++) {
    const beforeMesh = beforeSmf.meshes[m];
    const afterMesh = afterSmf.meshes[m];
    const meshTarget = beforeMesh.name || `mesh ${m}`;
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
        boundsMismatchCount += 1;
        pushMismatch(
          'SMF_ROUNDTRIP_BOUNDS_DELTA',
          'Bounds',
          `mesh ${m} bounds differ beyond tolerance (${boundsDelta.toFixed(6)}).`,
          meshTarget,
        );
      }
    } else if (beforeBounds || afterBounds) {
      boundsMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_BOUNDS_MISSING',
        'Bounds',
        `mesh ${m} bounds missing parity after reimport.`,
        meshTarget,
      );
      meshBoundsMaxDelta = meshBoundsTolerance;
    }

    if (meshPosDelta > 1e-4) {
      geometryMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_POSITION_DELTA',
        'Geometry',
        `mesh ${m} positions differ beyond tolerance (${meshPosDelta.toFixed(6)}).`,
        meshTarget,
      );
    }
    if (meshNormalDelta > 1e-4) {
      geometryMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_NORMAL_DELTA',
        'Geometry',
        `mesh ${m} normals differ beyond tolerance (${meshNormalDelta.toFixed(6)}).`,
        meshTarget,
      );
    }
  }

  if (countToCheck > 0 && geometryMismatchCount === 0) {
    pushCheck(
      'pass',
      'SMF_ROUNDTRIP_GEOMETRY_OK',
      'Geometry',
      'Vertex positions and normals are within tolerance.',
    );
  }
  if (countToCheck > 0 && boundsMismatchCount === 0) {
    pushCheck(
      'pass',
      'SMF_ROUNDTRIP_BOUNDS_OK',
      'Bounds',
      'Mesh bounds are within tolerance.',
    );
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

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const beforeTimes = beforeAnim.times[frameIndex];
      const afterTimes = afterAnim.times[frameIndex];
      if (beforeTimes !== afterTimes && Math.abs(beforeTimes - afterTimes) > frameCountTolerance) {
        timingMismatchCount += 1;
        pushMismatch(
          'SMF_ROUNDTRIP_ANIMATION_TIME_DELTA',
          'Animation timing',
          `animation ${a} timestamp drift at frame ${frameIndex} (${Math.abs(beforeTimes - afterTimes).toFixed(6)}).`,
          beforeAnim.name || `animation ${a}`,
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
            poseMismatchCount += 1;
            pushMismatch(
              position === 'first'
                ? 'SMF_ROUNDTRIP_FIRST_POSE_DELTA'
                : 'SMF_ROUNDTRIP_LAST_POSE_DELTA',
              'Animation pose',
              `animation ${a} ${position} frame bone ${boneIndex} pose delta exceeds tolerance (${poseDelta.toFixed(6)}).`,
              beforeAnim.name || `animation ${a}`,
            );
          }
        }
      }
    }

    if (beforeAnim.nodeCount !== afterAnim.nodeCount) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_NODE_COUNT',
        'Animation metadata',
        `animation ${a} nodeCount drift: expected ${beforeAnim.nodeCount}, got ${afterAnim.nodeCount}`,
        beforeAnim.name || `animation ${a}`,
      );
    }
    const durationDelta = Math.abs(beforeAnim.duration - afterAnim.duration);
    if (durationDelta > frameCountTolerance) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_DURATION',
        'Animation metadata',
        `animation ${a} duration drift (${durationDelta.toFixed(6)}).`,
        beforeAnim.name || `animation ${a}`,
      );
    }
    if (beforeAnim.interpolation !== afterAnim.interpolation) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_INTERPOLATION',
        'Animation metadata',
        `animation ${a} interpolation drift: expected ${beforeAnim.interpolation}, got ${afterAnim.interpolation}`,
        beforeAnim.name || `animation ${a}`,
      );
    }
    if (beforeAnim.sampleFrameMultiplier !== afterAnim.sampleFrameMultiplier) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_SAMPLE_MULTIPLIER',
        'Animation metadata',
        `animation ${a} sampleFrameMultiplier drift: expected ${beforeAnim.sampleFrameMultiplier}, got ${afterAnim.sampleFrameMultiplier}`,
        beforeAnim.name || `animation ${a}`,
      );
    }
    if (beforeAnim.loop !== afterAnim.loop) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_LOOP',
        'Animation metadata',
        `animation ${a} loop mode drift: expected ${beforeAnim.loop}, got ${afterAnim.loop}`,
        beforeAnim.name || `animation ${a}`,
      );
    }
    const frameCountDelta = Math.abs(beforeAnim.times.length - afterAnim.times.length);
    if (frameCountDelta > 0) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_FRAME_COUNT',
        'Animation metadata',
        `animation ${a} frame timestamp count drift: expected ${beforeAnim.times.length}, got ${afterAnim.times.length}`,
        beforeAnim.name || `animation ${a}`,
      );
    }

    if (beforeAnim.lockedBones.length !== afterAnim.lockedBones.length) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_LOCKED_BONES',
        'Animation metadata',
        `animation ${a} lockedBones count drift: expected ${beforeAnim.lockedBones.length}, got ${afterAnim.lockedBones.length}`,
        beforeAnim.name || `animation ${a}`,
      );
    } else if (
      beforeAnim.lockedBones.some((beforeLock, index) => beforeLock !== afterAnim.lockedBones[index])
    ) {
      animationMetadataMismatchCount += 1;
      pushMismatch(
        'SMF_ROUNDTRIP_ANIMATION_LOCKED_BONES',
        'Animation metadata',
        `animation ${a} lockedBones drift.`,
        beforeAnim.name || `animation ${a}`,
      );
    }
  }

  if (beforeSmf.animations.length !== afterSmf.animations.length) {
    animationMetadataMismatchCount += 1;
    pushMismatch(
      'SMF_ROUNDTRIP_ANIMATION_COUNT',
      'Animation metadata',
      `animations: expected ${beforeSmf.animations.length}, got ${afterSmf.animations.length}.`,
    );
  }

  if (beforeSmf.animations.length > 0 || afterSmf.animations.length > 0) {
    if (timingMismatchCount === 0) {
      pushCheck(
        'pass',
        'SMF_ROUNDTRIP_ANIMATION_TIMING_OK',
        'Animation timing',
        'Animation frame timestamps are within tolerance.',
      );
    }
    if (poseMismatchCount === 0) {
      pushCheck(
        'pass',
        'SMF_ROUNDTRIP_ANIMATION_POSE_OK',
        'Animation pose',
        bonePoseSamplesChecked > 0
          ? 'First and last animation pose samples are within tolerance.'
          : 'No animation pose samples were available to compare.',
      );
    }
    if (animationMetadataMismatchCount === 0) {
      pushCheck(
        'pass',
        'SMF_ROUNDTRIP_ANIMATION_METADATA_OK',
        'Animation metadata',
        'Animation metadata fields match.',
      );
    }
  } else {
    pushCheck(
      'pass',
      'SMF_ROUNDTRIP_NO_ANIMATIONS',
      'Animation',
      'No animation clips to compare.',
    );
  }

  if (messages.length === 0) {
    messages.push('SMF roundtrip summary matched after export and reimport.');
  }

  const hasError = checks.some((check) => check.level === 'error');
  const hasWarning = checks.some((check) => check.level === 'warning');
  const status: SmfRoundtripStatus = hasError ? 'failed' : hasWarning ? 'warning' : 'passed';

  return {
    ok: status !== 'failed',
    status,
    before,
    after,
    checks,
    vertexPositionMaxDelta,
    vertexNormalMaxDelta,
    bonePoseMaxDelta,
    meshBoundsMaxDelta,
    bonePoseSamplesChecked,
    messages,
  };
}
