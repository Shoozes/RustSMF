import type { ImportedSmf } from './smf';
import { SMF_LIMITS } from './smfBinary';

const DQ_COMPONENTS = 8;
const DQ_ROTATION_EPSILON = 1e-8;
const FLOAT_EPSILON = 1e-5;

export class SmfSemanticValidationError extends Error {
  readonly code = 'SMF_SEMANTIC_INVALID';

  constructor(message: string) {
    super(`Invalid SMF data: ${message}`);
    this.name = 'SmfSemanticValidationError';
  }
}

function fail(message: string): never {
  throw new SmfSemanticValidationError(message);
}

function requireFiniteValues(values: ArrayLike<number>, label: string): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      fail(`${label}[${index}] is not finite`);
    }
  }
}

function requireDualQuaternion(dq: ArrayLike<number>, label: string): void {
  if (dq.length !== DQ_COMPONENTS) {
    fail(`${label} must contain ${DQ_COMPONENTS} components`);
  }
  requireFiniteValues(dq, label);
  let rotationNormSquared = 0;
  for (let index = 0; index < 4; index += 1) {
    const component = dq[index] ?? 0;
    rotationNormSquared += component * component;
  }
  if (!Number.isFinite(rotationNormSquared) || rotationNormSquared <= DQ_ROTATION_EPSILON) {
    fail(`${label} has a zero-length rotation component`);
  }
}

function validateParentGraph(bones: ImportedSmf['bones']): void {
  for (let index = 0; index < bones.length; index += 1) {
    const parent = bones[index]?.parent;
    if (!Number.isInteger(parent) || parent < -1 || parent >= bones.length) {
      fail(`bone ${index} parent ${parent} is outside the rig`);
    }
  }

  for (let start = 0; start < bones.length; start += 1) {
    const visited = new Set<number>();
    let current = start;
    while (current >= 0 && current < bones.length) {
      if (visited.has(current)) {
        fail(`rig parent cycle includes bone ${current}`);
      }
      visited.add(current);
      const parent = bones[current]?.parent ?? -1;
      if (parent < 0 || parent === current) break;
      current = parent;
    }
  }
}

function validateMeshes(imported: ImportedSmf): void {
  const deformBoneCount = imported.bones.filter((bone) => bone.isBone === 1).length;
  let totalVertices = 0;

  imported.meshes.forEach((mesh, meshIndex) => {
    const label = `mesh ${meshIndex}`;
    if (!Number.isSafeInteger(mesh.verts) || mesh.verts < 3 || mesh.verts > SMF_LIMITS.maxMeshVertices || mesh.verts % 3 !== 0) {
      fail(`${label} has an invalid vertex count ${mesh.verts}`);
    }
    if (mesh.positions.length !== mesh.verts * 3) fail(`${label} positions length does not match verts`);
    if (mesh.normals.length !== mesh.verts * 3) fail(`${label} normals length does not match verts`);
    if (mesh.uvs.length !== mesh.verts * 2) fail(`${label} UV length does not match verts`);
    if (mesh.tangents.length !== mesh.verts * 4) fail(`${label} tangent length does not match verts`);
    if (mesh.skinIndices.length !== mesh.verts * 4) fail(`${label} skin-index length does not match verts`);
    if (mesh.skinWeights.length !== mesh.verts * 4) fail(`${label} skin-weight length does not match verts`);
    if (!Number.isInteger(mesh.texIdx) || mesh.texIdx < -1 || mesh.texIdx >= imported.textures.length) {
      fail(`${label} texture index ${mesh.texIdx} is outside the texture table`);
    }
    if (!Array.isArray(mesh.triangles) || mesh.triangles.length !== mesh.verts / 3) {
      fail(`${label} triangle metadata does not match verts`);
    }

    requireFiniteValues(mesh.positions, `${label} positions`);
    requireFiniteValues(mesh.normals, `${label} normals`);
    requireFiniteValues(mesh.uvs, `${label} UVs`);
    requireFiniteValues(mesh.tangents, `${label} tangents`);
    requireFiniteValues(mesh.skinWeights, `${label} skin weights`);

    mesh.triangles.forEach((triangle, triangleIndex) => {
      if (!Array.isArray(triangle) || triangle.length !== 3) {
        fail(`${label} triangle ${triangleIndex} is not a three-index face`);
      }
      triangle.forEach((vertexIndex, componentIndex) => {
        if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= mesh.verts) {
          fail(`${label} triangle ${triangleIndex} index ${componentIndex} is outside the vertex range`);
        }
      });
    });

    for (let vertex = 0; vertex < mesh.verts; vertex += 1) {
      let weightSum = 0;
      for (let influence = 0; influence < 4; influence += 1) {
        const offset = vertex * 4 + influence;
        const boneIndex = mesh.skinIndices[offset] ?? -1;
        const weight = mesh.skinWeights[offset] ?? Number.NaN;
        if (!Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= deformBoneCount) {
          fail(`${label} vertex ${vertex} skin index ${boneIndex} is outside the deform-bone range`);
        }
        if (weight < 0 || weight > 1) {
          fail(`${label} vertex ${vertex} skin weight ${weight} is outside 0..1`);
        }
        weightSum += weight;
      }
      if (!Number.isFinite(weightSum) || weightSum < -FLOAT_EPSILON || weightSum > 4 + FLOAT_EPSILON) {
        fail(`${label} vertex ${vertex} skin weights have an invalid sum ${weightSum}`);
      }
    }

    totalVertices += mesh.verts;
    if (totalVertices > SMF_LIMITS.maxMeshVertices) {
      fail(`total mesh vertices exceed ${SMF_LIMITS.maxMeshVertices}`);
    }
  });
}

function validateTextures(imported: ImportedSmf): void {
  if (imported.textures.length > SMF_LIMITS.maxTextures) {
    fail(`texture count ${imported.textures.length} exceeds ${SMF_LIMITS.maxTextures}`);
  }
  imported.textures.forEach((texture, textureIndex) => {
    if (!Number.isInteger(texture.width) || !Number.isInteger(texture.height)
      || texture.width < 1 || texture.width > SMF_LIMITS.maxTextureWidth
      || texture.height < 1 || texture.height > SMF_LIMITS.maxTextureHeight) {
      fail(`texture ${textureIndex} dimensions are outside the supported range`);
    }
    const expectedBytes = texture.width * texture.height * 4;
    if (texture.pixels.length !== expectedBytes) {
      fail(`texture ${textureIndex} has ${texture.pixels.length} bytes; expected ${expectedBytes}`);
    }
  });
}

function validateAnimations(imported: ImportedSmf): void {
  if (imported.animations.length > SMF_LIMITS.maxAnimations) {
    fail(`animation count ${imported.animations.length} exceeds ${SMF_LIMITS.maxAnimations}`);
  }
  imported.animations.forEach((animation, animationIndex) => {
    const label = `animation ${animationIndex}`;
    if (!Number.isFinite(animation.duration) || animation.duration < 0) {
      fail(`${label} has an invalid duration`);
    }
    if (!Number.isInteger(animation.nodeCount) || animation.nodeCount !== imported.bones.length) {
      fail(`${label} node count ${animation.nodeCount} does not match the rig`);
    }
    if (animation.times.length !== animation.frames.length || animation.times.length > SMF_LIMITS.maxAnimationFrames) {
      fail(`${label} time/frame arrays are mismatched or too large`);
    }
    if (animation.lockedBones.some((boneIndex) => !Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= imported.bones.length)) {
      fail(`${label} contains a locked-bone index outside the rig`);
    }

    let previousTime = -Infinity;
    animation.times.forEach((time, frameIndex) => {
      if (!Number.isFinite(time) || time < 0 || time > animation.duration || time + FLOAT_EPSILON < previousTime) {
        fail(`${label} frame ${frameIndex} has a non-monotonic or out-of-range time`);
      }
      previousTime = time;
      const frame = animation.frames[frameIndex];
      if (!frame || frame.length !== imported.bones.length) {
        fail(`${label} frame ${frameIndex} does not contain one DQ per rig node`);
      }
      frame.forEach((dq, nodeIndex) => requireDualQuaternion(dq, `${label} frame ${frameIndex} node ${nodeIndex}`));
    });
  });
}

export function validateImportedSmfSemantics(imported: ImportedSmf): void {
  if (imported.bones.length > SMF_LIMITS.maxRigNodes) {
    fail(`rig node count ${imported.bones.length} exceeds ${SMF_LIMITS.maxRigNodes}`);
  }
  imported.bones.forEach((bone, index) => {
    if (bone.index !== index || !Number.isInteger(bone.index)) fail(`bone ${index} has inconsistent index metadata`);
    if (bone.isBone !== 0 && bone.isBone !== 1) fail(`bone ${index} has an invalid isBone flag`);
    requireDualQuaternion(bone.dq, `bone ${index} dual quaternion`);
    if (!Array.isArray(bone.axis) || bone.axis.length < 3) fail(`bone ${index} has an incomplete axis`);
    requireFiniteValues(bone.axis, `bone ${index} axis`);
  });
  validateParentGraph(imported.bones);
  validateTextures(imported);
  validateMeshes(imported);
  validateAnimations(imported);
}
