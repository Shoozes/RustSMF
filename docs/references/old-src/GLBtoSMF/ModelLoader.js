// ModelLoader.js
// helpers for loading FBX/GLTF/GLB models into three.js scenes,
// normalizing, baking transforms, creating skeleton helpers, and
// detailed root-orientation debugging.

import * as THREE       from 'three';
import { FBXLoader }    from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader }   from 'three/addons/loaders/GLTFLoader.js';
import { CustomSkeletonHelper } from './CustomSkeletonHelper.js';
import { DebugLogger }  from './DebugLogger.js';
import { Utils }        from './Utils.js';

export const ModelLoader = {
  // create material with optional wireframe
  createWireframeMaterial(color, wireframe = false) {
    return Utils.executeWithErrorHandling(
      () => new THREE.MeshLambertMaterial({ color, wireframe }),
      `creating material with color: ${color}, wireframe: ${wireframe}`,
      'error creating material'
    );
  },

  // fallback material
  createFallbackMaterial(color = 0x808080) {
    return new THREE.MeshLambertMaterial({ color });
  },

  // validate material, ensure opaque unless intentionally transparent
  getValidMaterial(mesh, fallbackColor = 0x808080) {
    return Utils.executeWithErrorHandling(
      () => {
        let mat;
        if (mesh.material && mesh.material.map && mesh.material.map.image) {
          mat = mesh.material.clone();
        } else {
          mat = new THREE.MeshLambertMaterial({ color: fallbackColor });
        }
        // fix gltf alpha issue
        if (mat.transparent && mat.opacity >= 0.999) {
          mat.transparent = false;
          mat.depthWrite  = true;
          mat.needsUpdate = true;
        }
        return mat;
      },
      `validating material for "${mesh.name || 'unnamed'}"`,
      'material validation error'
    );
  },

  // create origin marker
  createOriginMarker(size = 0.9) {
    return new THREE.Mesh(
      new THREE.OctahedronGeometry(size),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
  },

  // capture rest-pose local matrices
  getRestPoseLocalMatrices(skeleton, skipPose = false) {
    if (!skeleton) return [];
    const originals = skeleton.bones.map(b => ({
      p: b.position.clone(),
      q: b.quaternion.clone(),
      s: b.scale.clone()
    }));
    if (!skipPose) skeleton.pose();
    const mats = skeleton.bones.map(b => new THREE.Matrix4().compose(
      b.position, b.quaternion, b.scale
    ));
    skeleton.bones.forEach((b, i) => {
      b.position.copy(originals[i].p);
      b.quaternion.copy(originals[i].q);
      b.scale.copy(originals[i].s);
    });
    skeleton.update();
    return mats;
  },

  // unwrap gltf group if needed
  unwrapGLTFIfNeeded(scene) {
    if (scene.children.length === 1 && scene.children[0].isGroup) {
      const wrap = scene.children[0];
      wrap.updateMatrixWorld(true);
      wrap.children.slice().forEach(c => {
        c.applyMatrix4(wrap.matrixWorld);
        scene.add(c);
      });
      scene.remove(wrap);
    }
    return scene;
  },

  // bake transforms into geometry for FBX
  safeBakeModelTransform(model) {
    if (!model) return null;
    Utils.updateMatrixWorld(model);
    model.traverse(c => {
      if (c.isSkinnedMesh) {
        const inv = c.skeleton.boneInverses.map(i => i.clone());
        c.geometry.applyMatrix4(c.matrixWorld);
        Utils.resetTransform(c);
        c.skeleton.boneInverses = inv;
        c.bind(c.skeleton, new THREE.Matrix4());
      } else if (c.isMesh) {
        c.geometry.applyMatrix4(c.matrixWorld);
        Utils.resetTransform(c);
      }
    });
    Utils.resetTransform(model);
    return model;
  },

  // fix skeleton hierarchy if multiple roots
  fixSkeletonHierarchy(skinnedMesh) {
    if (!skinnedMesh?.skeleton) return;
    const roots = skinnedMesh.skeleton.bones.filter(b => !b.parent || !b.parent.isBone);
    if (roots.length > 1) {
      const hips  = roots.find(b => /hips/i.test(b.name));
      const spine = roots.find(b => /spine1/i.test(b.name));
      if (hips && spine) {
        spine.parent.remove(spine);
        hips.add(spine);
        DebugLogger.log('fixed skeleton hierarchy: reparented spine to hips');
      }
    }
  },

  // estimate average bone length for helper scaling
  estimateSkeletonScale(skeleton) {
    let total = 0, count = 0;
    skeleton.bones.forEach(b => b.children.forEach(c => {
      if (c.isBone) { total += c.position.length(); count++; }
    }));
    return count ? total / count : 1;
  },

  // create skeleton helper overlay
  createSkeletonHelper(skinnedMesh, parent = null) {
    skinnedMesh.updateMatrixWorld(true);
    skinnedMesh.skeleton.bones.forEach(b => b.updateMatrixWorld(true));
    const worldScale = skinnedMesh.getWorldScale(new THREE.Vector3()).x;
    const localLen   = this.estimateSkeletonScale(skinnedMesh.skeleton);
    const helper     = new CustomSkeletonHelper(skinnedMesh, {
      skeletonScale: localLen * worldScale
    });
    (parent || skinnedMesh.parent).add(helper);
    DebugLogger.log('created skeleton helper');
    return helper;
  },

  // normalize model to target height (180 units)
  normalizeModelData(modelData, targetHeight = 180) {
    const { model } = modelData;
    Utils.updateMatrixWorld(model);
    const box = new THREE.Box3().setFromObject(model);
    const h   = box.max.y - box.min.y;
    const scale = h > 0 ? targetHeight / h : 1;
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
    Utils.updateMatrixWorld(model);
    modelData.naturalHeight = h;
    modelData.bboxMin.copy(box2.min);
    modelData.bboxMax.copy(box2.max);
    DebugLogger.log(`normalized model to ${targetHeight} units; scale: ${scale.toFixed(3)}`);
  },

  // debug root orientation using pure-rotation extract
  debugRootOrientation(skeleton, fileName) {
    const root = skeleton.bones.find(b => !b.parent || !b.parent.isBone);
    if (!root) {
      DebugLogger.warn(`no root bone found in ${fileName}`);
      return null;
    }
    root.updateMatrixWorld(true);
    const rotOnly = new THREE.Matrix4().extractRotation(root.matrixWorld);
    const q       = new THREE.Quaternion().setFromRotationMatrix(rotOnly);
    const e       = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    DebugLogger.log(
      `root orientation (${fileName}): ` +
      `Quaternion [${q.x.toFixed(3)},${q.y.toFixed(3)},` +
      `${q.z.toFixed(3)},${q.w.toFixed(3)}], ` +
      `Euler [X=${THREE.MathUtils.radToDeg(e.x).toFixed(1)}°,` +
      `Y=${THREE.MathUtils.radToDeg(e.y).toFixed(1)}°,` +
      `Z=${THREE.MathUtils.radToDeg(e.z).toFixed(1)}°]`
    );
    return q;
  },

  // ------------------------------------------------------------------------
  // main load function
  // ------------------------------------------------------------------------
  async load(file, position = new THREE.Vector3(), materialColor = 0x808080, {
    normalize        = true,
    addHelper        = true,
    fileTypeOverride = null
  } = {}) {
    // determine extension
    const ext = (fileTypeOverride || file.name.split('.').pop()).toLowerCase();
    if (!['fbx','gltf','glb'].includes(ext)) {
      throw new Error(`unsupported file type: ${ext}`);
    }
    DebugLogger.log(`loading ${ext.toUpperCase()} file: ${file.name}`);

    // load raw data
    const loader = ext === 'fbx' ? new FBXLoader() : new GLTFLoader();
    const data   = await loader.loadAsync(URL.createObjectURL(file));
    DebugLogger.log(`loaded raw ${ext.toUpperCase()} data`);

    // bake or unwrap
    let model = ext === 'fbx'
      ? this.safeBakeModelTransform(data)
      : this.unwrapGLTFIfNeeded(data.scene);
    if (!model) throw new Error('no valid model after processing');
    DebugLogger.log('processed model transforms');

    // set position & animations
    model.position.copy(position);
    model.animations = data.animations || [];

    // apply materials
    const meshes = [];
    model.traverse(c => {
      if (c.isMesh || c.isSkinnedMesh) {
        c.material = this.getValidMaterial(c, materialColor);
        meshes.push(c);
      }
    });
    if (!meshes.length) throw new Error(`no mesh found in ${file.name}`);
    DebugLogger.log(`applied materials to ${meshes.length} meshes`);

    // identify skeleton
    const mesh = meshes.find(m => m.isSkinnedMesh) || meshes[0];
    let skeleton = null, isSkinned = false;
    if (mesh.isSkinnedMesh && mesh.geometry.attributes.skinIndex) {
      skeleton = mesh.skeleton;
      isSkinned = true;
      this.fixSkeletonHierarchy(mesh);
    } else {
      const bones = [];
      model.traverse(c => { if (c.isBone) bones.push(c); });
      if (bones.length) {
        skeleton = new THREE.Skeleton(bones);
        const sk = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
        sk.bind(skeleton, new THREE.Matrix4());
        bones.filter(b => !b.parent || !b.parent.isBone)
             .forEach(root => sk.add(root));
        isSkinned = true;
      }
    }
    DebugLogger.log(`skeleton ${skeleton ? 'detected' : 'not found'}; skinned: ${isSkinned}`);

    // assemble modelData
    const modelData = {
      model,
      mesh,
      skeleton,
      animations: model.animations,
      restPose: [],
      restLocalMatricesMap: {},
      naturalHeight: 0,
      bboxMin: new THREE.Vector3(),
      bboxMax: new THREE.Vector3(),
      isSkinned,
      fileType: ext
    };

    // normalize
    if (normalize) {
      this.normalizeModelData(modelData, 180);
      DebugLogger.log('completed model normalization');
    }

    // rest pose capture
    if (skeleton) {
      const restMats = this.getRestPoseLocalMatrices(skeleton, ext !== 'fbx');
      modelData.restPose = skeleton.bones.map((b, i) => ({
        position: b.position.clone(),
        quaternion: b.quaternion.clone(),
        scale: b.scale.clone()
      }));
      modelData.restLocalMatricesMap = Object.fromEntries(
        skeleton.bones.map((b, i) => [b.name || `bone_${i}`, restMats[i]])
      );
      DebugLogger.log('captured rest pose post-normalization');
    }

    // debug root orientation
    if (skeleton) {
      modelData.rootQuaternion = this.debugRootOrientation(skeleton, file.name);
    }

    // add helper + origin marker
    if (addHelper && skeleton) {
      modelData.skeletonHelper = this.createSkeletonHelper(mesh, mesh.parent || model);
      model.originMarker       = this.createOriginMarker(0.9);
      model.add(model.originMarker);
      DebugLogger.log('added skeleton helper and origin marker');
    }

    return modelData;
  }
};
