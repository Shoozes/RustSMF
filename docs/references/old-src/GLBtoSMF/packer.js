// packer.js
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DebugLogger } from './DebugLogger.js';
import { smf_dq_to_matrix, smf_transform_to_yup, smf_dq_negate, smf_dq_flip_sign } from './smf_dq_math.js';

// Build Three.js scene from imported data and export to GLB Blob URL.
export async function packGLB({ meshes, textures, bones, animations }) {
  DebugLogger.log('Starting GLB pack:', {
    meshCount: meshes.length,
    textureCount: textures.length,
    boneCount: bones.length,
    animCount: animations.length
  });

  const scene = new THREE.Scene();
  const modelRoot = new THREE.Group();
  modelRoot.name = 'ModelRoot';
  scene.add(modelRoot);

  // Textures: Create Three.js Texture objects
  const threeTextures = textures.map(t => {
    const tex = new THREE.Texture(t.image);
    tex.flipY = false;  // GLTF expects unflipped
    tex.needsUpdate = true;
    return tex;
  });

  // Bones: Build Skeleton from nodes
  const threeBones = [];
  const boneInverses = [];
  const worldMats = [];
  bones.forEach((b, i) => {
    const bone = new THREE.Bone();
    bone.name = `Bone_${i}`;

    let mat = smf_dq_to_matrix(b.dq);
    mat = smf_transform_to_yup(mat);
    worldMats.push(new THREE.Matrix4().fromArray(mat));

    threeBones.push(bone);
  });

  // Compute local matrices
  bones.forEach((b, i) => {
    const bone = threeBones[i];
    const worldMat = worldMats[i];
    let localMat;
    if (b.parent > 0) {
      const parentWorld = worldMats[b.parent];
      localMat = new THREE.Matrix4().copy(parentWorld).invert().multiply(worldMat);
    } else {
      localMat = worldMat;
    }

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    localMat.decompose(pos, quat, scale);
    bone.position.copy(pos);
    bone.quaternion.copy(quat);
    bone.scale.copy(scale);

    // Hierarchy
    if (b.parent > 0 && b.parent < threeBones.length) {
      threeBones[b.parent].add(bone);
    }

    // Bone inverse: invert the world matrix
    const inv = new THREE.Matrix4().copy(worldMat).invert();
    boneInverses.push(inv);
  });

  const skeleton = new THREE.Skeleton(threeBones, boneInverses);

  // Add root bones to modelRoot
  threeBones.filter(b => b.parent <= 0 || !threeBones.includes(b.parent)).forEach(root => modelRoot.add(root));

  // Create remap for skin indices (SMF sampleBoneInd to Three.js bone index = nodeInd)
  const boneRemap = [];
  let sampleInd = 0;
  bones.forEach((b, nodeInd) => {
    if (b.isBone) {
      boneRemap[sampleInd] = nodeInd;
      sampleInd++;
    }
  });

  // Meshes: Build SkinnedMesh for each
  const skinnedMeshes = [];
  meshes.forEach((m, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    geometry.setAttribute('tangent', new THREE.BufferAttribute(m.tangents, 4));

    // Remap skinIndex
    const skinIndicesNew = new Uint16Array(m.skinIndices.length);
    for (let k = 0; k < m.skinIndices.length; k++) {
      skinIndicesNew[k] = boneRemap[m.skinIndices[k]] || 0;
    }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndicesNew, 4));

    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeights, 4));

    const material = new THREE.MeshStandardMaterial({
      map: m.texIdx >= 0 ? threeTextures[m.texIdx] : null,
      skinning: true
    });

    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.name = m.name;
    skinnedMesh.bind(skeleton, new THREE.Matrix4());
    skinnedMesh.visible = !!m.visible;

    modelRoot.add(skinnedMesh);
    skinnedMeshes.push(skinnedMesh);
    DebugLogger.log(`Packed mesh[${i}] "${m.name}": verts=${m.verts}`);
  });

  // Correct overall rotation
  modelRoot.rotation.y = Math.PI;

  // Animations: Build clips from frames
  const clips = [];
  animations.forEach((a, i) => {
    const tracks = [];

    // Per-bone tracks: position, quaternion (from DQ)
    for (let n = 0; n < a.nodeCount; n++) {
      const boneName = threeBones[n].name + '.';

      const posValues = new Float32Array(a.times.length * 3);
      const quatValues = new Float32Array(a.times.length * 4);

      a.frames.forEach((frame, f) => {
        const frameWorldMats = [];
        frame.forEach((dq, nn) => {
          let mat = smf_dq_to_matrix(dq);
          mat = smf_transform_to_yup(mat);
          frameWorldMats.push(new THREE.Matrix4().fromArray(mat));
        });

        const worldMat = frameWorldMats[n];
        let localMat;
        if (bones[n].parent > 0) {
          const parentWorld = frameWorldMats[bones[n].parent];
          localMat = new THREE.Matrix4().copy(parentWorld).invert().multiply(worldMat);
        } else {
          localMat = worldMat;
        }

        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        localMat.decompose(pos, quat, scale);

        posValues[f*3+0] = pos.x;
        posValues[f*3+1] = pos.y;
        posValues[f*3+2] = pos.z;

        quatValues[f*4+0] = quat.x;
        quatValues[f*4+1] = quat.y;
        quatValues[f*4+2] = quat.z;
        quatValues[f*4+3] = quat.w;
      });

      tracks.push(new THREE.VectorKeyframeTrack(boneName + 'position', a.times, posValues));
      tracks.push(new THREE.QuaternionKeyframeTrack(boneName + 'quaternion', a.times, quatValues));
    }

    const clip = new THREE.AnimationClip(a.name, a.duration, tracks);
    clips.push(clip);
    DebugLogger.log(`Packed anim[${i}] "${a.name}": ${a.times.length} keyframes`);
  });

  modelRoot.animations = clips;

  // Export to GLB
  const exporter = new GLTFExporter();
  const options = { binary: true, animations: clips };
  const glbData = await exporter.parseAsync(scene, options);
  const blob = new Blob([glbData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  DebugLogger.log('GLB exported URL:', url);

  return { url, clips };  // Clips for optional preview if needed
}