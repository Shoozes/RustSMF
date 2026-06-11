import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLoader } from './ModelLoader.js';
import { DebugLogger } from './DebugLogger.js';

// Unpack GLB file into structured data for SMF export and UI display
export async function unpackGLB(url) {
  // Load GLB using GLTFLoader
  const gltf = await new GLTFLoader().loadAsync(url);
  DebugLogger.log('GLTF loaded:', { meshes: gltf.scene.children.length, animations: gltf.animations.length });

  // Unwrap GLTF scene if needed
  const scene = ModelLoader.unwrapGLTFIfNeeded(gltf.scene);

  // Collect skinned meshes and preprocess
  const meshes = [];
  scene.traverse(o => {
    if (o.isSkinnedMesh) {
      const geometry = o.geometry.clone();
      if (!geometry.attributes.tangent) {
        geometry.computeTangents();
        DebugLogger.log(`Mesh "${o.name || 'unnamed'}" tangents computed`);
      }
      if (!geometry.attributes.uv) {
        const vertexCount = geometry.attributes.position.count;
        const uvs = new Float32Array(vertexCount * 2).fill(0);
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        DebugLogger.warn(`Mesh "${o.name || 'unnamed'}" had no UVs; added default UVs`);
      }
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
        DebugLogger.log(`Mesh "${o.name || 'unnamed'}" normals computed`);
      }
      let triangles = [];
      let vertexCount = geometry.attributes.position.count;
      if (geometry.index) {
        const indices = geometry.index.array;
        for (let i = 0; i < indices.length; i += 3) {
          triangles.push([indices[i], indices[i + 1], indices[i + 2]]);
        }
        DebugLogger.log(`Mesh "${o.name || 'unnamed'}" triangulated: ${triangles.length} triangles`);
      } else {
        for (let v = 0; v < vertexCount; v += 3) {
          triangles.push([v, v + 1, v + 2]);
        }
        DebugLogger.log(`Mesh "${o.name || 'unnamed'}" non-indexed: ${triangles.length} triangles`);
      }
      if (vertexCount < 3 || triangles.length === 0) {
        DebugLogger.warn(`Mesh "${o.name || 'unnamed'}" has invalid vertex count (${vertexCount}) or no triangles`);
        return;
      }
      o.geometry = geometry;
      meshes.push({ original: o, triangles });
    }
  });
  if (!meshes.length) {
    throw new Error('No valid SkinnedMesh found in GLB.');
  }
  DebugLogger.log('Found SkinnedMesh count:', meshes.length);

  // Extract textures
  const textures = [];
  const meshToTextureIdx = new Map();
  for (const [mi, meshData] of meshes.entries()) {
    const mesh = meshData.original;
    const mat = ModelLoader.getValidMaterial(mesh);
    if (mat.map && mat.map.image) {
      const img = mat.map.image;
      if (!img.complete && (img.src || img.currentSrc)) {
        try {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error(`Failed to load texture for mesh[${mi}]`));
            if (img.complete) resolve();
          });
        } catch (err) {
          DebugLogger.warn(`Failed to load texture for mesh[${mi}]:`, err.message);
          meshToTextureIdx.set(mesh, -1);
          continue;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const previewUrl = canvas.toDataURL('image/png');
      let texIdx = textures.findIndex(t => t.previewUrl === previewUrl);
      if (texIdx === -1) {
        texIdx = textures.length;
        textures.push({ image: img, previewUrl });
      }
      meshToTextureIdx.set(mesh, texIdx);
      DebugLogger.log(`Texture for mesh[${mi}] assigned index: ${texIdx}`);
    } else {
      meshToTextureIdx.set(mesh, -1);
      DebugLogger.log(`No texture for mesh[${mi}]`);
    }
  }
  DebugLogger.log('Unique textures count:', textures.length);

  // Extract bones with transformation logging
  const bones = meshes[0].original.skeleton?.bones || [];
  const boneData = bones.map((b, bi) => {
    const matrixWorld = b.matrixWorld.toArray();
    const parentIndex = b.parent && b.parent.isBone ? bones.indexOf(b.parent) : -1;
    DebugLogger.log(`Bone[${bi}] "${b.name}": parent=${parentIndex}, matrixWorld=[${matrixWorld.join(', ')}]`);
    return { index: bi, parent: parentIndex, isBone: parentIndex >= 0, mesh: meshes[0].original };
  });
  DebugLogger.log('Bones count:', bones.length);

  // Extract animations
  const animations = gltf.animations || [];
  const animsData = animations.map(clip => {
    const times = [...new Set(
      clip.tracks
        .filter(t => /position|quaternion|scale/.test(t.name))
        .flatMap(t => Array.from(t.times))
    )].sort((a, b) => a - b);
    DebugLogger.log(`Animation "${clip.name || `Anim_${clip.id}`}": ${times.length} keyframes`);
    return { name: clip.name || `Anim_${clip.id}`, frames: times.length, clip, mesh: meshes[0].original, times };
  });
  DebugLogger.log('Animations count:', animations.length);

  // Prepare mesh debug data
  const meshesData = meshes.map((m, i) => {
    const mesh = m.original;
    const geometry = mesh.geometry;
    const vertexCount = geometry.attributes.position.count;
    const triangles = m.triangles;
    if (triangles.length === 0) {
      DebugLogger.error(`Mesh[${i}] "${mesh.name || 'Mesh_' + i}" has no triangles; skipping`);
      return null;
    }
    DebugLogger.log(`Mesh[${i}] "${mesh.name || 'Mesh_' + i}": vertex count=${vertexCount}, triangle count=${triangles.length}`);
    return {
      name: mesh.name || `Mesh_${i}`,
      verts: triangles.length * 3,
      triangles,
      texIdx: meshToTextureIdx.get(mesh),
      mesh
    };
  }).filter(m => m !== null);

  if (!meshesData.length) {
    throw new Error('No valid meshes after processing.');
  }

  return {
    gltf,
    meshes: meshesData,
    textures,
    bones: boneData,
    animations: animsData
  };
}