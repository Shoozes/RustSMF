import React, { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { SimpleOrbit } from '../utils/SimpleOrbit';
import { disposeThreeObject } from '../utils/threeDisposal';
import { isThreeMesh, isThreeSkinnedMesh } from '../utils/threeTypeGuards';
import { restoreWeightPreview, applyWeightPreviewForBone } from '../utils/weightPreview';
import { findClosestBone, DEFAULT_MAX_BONE_PICK_DIST, findBoneByName } from '../utils/bonePicker';
import type { SkinWeightEditMode } from '../utils/skinWeights';
import type { RigToolMode } from '../utils/rigEdits';
import type { RigIkSolveResult } from '../utils/rigIk';
import { useBoneLabelsWithScale } from '../utils/useBoneLabels';
import { createSkinPointOverlays, disposeSkinPointOverlays } from '../utils/skinPointOverlay';
import {
  type TextureFilterPreview,
} from '../utils/materialPreview';
import { createViewportDisplayController } from '../utils/viewportDisplayController';
import {
  createSelectionOverlays,
  disposeSelectionOverlays,
  getSelectionOverlayTargetName,
  updateSelectionOverlays,
  type SelectionOverlay,
} from '../utils/selectionOverlay';
import {
  makeBoneHighlightMarker,
  updateHighlightPosition,
  makeBoneEndpointHandle,
  makeRigIkTargetHandle,
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
  getModelOrbitDistance,
  getOrthographicPanDelta,
  getViewportAt as findViewportAt,
  refreshOrthoCameras as updateOrthoCameras,
  refreshViewportSpecs as buildViewportSpecs,
  type ModelBounds,
  type ViewportRole,
  type ViewportSpec,
} from '../utils/viewportLayout';
import {
  resolvePointerClickOwner,
  resolvePointerDownOwner,
  type ViewportInteractionOwner,
} from '../utils/viewportInteractionRouter';
import { attachViewportInteractionRuntime } from '../utils/viewportInteractionRuntime';
import {
  createViewportTransformControls,
  type ViewportTransformControlsController,
} from '../utils/viewportTransformControls';
import {
  createThemeViewportGrids,
  disposeThemeViewportGrids,
  updateThemeViewportGridVisibility,
  type ThemeViewportGrids,
} from '../utils/themeViewportGrid';
import {
  buildSkinnedWorldBrushIndex,
  querySkinBrushWorldIndex,
  type SkinBrushIndex,
  type SkinBrushVertexRef,
} from '../utils/skinBrushIndex';
import { getSkinnedVertexWorldPosition } from '../utils/skinnedVertexPosition';
import { cancelPendingAnimationFrame } from '../utils/animationFrame';
import type { EditorMode, ViewportLayout } from '../store';
import { getAppTheme, type AppThemeId } from '../theme';
import type {
  BoneTransformEditEvent,
  BoneTransformEditPhase,
  BoneTransformEditSource,
  BoneTransformOwner,
  RigIkEditEvent,
  RigMoveEditEvent,
  RigRotateEditEvent,
  ViewportObjectSelectEvent,
} from '../types/viewportEditorEvents';
import { TransformControlsGizmo } from 'three/examples/jsm/controls/TransformControls.js';

type EndpointDragState = {
  boneName: string;
  bone: THREE.Bone;
  plane: THREE.Plane;
  localOffset: THREE.Vector3;
  parentInverse: THREE.Matrix4;
};

type RigMoveDragState = {
  boneName: string;
  bone: THREE.Bone;
  paneRole: ViewportRole;
  plane: THREE.Plane;
  localOffset: THREE.Vector3;
};

type RigRotateDragState = {
  boneName: string;
  bone: THREE.Bone;
  paneRole: ViewportRole;
  plane: THREE.Plane;
  axis: THREE.Vector3;
  center: THREE.Vector3;
  previousVector: THREE.Vector3;
};

type RigIkDragState = {
  boneName: string;
  paneRole: ViewportRole;
  plane: THREE.Plane;
  localOffset: THREE.Vector3;
  initialTargetWorld: THREE.Vector3;
  targetWorld: THREE.Vector3;
};

const TRANSFORM_HANDLE_AXES = ['X', 'Y', 'Z'] as const;

type SkinPaintVertex = { meshId: string; vertexIndex: number; amount: number };

interface SkinPaintCollection {
  vertices: SkinPaintVertex[];
  candidateCount: number;
  totalVertexCount: number;
}

const writeViewportCameraTelemetry = (
  canvas: HTMLCanvasElement | null,
  viewports: ViewportSpec[],
): void => {
  if (!canvas) return;
  canvas.dataset.viewportCameraType = viewports[0]?.camera.type ?? '';
};

const writeSharedCameraTargetTelemetry = (
  canvas: HTMLCanvasElement | null,
  target: THREE.Vector3,
): void => {
  if (!canvas) return;
  canvas.dataset.cameraTargetX = target.x.toFixed(6);
  canvas.dataset.cameraTargetY = target.y.toFixed(6);
  canvas.dataset.cameraTargetZ = target.z.toFixed(6);
};

// Self-contained ThreeViewport.
// Owns: renderer, scene (base lights+grid+axes), camera, SimpleOrbit controls, RAF loop, model attach,
// SkeletonHelper, AnimationMixer + action management, time reporting.
// Receives declarative props from App for the loaded model and playback intent.
// No dead code or duplication with parent. All imperative three isolated here.

interface PlaybackIntent {
  clips: THREE.AnimationClip[];
  currentClipName?: string;
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
}

function activateMixerClip(
  mixer: THREE.AnimationMixer,
  intent: PlaybackIntent,
): THREE.AnimationAction | null {
  if (intent.clips.length === 0) return null;

  const clip = (
    intent.currentClipName
      ? intent.clips.find(candidate => (candidate.name || 'clip') === intent.currentClipName)
      : undefined
  ) ?? intent.clips[0];
  if (!clip) return null;

  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  action.paused = !intent.isPlaying;
  action.setEffectiveTimeScale(intent.playbackSpeed);
  action.time = Math.max(0, Math.min(intent.currentTime, clip.duration || 0));
  mixer.update(0);
  return action;
}

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
  onSelectObject?: (event: ViewportObjectSelectEvent) => void;
  onClearObjectSelection?: () => void;
  onObjectContextMenu?: (event: ViewportObjectSelectEvent) => void;
  onBoneTransformEdit?: (event: BoneTransformEditEvent) => void;
  onCreateRigChildAtWorld?: (event: { worldPosition: THREE.Vector3; paneRole: ViewportRole }) => boolean | void;
  onMoveRigBoneToWorld?: (event: RigMoveEditEvent) => boolean | void;
  onRotateRigBone?: (event: RigRotateEditEvent) => boolean | void;
  onSolveRigIk?: (event: RigIkEditEvent) => RigIkSolveResult | boolean | void;
  selectedBoneName?: string;
  selectedObjectIds?: string[];
  selectionOverlayRevision?: number;
  weightPreviewEnabled?: boolean;
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSetTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => boolean | void;
  boneTransformOwner?: BoneTransformOwner;
  boneLabelsEnabled?: boolean;
  rigToolMode?: RigToolMode;
  editorMode?: EditorMode;
  viewportLayout?: ViewportLayout;
  wireframeEnabled?: boolean;
  gridEnabled?: boolean;
  axesEnabled?: boolean;
  textureEnabled?: boolean;
  textureRepeatPreviewEnabled?: boolean;
  textureFilterPreview?: TextureFilterPreview;
  boneIndexLabelsEnabled?: boolean;
  rigOpacity?: number;
  rigThicknessScale?: number;
  skinPointOverlayEnabled?: boolean;
  shaderEnabled?: boolean;
  perspectiveEnabled?: boolean;
  modelOpacity?: number;
  themeId?: AppThemeId;
  onPaintSkinVertices?: (paintVertices: SkinPaintVertex[]) => void;
  onSkinPaintStrokeStart?: () => void;
  onSkinPaintStrokeEnd?: () => void;
  skinPaintMode?: SkinWeightEditMode;
  skinPaintTargetMode?: 'vertex' | 'triangle';
  skinPaintRadius?: number;
  skinPaintStrength?: number;
  skinPaintTarget?: number;
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
  onSelectObject,
  onClearObjectSelection,
  onObjectContextMenu,
  onBoneTransformEdit,
  onCreateRigChildAtWorld,
  onMoveRigBoneToWorld,
  onRotateRigBone,
  onSolveRigIk,
  selectedBoneName,
  selectedObjectIds = [],
  selectionOverlayRevision = 0,
  weightPreviewEnabled = false,
  transformMode = 'translate',
  onSetTransformMode,
  boneTransformOwner = 'disabled',
  boneLabelsEnabled = false,
  rigToolMode = 'select',
  editorMode = 'view',
  viewportLayout = 'single',
  wireframeEnabled = false,
  gridEnabled = true,
  axesEnabled = true,
  textureEnabled = true,
  textureRepeatPreviewEnabled = false,
  textureFilterPreview = 'source',
  boneIndexLabelsEnabled = false,
  rigOpacity = 1,
  rigThicknessScale = 1,
  skinPointOverlayEnabled = false,
  shaderEnabled = false,
  perspectiveEnabled = true,
  modelOpacity = 1,
  themeId = 'modern',
  onPaintSkinVertices,
  onSkinPaintStrokeStart,
  onSkinPaintStrokeEnd,
  skinPaintMode = 'set',
  skinPaintTargetMode = 'vertex',
  skinPaintRadius = 0.2,
  skinPaintStrength = 0.2,
  skinPaintTarget = 1,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRefs = useRef<THREE.OrthographicCamera[]>([]);
  const orbitRef = useRef(new SimpleOrbit());
  const frameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const viewportRef = useRef<ViewportSpec[]>([]);
  const layoutRef = useRef<ViewportLayout>('single');
  const wireframeEnabledRef = useRef(false);
  const gridEnabledRef = useRef(gridEnabled);
  const viewportGridModeRef = useRef(getAppTheme(themeId).viewportGrid.mode);
  const viewportGridThemeRef = useRef<AppThemeId>(themeId);
  const wireframeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const boundsRef = useRef<ModelBounds>(DEFAULT_VIEWPORT_BOUNDS);
  const canvasSizeRef = useRef({ width: 800, height: 600 });
  const viewportGridRefs = useRef<ThemeViewportGrids | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const pointerDownRef = useRef<{
    x: number;
    y: number;
    time: number;
    button: number;
    owner: ViewportInteractionOwner;
    isSkinPaint?: boolean;
  } | null>(null);
  const viewportDisplayRef = useRef(createViewportDisplayController());
  const onPaintSkinVerticesRef = useRef(onPaintSkinVertices);
  const onSkinPaintStrokeStartRef = useRef(onSkinPaintStrokeStart);
  const onSkinPaintStrokeEndRef = useRef(onSkinPaintStrokeEnd);
  const skinPaintModeRef = useRef<SkinWeightEditMode>(skinPaintMode);
  const skinPaintTargetModeRef = useRef<'vertex' | 'triangle'>(skinPaintTargetMode);
  const skinPaintRadiusRef = useRef<number>(skinPaintRadius);
  const skinPaintStrengthRef = useRef<number>(skinPaintStrength);
  const skinPaintTargetRef = useRef<number>(skinPaintTarget);
  const pickDistanceRef = useRef(DEFAULT_MAX_BONE_PICK_DIST);
  const editorModeRef = useRef(editorMode);
  const cursorModeRef = useRef<string>('default');
  const isPrecisionModeRef = useRef(false);
  const endpointDragRef = useRef<EndpointDragState | null>(null);
  const rigMoveDragRef = useRef<RigMoveDragState | null>(null);
  const rigRotateDragRef = useRef<RigRotateDragState | null>(null);
  const rigIkDragRef = useRef<RigIkDragState | null>(null);
  const skinPaintActiveRef = useRef(false);

  // TransformControls for selected bone (Cycle 3 editor polish). Attached to the live THREE.Bone when selectedBoneName changes.
  // Change events mutate the bone in place (position/rot/scale); works with existing marker + Inspector controls + RAF.
  const transformControlsControllerRef = useRef<ViewportTransformControlsController | null>(null);
  const transformTargetRef = useRef<THREE.Bone | null>(null);
  const isTransformControlsPausedForEndpointRef = useRef(false);

  // Local mixer + action owned here (viewport is the source of truth for three playback)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const attachedModelRef = useRef<THREE.Object3D | null>(null);
  const skeletonHelperRef = useRef<DisposableSkeletonHelper | null>(null);
  const playbackIntentRef = useRef<PlaybackIntent>({
    clips,
    currentClipName,
    isPlaying,
    currentTime,
    playbackSpeed,
  });
  playbackIntentRef.current = {
    clips,
    currentClipName,
    isPlaying,
    currentTime,
    playbackSpeed,
  };

  // For raycast bone picking (3D click-to-select complementing Inspector list)
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const onSelectBoneRef = useRef(onSelectBone);
  const onSelectObjectRef = useRef(onSelectObject);
  const onClearObjectSelectionRef = useRef(onClearObjectSelection);
  const onObjectContextMenuRef = useRef(onObjectContextMenu);
  const onBoneTransformEditRef = useRef(onBoneTransformEdit);
  const onCreateRigChildAtWorldRef = useRef(onCreateRigChildAtWorld);
  const onMoveRigBoneToWorldRef = useRef(onMoveRigBoneToWorld);
  const onRotateRigBoneRef = useRef(onRotateRigBone);
  const onSolveRigIkRef = useRef(onSolveRigIk);
  const onSetTransformModeRef = useRef(onSetTransformMode);
  const boneTransformOwnerRef = useRef<BoneTransformOwner>(boneTransformOwner);
  const skeletonRefForPick = useRef(skeleton);

  // For selected bone 3D highlight marker (visual feedback when list or raycast selects a bone)
  const selectedBoneNameRef = useRef(selectedBoneName);
  const rigToolModeRef = useRef<RigToolMode>(rigToolMode);
  const boneHighlightRef = useRef<THREE.Object3D | null>(null);
  const boneEndpointHandleRef = useRef<THREE.Object3D | null>(null);
  const rigIkTargetHandleRef = useRef<THREE.Object3D | null>(null);
  const rigIkTargetWorldRef = useRef<THREE.Vector3 | null>(null);
  const boneHoverMarkerRef = useRef<THREE.Object3D | null>(null);
  const skinPointOverlaysRef = useRef<THREE.Points[]>([]);
  const selectionOverlaysRef = useRef<SelectionOverlay[]>([]);
  const hoveredBoneNameRef = useRef<string | null>(null);
  const skinBrushMarkerRef = useRef<THREE.Object3D | null>(null);
  const skinBrushIndexCacheRef = useRef(new WeakMap<THREE.SkinnedMesh, {
    cellSize: number;
    signature: number;
    index: SkinBrushIndex;
  }>());
  const skinPaintHitCountRef = useRef(0);
  const skinCandidateCountRef = useRef(0);
  const skinTotalVertexCountRef = useRef(0);
  const lastSkinPaintMsRef = useRef(0);
  const transformControlsDraggingRef = useRef(false);
  const perspectiveEnabledRef = useRef(perspectiveEnabled);
  const skinPointOverlayEnabledRef = useRef(skinPointOverlayEnabled);
  const selectedObjectIdsRef = useRef(selectedObjectIds);
  const textureEnabledRef = useRef(textureEnabled);
  const modelOpacityRef = useRef(modelOpacity);
  const selectedObjectIdKey = selectedObjectIds.join('|');

  const clearTransformHandleTelemetry = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    delete canvas.dataset.transformHandleAxis;
    delete canvas.dataset.transformHandleMode;
    delete canvas.dataset.transformHandleStartX;
    delete canvas.dataset.transformHandleStartY;
    delete canvas.dataset.transformHandleEndX;
    delete canvas.dataset.transformHandleEndY;
  };

  const setTransformOwnerTelemetry = (attached: boolean): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = transformControlsControllerRef.current;
    const controls = controller?.controls;
    const helper = controller?.helper;
    canvas.dataset.transformOwner = boneTransformOwnerRef.current;
    canvas.dataset.transformAttached = attached ? 'true' : 'false';
    canvas.dataset.transformDragging = transformControlsDraggingRef.current ? 'true' : 'false';
    canvas.dataset.transformAxis = controls?.axis ?? '';
    canvas.dataset.transformHelperMounted = helper?.parent === sceneRef.current ? 'true' : 'false';
    if (!attached) clearTransformHandleTelemetry();
  };

  // Ref for onTimeUpdate to decouple RAF reporting from setup effect deps (timing/robustness: avoids re-init of scene/RAF if fn identity ever shifts; mirrors bone pick ref pattern)
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const playbackStateRef = useRef({ isPlaying, currentTime });

  const applyViewportLayout = (nextLayout: ViewportLayout) => {
    const camera = cameraRef.current;
    if (!camera) return;
    updateOrthoCameras(
      orthoCameraRefs.current,
      boundsRef.current,
      orbitRef.current.target,
    );
    const viewports = buildViewportSpecs(
      canvasSizeRef.current.width,
      canvasSizeRef.current.height,
      nextLayout,
      boundsRef.current,
      camera,
      orthoCameraRefs.current,
      perspectiveEnabledRef.current,
    );
    viewportRef.current = viewports;
    writeViewportCameraTelemetry(canvasRef.current, viewports);
    layoutRef.current = nextLayout;
  };

  const getViewportAt = (x: number, y: number, requirePicking = false): ViewportSpec | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return findViewportAt(viewportRef.current, rect, x, y, requirePicking);
  };

  const isInPickingViewport = (x: number, y: number): boolean => !!getViewportAt(x, y, true);

  const pickViewportCamera = (x: number, y: number): { camera: THREE.Camera; viewport: ViewportSpec } | null => {
    const match = getViewportAt(x, y, true);
    if (!match) return null;

    return {
      camera: match.camera,
      viewport: match,
    };
  };

  const projectWorldToCanvasClient = (
    worldPosition: THREE.Vector3,
    viewport: ViewportSpec,
    rect: DOMRect,
  ): { x: number; y: number } | null => {
    const projected = worldPosition.clone().project(viewport.camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || Math.abs(projected.z) > 1) {
      return null;
    }

    const localX = viewport.x + ((projected.x + 1) / 2) * viewport.width;
    const localYFromBottom = viewport.y + ((projected.y + 1) / 2) * viewport.height;
    return {
      x: rect.left + localX,
      y: rect.top + (rect.height - localYFromBottom),
    };
  };

  const writeEndpointScreenTelemetry = (bone: THREE.Bone): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const viewport = viewportRef.current.find((spec) => spec.role === 'perspective') ?? viewportRef.current[0];
    const endpointHandle = boneEndpointHandleRef.current?.children.find(
      (child) => child.userData.endpointRole === 'end',
    );
    const worldPosition = endpointHandle
      ? endpointHandle.getWorldPosition(new THREE.Vector3())
      : bone.getWorldPosition(new THREE.Vector3());
    const point = viewport ? projectWorldToCanvasClient(worldPosition, viewport, rect) : null;
    if (!point) {
      delete canvas.dataset.endpointX;
      delete canvas.dataset.endpointY;
      return;
    }
    canvas.dataset.endpointX = String(Math.round(point.x));
    canvas.dataset.endpointY = String(Math.round(point.y));
  };

  const writeRigIkTargetScreenTelemetry = (worldPosition: THREE.Vector3): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const viewport = viewportRef.current.find((spec) => spec.role === 'perspective') ?? viewportRef.current[0];
    const point = viewport ? projectWorldToCanvasClient(worldPosition, viewport, rect) : null;
    if (!point) {
      delete canvas.dataset.rigIkTargetScreenX;
      delete canvas.dataset.rigIkTargetScreenY;
      return;
    }
    canvas.dataset.rigIkTargetScreenX = String(Math.round(point.x));
    canvas.dataset.rigIkTargetScreenY = String(Math.round(point.y));
  };

  const writeTransformHandleTelemetry = (): void => {
    const canvas = canvasRef.current;
    const controller = transformControlsControllerRef.current;
    const controls = controller?.controls;
    const helper = controller?.helper;
    const target = transformTargetRef.current;
    const viewport = viewportRef.current.find((spec) => spec.role === 'perspective') ?? viewportRef.current[0];
    if (
      !canvas
      || !controls
      || !helper
      || helper.parent !== sceneRef.current
      || !helper.visible
      || !target
      || !viewport
      || layoutRef.current !== 'single'
    ) {
      clearTransformHandleTelemetry();
      return;
    }

    const gizmo = helper.children.find((child) => child instanceof TransformControlsGizmo);
    if (!gizmo) {
      clearTransformHandleTelemetry();
      return;
    }

    const mode = controls.getMode();
    const picker = gizmo.picker[mode];
    const rect = canvas.getBoundingClientRect();
    const origin = target.getWorldPosition(new THREE.Vector3());
    const originScreen = projectWorldToCanvasClient(origin, viewport, rect);
    if (!originScreen) {
      clearTransformHandleTelemetry();
      return;
    }

    const worldQuaternion = target.getWorldQuaternion(new THREE.Quaternion());
    for (const axis of TRANSFORM_HANDLE_AXES) {
      const direction = axis === 'X'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'Y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
      if (controls.space === 'local') direction.applyQuaternion(worldQuaternion);
      const directionScreen = projectWorldToCanvasClient(origin.clone().add(direction), viewport, rect);
      if (!directionScreen) continue;
      const deltaX = directionScreen.x - originScreen.x;
      const deltaY = directionScreen.y - originScreen.y;
      const deltaLength = Math.hypot(deltaX, deltaY);
      if (deltaLength < 1) continue;

      const candidates = picker.children.filter((child) => child.name === axis && child.visible);
      for (const candidate of candidates) {
        if (!(candidate instanceof THREE.Mesh) || !(candidate.geometry instanceof THREE.BufferGeometry)) continue;
        if (!candidate.geometry.boundingBox) candidate.geometry.computeBoundingBox();
        const bounds = candidate.geometry.boundingBox;
        if (!bounds) continue;
        const handleWorld = bounds.getCenter(new THREE.Vector3()).applyMatrix4(candidate.matrixWorld);
        const start = projectWorldToCanvasClient(handleWorld, viewport, rect);
        if (!start) continue;

        canvas.dataset.transformHandleAxis = axis;
        canvas.dataset.transformHandleMode = mode;
        canvas.dataset.transformHandleStartX = String(Math.round(start.x));
        canvas.dataset.transformHandleStartY = String(Math.round(start.y));
        canvas.dataset.transformHandleEndX = String(Math.round(start.x + (deltaX / deltaLength) * 48));
        canvas.dataset.transformHandleEndY = String(Math.round(start.y + (deltaY / deltaLength) * 48));
        return;
      }
    }

    clearTransformHandleTelemetry();
  };

  const isPrecisionMode = editorMode === 'rig' || editorMode === 'skin';
  const bonePickDist = isPrecisionMode ? 2.5 : DEFAULT_MAX_BONE_PICK_DIST;
  const boneLabelScale = isPrecisionMode ? 1.8 : 1;
  pickDistanceRef.current = bonePickDist;
  isPrecisionModeRef.current = isPrecisionMode;
  perspectiveEnabledRef.current = perspectiveEnabled;
  skinPointOverlayEnabledRef.current = skinPointOverlayEnabled;
  selectedObjectIdsRef.current = selectedObjectIds;
  textureEnabledRef.current = textureEnabled;
  modelOpacityRef.current = modelOpacity;

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

  const clamp01 = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  };

  const getPaintAmount = (
    distanceSq: number,
    radius: number,
    strength: number,
    target: number,
  ): number => {
    if (radius <= 0 || distanceSq > radius * radius) return 0;
    if (strength <= 0) return 0;
    const dist = Math.sqrt(Math.max(0, distanceSq));
    const normalized = 1 - dist / radius;
    const falloff = Math.max(1, target);
    return clamp01(strength * Math.pow(normalized, falloff));
  };

  const collectSkinnedMeshes = (): THREE.SkinnedMesh[] => {
    const root = attachedModelRef.current;
    if (!root) return [];
    const meshes: THREE.SkinnedMesh[] = [];
    root.traverse((obj: THREE.Object3D) => {
      if (isThreeSkinnedMesh(obj)) {
        meshes.push(obj);
      }
    });
    return meshes;
  };

  const getSkinnedWorldBrushIndex = (mesh: THREE.SkinnedMesh): SkinBrushIndex => {
    const desiredCellSize = Math.max(0.01, Math.min(boundsRef.current.maxDim / 32, 0.25));
    mesh.updateMatrixWorld(true);
    mesh.skeleton?.update();
    const position = mesh.geometry.getAttribute('position');
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    const attributeVersion = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): number => (
      attribute && 'version' in attribute ? attribute.version : 0
    );
    const signatureValues = [
      ...mesh.matrixWorld.elements,
      ...(mesh.skeleton?.boneMatrices ?? []),
      attributeVersion(position),
      attributeVersion(skinIndex),
      attributeVersion(skinWeight),
    ];
    let signature = 2166136261;
    for (const value of signatureValues) {
      signature = Math.imul(signature ^ Math.round(value * 100000), 16777619);
    }
    const cached = skinBrushIndexCacheRef.current.get(mesh);
    if (cached && cached.cellSize === desiredCellSize && cached.signature === signature) {
      return cached.index;
    }
    const index = buildSkinnedWorldBrushIndex(mesh, desiredCellSize);
    skinBrushIndexCacheRef.current.set(mesh, { cellSize: desiredCellSize, signature, index });
    return index;
  };

  const shouldApplySkinPaintNow = (): boolean => {
    const now = performance.now();
    if (now - lastSkinPaintMsRef.current < 20) return false;
    lastSkinPaintMsRef.current = now;
    return true;
  };

  const collectSelectableMeshes = (): THREE.Mesh[] => {
    const root = attachedModelRef.current;
    if (!root) return [];
    const meshes: THREE.Mesh[] = [];
    root.traverseVisible((obj: THREE.Object3D) => {
      if (isThreeMesh(obj)) meshes.push(obj);
    });
    return meshes;
  };

  const pickViewportObject = (
    event: Pick<PointerEvent | MouseEvent, 'clientX' | 'clientY' | 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  ): ViewportObjectSelectEvent | null => {
    const pick = pickViewportCamera(event.clientX, event.clientY);
    const canvas = canvasRef.current;
    if (!pick || !canvas) return null;

    const meshes = collectSelectableMeshes();
    if (meshes.length === 0) return null;

    const rect = canvas.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
    mouseRef.current.copy(mouse);
    raycasterRef.current.setFromCamera(mouseRef.current, pick.camera);

    const hit = raycasterRef.current.intersectObjects(meshes, false)[0];
    if (!hit?.object) return null;

    canvas.dataset.selectedObject = hit.object.uuid;
    canvas.dataset.selectedObjectName = hit.object.name || hit.object.type || 'Object';
    return {
      objectId: hit.object.uuid,
      objectName: hit.object.name || hit.object.type || 'Object',
      additive: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    };
  };

  const clearSkinPointOverlays = (): void => {
    disposeSkinPointOverlays(skinPointOverlaysRef.current);
    skinPointOverlaysRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.dataset.skinPointOverlayCount = '0';
    }
  };

  const rebuildSkinPointOverlays = (): void => {
    clearSkinPointOverlays();
    const canvas = canvasRef.current;
    if (!skinPointOverlayEnabledRef.current || !attachedModelRef.current) {
      return;
    }
    skinPointOverlaysRef.current = createSkinPointOverlays(attachedModelRef.current, {
      selectedBoneName: selectedBoneNameRef.current,
    });
    if (canvas) {
      canvas.dataset.skinPointOverlayCount = String(skinPointOverlaysRef.current.length);
    }
  };

  const clearSelectionOverlays = (): void => {
    disposeSelectionOverlays(selectionOverlaysRef.current);
    selectionOverlaysRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.dataset.selectionOverlayCount = '0';
      delete canvas.dataset.selectionOverlayNames;
    }
  };

  const rebuildSelectionOverlays = (): void => {
    clearSelectionOverlays();
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const activeSelectedObjectIds = selectedObjectIdsRef.current;
    if (!scene || !attachedModelRef.current || activeSelectedObjectIds.length === 0) {
      return;
    }

    selectionOverlaysRef.current = createSelectionOverlays(attachedModelRef.current, activeSelectedObjectIds);
    selectionOverlaysRef.current.forEach((overlay) => scene.add(overlay));
    if (canvas) {
      canvas.dataset.selectionOverlayCount = String(selectionOverlaysRef.current.length);
      canvas.dataset.selectionOverlayNames = selectionOverlaysRef.current
        .map(getSelectionOverlayTargetName)
        .filter(Boolean)
        .join(',');
    }
  };

  const emitBoneTransformEdit = (
    phase: BoneTransformEditPhase,
    source: BoneTransformEditSource,
    bone: THREE.Bone | null,
  ): void => {
    if (!bone?.name) return;
    const owner = boneTransformOwnerRef.current;
    if (owner === 'disabled') return;

    bone.updateMatrix();
    bone.updateMatrixWorld(true);

    onBoneTransformEditRef.current?.({
      phase,
      source,
      owner,
      boneName: bone.name,
      position: [bone.position.x, bone.position.y, bone.position.z],
      quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
      scale: [bone.scale.x, bone.scale.y, bone.scale.z],
    });

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.dataset.boneTransformPhase = phase;
      canvas.dataset.boneTransformSource = source;
      canvas.dataset.boneTransformOwner = owner;
      canvas.dataset.boneTransformBone = bone.name;
    }
  };

  const pauseTransformControlsForEndpointDrag = () => {
    const controller = transformControlsControllerRef.current;
    if (!controller || isTransformControlsPausedForEndpointRef.current) return;
    isTransformControlsPausedForEndpointRef.current = true;
    controller.setEnabled(false);
    controller.detach();
    setTransformOwnerTelemetry(false);
  };

  const restoreTransformControlsAfterEndpointDrag = () => {
    const controller = transformControlsControllerRef.current;
    if (!controller || !isTransformControlsPausedForEndpointRef.current) return;
    controller.setEnabled(true);
    if (transformTargetRef.current) {
      controller.attach(transformTargetRef.current);
    }
    isTransformControlsPausedForEndpointRef.current = false;
    setTransformOwnerTelemetry(!!transformTargetRef.current);
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
    emitBoneTransformEdit('change', 'endpoint-drag', state.bone);
    return true;
  };

  const updateRigMoveTelemetry = (state: RigMoveDragState, worldPosition: THREE.Vector3): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.rigMove = 'active';
    canvas.dataset.rigMovePaneRole = state.paneRole;
    canvas.dataset.rigMoveBone = state.boneName;
    canvas.dataset.rigMoveX = worldPosition.x.toFixed(4);
    canvas.dataset.rigMoveY = worldPosition.y.toFixed(4);
    canvas.dataset.rigMoveZ = worldPosition.z.toFixed(4);
  };

  const clearRigMoveTelemetry = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    delete canvas.dataset.rigMove;
    delete canvas.dataset.rigMovePaneRole;
    delete canvas.dataset.rigMoveBone;
    delete canvas.dataset.rigMoveX;
    delete canvas.dataset.rigMoveY;
    delete canvas.dataset.rigMoveZ;
  };

  const updateRigRotateTelemetry = (state: RigRotateDragState, angleRadians: number): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.rigRotate = 'active';
    canvas.dataset.rigRotatePaneRole = state.paneRole;
    canvas.dataset.rigRotateBone = state.boneName;
    canvas.dataset.rigRotateAngle = angleRadians.toFixed(4);
  };

  const clearRigRotateTelemetry = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    delete canvas.dataset.rigRotate;
    delete canvas.dataset.rigRotatePaneRole;
    delete canvas.dataset.rigRotateBone;
    delete canvas.dataset.rigRotateAngle;
  };

  const updateRigIkTelemetry = (state: RigIkDragState, result?: RigIkSolveResult | boolean | void): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.rigIk = 'active';
    canvas.dataset.rigIkPaneRole = state.paneRole;
    canvas.dataset.rigIkBone = state.boneName;
    canvas.dataset.rigIkTargetX = state.targetWorld.x.toFixed(4);
    canvas.dataset.rigIkTargetY = state.targetWorld.y.toFixed(4);
    canvas.dataset.rigIkTargetZ = state.targetWorld.z.toFixed(4);
    if (result && typeof result === 'object') {
      canvas.dataset.rigIkStatus = result.status;
      canvas.dataset.rigIkDistance = result.distanceToTarget.toFixed(5);
    }
  };

  const clearRigIkTelemetry = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    delete canvas.dataset.rigIk;
    delete canvas.dataset.rigIkPaneRole;
    delete canvas.dataset.rigIkBone;
    delete canvas.dataset.rigIkTargetX;
    delete canvas.dataset.rigIkTargetY;
    delete canvas.dataset.rigIkTargetZ;
  };

  const getRigIkWorldTargetFromPointer = (
    event: PointerEvent,
    state: RigIkDragState,
    viewport: ViewportSpec,
  ): THREE.Vector3 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, viewport, rect);
    raycasterRef.current.setFromCamera(mouse, viewport.camera);
    const hit = raycasterRef.current.ray.intersectPlane(state.plane, new THREE.Vector3());
    return hit ? hit.sub(state.localOffset) : null;
  };

  const updateRigIkFromPointer = (event: PointerEvent, state: RigIkDragState): boolean => {
    const pick = pickViewportCamera(event.clientX, event.clientY);
    if (!pick || pick.viewport.role !== state.paneRole) return false;
    const targetWorld = getRigIkWorldTargetFromPointer(event, state, pick.viewport);
    if (!targetWorld) return false;
    const previousTarget = state.targetWorld.clone();
    state.targetWorld.copy(targetWorld);
    rigIkTargetWorldRef.current?.copy(targetWorld);
    rigIkTargetHandleRef.current?.position.copy(targetWorld);
    const result = onSolveRigIkRef.current?.({
      phase: 'change',
      boneName: state.boneName,
      targetWorld,
      paneRole: state.paneRole,
    });
    if (result === false) {
      state.targetWorld.copy(previousTarget);
      rigIkTargetWorldRef.current?.copy(previousTarget);
      rigIkTargetHandleRef.current?.position.copy(previousTarget);
      return false;
    }
    updateRigIkTelemetry(state, result);
    return true;
  };

  const getRigMoveWorldPositionFromPointer = (
    event: PointerEvent,
    state: RigMoveDragState,
    viewport: ViewportSpec,
  ): THREE.Vector3 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, viewport, rect);
    raycasterRef.current.setFromCamera(mouse, viewport.camera);
    const hit = raycasterRef.current.ray.intersectPlane(state.plane, new THREE.Vector3());
    if (!hit) return null;
    return hit.sub(state.localOffset);
  };

  const updateRigMoveFromPointer = (event: PointerEvent, state: RigMoveDragState): boolean => {
    const pick = pickViewportCamera(event.clientX, event.clientY);
    if (!pick || pick.viewport.role !== state.paneRole) return false;

    const worldPosition = getRigMoveWorldPositionFromPointer(event, state, pick.viewport);
    if (!worldPosition) return false;

    const moved = onMoveRigBoneToWorldRef.current?.({
      phase: 'change',
      boneName: state.boneName,
      worldPosition,
      paneRole: state.paneRole,
    });
    if (moved === false) return false;

    updateRigMoveTelemetry(state, worldPosition);
    return true;
  };

  const getRigRotateVectorFromPointer = (
    event: PointerEvent,
    state: RigRotateDragState,
    viewport: ViewportSpec,
  ): THREE.Vector3 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, viewport, rect);
    raycasterRef.current.setFromCamera(mouse, viewport.camera);
    const hit = raycasterRef.current.ray.intersectPlane(state.plane, new THREE.Vector3());
    if (!hit) return null;
    const vector = hit.sub(state.center);
    return vector.lengthSq() > 1e-10 ? vector.normalize() : null;
  };

  const updateRigRotateFromPointer = (event: PointerEvent, state: RigRotateDragState): boolean => {
    const pick = pickViewportCamera(event.clientX, event.clientY);
    if (!pick || pick.viewport.role !== state.paneRole) return false;

    const nextVector = getRigRotateVectorFromPointer(event, state, pick.viewport);
    if (!nextVector) return false;
    const cross = new THREE.Vector3().crossVectors(state.previousVector, nextVector);
    const signedSin = cross.dot(state.axis);
    const angleRadians = Math.atan2(signedSin, state.previousVector.dot(nextVector));
    if (!Number.isFinite(angleRadians) || Math.abs(angleRadians) < 1e-5) return false;

    const rotated = onRotateRigBoneRef.current?.({
      phase: 'change',
      boneName: state.boneName,
      worldAxis: state.axis,
      angleRadians,
      paneRole: state.paneRole,
    });
    if (rotated === false) return false;

    state.previousVector.copy(nextVector);
    updateRigRotateTelemetry(state, angleRadians);
    return true;
  };

  const getRigChildPlacementFromPointer = (
    event: PointerEvent,
  ): { worldPosition: THREE.Vector3; paneRole: ViewportRole } | null => {
    if (editorModeRef.current !== 'rig' || rigToolModeRef.current !== 'add-child') return null;

    const parentName = selectedBoneNameRef.current;
    const skel = skeletonRefForPick.current;
    const parentBone = parentName && skel ? findBoneByName(skel, parentName) : null;
    if (!parentBone) return null;

    const pick = pickViewportCamera(event.clientX, event.clientY);
    if (!pick || pick.viewport.role === 'perspective' || !canvasRef.current) return null;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
    raycasterRef.current.setFromCamera(mouse, pick.camera);

    const parentWorld = parentBone.getWorldPosition(new THREE.Vector3());
    const normal = pick.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, parentWorld);
    const worldPosition = raycasterRef.current.ray.intersectPlane(plane, new THREE.Vector3());
    if (!worldPosition) return null;

    return { worldPosition, paneRole: pick.viewport.role };
  };

  // One-time base scene + renderer + orbit + RAF + resize + internal R key reset
  useEffect(() => {
    const displayController = viewportDisplayRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(800, 600);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getAppTheme(themeId).viewportBackground);
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

    const viewportGrids = createThemeViewportGrids(themeId);
    viewportGrids.floor.visible = gridEnabled;
    viewportGrids.front.visible = false;
    viewportGrids.side.visible = false;
    scene.add(viewportGrids.floor, viewportGrids.front, viewportGrids.side);
    viewportGridRefs.current = viewportGrids;

    const axes = new THREE.AxesHelper(1.8);
    axes.visible = axesEnabled;
    scene.add(axes);
    axesRef.current = axes;

    const brushMarkerGeometry = new THREE.SphereGeometry(1, 16, 10);
    const brushMarkerMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const brushMarker = new THREE.Mesh(brushMarkerGeometry, brushMarkerMaterial);
    brushMarker.visible = false;
    skinBrushMarkerRef.current = brushMarker;
    scene.add(brushMarker);

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
    const updateCameras = () => {
      camera.position.copy(orbit.getPosition());
      camera.lookAt(orbit.target);
      camera.updateMatrixWorld();
      updateOrthoCameras(
        orthoCameraRefs.current,
        boundsRef.current,
        orbit.target,
      );
      writeSharedCameraTargetTelemetry(canvas, orbit.target);
    };
    updateCameras();
    const detachOrbit = orbit.attach(
      canvas,
      updateCameras,
      (x, y, button = 0) => {
        if (button !== 0 && button !== 2) return false;
        return getViewportAt(x, y, true)?.role === 'perspective';
      },
    );

    let orthoPanState: {
      camera: THREE.OrthographicCamera;
      lastX: number;
      lastY: number;
      viewportHeight: number;
    } | null = null;
    const onOrthoPanDown = (event: MouseEvent): void => {
      if (!orbit.enabled || event.button !== 2) return;
      const viewport = getViewportAt(event.clientX, event.clientY, true);
      if (!viewport || !(viewport.camera instanceof THREE.OrthographicCamera)) return;
      orthoPanState = {
        camera: viewport.camera,
        lastX: event.clientX,
        lastY: event.clientY,
        viewportHeight: viewport.height,
      };
    };
    const onOrthoPanMove = (event: MouseEvent): void => {
      const state = orthoPanState;
      if (!state) return;
      if (!orbit.enabled) {
        orthoPanState = null;
        return;
      }
      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;
      if (deltaX === 0 && deltaY === 0) return;
      orbit.target.add(getOrthographicPanDelta(
        state.camera,
        deltaX,
        deltaY,
        state.viewportHeight,
      ));
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      updateCameras();
    };
    const onOrthoPanUp = (): void => {
      orthoPanState = null;
    };
    canvas.addEventListener('mousedown', onOrthoPanDown);
    window.addEventListener('mousemove', onOrthoPanMove);
    window.addEventListener('mouseup', onOrthoPanUp);

    // Internal key handler for view reset (R) + gizmo modes (T=translate, R=rotate, S=scale when a bone is selected).
    // Mode keys take precedence only while TransformControls has an active target. Space is handled by App.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rigIkDragRef.current) {
        e.preventDefault();
        cancelRigIkDrag();
        return;
      }
      const tc = transformControlsControllerRef.current?.controls;
      if (tc && transformTargetRef.current) {
        const k = e.key.toLowerCase();
        if (k === 't') {
          const accepted = onSetTransformModeRef.current?.('translate');
          if (accepted !== false) tc.setMode('translate');
          return;
        }
        if (k === 'r') {
          const accepted = onSetTransformModeRef.current?.('rotate');
          if (accepted !== false) tc.setMode('rotate');
          return;
        }
        if (k === 's') {
          const accepted = onSetTransformModeRef.current?.('scale');
          if (accepted !== false) tc.setMode('scale');
          return;
        }
      }
      if (e.key.toLowerCase() === 'r') {
        orbit.reset(
          boundsRef.current.center,
          getModelOrbitDistance(boundsRef.current),
        );
        updateCameras();
      }
    };
    // Pointer-based bone selection on the canvas.
    // Complements list selection in Inspector. Uses bone world positions + ray distance.
    // Ignore drag/long-press paths to avoid accidental selection during orbit/transform interaction.
    const buildEndpointDragState = (event: PointerEvent): EndpointDragState | null => {
      if (editorModeRef.current !== 'rig') return null;
      if (rigToolModeRef.current !== 'endpoint') return null;
      if (!isPrecisionModeRef.current) return null;

      const selected = selectedBoneNameRef.current;
      if (!selected) return null;

      const skel = skeletonRefForPick.current;
      const bone = skel ? findBoneByName(skel, selected) : null;
      if (!bone) return null;

      const handle = boneEndpointHandleRef.current;
      if (!handle) return null;

      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick || !canvasRef.current) return null;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
      raycasterRef.current.setFromCamera(mouse, pick.camera);

      const hits = raycasterRef.current
        .intersectObject(handle, true)
        .filter((hit) => hit.object.userData.isEndpointDragHandle === true);
      const camera = pick.camera;
      let hit = hits[0]?.point.clone();
      if (!hit) {
        const transformAxis = transformControlsControllerRef.current?.controls.axis;
        if (transformAxis !== null && transformAxis !== undefined) return null;
        const fallbackBone = pickBoneName(event, 120);
        if (fallbackBone !== selected) {
          return null;
        }
        const boneWorld = new THREE.Vector3();
        bone.getWorldPosition(boneWorld);
        const fallbackPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3().copy(camera.getWorldDirection(new THREE.Vector3())),
          boneWorld,
        );
        const hitFromPlane = raycasterRef.current.ray.intersectPlane(fallbackPlane, new THREE.Vector3());
        if (!hitFromPlane) return null;
        hit = hitFromPlane;
      }

      const camDir = new THREE.Vector3();
      pick.camera.getWorldDirection(camDir);
      const parentInverse = bone.parent
        ? bone.parent.matrixWorld.clone().invert()
        : new THREE.Matrix4();

      const boneWorld = new THREE.Vector3();
      bone.getWorldPosition(boneWorld);

      return {
        boneName: selected,
        bone,
        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit),
        localOffset: new THREE.Vector3().subVectors(hit, boneWorld),
        parentInverse,
      };
    };

    const buildRigMoveDragState = (event: PointerEvent): RigMoveDragState | null => {
      if (editorModeRef.current !== 'rig' || rigToolModeRef.current !== 'move') return null;

      const selected = selectedBoneNameRef.current;
      if (!selected || selected === 'Scene') return null;

      const skel = skeletonRefForPick.current;
      const bone = skel ? findBoneByName(skel, selected) : null;
      if (!bone) return null;

      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick || pick.viewport.role === 'perspective') return null;

      const boneWorld = bone.getWorldPosition(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        pick.camera.getWorldDirection(new THREE.Vector3()),
        boneWorld,
      );
      const initialState: RigMoveDragState = {
        boneName: selected,
        bone,
        paneRole: pick.viewport.role,
        plane,
        localOffset: new THREE.Vector3(),
      };
      const worldPosition = getRigMoveWorldPositionFromPointer(event, initialState, pick.viewport);
      if (!worldPosition) return null;

      return {
        ...initialState,
        localOffset: worldPosition.sub(boneWorld),
      };
    };

    const buildRigRotateDragState = (event: PointerEvent): RigRotateDragState | null => {
      if (editorModeRef.current !== 'rig' || rigToolModeRef.current !== 'rotate') return null;

      const selected = selectedBoneNameRef.current;
      if (!selected || selected === 'Scene') return null;

      const skel = skeletonRefForPick.current;
      const bone = skel ? findBoneByName(skel, selected) : null;
      if (!bone) return null;

      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick || pick.viewport.role === 'perspective') return null;

      const center = bone.getWorldPosition(new THREE.Vector3());
      const axis = pick.camera.getWorldDirection(new THREE.Vector3()).normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, center);
      const initialState: RigRotateDragState = {
        boneName: selected,
        bone,
        paneRole: pick.viewport.role,
        plane,
        axis,
        center,
        previousVector: new THREE.Vector3(1, 0, 0),
      };
      const previousVector = getRigRotateVectorFromPointer(event, initialState, pick.viewport);
      if (!previousVector) return null;

      return {
        ...initialState,
        previousVector,
      };
    };

    const buildRigIkDragState = (event: PointerEvent): RigIkDragState | null => {
      if (editorModeRef.current !== 'rig' || rigToolModeRef.current !== 'ik') return null;
      const selected = selectedBoneNameRef.current;
      const handle = rigIkTargetHandleRef.current;
      const targetWorld = rigIkTargetWorldRef.current;
      if (!selected || selected === 'Scene' || !handle || !targetWorld) return null;

      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
      // The target handle can be recreated immediately after a workspace switch;
      // make its scene transform current before raycasting the first pointer event.
      handle.updateWorldMatrix(true, true);
      raycasterRef.current.setFromCamera(mouse, pick.camera);
      const hit = raycasterRef.current.intersectObject(handle, true)[0]?.point.clone();
      if (!hit) return null;

      return {
        boneName: selected,
        paneRole: pick.viewport.role,
        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
          pick.camera.getWorldDirection(new THREE.Vector3()),
          targetWorld,
        ),
        localOffset: hit.sub(targetWorld),
        initialTargetWorld: targetWorld.clone(),
        targetWorld: targetWorld.clone(),
      };
    };

    const startEndpointDrag = (state: EndpointDragState): void => {
      endpointDragRef.current = state;
      emitBoneTransformEdit('start', 'endpoint-drag', state.bone);
      pauseTransformControlsForEndpointDrag();
      orbitRef.current.enabled = false;
      canvas.style.cursor = 'grabbing';
      cursorModeRef.current = 'grabbing';
      canvas.dataset.endpointDrag = 'active';
    };

    const endEndpointDrag = (cancelled = false) => {
      const dragState = endpointDragRef.current;
      if (dragState) {
        emitBoneTransformEdit(cancelled ? 'cancel' : 'end', 'endpoint-drag', dragState.bone);
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

    const startRigMoveDrag = (state: RigMoveDragState, event: PointerEvent): boolean => {
      const initialWorldPosition = state.bone.getWorldPosition(new THREE.Vector3());
      const accepted = onMoveRigBoneToWorldRef.current?.({
        phase: 'start',
        boneName: state.boneName,
        worldPosition: initialWorldPosition,
        paneRole: state.paneRole,
      });
      if (accepted === false) return false;

      rigMoveDragRef.current = state;
      orbitRef.current.enabled = false;
      canvas.style.cursor = 'grabbing';
      cursorModeRef.current = 'grabbing';
      updateRigMoveTelemetry(state, initialWorldPosition);
      updateRigMoveFromPointer(event, state);
      return true;
    };

    const endRigMoveDrag = () => {
      const dragState = rigMoveDragRef.current;
      if (dragState) {
        onMoveRigBoneToWorldRef.current?.({
          phase: 'end',
          boneName: dragState.boneName,
          worldPosition: dragState.bone.getWorldPosition(new THREE.Vector3()),
          paneRole: dragState.paneRole,
        });
        rigMoveDragRef.current = null;
      }
      orbitRef.current.enabled = true;
      clearRigMoveTelemetry();
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
      hoveredBoneNameRef.current = null;
      canvas.dataset.hoveredBone = '';
    };

    const startRigRotateDrag = (state: RigRotateDragState): boolean => {
      const accepted = onRotateRigBoneRef.current?.({
        phase: 'start',
        boneName: state.boneName,
        worldAxis: state.axis,
        angleRadians: 0,
        paneRole: state.paneRole,
      });
      if (accepted === false) return false;

      rigRotateDragRef.current = state;
      orbitRef.current.enabled = false;
      canvas.style.cursor = 'grabbing';
      cursorModeRef.current = 'grabbing';
      updateRigRotateTelemetry(state, 0);
      return true;
    };

    const endRigRotateDrag = () => {
      const dragState = rigRotateDragRef.current;
      if (dragState) {
        onRotateRigBoneRef.current?.({
          phase: 'end',
          boneName: dragState.boneName,
          worldAxis: dragState.axis,
          angleRadians: 0,
          paneRole: dragState.paneRole,
        });
        rigRotateDragRef.current = null;
      }
      orbitRef.current.enabled = true;
      clearRigRotateTelemetry();
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
      hoveredBoneNameRef.current = null;
      canvas.dataset.hoveredBone = '';
    };

    const startRigIkDrag = (state: RigIkDragState): boolean => {
      const accepted = onSolveRigIkRef.current?.({
        phase: 'start',
        boneName: state.boneName,
        targetWorld: state.targetWorld.clone(),
        paneRole: state.paneRole,
      });
      if (accepted === false) return false;
      delete canvas.dataset.rigIkStatus;
      delete canvas.dataset.rigIkDistance;
      rigIkDragRef.current = state;
      orbitRef.current.enabled = false;
      canvas.style.cursor = 'grabbing';
      cursorModeRef.current = 'grabbing';
      updateRigIkTelemetry(state, accepted);
      return true;
    };

    const endRigIkDrag = (): void => {
      const state = rigIkDragRef.current;
      if (state) {
        onSolveRigIkRef.current?.({
          phase: 'end',
          boneName: state.boneName,
          targetWorld: state.targetWorld.clone(),
          paneRole: state.paneRole,
        });
        rigIkDragRef.current = null;
      }
      orbitRef.current.enabled = true;
      clearRigIkTelemetry();
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
    };

    const cancelRigIkDrag = (): void => {
      const state = rigIkDragRef.current;
      if (state) {
        onSolveRigIkRef.current?.({
          phase: 'cancel',
          boneName: state.boneName,
          targetWorld: state.initialTargetWorld.clone(),
          paneRole: state.paneRole,
        });
        rigIkTargetWorldRef.current?.copy(state.initialTargetWorld);
        rigIkTargetHandleRef.current?.position.copy(state.initialTargetWorld);
        rigIkDragRef.current = null;
      }
      orbitRef.current.enabled = true;
      clearRigIkTelemetry();
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
    };

    const collectPaintVertices = (event: PointerEvent): SkinPaintCollection => {
      const empty = { vertices: [], candidateCount: 0, totalVertexCount: 0 };
      if (editorModeRef.current !== 'skin' || !attachedModelRef.current || !canvasRef.current) return empty;
      if (!hasValidSkinPaintTarget()) {
        return empty;
      }
      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick) return empty;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
      mouseRef.current.copy(mouse);
      raycasterRef.current.setFromCamera(mouseRef.current, pick.camera);

      const paintMeshes = collectSkinnedMeshes();
      if (paintMeshes.length === 0) return empty;

      const hits = raycasterRef.current.intersectObjects(paintMeshes, false);
      const firstHit = hits[0];
      if (!firstHit?.point) return empty;

      const brushCenter = firstHit.point.clone();
      const brushRadius = Math.max(0.0001, skinPaintRadiusRef.current);
      const brushRadiusSq = brushRadius * brushRadius;
      const strength = skinPaintStrengthRef.current;
      const target = skinPaintTargetRef.current;
      const mode = skinPaintModeRef.current;
      const targetMode = skinPaintTargetModeRef.current;
      const local = new THREE.Vector3();
      const world = new THREE.Vector3();
      const seen = new Set<string>();
      const paintVertices: SkinPaintVertex[] = [];
      let candidateCount = 0;
      let totalVertexCount = 0;
      let skinIndexFailure: string | null = null;
      const hitDepth = hits[0]?.point ? hits[0].point.clone().project(pick.camera).z : null;

      const addCandidate = (mesh: THREE.SkinnedMesh, candidate: SkinBrushVertexRef): void => {
        local.set(candidate.localPosition[0], candidate.localPosition[1], candidate.localPosition[2]);
        const failure = getSkinnedVertexWorldPosition(mesh, candidate.vertexIndex, world.copy(local));
        if (failure) return;
        const transformed = world;

        if (hitDepth !== null) {
          const projected = transformed.clone().project(pick.camera);
          if (projected.z - hitDepth > 0.025) return;
        }

        const distanceSq = transformed.distanceToSquared(brushCenter);
        if (distanceSq > brushRadiusSq) return;

        const amount = mode === 'auto'
          ? getPaintAmount(distanceSq, brushRadius, Math.max(strength, 0.01), target)
          : getPaintAmount(distanceSq, brushRadius, strength, target);
        if (amount <= 0) return;

        const key = `${mesh.uuid}:${candidate.vertexIndex}`;
        if (seen.has(key)) return;
        seen.add(key);
        paintVertices.push({ meshId: mesh.uuid, vertexIndex: candidate.vertexIndex, amount });
      };

      const addTriangleHit = (): void => {
        const hit = hits[0];
        if (!hit?.face || !isThreeSkinnedMesh(hit.object)) return;
        const mesh = hit.object;
        const vertices = [hit.face.a, hit.face.b, hit.face.c];
        for (const vertexIndex of vertices) {
          const positionAttr = mesh.geometry.getAttribute('position');
          if (!positionAttr || vertexIndex < 0 || vertexIndex >= positionAttr.count) continue;
          candidateCount += 1;
          addCandidate(mesh, {
            meshId: mesh.uuid,
            vertexIndex,
            localPosition: [
              positionAttr.getX(vertexIndex),
              positionAttr.getY(vertexIndex),
              positionAttr.getZ(vertexIndex),
            ],
          });
        }
      };

      if (targetMode === 'triangle') {
        addTriangleHit();
      }

      for (const mesh of paintMeshes) {
        const positionAttr = mesh.geometry?.getAttribute('position');
        if (!positionAttr) continue;
        if (!mesh.geometry.getAttribute('skinIndex') || !mesh.geometry.getAttribute('skinWeight')) continue;

        const index = getSkinnedWorldBrushIndex(mesh);
        totalVertexCount += index.vertexCount;
        if (!index.valid) {
          skinIndexFailure ??= index.failureReason ?? 'invalid-skinned-mesh';
          continue;
        }
        if (targetMode === 'triangle' && brushRadius < 0.5) {
          continue;
        }
        const candidates = querySkinBrushWorldIndex(index, brushCenter, brushRadius);
        candidateCount += candidates.length;
        for (const candidate of candidates) {
          addCandidate(mesh, candidate);
        }
      }

      if (skinIndexFailure) {
        canvasRef.current.dataset.skinBrushIndexError = skinIndexFailure;
      } else {
        delete canvasRef.current.dataset.skinBrushIndexError;
      }

      if (mode === 'subtract') {
        const limited = Math.max(1, Math.round(paintVertices.length * clamp01(strength)));
        return {
          vertices: paintVertices.slice(0, Math.max(1, limited)),
          candidateCount,
          totalVertexCount,
        };
      }
      return { vertices: paintVertices, candidateCount, totalVertexCount };
    };

    const hasValidSkinPaintTarget = (): boolean => {
      const name = selectedBoneNameRef.current;
      if (!name || name === 'Scene') return false;
      const paintSkel = skeletonRefForPick.current;
      return Boolean(paintSkel && findBoneByName(paintSkel, name));
    };

    const updateBrushMarker = (center: THREE.Vector3 | null, brushRadius: number): void => {
      const marker = skinBrushMarkerRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!center || !isFinite(brushRadius)) {
        if (marker) marker.visible = false;
        canvas.dataset.skinBrushHover = 'inactive';
        delete canvas.dataset.skinBrushX;
        delete canvas.dataset.skinBrushY;
        delete canvas.dataset.skinBrushZ;
        return;
      }

      if (!hasValidSkinPaintTarget()) {
        if (marker) marker.visible = false;
        canvas.dataset.skinBrushHover = 'inactive';
        delete canvas.dataset.skinBrushX;
        delete canvas.dataset.skinBrushY;
        delete canvas.dataset.skinBrushZ;
        return;
      }

      if (marker) {
        marker.position.copy(center);
        marker.scale.setScalar(Math.max(0.0001, brushRadius));
        marker.visible = true;
      }

      canvas.dataset.skinBrushHover = 'active';
      canvas.dataset.skinBrushX = String(Math.round(center.x * 1000) / 1000);
      canvas.dataset.skinBrushY = String(Math.round(center.y * 1000) / 1000);
      canvas.dataset.skinBrushZ = String(Math.round(center.z * 1000) / 1000);
    };

    const getBrushCenterForPaint = (event: PointerEvent): THREE.Vector3 | null => {
      const pick = pickViewportCamera(event.clientX, event.clientY);
      if (!pick || !canvasRef.current || !attachedModelRef.current) {
        return null;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = getMouseForViewport(event.clientX, event.clientY, pick.viewport, rect);
      mouseRef.current.copy(mouse);
      raycasterRef.current.setFromCamera(mouseRef.current, pick.camera);

      const paintMeshes = collectSkinnedMeshes();
      if (paintMeshes.length === 0) return null;

      const hits = raycasterRef.current.intersectObjects(paintMeshes, false);
      if (hits[0]?.point) {
        return hits[0].point.clone();
      }

      return null;
    };

    const getBrushTelemetry = (count: number, candidateCount = 0, totalVertexCount = 0): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.dataset.skinPaintHitCount = String(count);
      canvas.dataset.skinCandidateCount = String(candidateCount);
      canvas.dataset.skinTotalVertexCount = String(totalVertexCount);
      canvas.dataset.skinPaintMode = skinPaintModeRef.current;
      canvas.dataset.skinPaintTargetMode = skinPaintTargetModeRef.current;
      canvas.dataset.skinPaintRadius = String(skinPaintRadiusRef.current);
      canvas.dataset.skinPaintStrength = String(skinPaintStrengthRef.current);
      canvas.dataset.skinPaintTarget = String(skinPaintTargetRef.current);
    };

    const collectPaintVerticesWithTelemetry = (event: PointerEvent): SkinPaintCollection => {
      const result = collectPaintVertices(event);
      skinPaintHitCountRef.current = result.vertices.length;
      skinCandidateCountRef.current = result.candidateCount;
      skinTotalVertexCountRef.current = result.totalVertexCount;
      getBrushTelemetry(result.vertices.length, result.candidateCount, result.totalVertexCount);
      return result;
    };

    const setPointerOwnerTelemetry = (
      owner: ViewportInteractionOwner,
      paneRole: ViewportRole | null = null,
    ): void => {
      canvas.dataset.pointerOwner = owner;
      canvas.dataset.pointerMode = editorModeRef.current;
      if (paneRole) {
        canvas.dataset.viewportPaneRole = paneRole;
      } else {
        delete canvas.dataset.viewportPaneRole;
      }
    };

    const resolvePointerOwner = (
      event: PointerEvent,
      endpointState: EndpointDragState | null,
      ikState: RigIkDragState | null,
    ): ViewportInteractionOwner => {
      const activeSkeleton = skeletonRefForPick.current;
      const activeViewport = getViewportAt(event.clientX, event.clientY, true);
      const owner = resolvePointerDownOwner({
        editorMode: editorModeRef.current,
        button: event.button,
        hasModel: !!attachedModelRef.current,
        hasSkeleton: !!activeSkeleton && activeSkeleton.bones.length > 0,
        hasSelectedBone: hasValidSkinPaintTarget(),
        isPrecisionMode: isPrecisionModeRef.current,
        isPickingViewport: !!activeViewport,
        hitEndpointHandle: !!endpointState,
        hitIkTargetHandle: !!ikState,
      });
      setPointerOwnerTelemetry(owner, activeViewport?.role ?? null);
      return owner;
    };

    const onCanvasPointerDown = (event: PointerEvent) => {
      const endpointState = event.button === 0 ? buildEndpointDragState(event) : null;
      const activeTransformControls = transformControlsControllerRef.current?.controls;
      if (
        !endpointState
        && event.button === 0
        && activeTransformControls?.enabled
        && activeTransformControls.axis !== null
        && transformTargetRef.current
      ) {
        resolvePointerOwner(event, null, null);
        pointerDownRef.current = null;
        return;
      }

      const ikState = event.button === 0 ? buildRigIkDragState(event) : null;
      const owner = resolvePointerOwner(event, endpointState, ikState);
      if (owner === 'none' || owner === 'orbit') return;
      if (event.button !== 0) return;

      if (owner === 'rig-endpoint-drag' && endpointState) {
        startEndpointDrag(endpointState);
        pointerDownRef.current = null;
        return;
      }

      if (owner === 'rig-ik-drag' && ikState) {
        if (startRigIkDrag(ikState)) {
          pointerDownRef.current = null;
        }
        return;
      }

      if (owner === 'rig-select' && rigToolModeRef.current === 'move') {
        const rigMoveState = buildRigMoveDragState(event);
        if (rigMoveState && startRigMoveDrag(rigMoveState, event)) {
          pointerDownRef.current = null;
          return;
        }
      }
      if (owner === 'rig-select' && rigToolModeRef.current === 'rotate') {
        const rigRotateState = buildRigRotateDragState(event);
        if (rigRotateState && startRigRotateDrag(rigRotateState)) {
          pointerDownRef.current = null;
          return;
        }
      }

      if (owner === 'skin-paint') {
        lastSkinPaintMsRef.current = 0;
        const paint = collectPaintVerticesWithTelemetry(event);
        const center = getBrushCenterForPaint(event);
        if (paint.vertices.length > 0) {
          onSkinPaintStrokeStartRef.current?.();
          onPaintSkinVerticesRef.current?.(paint.vertices);
          rebuildSkinPointOverlays();
          skinPaintActiveRef.current = true;
          canvas.style.cursor = 'crosshair';
          cursorModeRef.current = 'crosshair';
          canvas.dataset.skinPaintActive = 'active';
          updateBrushMarker(center, skinPaintRadiusRef.current);
          pointerDownRef.current = {
            x: event.clientX,
            y: event.clientY,
            time: performance.now(),
            button: event.button,
            owner,
            isSkinPaint: true,
          };
          return;
        }
        updateBrushMarker(center, skinPaintRadiusRef.current);
      }
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        button: event.button,
        owner,
      };
    };

    const onCanvasPointerUp = (event: PointerEvent) => {
      if (endpointDragRef.current) {
        endEndpointDrag();
        pointerDownRef.current = null;
        return;
      }
      if (rigMoveDragRef.current) {
        endRigMoveDrag();
        pointerDownRef.current = null;
        return;
      }
      if (rigRotateDragRef.current) {
        endRigRotateDrag();
        pointerDownRef.current = null;
        return;
      }
      if (rigIkDragRef.current) {
        endRigIkDrag();
        pointerDownRef.current = null;
        return;
      }
      if (skinPaintActiveRef.current) {
        skinPaintActiveRef.current = false;
        onSkinPaintStrokeEndRef.current?.();
        if (canvas.dataset.skinPaintActive) {
          delete canvas.dataset.skinPaintActive;
        }
        canvas.style.cursor = 'default';
        cursorModeRef.current = 'default';
        pointerDownRef.current = null;
        return;
      }

      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      const clickOwner = resolvePointerClickOwner(down, {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        button: event.button,
        isPickingViewport: isInPickingViewport(event.clientX, event.clientY),
      });
      if (!clickOwner) return;

      if (clickOwner === 'model-select') {
        setPointerOwnerTelemetry('model-select', getViewportAt(event.clientX, event.clientY, true)?.role ?? null);
        const objectHit = pickViewportObject(event);
        if (objectHit) {
          onSelectObjectRef.current?.(objectHit);
        } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          delete canvas.dataset.selectedObject;
          delete canvas.dataset.selectedObjectName;
          onClearObjectSelectionRef.current?.();
        }
        return;
      }

      if (clickOwner !== 'rig-select' && clickOwner !== 'animate-select') {
        return;
      }

      if (clickOwner === 'rig-select' && rigToolModeRef.current === 'add-child') {
        const placement = getRigChildPlacementFromPointer(event);
        if (placement) {
          const created = onCreateRigChildAtWorldRef.current?.(placement);
          if (created === false) {
            canvas.dataset.rigAddChildResult = 'blocked';
            return;
          }
          canvas.dataset.rigAddChildResult = 'created';
          canvas.dataset.rigAddChildPaneRole = placement.paneRole;
          canvas.dataset.rigAddChildX = placement.worldPosition.x.toFixed(4);
          canvas.dataset.rigAddChildY = placement.worldPosition.y.toFixed(4);
          canvas.dataset.rigAddChildZ = placement.worldPosition.z.toFixed(4);
          return;
        }
        canvas.dataset.rigAddChildResult = 'miss';
      }

      const closestName = pickBoneName(event, pickDistanceRef.current);
      if (closestName) {
        canvas.dataset.viewportPickedBone = closestName;
        onSelectBoneRef.current?.(closestName);
        return;
      }

      delete canvas.dataset.viewportPickedBone;

      if (clickOwner === 'rig-select' && rigToolModeRef.current === 'add-child') {
        delete canvas.dataset.rigAddChildPaneRole;
        delete canvas.dataset.rigAddChildX;
        delete canvas.dataset.rigAddChildY;
        delete canvas.dataset.rigAddChildZ;
      } else {
        delete canvas.dataset.rigAddChildResult;
        delete canvas.dataset.rigAddChildPaneRole;
        delete canvas.dataset.rigAddChildX;
        delete canvas.dataset.rigAddChildY;
        delete canvas.dataset.rigAddChildZ;
      }
    };

    const onWindowPointerUp = () => {
      if (endpointDragRef.current) {
        endEndpointDrag();
      }
      if (rigMoveDragRef.current) {
        endRigMoveDrag();
      }
      if (rigRotateDragRef.current) {
        endRigRotateDrag();
      }
      if (rigIkDragRef.current) {
        endRigIkDrag();
      }
      if (skinPaintActiveRef.current) {
        skinPaintActiveRef.current = false;
        onSkinPaintStrokeEndRef.current?.();
        const canvas = canvasRef.current;
        if (canvas?.dataset.skinPaintActive) {
          delete canvas.dataset.skinPaintActive;
        }
        if (canvas) {
          canvas.style.cursor = 'default';
          cursorModeRef.current = 'default';
        }
      }
      pointerDownRef.current = null;
    };

    const onWindowPointerCancel = () => {
      if (endpointDragRef.current) {
        endEndpointDrag(true);
      }
      if (rigMoveDragRef.current) {
        endRigMoveDrag();
      }
      if (rigRotateDragRef.current) {
        endRigRotateDrag();
      }
      if (rigIkDragRef.current) {
        cancelRigIkDrag();
      }
      if (skinPaintActiveRef.current) {
        skinPaintActiveRef.current = false;
        onSkinPaintStrokeEndRef.current?.();
        const canvas = canvasRef.current;
        if (canvas?.dataset.skinPaintActive) {
          delete canvas.dataset.skinPaintActive;
        }
        if (canvas) {
          canvas.style.cursor = 'default';
          cursorModeRef.current = 'default';
        }
      }
      pointerDownRef.current = null;
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      if (endpointDragRef.current) {
        const dragState = endpointDragRef.current;
        const dragPick = pickViewportCamera(event.clientX, event.clientY);
        if (!dragPick) {
          endEndpointDrag(true);
          return;
        }
        const moved = updateDragFromEndpoint(event, dragState, dragPick.viewport);
        if (moved) {
          hoveredBoneNameRef.current = dragState.boneName;
          canvas.dataset.hoveredBone = dragState.boneName;
        }
        return;
      }
      if (rigMoveDragRef.current) {
        const dragState = rigMoveDragRef.current;
        const moved = updateRigMoveFromPointer(event, dragState);
        if (moved) {
          hoveredBoneNameRef.current = dragState.boneName;
          canvas.dataset.hoveredBone = dragState.boneName;
        }
        return;
      }
      if (rigRotateDragRef.current) {
        const dragState = rigRotateDragRef.current;
        const rotated = updateRigRotateFromPointer(event, dragState);
        if (rotated) {
          hoveredBoneNameRef.current = dragState.boneName;
          canvas.dataset.hoveredBone = dragState.boneName;
        }
        return;
      }
      if (rigIkDragRef.current) {
        const state = rigIkDragRef.current;
        const solved = updateRigIkFromPointer(event, state);
        if (solved) {
          hoveredBoneNameRef.current = state.boneName;
          canvas.dataset.hoveredBone = state.boneName;
        }
        return;
      }
      if (skinPaintActiveRef.current && editorModeRef.current === 'skin') {
        updateBrushMarker(getBrushCenterForPaint(event), skinPaintRadiusRef.current);
        if (!shouldApplySkinPaintNow()) {
          return;
        }
        const paint = collectPaintVerticesWithTelemetry(event);
        if (paint.vertices.length > 0) {
          onPaintSkinVerticesRef.current?.(paint.vertices);
          rebuildSkinPointOverlays();
        }
        return;
      }
      if (editorModeRef.current === 'skin') {
        const center = getBrushCenterForPaint(event);
        if (center) {
          collectPaintVerticesWithTelemetry(event);
        } else {
          getBrushTelemetry(0);
        }
        updateBrushMarker(center, skinPaintRadiusRef.current);
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

    const onCanvasContextMenu = (event: MouseEvent) => {
      if (editorModeRef.current !== 'view' || !attachedModelRef.current) return;
      if (!isInPickingViewport(event.clientX, event.clientY)) return;

      const objectHit = pickViewportObject(event);
      if (!objectHit) return;
      event.preventDefault();
      canvas.dataset.pointerOwner = 'model-select';
      onObjectContextMenuRef.current?.(objectHit);
    };
    const interactionRuntime = attachViewportInteractionRuntime(canvas, window, {
      onKeyDown: onKey,
      onPointerDown: onCanvasPointerDown,
      onPointerUp: onCanvasPointerUp,
      onPointerMove: onCanvasPointerMove,
      onContextMenu: onCanvasContextMenu,
      onWindowPointerUp,
      onWindowPointerCancel,
      onDisposeActiveInteractions: () => {
        if (endpointDragRef.current) {
          endEndpointDrag(true);
        }
        if (rigMoveDragRef.current) {
          orbit.enabled = true;
          rigMoveDragRef.current = null;
          clearRigMoveTelemetry();
        }
        if (rigRotateDragRef.current) {
          orbit.enabled = true;
          rigRotateDragRef.current = null;
          clearRigRotateTelemetry();
        }
        if (rigIkDragRef.current) {
          onSolveRigIkRef.current?.({
            phase: 'cancel',
            boneName: rigIkDragRef.current.boneName,
            targetWorld: rigIkDragRef.current.initialTargetWorld.clone(),
            paneRole: rigIkDragRef.current.paneRole,
          });
          orbit.enabled = true;
          rigIkDragRef.current = null;
          clearRigIkTelemetry();
        }
        restoreTransformControlsAfterEndpointDrag();
      },
    });

    const animate = () => {
      const mixer = mixerRef.current;
      if (mixer) {
        const delta = clockRef.current.getDelta();
        mixer.update(delta);
        const action = currentActionRef.current;
        const report = onTimeUpdateRef.current;
        if (action && report) {
          // While paused, parent playback state is the source of truth; reporting stale action.time can race scrubs.
          report(playbackStateRef.current.isPlaying ? action.time : playbackStateRef.current.currentTime);
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
          updateEndpointHandle(endpoint, bone, isPrecisionModeRef.current ? 1.8 : 1);
          writeEndpointScreenTelemetry(bone);
        }
      }
      const ikTarget = rigIkTargetWorldRef.current;
      if (rigIkTargetHandleRef.current && ikTarget) {
        rigIkTargetHandleRef.current.position.copy(ikTarget);
        writeRigIkTargetScreenTelemetry(ikTarget);
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

      updateSelectionOverlays(selectionOverlaysRef.current);

      const specs: ViewportSpec[] = viewportRef.current.length
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
        const grids = viewportGridRefs.current;
        if (grids) {
          updateThemeViewportGridVisibility(
            grids,
            gridEnabledRef.current,
            viewportGridModeRef.current,
            spec.role,
          );
        }
        renderer.setViewport(spec.x, spec.y, spec.width, spec.height);
        if (isQuad) {
          renderer.setScissor(spec.x, spec.y, spec.width, spec.height);
        }
        renderer.clear(true, true, true);
        renderer.render(scene, spec.camera === cameraRef.current ? camera : spec.camera);
      });
      writeTransformHandleTelemetry();
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
      updateOrthoCameras(
        orthoCameraRefs.current,
        boundsRef.current,
        orbit.target,
      );
      const specs = buildViewportSpecs(
        w,
        h,
        layoutRef.current,
        boundsRef.current,
        camera,
        orthoCameraRefs.current,
        perspectiveEnabledRef.current,
      );
      viewportRef.current = specs;
      writeViewportCameraTelemetry(canvas, specs);
      canvasSizeRef.current = { width: w, height: h };
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    resizeObsRef.current = ro;
    resizeFrameRef.current = requestAnimationFrame(onResize);

    return () => {
      frameRef.current = cancelPendingAnimationFrame(frameRef.current, cancelAnimationFrame);
      resizeFrameRef.current = cancelPendingAnimationFrame(resizeFrameRef.current, cancelAnimationFrame);
      resizeObsRef.current?.disconnect();
      interactionRuntime.dispose();
      detachOrbit();
      canvas.removeEventListener('mousedown', onOrthoPanDown);
      window.removeEventListener('mousemove', onOrthoPanMove);
      window.removeEventListener('mouseup', onOrthoPanUp);
      canvas.style.cursor = 'default';
      cursorModeRef.current = 'default';
      delete canvas.dataset.endpointX;
      delete canvas.dataset.endpointY;
      if (boneHighlightRef.current) {
        scene.remove(boneHighlightRef.current);
        disposeThreeObject(boneHighlightRef.current);
        boneHighlightRef.current = null;
      }
      clearSkinPointOverlays();
      displayController.dispose();
      disposeThemeViewportGrids(scene, viewportGridRefs.current);
      viewportGridRefs.current = null;
      disposeThreeObject(axesRef.current);
      axesRef.current = null;
      wireframeMaterialRef.current?.dispose();
      wireframeMaterialRef.current = null;
      renderer.dispose();
    };
    // Note: intentionally no deps on playback props; RAF always runs, control via effects below.
    // onTimeUpdate (and onSelectBone/skeleton) kept via refs to avoid re-creating renderer/scene/RAF/ listeners on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderer, RAF, and DOM listeners are mount-owned; live inputs are synchronized through refs and focused effects.
  }, []);

  useLayoutEffect(() => {
    applyViewportLayout(viewportLayout);
  }, [viewportLayout, perspectiveEnabled]);

  useEffect(() => {
    const theme = getAppTheme(themeId);
    viewportGridModeRef.current = theme.viewportGrid.mode;
    const scene = sceneRef.current;
    if (scene) {
      scene.background = new THREE.Color(theme.viewportBackground);
      if (viewportGridThemeRef.current !== themeId) {
        disposeThemeViewportGrids(scene, viewportGridRefs.current);
        const nextGrids = createThemeViewportGrids(themeId);
        nextGrids.floor.visible = gridEnabledRef.current;
        nextGrids.front.visible = false;
        nextGrids.side.visible = false;
        scene.add(nextGrids.floor, nextGrids.front, nextGrids.side);
        viewportGridRefs.current = nextGrids;
        viewportGridThemeRef.current = themeId;
      }
    }
    orthoCameraRefs.current.forEach((camera) => {
      camera.zoom = theme.viewportCameraZoom;
      camera.updateProjectionMatrix();
    });
  }, [themeId]);

  useEffect(() => {
    wireframeEnabledRef.current = wireframeEnabled;
  }, [wireframeEnabled]);

  useEffect(() => {
    gridEnabledRef.current = gridEnabled;
  }, [gridEnabled]);

  useEffect(() => {
    const axes = axesRef.current;
    if (axes) {
      axes.visible = axesEnabled;
    }
  }, [axesEnabled]);

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
    if (!mixer || !root || mixer.getRoot() !== root) return;

    if (currentActionRef.current) {
      currentActionRef.current.stop();
    }
    currentActionRef.current = activateMixerClip(mixer, playbackIntentRef.current);
  }, [currentClipName, clips, root]);

  // Keep latest onSelectBone and skeleton for raycast handler (stable click listener)
  useEffect(() => { onSelectBoneRef.current = onSelectBone; }, [onSelectBone]);
  useEffect(() => { onSelectObjectRef.current = onSelectObject; }, [onSelectObject]);
  useEffect(() => { onClearObjectSelectionRef.current = onClearObjectSelection; }, [onClearObjectSelection]);
  useEffect(() => { onObjectContextMenuRef.current = onObjectContextMenu; }, [onObjectContextMenu]);
  useEffect(() => { onBoneTransformEditRef.current = onBoneTransformEdit; }, [onBoneTransformEdit]);
  useEffect(() => { onCreateRigChildAtWorldRef.current = onCreateRigChildAtWorld; }, [onCreateRigChildAtWorld]);
  useEffect(() => { onMoveRigBoneToWorldRef.current = onMoveRigBoneToWorld; }, [onMoveRigBoneToWorld]);
  useEffect(() => { onRotateRigBoneRef.current = onRotateRigBone; }, [onRotateRigBone]);
  useEffect(() => { onSolveRigIkRef.current = onSolveRigIk; }, [onSolveRigIk]);
  useEffect(() => { onSetTransformModeRef.current = onSetTransformMode; }, [onSetTransformMode]);
  useEffect(() => {
    boneTransformOwnerRef.current = boneTransformOwner;
    setTransformOwnerTelemetry(!!transformTargetRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- telemetry reads only imperative refs; owner is the sole reactive input.
  }, [boneTransformOwner]);
  useEffect(() => { skeletonRefForPick.current = skeleton; }, [skeleton]);
  useEffect(() => { onPaintSkinVerticesRef.current = onPaintSkinVertices; }, [onPaintSkinVertices]);
  useEffect(() => { onSkinPaintStrokeStartRef.current = onSkinPaintStrokeStart; }, [onSkinPaintStrokeStart]);
  useEffect(() => { onSkinPaintStrokeEndRef.current = onSkinPaintStrokeEnd; }, [onSkinPaintStrokeEnd]);
  useEffect(() => { skinPaintModeRef.current = skinPaintMode; }, [skinPaintMode]);
  useEffect(() => { skinPaintTargetModeRef.current = skinPaintTargetMode; }, [skinPaintTargetMode]);
  useEffect(() => { skinPaintRadiusRef.current = skinPaintRadius; }, [skinPaintRadius]);
  useEffect(() => { skinPaintStrengthRef.current = skinPaintStrength; }, [skinPaintStrength]);
  useEffect(() => { skinPaintTargetRef.current = skinPaintTarget; }, [skinPaintTarget]);
  useEffect(() => { editorModeRef.current = editorMode; }, [editorMode]);
  useEffect(() => { rigToolModeRef.current = rigToolMode; }, [rigToolMode]);
  useEffect(() => {
    if (editorMode !== 'skin') {
      const canvas = canvasRef.current;
      if (skinPaintActiveRef.current) {
        onSkinPaintStrokeEndRef.current?.();
      }
      skinPaintActiveRef.current = false;
      if (canvas?.dataset.skinPaintActive) {
        delete canvas.dataset.skinPaintActive;
      }
      if (canvas) {
        delete canvas.dataset.skinBrushHover;
        delete canvas.dataset.skinPaintHitCount;
        delete canvas.dataset.skinCandidateCount;
        delete canvas.dataset.skinTotalVertexCount;
        delete canvas.dataset.skinPaintMode;
        delete canvas.dataset.skinPaintTargetMode;
        delete canvas.dataset.skinPaintRadius;
        delete canvas.dataset.skinPaintStrength;
        delete canvas.dataset.skinPaintTarget;
        delete canvas.dataset.skinBrushIndexError;
        delete canvas.dataset.skinBrushX;
        delete canvas.dataset.skinBrushY;
        delete canvas.dataset.skinBrushZ;
        canvas.style.cursor = 'default';
      }
      if (cursorModeRef.current !== 'default') {
        cursorModeRef.current = 'default';
      }
      const marker = skinBrushMarkerRef.current;
      if (marker) {
        marker.visible = false;
      }
      hoveredBoneNameRef.current = null;
      if (canvas) {
        canvas.dataset.hoveredBone = '';
      }
    }
  }, [editorMode]);

  // Unmount cleanup for TransformControls (detach + remove from scene + dispose)
  useEffect(() => {
    return () => {
      if (skinPaintActiveRef.current) {
        skinPaintActiveRef.current = false;
        onSkinPaintStrokeEndRef.current?.();
      }
      restoreTransformControlsAfterEndpointDrag();
      const scene = sceneRef.current;
      clearSkinPointOverlays();
      clearSelectionOverlays();
      transformControlsControllerRef.current?.dispose();
      transformControlsControllerRef.current = null;
      transformTargetRef.current = null;
      if (scene) {
        [boneHighlightRef.current, boneEndpointHandleRef.current, rigIkTargetHandleRef.current, boneHoverMarkerRef.current, skinBrushMarkerRef.current].forEach(marker => {
          if (!marker) return;
          scene.remove(marker);
          disposeThreeObject(marker);
        });
      }
      boneHighlightRef.current = null;
      boneEndpointHandleRef.current = null;
      rigIkTargetHandleRef.current = null;
      rigIkTargetWorldRef.current = null;
      boneHoverMarkerRef.current = null;
      skinBrushMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup reads owned refs and must not rerun during the component lifetime.
  }, []);
  // Sync onTimeUpdate ref (for stable RAF time reporting without setup effect re-runs)
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => {
    playbackStateRef.current = { isPlaying, currentTime };
  }, [isPlaying, currentTime]);

  // Sync selected bone name ref (for animate loop + highlight without stale closures)
  useEffect(() => { selectedBoneNameRef.current = selectedBoneName; }, [selectedBoneName]);

  useEffect(() => {
    rebuildSkinPointOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the helper reads synchronized refs; these values own rebuild timing.
  }, [skinPointOverlayEnabled, root, selectedBoneName]);

  useEffect(() => {
    rebuildSelectionOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the helper reads synchronized selection refs; the key/revision own invalidation.
  }, [root, selectedObjectIdKey, selectionOverlayRevision]);

  // Bone labels management (extracted hook for modularity)
  const markerScale = isPrecisionMode ? 2 : 1;
  useBoneLabelsWithScale(boneLabelsEnabled, skeleton, boneLabelScale, boneIndexLabelsEnabled);

  useEffect(() => {
    viewportDisplayRef.current.setTextureEnabled(textureEnabled);
  }, [textureEnabled, root]);

  useEffect(() => {
    viewportDisplayRef.current.updatePreview({
      repeatTextures: textureRepeatPreviewEnabled,
      textureFilter: textureFilterPreview,
    });
  }, [textureRepeatPreviewEnabled, textureFilterPreview, root]);

  useEffect(() => {
    viewportDisplayRef.current.setShaderEnabled(shaderEnabled, textureEnabledRef.current, modelOpacityRef.current);
  }, [shaderEnabled, root]);

  useEffect(() => {
    viewportDisplayRef.current.setModelOpacity(modelOpacity);
  }, [modelOpacity, root]);

  useEffect(() => {
    const helper = skeletonHelperRef.current;
    if (!helper) return;
    helper.setOpacity?.(rigOpacity);
  }, [rigOpacity, skeleton, root]);

  useEffect(() => {
    const helper = skeletonHelperRef.current;
    if (!helper) return;
    helper.setThicknessScale?.(rigThicknessScale);
  }, [rigThicknessScale, skeleton, root]);

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
    detachMarker(rigIkTargetHandleRef.current);
    if (rigIkTargetHandleRef.current) {
      rigIkTargetHandleRef.current = null;
    }
    rigIkTargetWorldRef.current = null;
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
      delete canvas.dataset.rigIkTargetScreenX;
      delete canvas.dataset.rigIkTargetScreenY;
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
        if (editorMode === 'rig' && rigToolMode === 'endpoint') {
          const handle = makeBoneEndpointHandle(markerScale);
          updateEndpointHandle(handle, bone, markerScale);
          scene.add(handle);
          boneEndpointHandleRef.current = handle;
        }
        if (editorMode === 'rig' && rigToolMode === 'ik') {
          const targetWorld = bone.getWorldPosition(new THREE.Vector3());
          const targetHandle = makeRigIkTargetHandle(markerScale);
          targetHandle.position.copy(targetWorld);
          scene.add(targetHandle);
          rigIkTargetHandleRef.current = targetHandle;
          rigIkTargetWorldRef.current = targetWorld;
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
  }, [editorMode, selectedBoneName, skeleton, markerScale, isPrecisionMode, rigToolMode]);

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
    const controller = transformControlsControllerRef.current;
    if (controller && transformMode) {
      controller.setMode(transformMode);
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

    const previousController = transformControlsControllerRef.current;
    if (previousController) {
      previousController.detach();
      transformControlsDraggingRef.current = false;
    }

    const targetToolOwnsRigInteraction = editorMode === 'rig' && (rigToolMode === 'endpoint' || rigToolMode === 'ik');
    const transformCameraIsSupported = viewportLayout === 'single' && perspectiveEnabled;
    if (
      boneTransformOwner === 'disabled'
      || targetToolOwnsRigInteraction
      || !transformCameraIsSupported
      || !selectedBoneName
      || !skeleton
    ) {
      transformTargetRef.current = null;
      transformControlsControllerRef.current?.detach();
      setTransformOwnerTelemetry(false);
      return;
    }

    const bone = findBoneByName(skeleton, selectedBoneName);
    if (!bone) {
      transformTargetRef.current = null;
      transformControlsControllerRef.current?.detach();
      setTransformOwnerTelemetry(false);
      return;
    }
    transformTargetRef.current = bone;

    let controller = transformControlsControllerRef.current;
    if (!controller) {
      controller = createViewportTransformControls({
        scene,
        camera: cam,
        domElement: dom,
        mode: transformMode || 'translate',
        onChange: () => {
          const activeBone = transformTargetRef.current;
          const activeSkeleton = skeletonRefForPick.current;
          if (activeBone) {
            activeBone.updateMatrixWorld(true);
            if (transformControlsDraggingRef.current) {
              emitBoneTransformEdit('change', 'transform-controls', activeBone);
            }
          }
          activeSkeleton?.update();
        },
        onDraggingChange: (dragging) => {
          transformControlsDraggingRef.current = dragging;
          orbitRef.current.enabled = !dragging;
          setTransformOwnerTelemetry(!!transformTargetRef.current);
          emitBoneTransformEdit(
            dragging ? 'start' : 'end',
            'transform-controls',
            transformTargetRef.current,
          );
        },
        onAxisChange: () => {
          setTransformOwnerTelemetry(!!transformTargetRef.current);
        },
      });
      transformControlsControllerRef.current = controller;
    }

    controller.attach(bone);
    setTransformOwnerTelemetry(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transformMode has its own focused effect; telemetry and emitters read stable refs.
  }, [boneTransformOwner, editorMode, perspectiveEnabled, rigToolMode, selectedBoneName, skeleton, viewportLayout]);

  // Attach/replace model root + skeleton helper + create internal mixer when root prop changes.
  // IMPORTANT: deps ONLY loaded scene objects (root/skeleton). Never include playback props (isPlaying/currentTime/currentClipName/playbackSpeed)
  // or this will re-dispose + re-attach the entire model + recreate mixer on every frame/scrub (from parent setCurrentTime in RAF).
  // Clip changes are handled by the clip-selection effect so animation edits can update tracks without disposing the model.
  // Playback mutations happen in the dedicated effects below (they read current action/mixer refs and apply without re-mount).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    skinCandidateCountRef.current = 0;
    skinTotalVertexCountRef.current = 0;

    // Dispose + remove previous attached model + helper (use shared util)
    const prev = attachedModelRef.current;
    if (prev) {
      clearSkinPointOverlays();
      viewportDisplayRef.current.detachRoot(prev);
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
    transformControlsControllerRef.current?.detach();

    if (!root) {
      boundsRef.current = DEFAULT_VIEWPORT_BOUNDS;
      applyViewportLayout(viewportLayout);
      return;
    }

    // Attach the provided root directly (loaders produce unbound-to-scene instances; preserve skin binds)
    // Avoid clone here to keep skeleton bone refs and skinning correct.
    scene.add(root);
    attachedModelRef.current = root;
    viewportDisplayRef.current.captureRoot(root);
    rebuildSkinPointOverlays();
    viewportDisplayRef.current.updatePreview({
      textureEnabled,
      modelOpacity,
      repeatTextures: textureRepeatPreviewEnabled,
      textureFilter: textureFilterPreview,
    });
    viewportDisplayRef.current.setShaderEnabled(shaderEnabled, textureEnabled, modelOpacity);

    // Auto frame camera + orbit to model (fixes giant/tiny uploads; uses bbox, no model scale to preserve skin/bind)
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const modelBounds = { center, maxDim };
    boundsRef.current = modelBounds;
    const orbit = orbitRef.current;
    orbit.target.copy(modelBounds.center);
    orbit.distance = getModelOrbitDistance(modelBounds);
    orbit.yaw = 0.6;
    orbit.pitch = 0.35;
    applyViewportLayout(viewportLayout);
    if (cameraRef.current) {
      cameraRef.current.position.copy(orbit.getPosition());
      cameraRef.current.lookAt(orbit.target);
      cameraRef.current.updateMatrixWorld();
    }
    writeSharedCameraTargetTelemetry(canvasRef.current, orbit.target);

    // Modern skeleton helper for larger, old-editor-like rig visualization and direct helper hit picking.
    if (skeleton) {
      const helper = new ModernSkeletonHelper(root, {
        boneThickness: 0.065,
        jointRadius: 0.09,
        depthTest: false,
      });
      helper.setOpacity(rigOpacity);
      helper.setThicknessScale(rigThicknessScale);
      scene.add(helper);
      skeletonHelperRef.current = helper;
    }

    // Internal mixer for this model (drives skin + our time reports)
    const mixer = new THREE.AnimationMixer(root);
    mixerRef.current = mixer;

    // Clip effects run before this attachment effect. Initialize from the latest complete
    // playback intent so a root swap never binds the new clips to the previous mixer.
    currentActionRef.current = activateMixerClip(mixer, playbackIntentRef.current);

    return () => {
      // cleanup handled on next root change or unmount via the top of this effect
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- model attachment is intentionally root/skeleton-owned; clips, playback, layout, and display settings have focused effects.
  }, [root, skeleton]);  // <-- ONLY scene objects; playback/clips handled by other effects to prevent re-attach loops on every edit/tick

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        data-testid="three-canvas"
        data-model-root-id={root?.uuid ?? ''}
        data-playback-time={currentTime.toFixed(6)}
        data-editor-mode={editorMode}
        data-viewport-layout={viewportLayout}
        data-wireframe-enabled={wireframeEnabled ? 'true' : 'false'}
        data-grid-enabled={gridEnabled ? 'true' : 'false'}
        data-axes-enabled={axesEnabled ? 'true' : 'false'}
        data-texture-enabled={textureEnabled ? 'true' : 'false'}
        data-texture-repeat-preview={textureRepeatPreviewEnabled ? 'true' : 'false'}
        data-texture-filter-preview={textureFilterPreview}
        data-shader-enabled={shaderEnabled ? 'true' : 'false'}
        data-shader-mode={shaderEnabled ? 'legacy-smf' : 'standard'}
        data-perspective-enabled={perspectiveEnabled ? 'true' : 'false'}
        data-bone-index-labels-enabled={boneIndexLabelsEnabled ? 'true' : 'false'}
        data-rig-opacity={rigOpacity}
        data-model-opacity={modelOpacity}
        data-theme={themeId}
        data-rig-thickness-scale={rigThicknessScale}
        data-skin-points-enabled={skinPointOverlayEnabled ? 'true' : 'false'}
        data-skin-point-overlay-count={skinPointOverlaysRef.current.length}
        data-selection-overlay-count={selectionOverlaysRef.current.length}
        data-skin-candidate-count={skinCandidateCountRef.current}
        data-skin-total-vertex-count={skinTotalVertexCountRef.current}
        data-skin-paint-target-mode={skinPaintTargetMode}
        data-transform-owner={boneTransformOwner}
        data-transform-attached={transformTargetRef.current ? 'true' : 'false'}
        data-transform-dragging={transformControlsDraggingRef.current ? 'true' : 'false'}
        data-rig-tool-mode={rigToolMode}
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

