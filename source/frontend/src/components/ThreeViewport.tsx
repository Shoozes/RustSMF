import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SimpleOrbit } from '../utils/SimpleOrbit';
import { disposeThreeObject } from '../utils/threeDisposal';
import { restoreWeightPreview, applyWeightPreviewForBone } from '../utils/weightPreview';
import { findClosestBone, DEFAULT_MAX_BONE_PICK_DIST, findBoneByName } from '../utils/bonePicker';
import { useBoneLabelsWithScale } from '../utils/useBoneLabels';
import {
  makeBoneHighlightMarker,
  updateHighlightPosition,
  makeBoneEndpointHandle,
  updateEndpointHandle,
  makeBoneHoverMarker,
} from '../utils/boneHighlight';
import {
  ModernSkeletonHelper,
  findBoneNameFromSkeletonHelperHit,
  type DisposableSkeletonHelper,
} from '../utils/modernSkeletonHelper';
import {
  DEFAULT_VIEWPORT_BOUNDS,
  getMouseForViewport,
  getViewportAt as findViewportAt,
  refreshOrthoCameras as updateOrthoCameras,
  refreshViewportSpecs as buildViewportSpecs,
  type ModelBounds,
  type ViewportSpec,
} from '../utils/viewportLayout';
import type { EditorMode, ViewportLayout } from '../store';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

type EndpointDragState = {
  boneName: string;
  bone: THREE.Bone;
  plane: THREE.Plane;
  localOffset: THREE.Vector3;
  parentInverse: THREE.Matrix4;
};

// Self-contained ThreeViewport.
// Owns: renderer, scene (base lights+grid+axes), camera, SimpleOrbit controls, RAF loop, model attach,
// SkeletonHelper, AnimationMixer + action management, time reporting.
// Receives declarative props from App for the loaded model and playback intent.
// No dead code or duplication with parent. All imperative three isolated here.

interface ThreeViewportProps {
  root: THREE.Group | null;
  skeleton?: THREE.Skeleton;
  clips: THREE.AnimationClip[];
  isPlaying: boolean;
  currentTime: number;
  currentClipName?: string;
  playbackSpeed?: number;
  onTimeUpdate?: (time: number) => void;
  onSelectBone?: (boneName: string) => void;
  selectedBoneName?: string;
  weightPreviewEnabled?: boolean;
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSetTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => void;
  boneLabelsEnabled?: boolean;
  editorMode?: EditorMode;
  viewportLayout?: ViewportLayout;
  wireframeEnabled?: boolean;
}

// SimpleOrbit imported from ../utils/SimpleOrbit (filled modularity dir, single source of truth)

const ThreeViewport: React.FC<ThreeViewportProps> = ({
  root,
  skeleton,
  clips,
  isPlaying,
  currentTime,
  currentClipName,
  playbackSpeed = 1,
  onTimeUpdate,
  onSelectBone,
  selectedBoneName,
  weightPreviewEnabled = false,
  transformMode = 'translate',
  onSetTransformMode,
  boneLabelsEnabled = false,
  editorMode = 'view',
  viewportLayout = 'single',
  wireframeEnabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRefs = useRef<THREE.OrthographicCamera[]>([]);
  const orbitRef = useRef(new SimpleOrbit());
  const frameRef = useRef<number | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const viewportRef = useRef<ViewportSpec[]>([]);
  const layoutRef = useRef<ViewportLayout>('single');
  const wireframeEnabledRef = useRef(false);
  const wireframeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const boundsRef = useRef<ModelBounds>(DEFAULT_VIEWPORT_BOUNDS);
  const canvasSizeRef = useRef({ width: 800, height: 600 });
  const clockRef = useRef(new THREE.Clock());
  const pointerDownRef = useRef<{
    x: number;
    y: number;
    time: number;
    button: number;
  } | null>(null);
  const pickDistanceRef = useRef(DEFAULT_MAX_BONE_PICK_DIST);
  const cursorModeRef = useRef<string>('default');
  const isPrecisionModeRef = useRef(false);
  const endpointDragRef = useRef<EndpointDragState | null>(null);

  // TransformControls for selected bone (Cycle 3 editor polish). Attached to the live THREE.Bone when selectedBoneName changes.
  // Change events mutate the bone in place (position/rot/scale); works with existing marker + Inspector controls + RAF.
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformTargetRef = useRef<THREE.Bone | null>(null);
  const isTransformControlsPausedForEndpointRef = useRef(false);

  // Local mixer + action owned here (viewport is the source of truth for three playback)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const attachedModelRef = useRef<THREE.Object3D | null>(null);
  const skeletonHelperRef = useRef<DisposableSkeletonHelper | null>(null);

  // For raycast bone picking (3D click-to-select complementing Inspector list)
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const onSelectBoneRef = useRef(onSelectBone);
  const skeletonRefForPick = useRef(skeleton);

  // For selected bone 3D highlight marker (visual feedback when list or raycast selects a bone)
  const selectedBoneNameRef = useRef(selectedBoneName);
  const boneHighlightRef = useRef<THREE.Object3D | null>(null);
  const boneEndpointHandleRef = useRef<THREE.Object3D | null>(null);
  const boneHoverMarkerRef = useRef<THREE.Object3D | null>(null);
  const hoveredBoneNameRef = useRef<string | null>(null);

  // Ref for onTimeUpdate to decouple RAF reporting from setup effect deps (timing/robustness: avoids re-init of scene/RAF if fn identity ever shifts; mirrors bone pick ref pattern)
  const onTimeUpdateRef = useRef(onTimeUpdate);

  const applyViewportLayout = (nextLayout: ViewportLayout) => {
    const camera = cameraRef.current;
    if (!camera) return;
    viewportRef.current = buildViewportSpecs(
      canvasSizeRef.current.width,
      canvasSizeRef.current.height,
      nextLayout,
      boundsRef.current,
      camera,
      orthoCameraRefs.current,
    );
    layoutRef.current = nextLayout;
    updateOrthoCameras(orthoCameraRefs.current, boundsRef.current);
  };

  const getViewportAt = (x: number, y: number, requirePicking = false): ViewportSpec | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return findViewportAt(viewportRef.current, rect, x, y, requirePicking);
  };

  const isInPickingViewport = (x: number, y: number): boolean => !!getViewportAt(x, y, true);

  const isInOrbitViewport = (x: number, y: number): boolean => {
    const spec = getViewportAt(x, y, true);
    return !!spec && spec.role === 'perspective';
  };

  const pickViewportCamera = (x: number, y: number): { camera: THREE.Camera; viewport: ViewportSpec } | null => {
    const match = getViewportAt(x, y, true);
    if (!match) return null;

    return {
      camera: match.camera,
      viewport: match,
    };
  };

  const writeEndpointScreenTelemetry = (bone: THREE.Bone): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const viewport = viewportRef.current.find((spec) => spec.role === 'perspective') ?? viewportRef.current[0];
    if (!viewport) return;

    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);
    const projected = worldPos.clone().project(viewport.camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || Math.abs(projected.z) > 1) {
      delete canvas.dataset.endpointX;
      delete canvas.dataset.endpointY;
      return;
    }

    const localX = viewport.x + ((projected.x + 1) / 2) * viewport.width;
    const localYFromBottom = viewport.y + ((projected.y + 1) / 2) * viewport.height;
    canvas.dataset.endpointX = String(Math.round(rect.left + localX));
    canvas.dataset.endpointY = String(Math.round(rect.top + (rect.height - localYFromBottom)));
  };

  const isPrecisionMode = editorMode === 'rig' || editorMode === 'skin';
  const bonePickDist = isPrecisionMode ? 2.5 : DEFAULT_MAX_BONE_PICK_DIST;
  const boneLabelScale = isPrecisionMode ? 1.8 : 1;
  pickDistanceRef.current = bonePickDist;
  isPrecisionModeRef.current = isPrecisionMode;

  const pickBoneName = (
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    maxDist = bonePickDist,
  ): string | null => {
    const skel = skeletonRefForPick.current;
    const selectedPick = pickViewportCamera(event.clientX, event.clientY);
    if (!selectedPick || !skel || !canvasRef.current) return null;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, selectedPick.viewport, rect);
    mouseRef.current.copy(mouse);
    raycasterRef.current.setFromCamera(mouseRef.current, selectedPick.camera);
    const helper = skeletonHelperRef.current;
    if (helper) {
      const helperHits = raycasterRef.current.intersectObject(helper, true);
      for (const hit of helperHits) {
        const hitBoneName = findBoneNameFromSkeletonHelperHit(hit);
        if (hitBoneName) return hitBoneName;
      }
    }
    const closest = findClosestBone(raycasterRef.current, skel, maxDist);
    return closest?.name ?? null;
  };

  const pauseTransformControlsForEndpointDrag = () => {
    const tc = transformControlsRef.current;
    if (!tc || isTransformControlsPausedForEndpointRef.current) return;
    isTransformControlsPausedForEndpointRef.current = true;
    tc.enabled = false;
    (tc as unknown as THREE.Object3D).visible = false;
    tc.detach();
  };

  const restoreTransformControlsAfterEndpointDrag = () => {
    const tc = transformControlsRef.current;
    if (!tc || !isTransformControlsPausedForEndpointRef.current) return;
    tc.enabled = true;
    (tc as unknown as THREE.Object3D).visible = true;
    if (transformTargetRef.current) {
      tc.attach(transformTargetRef.current);
    }
    isTransformControlsPausedForEndpointRef.current = false;
  };

  const updateDragFromEndpoint = (event: PointerEvent, state: EndpointDragState, viewport: ViewportSpec): boolean => {
    const skel = skeletonRefForPick.current;
    const raycaster = raycasterRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !state) return false;

    const rect = canvas.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, viewport, rect);
    raycaster.setFromCamera(mouse, viewport.camera);

    const hit = raycaster.ray.intersectPlane(state.plane, new THREE.Vector3());
    if (!hit) return false;

    const boneWorld = hit.sub(state.localOffset);
    const parentInv = state.parentInverse;
    const localPos = boneWorld.applyMatrix4(parentInv);
    state.bone.position.copy(localPos);
    state.bone.updateMatrix();
    state.bone.updateMatrixWorld(true);

    if (skel) {
      skel.update();
    }
    return true;
  };

  // One-time base scene + renderer + orbit + RAF + resize + internal R key reset
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(800, 600);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    sceneRef.current = scene;
    wireframeMaterialRef.current = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });

    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x080820, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(4, 7, 3);
    scene.add(dir);

    const grid = new THREE.GridHelper(14, 14, 0x475569, 0x334155);
    grid.position.y = 0.001;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(1.8));

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    cameraRef.current = camera;

    const frontCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const sideCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    frontCam.up = new THREE.Vector3(0, 1, 0);
    sideCam.up = new THREE.Vector3(0, 1, 0);
    topCam.up = new THREE.Vector3(0, 0, -1);
    orthoCameraRefs.current = [frontCam, sideCam, topCam];

    const orbit = orbitRef.current;
    const updateCamera = () => {
      camera.position.copy(orbit.getPosition());
      camera.lookAt(orbit.target);
      camera.updateMatrixWorld();
    };
    updateCamera();
    const detachOrbit = orbit.attach(
      canvas,
      updateCamera,
      (x, y, button = 0) => {
        if (button !== 0 && button !== 2) return false;
        return isInOrbitViewport(x, y);
      },
    );

    // Internal key handler for view reset (R) + gizmo modes (T=translate, R=rotate, S=scale when a bone is selected).
    // Mode keys take precedence only while TransformControls has an active target. Space is handled by App.
    const onKey = (e: KeyboardEvent) => {
      const tc = transformControlsRef.current;
      if (tc && transformTargetRef.current) {
        const k = e.key.toLowerCase();
        if (k === 't') { tc.setMode('translate'); if (onSetTransformMode) onSetTransformMode('translate'); return; }
        if (k === 'r') { tc.setMode('rotate'); if (onSetTransformMode) onSetTransformMode('rotate'); return; }
        if (k === 's') { tc.setMode('scale'); if (onSetTransformMode) onSetTransformMode('scale'); return; }
      }
      if (e.key.toLowerCase() === 'r') {
        orbit.reset();
        updateCamera();
      }
    };
    window.addEventListener('keydown', onKey);

    // Pointer-based bone selection on the canvas.
    // Complements list selection in Inspector. Uses bone world positions + ray distance.
    // Ignore drag/long-press paths to avoid accidental selection during orbit/transform interaction.
    const startEndpointDrag = (event: PointerEvent): boolean => {
      if (!isPrecisionModeRef.current) return false;

      const selected = selectedBoneNameRef.current;
      if (!selected) return false;

      const skel = skeletonRefForPick.current;
      const bone = skel ? findBoneByName(skel, selected) : null;
      if (!bone) return false;

      const handle = boneEndpointHandleRef.current;
      if (!handle) return false;

      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick || !canvasRef.current) return false;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
      raycasterRef.current.setFromCamera(mouse, pick.camera);

      const hits = raycasterRef.current.intersectObject(handle, true);
      const camera = pick.camera;
      let hit = hits[0]?.point.clone();
      if (!hit) {
        const fallbackBone = pickBoneName(event, 120);
        if (fallbackBone !== selected) {
          return false;
        }
        const boneWorld = new THREE.Vector3();
        bone.getWorldPosition(boneWorld);
        const fallbackPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3().copy(camera.getWorldDirection(new THREE.Vector3())),
          boneWorld,
        );
        const hitFromPlane = raycasterRef.current.ray.intersectPlane(fallbackPlane, new THREE.Vector3());
        if (!hitFromPlane) return false;
        hit = hitFromPlane;
      }

      const camDir = new THREE.Vector3();
      pick.camera.getWorldDirection(camDir);
      const parentInverse = bone.parent
        ? bone.parent.matrixWorld.clone().invert()
        : new THREE.Matrix4();

      const boneWorld = new THREE.Vector3();
      bone.getWorldPosition(boneWorld);

      endpointDragRef.current = {
        boneName: selected,
        bone,
        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit),
        localOffset: new THREE.Vector3().subVectors(hit, boneWorld),
        parentInverse,
      };
      pauseTransformControlsForEndpointDrag();
      orbitRef.current.enabled = false;
      canvas.style.cursor = 'grabbing';
      cursorModeRef.current = 'grabbing';
      canvas.dataset.endpointDrag = 'active';
      return true;
    };

    const endEndpointDrag = () => {
      if (endpointDragRef.current) {
        endpointDragRef.current = null;
      }
      restoreTransformControlsAfterEndpointDrag();
      orbitRef.current.enabled = true;
      if (canvas.dataset.endpointDrag) {
        delete canvas.dataset.endpointDrag;
      }
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
      hoveredBoneNameRef.current = null;
      canvas.dataset.hoveredBone = '';
    };

    const onCanvasPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!isInPickingViewport(event.clientX, event.clientY)) return;
      if (startEndpointDrag(event)) {
        pointerDownRef.current = null;
        return;
      }
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        button: event.button,
      };
    };

    const onCanvasPointerUp = (event: PointerEvent) => {
      if (endpointDragRef.current) {
        endEndpointDrag();
        pointerDownRef.current = null;
        return;
      }

      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || down.button !== 0 || event.button !== 0) return;
      const elapsed = performance.now() - down.time;
      const movedPx = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (movedPx > 6 || elapsed > 350) return;
      if (!isInPickingViewport(event.clientX, event.clientY)) return;

      const cb = onSelectBoneRef.current;
      if (!cb) return;
      const closestName = pickBoneName(event, pickDistanceRef.current);
      if (closestName) {
        cb(closestName);
      }
    };

    const onWindowPointerUp = () => {
      if (endpointDragRef.current) {
        endEndpointDrag();
      }
      pointerDownRef.current = null;
    };

    const onWindowPointerCancel = () => {
      if (endpointDragRef.current) {
        endEndpointDrag();
      }
      pointerDownRef.current = null;
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      if (endpointDragRef.current) {
        const dragState = endpointDragRef.current;
        const dragPick = pickViewportCamera(event.clientX, event.clientY);
        if (!dragPick) {
          endEndpointDrag();
          return;
        }
        const moved = updateDragFromEndpoint(event, dragState, dragPick.viewport);
        if (moved) {
          hoveredBoneNameRef.current = dragState.boneName;
          canvas.dataset.hoveredBone = dragState.boneName;
        }
        return;
      }
      if (!isInPickingViewport(event.clientX, event.clientY)) {
        if (cursorModeRef.current !== 'default') {
          canvas.style.cursor = 'default';
          cursorModeRef.current = 'default';
        }
        hoveredBoneNameRef.current = null;
        canvas.dataset.hoveredBone = '';
        return;
      }

      const hoverDistance = isPrecisionModeRef.current ? pickDistanceRef.current * 4 : pickDistanceRef.current * 1.8;
      const closestName = pickBoneName(event, hoverDistance);
      hoveredBoneNameRef.current = closestName;
      canvas.dataset.hoveredBone = closestName || '';
      const nextCursor = closestName ? 'pointer' : 'default';
      if (cursorModeRef.current !== nextCursor) {
        canvas.style.cursor = nextCursor;
        cursorModeRef.current = nextCursor;
      }
    };
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointerup', onCanvasPointerUp);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);

    const animate = () => {
      const mixer = mixerRef.current;
      if (mixer) {
        const delta = clockRef.current.getDelta();
        mixer.update(delta);
        const action = currentActionRef.current;
        const report = onTimeUpdateRef.current;
        if (action && report) {
          // Always report for scrubber sync (even when paused, last known time)
          report(action.time);
        }
      }
      // Force hierarchy/skin update after anim (helps SMF and skinned visual correctness on play/scrub)
      if (attachedModelRef.current) {
        attachedModelRef.current.updateMatrixWorld(true);
      }

      // keep bone highlight marker following the (possibly animated) selected bone (use extracted util for modularity)
      const hl = boneHighlightRef.current;
      const skel = skeletonRefForPick.current;
      const sel = selectedBoneNameRef.current;
      if (hl && skel && sel) {
        const bone = findBoneByName(skel, sel);
        if (bone) {
          updateHighlightPosition(hl, bone);
        }
      }
      const endpoint = boneEndpointHandleRef.current;
      if (endpoint && skel && sel) {
        const bone = findBoneByName(skel, sel);
        if (bone) {
          updateEndpointHandle(endpoint, bone, boneLabelScale);
          writeEndpointScreenTelemetry(bone);
        }
      }
      const hoverMarker = boneHoverMarkerRef.current;
      if (hoverMarker && skel) {
        const hoveredName = hoveredBoneNameRef.current;
        if (hoveredName && hoveredName !== sel) {
          const hoveredBone = findBoneByName(skel, hoveredName);
          if (hoveredBone) {
            updateHighlightPosition(hoverMarker, hoveredBone);
            hoverMarker.visible = true;
          } else {
            hoverMarker.visible = false;
          }
        } else {
          hoverMarker.visible = false;
        }
      }

      const specs = viewportRef.current.length
        ? viewportRef.current
        : [{
          camera,
          x: 0,
          y: 0,
          width: canvasSizeRef.current.width,
          height: canvasSizeRef.current.height,
          isPickingCamera: true,
          role: 'perspective',
        }];

      const isQuad = layoutRef.current === 'quad';
      const previousOverride = scene.overrideMaterial;
      scene.overrideMaterial = wireframeEnabledRef.current ? wireframeMaterialRef.current : null;
      renderer.setScissorTest(isQuad);
      specs.forEach((spec) => {
        renderer.setViewport(spec.x, spec.y, spec.width, spec.height);
        if (isQuad) {
          renderer.setScissor(spec.x, spec.y, spec.width, spec.height);
        }
        renderer.clear(true, true, true);
        renderer.render(scene, spec.camera === cameraRef.current ? camera : spec.camera);
      });
      scene.overrideMaterial = previousOverride;
      if (!isQuad) {
        renderer.setScissorTest(false);
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    const container = canvas.parentElement!;
    const onResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const specs = buildViewportSpecs(w, h, layoutRef.current, boundsRef.current, camera, orthoCameraRefs.current);
      updateOrthoCameras(orthoCameraRefs.current, boundsRef.current);
      viewportRef.current = specs;
      canvasSizeRef.current = { width: w, height: h };
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    resizeObsRef.current = ro;
    requestAnimationFrame(onResize);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      resizeObsRef.current?.disconnect();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointerup', onCanvasPointerUp);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
      if (endpointDragRef.current) {
        orbitRef.current.enabled = true;
        endpointDragRef.current = null;
      }
      restoreTransformControlsAfterEndpointDrag();
      detachOrbit();
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
      delete canvas.dataset.endpointX;
      delete canvas.dataset.endpointY;
      if (boneHighlightRef.current) {
        scene.remove(boneHighlightRef.current);
        disposeThreeObject(boneHighlightRef.current);
        boneHighlightRef.current = null;
      }
      wireframeMaterialRef.current?.dispose();
      wireframeMaterialRef.current = null;
      renderer.dispose();
    };
    // Note: intentionally no deps on playback props; RAF always runs, control via effects below.
    // onTimeUpdate (and onSelectBone/skeleton) kept via refs to avoid re-creating renderer/scene/RAF/ listeners on every parent render.
  }, []);

  useEffect(() => {
    applyViewportLayout(viewportLayout);
  }, [viewportLayout]);

  useEffect(() => {
    wireframeEnabledRef.current = wireframeEnabled;
  }, [wireframeEnabled]);

  // React to playbackSpeed changes (apply to current action)
  useEffect(() => {
    const action = currentActionRef.current;
    if (action) {
      action.setEffectiveTimeScale(playbackSpeed);
    }
  }, [playbackSpeed]);

  // React to isPlaying / currentTime controlled changes (scrub + pause/resume)
  useEffect(() => {
    const action = currentActionRef.current;
    const mixer = mixerRef.current;
    if (!action || !mixer) return;

    action.paused = !isPlaying;
    // Apply scrub position (clamped by caller)
    if (typeof currentTime === 'number') {
      action.time = Math.max(0, Math.min(currentTime, action.getClip().duration || 0));
    }
    // Force skinning/matrix update immediately for scrub
    mixer.update(0);
    if (attachedModelRef.current) attachedModelRef.current.updateMatrixWorld(true);
  }, [isPlaying, currentTime]);

  // React to clip selection change from parent (inspector list)
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || !clips || clips.length === 0 || !currentClipName) return;

    const target = clips.find(c => (c.name || 'clip') === currentClipName) || clips[0];
    if (!target) return;

    if (currentActionRef.current) {
      currentActionRef.current.stop();
    }
    const action = mixer.clipAction(target);
    action.reset();
    action.play();
    action.setEffectiveTimeScale(playbackSpeed);
    currentActionRef.current = action;
  }, [currentClipName, clips, playbackSpeed]);

  // Keep latest onSelectBone and skeleton for raycast handler (stable click listener)
  useEffect(() => { onSelectBoneRef.current = onSelectBone; }, [onSelectBone]);
  useEffect(() => { skeletonRefForPick.current = skeleton; }, [skeleton]);

  // Unmount cleanup for TransformControls (detach + remove from scene + dispose)
  useEffect(() => {
    return () => {
      restoreTransformControlsAfterEndpointDrag();
      const tc = transformControlsRef.current;
      const scene = sceneRef.current;
      if (tc) {
        tc.detach();
        if (scene) scene.remove(tc as unknown as THREE.Object3D);
        tc.dispose?.();
        transformControlsRef.current = null;
        transformTargetRef.current = null;
      }
      if (scene) {
        [boneHighlightRef.current, boneEndpointHandleRef.current, boneHoverMarkerRef.current].forEach(marker => {
          if (!marker) return;
          scene.remove(marker);
          disposeThreeObject(marker);
        });
      }
      boneHighlightRef.current = null;
      boneEndpointHandleRef.current = null;
      boneHoverMarkerRef.current = null;
    };
  }, []);
  // Sync onTimeUpdate ref (for stable RAF time reporting without setup effect re-runs)
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  // Sync selected bone name ref (for animate loop + highlight without stale closures)
  useEffect(() => { selectedBoneNameRef.current = selectedBoneName; }, [selectedBoneName]);

  // Bone labels management (extracted hook for modularity)
  const markerScale = isPrecisionMode ? 2 : 1;
  useBoneLabelsWithScale(boneLabelsEnabled, skeleton, boneLabelScale);

  // Bone selection 3D highlight marker (small sphere+axes that follows the selected bone's world position).
  // Provides visual editor feedback (clickable list or raycast selection now "lights up" in viewport).
  // Reuses existing skeleton/bone refs; cheap, no skin affect.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const detachMarker = (marker: THREE.Object3D | null) => {
      if (!marker) return;
      scene.remove(marker);
      disposeThreeObject(marker);
    };

    // remove old markers/handles
    detachMarker(boneHighlightRef.current);
    if (boneHighlightRef.current) {
      boneHighlightRef.current = null;
    }
    detachMarker(boneEndpointHandleRef.current);
    if (boneEndpointHandleRef.current) {
      boneEndpointHandleRef.current = null;
    }
    detachMarker(boneHoverMarkerRef.current);
    if (boneHoverMarkerRef.current) {
      boneHoverMarkerRef.current = null;
    }
    hoveredBoneNameRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.dataset.hoveredBone = '';
      delete canvas.dataset.endpointX;
      delete canvas.dataset.endpointY;
    }
    if (!skeleton) {
      return;
    }

    if (selectedBoneName) {
      const bone = findBoneByName(skeleton, selectedBoneName);
      if (bone) {
        const group = makeBoneHighlightMarker(markerScale);
        scene.add(group);
        boneHighlightRef.current = group;
        // Keep endpoint-style handles in precision modes to make exact picking easier.
        if (isPrecisionMode) {
          const handle = makeBoneEndpointHandle(markerScale);
          updateEndpointHandle(handle, bone, markerScale);
          scene.add(handle);
          boneEndpointHandleRef.current = handle;
        }

        updateHighlightPosition(group, bone); // use extracted util
      } else {
        transformTargetRef.current = null;
      }
    }

    // Keep a shared hover marker for visual contrast/affordance.
    const hoverMarker = makeBoneHoverMarker(isPrecisionMode ? markerScale : Math.max(markerScale * 0.7, 0.6));
    hoverMarker.visible = false;
    scene.add(hoverMarker);
    boneHoverMarkerRef.current = hoverMarker;
  }, [selectedBoneName, skeleton, markerScale, isPrecisionMode]);

  // Weight preview visualization for the selected bone.
  // Delegates to extracted pure helpers in utils/weightPreview.ts.
  // Preserves exact prior behavior, backup/restore, color ramp, non-destructive.
  useEffect(() => {
    if (!weightPreviewEnabled || !selectedBoneName || !skeleton) {
      restoreWeightPreview(attachedModelRef.current);
      return;
    }
    applyWeightPreviewForBone(attachedModelRef.current, selectedBoneName, skeleton);
  }, [weightPreviewEnabled, selectedBoneName, skeleton]);

  // Apply transform mode from prop (for UI buttons) or default.
  // useEffect to react to prop changes and set on tc.
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (tc && transformMode) {
      tc.setMode(transformMode);
    }
  }, [transformMode]);

  // Transform gizmo for the selected bone.
  // Reuses the selectedBoneName + skeleton already synced via refs/effects + raycast/list selection.
  // Attaches TransformControls (mode controlled by prop from Inspector buttons or default translate; rotate/scale via 3D handles) to the bone Object3D.
  // On change: bone matrices updated; existing boneHighlight marker (in RAF) and Inspector controls reflect live.
  // Dragging pauses orbit (common pattern). Detached on selection clear or unmount.
  // Quick nudges + T/R/S buttons in Inspector provide precise + mode control; 3D handles for freeform editing. Keyboard T/R/S also supported.
  useEffect(() => {
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    const dom = rendererRef.current?.domElement;
    if (!scene || !cam || !dom) return;

    const prevTc = transformControlsRef.current;
    if (prevTc) {
      prevTc.detach();
    }

    if (!selectedBoneName || !skeleton) {
      transformTargetRef.current = null;
      return;
    }

    const bone = findBoneByName(skeleton, selectedBoneName);
    if (!bone) return;
    transformTargetRef.current = bone;

    let tc = transformControlsRef.current;
    if (!tc) {
      tc = new TransformControls(cam, dom);
      tc.setMode(transformMode || 'translate'); // controlled by prop from Inspector buttons (or default)
      tc.addEventListener('change', () => {
        // Ensure world matrices propagate for skinning + marker follow
        const activeBone = transformTargetRef.current;
        const activeSkeleton = skeletonRefForPick.current;
        if (activeBone) {
          activeBone.updateMatrixWorld(true);
        }
        if (activeSkeleton) {
          activeSkeleton.update();
        }
      });
      tc.addEventListener('dragging-changed', (event: any) => {
        orbitRef.current.enabled = !event.value;
      });
      try {
        scene.add(tc as any);
      } catch (e) {
        // Benign in some dev bundler scenarios with jsm controls + multiple three copies (dedupe helps but not always in Playwright workers).
        // The gizmo logic is still wired; in clean single-bundle runs (tauri build / prod) attach works.
        // Non-fatal: selection + marker + Inspector controls continue to provide transform UX.
        console.warn('[three] TransformControls scene.add skipped (likely three instance skew in dev server):', e);
      }
      transformControlsRef.current = tc;
    }

    try {
      tc.attach(bone as any);
    } catch (e) {
      // same benign skew case
    }
  }, [selectedBoneName, skeleton]);

  // Attach/replace model root + skeleton helper + create internal mixer when root prop changes.
  // IMPORTANT: deps ONLY model data (root/skeleton/clips). Never include playback props (isPlaying/currentTime/currentClipName/playbackSpeed)
  // or this will re-dispose + re-attach the entire model + recreate mixer on every frame/scrub (from parent setCurrentTime in RAF).
  // Playback mutations happen in the dedicated effects below (they read current action/mixer refs and apply without re-mount).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Dispose + remove previous attached model + helper (use shared util)
    const prev = attachedModelRef.current;
    if (prev) {
      scene.remove(prev);
      disposeThreeObject(prev);
      attachedModelRef.current = null;
    }
    if (skeletonHelperRef.current) {
      scene.remove(skeletonHelperRef.current);
      skeletonHelperRef.current.dispose?.();
      skeletonHelperRef.current = null;
    }
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }
    currentActionRef.current = null;

    // Detach any active transform gizmo when model is cleared/replaced (prevents dangling attachment to disposed bones)
    if (transformControlsRef.current) {
      transformControlsRef.current.detach();
    }

    if (!root) {
      boundsRef.current = DEFAULT_VIEWPORT_BOUNDS;
      applyViewportLayout(viewportLayout);
      return;
    }

    // Attach the provided root directly (loaders produce unbound-to-scene instances; preserve skin binds)
    // Avoid clone here to keep skeleton bone refs and skinning correct.
    scene.add(root);
    attachedModelRef.current = root;

    // Auto frame camera + orbit to model (fixes giant/tiny uploads; uses bbox, no model scale to preserve skin/bind)
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const modelBounds = { center, maxDim };
    boundsRef.current = modelBounds;
    updateOrthoCameras(orthoCameraRefs.current, modelBounds);
    applyViewportLayout(viewportLayout);
    const orbit = orbitRef.current;
    orbit.target.copy(modelBounds.center);
    orbit.distance = modelBounds.maxDim * 0.85 + 2;
    orbit.yaw = 0.6;
    orbit.pitch = 0.35;
    if (cameraRef.current) {
      cameraRef.current.position.copy(orbit.getPosition());
      cameraRef.current.lookAt(orbit.target);
    }

    // Modern skeleton helper for larger, old-editor-like rig visualization and direct helper hit picking.
    if (skeleton) {
      const helper = new ModernSkeletonHelper(root, {
        boneThickness: 0.065,
        jointRadius: 0.09,
        depthTest: false,
      });
      scene.add(helper);
      skeletonHelperRef.current = helper;
    }

    // Internal mixer for this model (drives skin + our time reports)
    const mixer = new THREE.AnimationMixer(root);
    mixerRef.current = mixer;

    // Always start the first clip on fresh attach (reliable default).
    // If parent also set a specific currentClipName in the same update, the clip effect below will switch it right after.
    // Start at time 0; the isPlaying/currentTime effects will immediately apply parent's desired initial scrub/play state.
    if (clips && clips.length > 0) {
      const targetClip = clips[0];
      const action = mixer.clipAction(targetClip);
      action.play();
      // Use prop value at attach time for initial speed (playbackSpeed effect will keep it in sync on changes)
      action.setEffectiveTimeScale(playbackSpeed);
      currentActionRef.current = action;
    }

    return () => {
      // cleanup handled on next root change or unmount via the top of this effect
    };
  }, [root, skeleton, clips]);  // <-- ONLY model data; playback handled by other effects to prevent re-attach loops on every tick

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        data-testid="three-canvas"
        data-editor-mode={editorMode}
        data-viewport-layout={viewportLayout}
        data-wireframe-enabled={wireframeEnabled ? 'true' : 'false'}
      />
      {viewportLayout === 'quad' && (
        <div className="quad-pane-overlay" data-testid="quad-pane-overlay" aria-hidden="true">
          <div className="quad-pane-line quad-pane-line-v" />
          <div className="quad-pane-line quad-pane-line-h" />
          <span className="quad-pane-label quad-pane-label-top-left" data-testid="quad-pane-label-top">Top</span>
          <span className="quad-pane-label quad-pane-label-top-right" data-testid="quad-pane-label-3d">3D</span>
          <span className="quad-pane-label quad-pane-label-bottom-left" data-testid="quad-pane-label-front">Front</span>
          <span className="quad-pane-label quad-pane-label-bottom-right" data-testid="quad-pane-label-side">Side</span>
        </div>
      )}
    </>
  );
};

export default ThreeViewport;
