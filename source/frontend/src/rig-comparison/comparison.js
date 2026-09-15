import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const byId = (id) => document.getElementById(id);
const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);

const abort = new AbortController();
const views = [];
const runtime = { disposed: false, ready: false, viewCount: 0 };
window.__RUSTSMF_COMPARISON_STATE__ = runtime;
let manifest;
let schedule = [];
let scheduleIndex = 0;
let playing = false;
let animation;
let lastTick = 0;
let elapsed = 0;
const MAX_COMPARISON_GRID_FRAMES = 6000;
const jointWorldPosition = new THREE.Vector3();
const parentWorldPosition = new THREE.Vector3();
const childWorldPosition = new THREE.Vector3();
const MAPPED_COLOR = new THREE.Color(0x00a9c1);
const UNMAPPED_COLOR = new THREE.Color(0xd18a00);

function colorAttribute(items, mappedNames, name) {
  const values = new Float32Array(items.length * 3);
  items.forEach((item, index) => {
    const color = mappedNames.has(item[name]) ? MAPPED_COLOR : UNMAPPED_COLOR;
    color.toArray(values, index * 3);
  });
  return new THREE.Float32BufferAttribute(values, 3);
}

function createSkeletonOverlay(skeleton, scene, mappedNames) {
  const links = skeleton.bones.flatMap((bone) => (
    bone.parent?.isBone ? [{ bone, parent: bone.parent }] : []
  ));
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(links.length * 6), 3)
      .setUsage(THREE.DynamicDrawUsage),
  );
  lineGeometry.setAttribute('color', colorAttribute(
    links.flatMap(({ bone }) => [{ name: bone.name }, { name: bone.name }]),
    mappedNames,
    'name',
  ));
  const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  }));
  lines.frustumCulled = false;
  lines.renderOrder = 10;
  lines.visible = false;
  scene.add(lines);

  const jointGeometry = new THREE.BufferGeometry();
  jointGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(skeleton.bones.length * 3), 3)
      .setUsage(THREE.DynamicDrawUsage),
  );
  jointGeometry.setAttribute('color', colorAttribute(skeleton.bones, mappedNames, 'name'));
  const joints = new THREE.Points(jointGeometry, new THREE.PointsMaterial({
    vertexColors: true,
    size: 7,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
  }));
  joints.frustumCulled = false;
  joints.renderOrder = 11;
  joints.visible = false;
  scene.add(joints);
  return { bones: skeleton.bones, links, lines, joints };
}

function createJointDiagnostic(scene) {
  const axes = new THREE.AxesHelper(0.18);
  const axesMaterials = Array.isArray(axes.material) ? axes.material : [axes.material];
  for (const material of axesMaterials) {
    material.depthTest = false;
    material.depthWrite = false;
    material.transparent = true;
    material.opacity = 0.95;
  }
  axes.renderOrder = 12;
  axes.visible = false;
  scene.add(axes);
  const planeGeometry = new THREE.BufferGeometry();
  planeGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(24), 3).setUsage(THREE.DynamicDrawUsage),
  );
  const plane = new THREE.LineSegments(planeGeometry, new THREE.LineBasicMaterial({
    color: 0xff315b,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  }));
  plane.frustumCulled = false;
  plane.renderOrder = 12;
  plane.visible = false;
  scene.add(plane);
  return { axes, plane };
}

function updateJointDiagnostic(view, visible) {
  const diagnostic = view.jointDiagnostic;
  const targetName = byId('joint').value;
  const selectedName = view.definition.id === 'source'
    ? view.targetToSource.get(targetName)
    : targetName;
  const matches = view.bones.filter((bone) => bone.name === selectedName);
  const bone = matches.length === 1 ? matches[0] : null;
  diagnostic.axes.visible = visible && Boolean(bone);
  diagnostic.plane.visible = false;
  if (!visible || !bone) return;
  bone.getWorldPosition(diagnostic.axes.position);
  bone.getWorldQuaternion(diagnostic.axes.quaternion);
  diagnostic.axes.updateMatrixWorld(true);
  const parent = bone.parent?.isBone ? bone.parent : null;
  const children = bone.children.filter((child) => child.isBone);
  if (!parent || children.length !== 1) return;
  parent.getWorldPosition(parentWorldPosition);
  bone.getWorldPosition(jointWorldPosition);
  children[0].getWorldPosition(childWorldPosition);
  const normal = parentWorldPosition.clone().sub(jointWorldPosition)
    .cross(childWorldPosition.clone().sub(jointWorldPosition));
  if (normal.lengthSq() <= 1e-10) return;
  normal.normalize().multiplyScalar(0.24);
  const normalEnd = jointWorldPosition.clone().add(normal);
  const positions = diagnostic.plane.geometry.getAttribute('position');
  const segments = [
    parentWorldPosition, jointWorldPosition,
    jointWorldPosition, childWorldPosition,
    childWorldPosition, parentWorldPosition,
    jointWorldPosition, normalEnd,
  ];
  segments.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
  positions.needsUpdate = true;
  diagnostic.plane.visible = true;
}

function updateSkeletonOverlay(overlay, visible) {
  overlay.lines.visible = visible;
  overlay.joints.visible = visible;
  if (!visible) return;
  const linePositions = overlay.lines.geometry.getAttribute('position');
  for (let index = 0; index < overlay.links.length; index += 1) {
    overlay.links[index].parent.getWorldPosition(jointWorldPosition);
    linePositions.setXYZ(index * 2, jointWorldPosition.x, jointWorldPosition.y, jointWorldPosition.z);
    overlay.links[index].bone.getWorldPosition(jointWorldPosition);
    linePositions.setXYZ((index * 2) + 1, jointWorldPosition.x, jointWorldPosition.y, jointWorldPosition.z);
  }
  linePositions.needsUpdate = true;
  const jointPositions = overlay.joints.geometry.getAttribute('position');
  for (let index = 0; index < overlay.bones.length; index += 1) {
    overlay.bones[index].getWorldPosition(jointWorldPosition);
    jointPositions.setXYZ(index, jointWorldPosition.x, jointWorldPosition.y, jointWorldPosition.z);
  }
  jointPositions.needsUpdate = true;
}

function updateMeshOpacity(view, opacity) {
  for (const state of view.materialStates) {
    const transparent = state.transparent || opacity < 1;
    const depthWrite = opacity < 1 ? false : state.depthWrite;
    if (state.material.transparent !== transparent || state.material.depthWrite !== depthWrite) {
      state.material.transparent = transparent;
      state.material.depthWrite = depthWrite;
      state.material.needsUpdate = true;
    }
    state.material.opacity = state.opacity * opacity;
  }
}

function durationTolerance(...durations) {
  return Math.max(1, ...durations.map(Math.abs)) * (2 ** -22);
}

function comparisonSchedule(duration, rate) {
  if (!Number.isFinite(duration) || duration < 0 || duration * rate > MAX_COMPARISON_GRID_FRAMES) {
    throw new Error(`Comparison clip exceeds ${MAX_COMPARISON_GRID_FRAMES} regular frames`);
  }
  const lastGridFrame = Math.floor(duration * rate);
  const times = Array.from({ length: lastGridFrame + 1 }, (_, frame) => frame / rate);
  if (times[times.length - 1] !== duration) times.push(duration);
  return times;
}

function disposeObject(root) {
  const disposed = new Set();
  root.traverse((node) => {
    for (const resource of [
      node.geometry,
      node.skeleton,
      ...(Array.isArray(node.material) ? node.material : [node.material]),
    ]) {
      if (!resource?.dispose || disposed.has(resource)) continue;
      for (const value of Object.values(resource)) {
        if (value?.isTexture && !disposed.has(value)) {
          disposed.add(value);
          value.dispose();
        }
      }
      disposed.add(resource);
      resource.dispose();
    }
  });
}

function cleanup() {
  if (runtime.disposed) return;
  runtime.disposed = true;
  runtime.ready = false;
  abort.abort();
  cancelAnimationFrame(animation);
  resize.disconnect();
  for (const view of views) {
    view.mixer.stopAllAction();
    view.mixer.uncacheRoot(view.asset.scene);
    disposeObject(view.scene);
  }
  views.length = 0;
  runtime.viewCount = 0;
  renderer.dispose();
}

function validateManifest(value) {
  if (!value || value.schema !== 'rustsmf-rig-comparison-v2'
    || !Array.isArray(value.clips) || value.clips.length === 0
    || new Set(value.clips).size !== value.clips.length
    || !Number.isInteger(value.sampleRateHz) || value.sampleRateHz < 1 || value.sampleRateHz > 240
    || !Number.isFinite(value.playbackRate) || value.playbackRate <= 0 || value.playbackRate > 4
    || !Number.isFinite(value.displayHeight) || value.displayHeight <= 0
    || !value.mapping || typeof value.mapping !== 'object' || Array.isArray(value.mapping)
    || Object.keys(value.mapping).length === 0
    || !Array.isArray(value.models) || value.models.length !== 3) {
    throw new Error('Invalid comparison manifest');
  }
  const mappingEntries = Object.entries(value.mapping);
  if (mappingEntries.some(([source, target]) => !source.trim() || typeof target !== 'string' || !target.trim())
    || new Set(mappingEntries.map(([, target]) => target)).size !== mappingEntries.length) {
    throw new Error('Invalid comparison mapping');
  }
  if (value.models.map((model) => model?.id).join(',') !== 'source,fitted,template') {
    throw new Error('Comparison models must be source, fitted, and template in order');
  }
  for (const model of value.models) {
    if (!model?.id || !model.label || !model.url || !/^[a-f0-9]{64}$/.test(model.sha256)) {
      throw new Error('Invalid comparison model identity');
    }
    if (model.clipMap !== undefined && (!model.clipMap || typeof model.clipMap !== 'object' || Array.isArray(model.clipMap)
      || Object.entries(model.clipMap).some(([role, name]) => !value.clips.includes(role) || typeof name !== 'string' || !name.trim())
      || new Set(value.clips.map(role => model.clipMap[role] ?? role)).size !== value.clips.length)) {
      throw new Error('Invalid comparison clip map');
    }
  }
}

function resolvedClipName(view, role) {
  return view.definition.clipMap?.[role] ?? role;
}

function validateClipCoverage() {
  const source = views[0];
  for (const clipName of manifest.clips) {
    const sourceMatches = source.asset.animations.filter((clip) => clip.name === resolvedClipName(source, clipName));
    if (sourceMatches.length !== 1) {
      throw new Error(`Coverage error: source ${sourceMatches.length ? 'duplicates' : 'is missing'} clip "${clipName}"`);
    }
    const sourceDuration = sourceMatches[0].duration;
    for (const view of views.slice(1)) {
      const matches = view.asset.animations.filter((clip) => clip.name === resolvedClipName(view, clipName));
      if (matches.length !== 1) {
        throw new Error(`Coverage error: ${view.definition.id} ${matches.length ? 'duplicates' : 'is missing'} clip "${clipName}"`);
      }
      const difference = Math.abs(matches[0].duration - sourceDuration);
      const tolerance = durationTolerance(sourceDuration, matches[0].duration);
      if (difference > tolerance) {
        throw new Error(
          `Coverage error: ${view.definition.id} clip "${clipName}" duration ${matches[0].duration} differs from source ${sourceDuration} by ${difference} (tolerance ${tolerance})`,
        );
      }
    }
  }
}

function validateMappingCoverage() {
  const boneNameCounts = (view) => {
    const counts = new Map();
    for (const bone of view.bones) counts.set(bone.name, (counts.get(bone.name) ?? 0) + 1);
    return counts;
  };
  const counts = views.map(boneNameCounts);
  for (const [sourceName, targetName] of Object.entries(manifest.mapping)) {
    if (counts[0].get(sourceName) !== 1) {
      throw new Error(`Mapping source bone "${sourceName}" is missing or ambiguous`);
    }
    for (let index = 1; index < counts.length; index += 1) {
      if (counts[index].get(targetName) !== 1) {
        throw new Error(`Mapping target bone "${targetName}" is missing or ambiguous in ${views[index].definition.id}`);
      }
    }
  }
}

function findPitchJoint(asset, transform) {
  if (!transform?.pitchJoint) return null;
  const matches = [];
  asset.scene.traverse((node) => { if (node.name === transform.pitchJoint) matches.push(node); });
  if (matches.length !== 1) {
    throw new Error(`Game transform pitch joint "${transform.pitchJoint}" is ${matches.length ? 'ambiguous' : 'missing'}`);
  }
  return matches[0];
}

async function loadView(definition) {
  const response = await fetch(definition.url, { signal: abort.signal });
  if (!response.ok) throw new Error(`Cannot load ${definition.url}`);
  const asset = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  if (runtime.disposed) {
    disposeObject(asset.scene);
    throw new Error('Comparison closed while loading');
  }
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e8e8df');
    const wrapper = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(asset.scene);
    wrapper.add(inner);
    scene.add(wrapper);
    const mixer = new THREE.AnimationMixer(asset.scene);
    const firstClip = asset.animations[0];
    if (!firstClip) throw new Error(`${definition.id} has no animation`);
    const action = mixer.clipAction(firstClip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(0);
    asset.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(asset.scene, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error(`${definition.id} has invalid model bounds`);
    const pitchJoint = findPitchJoint(asset, definition.gameTransform);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7666, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(4, 8, 6);
    scene.add(light);
    scene.add(new THREE.GridHelper(8, 16, 0x8e9c7a, 0xc6cbbd));
    const mappedNames = new Set(definition.id === 'source'
      ? Object.keys(manifest.mapping)
      : Object.values(manifest.mapping));
    const targetToSource = new Map(Object.entries(manifest.mapping).map(([source, target]) => [target, source]));
    const skeletonOverlays = [];
    const seenSkeletons = new Set();
    const bones = [];
    const materialStates = [];
    const seenMaterials = new Set();
    asset.scene.traverse((node) => {
      if (node.isBone) bones.push(node);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material || seenMaterials.has(material)) continue;
        seenMaterials.add(material);
        materialStates.push({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
      }
      if (!node.isSkinnedMesh || seenSkeletons.has(node.skeleton)) return;
      seenSkeletons.add(node.skeleton);
      skeletonOverlays.push(createSkeletonOverlay(node.skeleton, scene, mappedNames));
    });
    if (skeletonOverlays.length === 0) throw new Error(`${definition.id} has no skinned skeleton`);
    return {
      definition,
      asset,
      scene,
      wrapper,
      inner,
      mixer,
      action,
      skeletonOverlays,
      bones,
      materialStates,
      targetToSource,
      jointDiagnostic: createJointDiagnostic(scene),
      camera: new THREE.PerspectiveCamera(manifest.camera.fovDegrees, 1, manifest.camera.near, manifest.camera.far),
      orthoCameras: {
        top: new THREE.OrthographicCamera(-1, 1, 1, -1, manifest.camera.near, manifest.camera.far),
        front: new THREE.OrthographicCamera(-1, 1, 1, -1, manifest.camera.near, manifest.camera.far),
        side: new THREE.OrthographicCamera(-1, 1, 1, -1, manifest.camera.near, manifest.camera.far),
      },
      raw: {
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        position: asset.scene.position.toArray(),
        quaternion: asset.scene.quaternion.toArray(),
        scale: asset.scene.scale.toArray(),
      },
      equalTransform: {
        scale: manifest.displayHeight / size.y,
        position: [
          -center.x * (manifest.displayHeight / size.y),
          -bounds.min.y * (manifest.displayHeight / size.y),
          -center.z * (manifest.displayHeight / size.y),
        ],
      },
      pitchJoint,
      pitchJointRest: pitchJoint?.quaternion.clone() ?? null,
    };
  } catch (error) {
    disposeObject(asset.scene);
    throw error;
  }
}

function selectClip() {
  playing = false;
  byId('play').textContent = 'Play';
  scheduleIndex = 0;
  const clipName = byId('clip').value;
  for (const view of views) {
    view.mixer.stopAllAction();
    const clip = view.asset.animations.find((candidate) => candidate.name === resolvedClipName(view, clipName));
    view.action = view.mixer.clipAction(clip);
    view.action.reset();
    view.action.setLoop(THREE.LoopOnce, 1);
    view.action.clampWhenFinished = true;
    view.action.play();
  }
  const sourceClip = views[0].asset.animations.find((clip) => clip.name === resolvedClipName(views[0], clipName));
  schedule = comparisonSchedule(sourceClip.duration, manifest.sampleRateHz);
  byId('frame').max = String(schedule.length - 1);
  draw();
}

function applyPose(view, time, mode) {
  if (view.pitchJointRest) view.pitchJoint.quaternion.copy(view.pitchJointRest);
  // LoopOnce terminal sampling pauses the action; explicit seeks must resume it.
  view.action.paused = false;
  view.mixer.setTime(Math.min(view.action.getClip().duration, Math.max(0, Math.fround(time))));
  view.wrapper.position.set(0, 0, 0);
  view.wrapper.rotation.set(0, 0, 0);
  view.wrapper.scale.setScalar(1);
  view.inner.position.set(0, 0, 0);
  view.inner.rotation.set(0, 0, 0);
  view.inner.scale.setScalar(1);
  if (mode === 'equal-height') {
    view.wrapper.scale.setScalar(view.equalTransform.scale);
    view.wrapper.position.fromArray(view.equalTransform.position);
  } else {
    const transform = view.definition.gameTransform;
    view.wrapper.scale.setScalar(transform.visualScale);
    view.wrapper.rotation.set(transform.modelPitch ?? 0, transform.facing === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
    view.inner.scale.setScalar(transform.normalizationScale);
    view.inner.position.y = transform.groundTranslationY;
    if (transform.modelPitch !== null) {
      const euler = new THREE.Euler().setFromQuaternion(view.pitchJoint.quaternion, 'ZYX');
      euler.x = transform.modelPitch;
      view.pitchJoint.quaternion.setFromEuler(euler);
    }
  }
  view.wrapper.updateMatrixWorld(true);
  updateMeshOpacity(view, Number(byId('opacity').value));
  const showBones = byId('bones').checked;
  for (const overlay of view.skeletonOverlays) updateSkeletonOverlay(overlay, showBones);
  updateJointDiagnostic(view, byId('joint-diagnostic').checked);
}

function configureCameras(width, height) {
  const combined = new THREE.Box3();
  for (const view of views) combined.union(new THREE.Box3().setFromObject(view.wrapper, true));
  const size = combined.getSize(new THREE.Vector3());
  const target = combined.getCenter(new THREE.Vector3());
  const paneWidth = width / 3;
  const layout = byId('view').value;
  const aspect = paneWidth / height;
  const verticalFov = THREE.MathUtils.degToRad(manifest.camera.fovDegrees);
  const fitHeightDistance = size.y / (2 * Math.tan(verticalFov / 2));
  const fitWidthDistance = Math.max(size.x, size.z) / (2 * Math.tan(verticalFov / 2) * aspect);
  const distance = Math.max(0.5, fitHeightDistance, fitWidthDistance) * 1.25;
  const mode = layout === 'quad-ortho' ? 'quarter' : layout;
  const direction = mode === 'front'
    ? new THREE.Vector3(0, 0, 1)
    : mode === 'side'
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(1, 0, 1).normalize();
  for (const view of views) {
    view.camera.aspect = aspect;
    view.camera.position.copy(target).addScaledVector(direction, distance);
    view.camera.lookAt(target);
    view.camera.updateProjectionMatrix();
    const orthoAspect = aspect;
    const horizontalSpan = Math.max(size.x, size.z);
    const halfHeight = Math.max(size.y / 2, horizontalSpan / (2 * orthoAspect), 0.25) * 1.2;
    const halfWidth = halfHeight * orthoAspect;
    for (const camera of Object.values(view.orthoCameras)) {
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    }
    view.orthoCameras.front.position.copy(target).add(new THREE.Vector3(0, 0, distance));
    view.orthoCameras.front.up.set(0, 1, 0);
    view.orthoCameras.front.lookAt(target);
    view.orthoCameras.side.position.copy(target).add(new THREE.Vector3(distance, 0, 0));
    view.orthoCameras.side.up.set(0, 1, 0);
    view.orthoCameras.side.lookAt(target);
    view.orthoCameras.top.position.copy(target).add(new THREE.Vector3(0, distance, 0));
    view.orthoCameras.top.up.set(0, 0, -1);
    view.orthoCameras.top.lookAt(target);
  }
  return {
    layout,
    target: target.toArray(),
    perspective: { position: views[0].camera.position.toArray(), distance, aspect },
    orthographic: {
      halfHeight: views[0].orthoCameras.front.top,
      halfWidth: views[0].orthoCameras.front.right,
      top: views[0].orthoCameras.top.position.toArray(),
      front: views[0].orthoCameras.front.position.toArray(),
      side: views[0].orthoCameras.side.position.toArray(),
    },
  };
}

function transformReceipt(view, mode) {
  const game = view.definition.gameTransform;
  return {
    id: view.definition.id,
    resolvedClip: resolvedClipName(view, byId('clip').value),
    sha256: view.definition.sha256,
    raw: view.raw,
    applied: {
      position: view.wrapper.position.toArray(),
      quaternion: view.wrapper.quaternion.toArray(),
      scale: view.wrapper.scale.toArray(),
      innerPosition: view.inner.position.toArray(),
      innerQuaternion: view.inner.quaternion.toArray(),
      innerScale: view.inner.scale.toArray(),
      mode,
      game: mode === 'game-transform' ? {
        normalizationScale: game.normalizationScale,
        visualScale: game.visualScale,
        combinedScale: game.normalizationScale * game.visualScale,
        groundTranslationY: game.groundTranslationY,
        facing: game.facing,
        rootPitch: game.modelPitch ?? 0,
        pitchJoint: game.pitchJoint ?? null,
        pitchJointLocalXOverride: game.modelPitch,
      } : null,
    },
  };
}

function updateReceipt(time, camera) {
  const mode = byId('mode').value;
  const receipt = {
    schema: 'rustsmf-rig-comparison-capture-v1',
    clip: byId('clip').value,
    sourceFrame: time * manifest.sampleRateHz,
    clipTime: time,
    sampleRateHz: manifest.sampleRateHz,
    scheduleIndex,
    playbackRate: manifest.playbackRate,
    skeletonOverlay: byId('bones').checked,
    meshOpacity: Number(byId('opacity').value),
    selectedJoint: byId('joint').value || null,
    jointDiagnostic: byId('joint-diagnostic').checked,
    mappingLegend: { mapped: '#00a9c1', unmappedOrTargetOnly: '#d18a00' },
    view: byId('view').value,
    mode,
    camera: {
      fovDegrees: manifest.camera.fovDegrees,
      near: manifest.camera.near,
      far: manifest.camera.far,
      ...camera,
    },
    models: views.map((view) => transformReceipt(view, mode)),
  };
  window.__RUSTSMF_COMPARISON_CAPTURE__ = receipt;
  byId('receipt').textContent = JSON.stringify(receipt, null, 2);
}

function draw() {
  if (runtime.disposed || !runtime.ready || schedule.length === 0) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  byId('frame').value = String(scheduleIndex);
  const time = schedule[scheduleIndex];
  byId('position').value = (time * manifest.sampleRateHz).toFixed(Number.isInteger(time * manifest.sampleRateHz) ? 0 : 3);
  const mode = byId('mode').value;
  for (const view of views) applyPose(view, time, mode);
  const camera = configureCameras(width, height);
  views.forEach((view, index) => {
    const left = Math.floor(index * width / 3);
    const right = Math.floor((index + 1) * width / 3);
    if (byId('view').value === 'quad-ortho') {
      const middleX = Math.floor((left + right) / 2);
      const middleY = Math.floor(height / 2);
      const panes = [
        { x: left, y: middleY, width: middleX - left, height: height - middleY, camera: view.orthoCameras.top },
        { x: middleX, y: middleY, width: right - middleX, height: height - middleY, camera: view.camera },
        { x: left, y: 0, width: middleX - left, height: middleY, camera: view.orthoCameras.front },
        { x: middleX, y: 0, width: right - middleX, height: middleY, camera: view.orthoCameras.side },
      ];
      for (const pane of panes) {
        renderer.setViewport(pane.x, pane.y, pane.width, pane.height);
        renderer.setScissor(pane.x, pane.y, pane.width, pane.height);
        renderer.render(view.scene, pane.camera);
      }
    } else {
      renderer.setViewport(left, 0, right - left, height);
      renderer.setScissor(left, 0, right - left, height);
      renderer.render(view.scene, view.camera);
    }
  });
  updateReceipt(time, camera);
}

function tick(time) {
  if (runtime.disposed) return;
  if (lastTick === 0) lastTick = time;
  if (playing) {
    elapsed += Math.min((time - lastTick) / 1000, 0.25);
    const step = 1 / (manifest.sampleRateHz * manifest.playbackRate);
    let advanced = false;
    while (elapsed >= step) {
      scheduleIndex = (scheduleIndex + 1) % schedule.length;
      elapsed -= step;
      advanced = true;
    }
    if (advanced) draw();
  }
  lastTick = time;
  animation = requestAnimationFrame(tick);
}

const resize = new ResizeObserver(draw);
resize.observe(canvas);
byId('clip').addEventListener('change', selectClip);
byId('frame').addEventListener('input', () => {
  playing = false;
  byId('play').textContent = 'Play';
  scheduleIndex = Number(byId('frame').value);
  draw();
});
byId('play').addEventListener('click', () => {
  playing = !playing;
  elapsed = 0;
  lastTick = 0;
  byId('play').textContent = playing ? 'Pause' : 'Play';
});
byId('view').addEventListener('change', draw);
byId('mode').addEventListener('change', draw);
byId('bones').addEventListener('change', draw);
byId('opacity').addEventListener('input', () => {
  byId('opacity-value').value = `${Math.round(Number(byId('opacity').value) * 100)}%`;
  draw();
});
byId('joint').addEventListener('change', draw);
byId('joint-diagnostic').addEventListener('change', draw);
byId('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(window.__RUSTSMF_COMPARISON_CAPTURE__, null, 2));
    byId('copy').textContent = 'Copied';
  } catch {
    byId('copy').textContent = 'Copy unavailable';
  }
});

try {
  const response = await fetch('/models.json', { signal: abort.signal });
  if (!response.ok) throw new Error('Cannot read comparison manifest');
  manifest = await response.json();
  validateManifest(manifest);
  for (const definition of manifest.models) {
    const view = await loadView(definition);
    views.push(view);
    runtime.viewCount = views.length;
  }
  validateClipCoverage();
  validateMappingCoverage();
  for (const definition of manifest.models) {
    const label = document.createElement('span');
    label.textContent = definition.label;
    byId('labels').append(label);
  }
  for (const name of manifest.clips) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    byId('clip').append(option);
  }
  const targetBoneNames = [...new Set(views[2].bones.map((bone) => bone.name))]
    .sort((left, right) => left.localeCompare(right));
  for (const name of targetBoneNames) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    byId('joint').append(option);
  }
  byId('joint').value = targetBoneNames.includes('mixamorigLeftLeg')
    ? 'mixamorigLeftLeg'
    : Object.values(manifest.mapping)[0];
  byId('joint').disabled = false;
  byId('joint-diagnostic').disabled = false;
  const hasGameTransforms = manifest.models.every((model) => model.gameTransform);
  byId('mode').disabled = !hasGameTransforms;
  if (!hasGameTransforms) byId('mode').title = 'Saved game transforms are not present in this comparison job';
  byId('clip').value = manifest.clips.includes('attack') ? 'attack' : manifest.clips[0];
  for (const id of ['clip', 'play', 'frame']) byId(id).disabled = false;
  runtime.ready = true;
  selectClip();
  byId('status').textContent = `Strict coverage passed • ${manifest.playbackRate}× playback • capture receipt current`;
  animation = requestAnimationFrame(tick);
} catch (error) {
  if (!runtime.disposed) {
    byId('error').textContent = error instanceof Error ? error.message : String(error);
    cleanup();
  }
}

addEventListener('pagehide', cleanup);
