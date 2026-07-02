import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SimpleOrbit } from '../utils/SimpleOrbit';
import { disposeThreeObject } from '../utils/threeDisposal';
import { restoreWeightPreview, applyWeightPreviewForBone } from '../utils/weightPreview';
import { findClosestBone, DEFAULT_MAX_BONE_PICK_DIST, findBoneByName } from '../utils/bonePicker';
import type { SkinWeightEditMode } from '../utils/skinWeights';
import { useBoneLabelsWithScale } from '../utils/useBoneLabels';
import { createLegacySmfMaterial } from '../utils/legacySmfLighting';
import { createSkinPointOverlays, disposeSkinPointOverlays } from '../utils/skinPointOverlay';
import {
  createSelectionOverlays,
  disposeSelectionOverlays,
  updateSelectionOverlays,
  type SelectionOverlay,
} from '../utils/selectionOverlay';
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
import {
  resolvePointerClickOwner,
  resolvePointerDownOwner,
  type ViewportInteractionOwner,
} from '../utils/viewportInteractionRouter';
import {
  buildSkinnedWorldBrushIndex,
  querySkinBrushWorldIndex,
  type SkinBrushIndex,
  type SkinBrushVertexRef,
} from '../utils/skinBrushIndex';
import type { EditorMode, ViewportLayout } from '../store';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

type EndpointDragState = {
  boneName: string;
  bone: THREE.Bone;
  plane: THREE.Plane;
  localOffset: THREE.Vector3;
  parentInverse: THREE.Matrix4;
};

type MaterialWithMap = THREE.Material & {
  map?: THREE.Texture | null;
};

type TransformControlsDraggingEvent = { value: boolean };

type MeshMaterialEntry = {
  mesh: THREE.Mesh;
  materials: THREE.Material[];
  materialWasArray: boolean;
};

type SkinPaintVertex = { meshId: string; vertexIndex: number; amount: number };

interface SkinPaintCollection {
  vertices: SkinPaintVertex[];
  candidateCount: number;
  totalVertexCount: number;
}

export type BoneTransformEditSource = 'transform-controls' | 'endpoint-drag';

export type BoneTransformEditPhase = 'start' | 'change' | 'end';

export type BoneTransformOwner = 'disabled' | 'pose' | 'animation';

export interface BoneTransformEditEvent {
  phase: BoneTransformEditPhase;
  source: BoneTransformEditSource;
  owner: BoneTransformOwner;
  boneName: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

export interface ViewportObjectSelectEvent {
  objectId: string;
  objectName: string;
  additive: boolean;
  toggle: boolean;
}

const isObject3D = (value: unknown): value is THREE.Object3D => value instanceof THREE.Object3D;
const transformControlsAsObject3D = (controls: TransformControls): THREE.Object3D =>
  controls as unknown as THREE.Object3D;
const isDraggingEvent = (event: unknown): event is TransformControlsDraggingEvent =>
  typeof event === 'object' && event !== null && typeof (event as TransformControlsDraggingEvent).value === 'boolean';

const isSkinnedMesh = (obj: THREE.Object3D): obj is THREE.SkinnedMesh => obj.type === 'SkinnedMesh' || (obj as THREE.SkinnedMesh).isSkinnedMesh === true;

const isMaterialWithMap = (material: THREE.Material): material is MaterialWithMap => 'map' in material;

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
  onSelectObject?: (event: ViewportObjectSelectEvent) => void;
  onClearObjectSelection?: () => void;
  onObjectContextMenu?: (event: ViewportObjectSelectEvent) => void;
  onBoneTransformEdit?: (event: BoneTransformEditEvent) => void;
  selectedBoneName?: string;
  selectedObjectIds?: string[];
  selectionOverlayRevision?: number;
  weightPreviewEnabled?: boolean;
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSetTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => boolean | void;
  boneTransformOwner?: BoneTransformOwner;
  boneLabelsEnabled?: boolean;
  editorMode?: EditorMode;
  viewportLayout?: ViewportLayout;
  wireframeEnabled?: boolean;
  gridEnabled?: boolean;
  axesEnabled?: boolean;
  textureEnabled?: boolean;
  boneIndexLabelsEnabled?: boolean;
  rigOpacity?: number;
  rigThicknessScale?: number;
  skinPointOverlayEnabled?: boolean;
  shaderEnabled?: boolean;
  perspectiveEnabled?: boolean;
  modelOpacity?: number;
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
  selectedBoneName,
  selectedObjectIds = [],
  selectionOverlayRevision = 0,
  weightPreviewEnabled = false,
  transformMode = 'translate',
  onSetTransformMode,
  boneTransformOwner = 'disabled',
  boneLabelsEnabled = false,
  editorMode = 'view',
  viewportLayout = 'single',
  wireframeEnabled = false,
  gridEnabled = true,
  axesEnabled = true,
  textureEnabled = true,
  boneIndexLabelsEnabled = false,
  rigOpacity = 1,
  rigThicknessScale = 1,
  skinPointOverlayEnabled = false,
  shaderEnabled = false,
  perspectiveEnabled = true,
  modelOpacity = 1,
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
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const viewportRef = useRef<ViewportSpec[]>([]);
  const layoutRef = useRef<ViewportLayout>('single');
  const wireframeEnabledRef = useRef(false);
  const wireframeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const boundsRef = useRef<ModelBounds>(DEFAULT_VIEWPORT_BOUNDS);
  const canvasSizeRef = useRef({ width: 800, height: 600 });
  const gridRef = useRef<THREE.GridHelper | null>(null);
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
  const materialTextureBackupRef = useRef<Map<string, THREE.Texture | null>>(new Map());
  const materialOpacityBackupRef = useRef<Map<string, number>>(new Map());
  const materialTransparentBackupRef = useRef<Map<string, boolean>>(new Map());
  const meshMaterialsRef = useRef<Map<string, MeshMaterialEntry>>(new Map());
  const legacyShaderMaterialsRef = useRef<Map<string, THREE.Material>>(new Map());
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
  const skinPaintActiveRef = useRef(false);

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
  const onSelectObjectRef = useRef(onSelectObject);
  const onClearObjectSelectionRef = useRef(onClearObjectSelection);
  const onObjectContextMenuRef = useRef(onObjectContextMenu);
  const onBoneTransformEditRef = useRef(onBoneTransformEdit);
  const onSetTransformModeRef = useRef(onSetTransformMode);
  const boneTransformOwnerRef = useRef<BoneTransformOwner>(boneTransformOwner);
  const skeletonRefForPick = useRef(skeleton);

  // For selected bone 3D highlight marker (visual feedback when list or raycast selects a bone)
  const selectedBoneNameRef = useRef(selectedBoneName);
  const boneHighlightRef = useRef<THREE.Object3D | null>(null);
  const boneEndpointHandleRef = useRef<THREE.Object3D | null>(null);
  const boneHoverMarkerRef = useRef<THREE.Object3D | null>(null);
  const skinPointOverlaysRef = useRef<THREE.Points[]>([]);
  const selectionOverlaysRef = useRef<SelectionOverlay[]>([]);
  const hoveredBoneNameRef = useRef<string | null>(null);
  const skinBrushMarkerRef = useRef<THREE.Object3D | null>(null);
  const skinPaintHitCountRef = useRef(0);
  const skinCandidateCountRef = useRef(0);
  const skinTotalVertexCountRef = useRef(0);
  const lastSkinPaintMsRef = useRef(0);
  const transformControlsDraggingRef = useRef(false);
  const selectedObjectIdKey = selectedObjectIds.join('|');

  const setTransformOwnerTelemetry = (attached: boolean): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.transformOwner = boneTransformOwnerRef.current;
    canvas.dataset.transformAttached = attached ? 'true' : 'false';
    canvas.dataset.transformDragging = transformControlsDraggingRef.current ? 'true' : 'false';
  };

  // Ref for onTimeUpdate to decouple RAF reporting from setup effect deps (timing/robustness: avoids re-init of scene/RAF if fn identity ever shifts; mirrors bone pick ref pattern)
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const playbackStateRef = useRef({ isPlaying, currentTime });

  const applyViewportLayout = (nextLayout: ViewportLayout) => {
    const camera = cameraRef.current;
    if (!camera) return;
    updateOrthoCameras(orthoCameraRefs.current, boundsRef.current);
    viewportRef.current = buildViewportSpecs(
      canvasSizeRef.current.width,
      canvasSizeRef.current.height,
      nextLayout,
      boundsRef.current,
      camera,
      orthoCameraRefs.current,
      perspectiveEnabled,
    );
    layoutRef.current = nextLayout;
  };

  const getViewportAt = (x: number, y: number, requirePicking = false): ViewportSpec | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return findViewportAt(viewportRef.current, rect, x, y, requirePicking);
  };

  const isInPickingViewport = (x: number, y: number): boolean => !!getViewportAt(x, y, true);

  const isInOrbitViewport = (x: number, y: number): boolean => {
    const spec = getViewportAt(x, y, true);
    return !!spec;
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
      if (isSkinnedMesh(obj)) {
        meshes.push(obj);
      }
    });
    return meshes;
  };

  const getSkinnedWorldBrushIndex = (mesh: THREE.SkinnedMesh, brushRadius: number): SkinBrushIndex => {
    const desiredCellSize = Math.max(0.01, Math.min(Math.max(brushRadius / 2, 0.01), boundsRef.current.maxDim / 16));
    return buildSkinnedWorldBrushIndex(mesh, desiredCellSize);
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
      if (obj.type === 'Mesh' || obj.type === 'SkinnedMesh') {
        meshes.push(obj as THREE.Mesh);
      }
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
    if (!skinPointOverlayEnabled || !attachedModelRef.current) {
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
    if (!scene || !attachedModelRef.current || selectedObjectIds.length === 0) {
      return;
    }

    selectionOverlaysRef.current = createSelectionOverlays(attachedModelRef.current, selectedObjectIds);
    selectionOverlaysRef.current.forEach((overlay) => scene.add(overlay));
    if (canvas) {
      canvas.dataset.selectionOverlayCount = String(selectionOverlaysRef.current.length);
      canvas.dataset.selectionOverlayNames = selectionOverlaysRef.current
        .map((overlay) => overlay.userData.targetName ?? '')
        .filter(Boolean)
        .join(',');
    }
  };

  const captureTextureMaterials = (object: THREE.Object3D | null): void => {
    if (!object) return;
    disposeLegacyShaderMaterials();
    meshMaterialsRef.current.clear();
    materialTextureBackupRef.current.clear();
    materialOpacityBackupRef.current.clear();
    materialTransparentBackupRef.current.clear();
    object.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const materialWasArray = Array.isArray(obj.material);
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      const normalized = materials.filter((m): m is THREE.Material => !!m);
      if (normalized.length > 0) {
        meshMaterialsRef.current.set(obj.uuid, { mesh: obj, materials: normalized, materialWasArray });
        normalized.forEach((material) => {
          if (!materialTextureBackupRef.current.has(material.uuid)) {
            materialTextureBackupRef.current.set(material.uuid, isMaterialWithMap(material) ? material.map ?? null : null);
            materialOpacityBackupRef.current.set(material.uuid, material.opacity);
            materialTransparentBackupRef.current.set(material.uuid, material.transparent);
          }
        });
      }
    });
  };

  const disposeLegacyShaderMaterials = (): void => {
    legacyShaderMaterialsRef.current.forEach((material) => {
      material.dispose();
    });
    legacyShaderMaterialsRef.current.clear();
  };

  const restoreOriginalMaterials = (): void => {
    meshMaterialsRef.current.forEach(({ mesh, materials, materialWasArray }) => {
      if (materials.length === 0) return;
      mesh.material = materialWasArray ? [...materials] : materials[0];
    });
  };

  const applyTextureToMaterial = (
    material: THREE.Material,
    sourceMaterialUuid: string,
    enabled: boolean,
  ): void => {
    if (!isMaterialWithMap(material)) return;
    const mapValue = materialTextureBackupRef.current.get(sourceMaterialUuid);
    if (typeof mapValue === 'undefined') return;
    material.map = enabled ? mapValue : null;
    material.needsUpdate = true;
  };

  const applyTextureEnabled = (enabled: boolean): void => {
    meshMaterialsRef.current.forEach(({ materials }) => {
      for (const material of materials) {
        applyTextureToMaterial(material, material.uuid, enabled);
        const legacyMaterial = legacyShaderMaterialsRef.current.get(material.uuid);
        if (legacyMaterial) {
          applyTextureToMaterial(legacyMaterial, material.uuid, enabled);
        }
      }
    });
  };

  const applyShaderEnabled = (enabled: boolean): void => {
    if (!enabled) {
      restoreOriginalMaterials();
      disposeLegacyShaderMaterials();
      applyTextureEnabled(textureEnabled);
      applyModelOpacity(modelOpacity);
      return;
    }

    meshMaterialsRef.current.forEach(({ mesh, materials, materialWasArray }) => {
      const displayMaterials = materials.map((material) => {
        let legacyMaterial = legacyShaderMaterialsRef.current.get(material.uuid);
        if (!legacyMaterial) {
          legacyMaterial = createLegacySmfMaterial(material, {
            mapEnabled: textureEnabled,
            opacity: modelOpacity,
          });
          legacyShaderMaterialsRef.current.set(material.uuid, legacyMaterial);
        }
        return legacyMaterial;
      });
      if (displayMaterials.length === 0) return;
      mesh.material = materialWasArray ? displayMaterials : displayMaterials[0];
    });
    applyTextureEnabled(textureEnabled);
    applyModelOpacity(modelOpacity);
  };

  const applyOpacityToMaterial = (
    material: THREE.Material,
    sourceMaterialUuid: string,
    opacity: number,
  ): void => {
    const defaultOpacity = materialOpacityBackupRef.current.get(sourceMaterialUuid);
    if (typeof defaultOpacity === 'undefined') return;
    material.opacity = opacity;
    if (opacity < 1) {
      material.transparent = true;
    } else {
      const defaultTransparent = materialTransparentBackupRef.current.get(sourceMaterialUuid);
      material.transparent = defaultTransparent ?? false;
    }
    material.needsUpdate = true;
  };

  const applyModelOpacity = (value: number): void => {
    const opacity = clamp01(value);
    meshMaterialsRef.current.forEach(({ materials }) => {
      for (const material of materials) {
        applyOpacityToMaterial(material, material.uuid, opacity);
        const legacyMaterial = legacyShaderMaterialsRef.current.get(material.uuid);
        if (legacyMaterial) {
          applyOpacityToMaterial(legacyMaterial, material.uuid, opacity);
        }
      }
    });
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
    const tc = transformControlsRef.current;
    if (!tc || isTransformControlsPausedForEndpointRef.current) return;
    isTransformControlsPausedForEndpointRef.current = true;
    tc.enabled = false;
    transformControlsAsObject3D(tc).visible = false;
    tc.detach();
    setTransformOwnerTelemetry(false);
  };

  const restoreTransformControlsAfterEndpointDrag = () => {
    const tc = transformControlsRef.current;
    if (!tc || !isTransformControlsPausedForEndpointRef.current) return;
    tc.enabled = true;
    transformControlsAsObject3D(tc).visible = true;
    if (transformTargetRef.current) {
      tc.attach(transformTargetRef.current);
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
    grid.visible = gridEnabled;
    scene.add(grid);
    gridRef.current = grid;

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
        orbit.reset();
        updateCamera();
      }
    };
    window.addEventListener('keydown', onKey);

    // Pointer-based bone selection on the canvas.
    // Complements list selection in Inspector. Uses bone world positions + ray distance.
    // Ignore drag/long-press paths to avoid accidental selection during orbit/transform interaction.
    const buildEndpointDragState = (event: PointerEvent): EndpointDragState | null => {
      if (editorModeRef.current !== 'rig') return null;
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

      const hits = raycasterRef.current.intersectObject(handle, true);
      const camera = pick.camera;
      let hit = hits[0]?.point.clone();
      if (!hit) {
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

    const startEndpointDrag = (state: EndpointDragState): void => {
      endpointDragRef.current = state;
      emitBoneTransformEdit('start', 'endpoint-drag', state.bone);
      pauseTransformControlsForEndpointDrag();
      orbitRef.current.enabled = false;
      canvas.style.cursor = 'grabbing';
      cursorModeRef.current = 'grabbing';
      canvas.dataset.endpointDrag = 'active';
    };

    const endEndpointDrag = () => {
      const dragState = endpointDragRef.current;
      if (dragState) {
        emitBoneTransformEdit('end', 'endpoint-drag', dragState.bone);
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
      const hitDepth = hits[0]?.point ? hits[0].point.clone().project(pick.camera).z : null;

      const addCandidate = (mesh: THREE.SkinnedMesh, candidate: SkinBrushVertexRef): void => {
        local.set(candidate.localPosition[0], candidate.localPosition[1], candidate.localPosition[2]);
        let transformed = world.copy(local);
        const skinTransform = (mesh as { boneTransform?: (index: number, target: THREE.Vector3) => THREE.Vector3 }).boneTransform;
        if (typeof skinTransform === 'function') {
          transformed = skinTransform.call(mesh, candidate.vertexIndex, transformed);
        }
        transformed.applyMatrix4(mesh.matrixWorld);

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
        if (!hit?.face || !isSkinnedMesh(hit.object)) return;
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

        const index = getSkinnedWorldBrushIndex(mesh, brushRadius);
        totalVertexCount += index.vertexCount;
        if (targetMode === 'triangle' && brushRadius < 0.5) {
          continue;
        }
        const candidates = querySkinBrushWorldIndex(index, brushCenter, brushRadius);
        candidateCount += candidates.length;
        for (const candidate of candidates) {
          addCandidate(mesh, candidate);
        }
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

    const setPointerOwnerTelemetry = (owner: ViewportInteractionOwner): void => {
      canvas.dataset.pointerOwner = owner;
      canvas.dataset.pointerMode = editorModeRef.current;
    };

    const resolvePointerOwner = (
      event: PointerEvent,
      endpointState: EndpointDragState | null,
    ): ViewportInteractionOwner => {
      const activeSkeleton = skeletonRefForPick.current;
      const owner = resolvePointerDownOwner({
        editorMode: editorModeRef.current,
        button: event.button,
        hasModel: !!attachedModelRef.current,
        hasSkeleton: !!activeSkeleton && activeSkeleton.bones.length > 0,
        hasSelectedBone: hasValidSkinPaintTarget(),
        isPrecisionMode: isPrecisionModeRef.current,
        isPickingViewport: isInPickingViewport(event.clientX, event.clientY),
        hitEndpointHandle: !!endpointState,
      });
      setPointerOwnerTelemetry(owner);
      return owner;
    };

    const onCanvasPointerDown = (event: PointerEvent) => {
      const endpointState = event.button === 0 ? buildEndpointDragState(event) : null;
      const owner = resolvePointerOwner(event, endpointState);
      if (owner === 'none' || owner === 'orbit') return;
      if (event.button !== 0) return;

      if (owner === 'rig-endpoint-drag' && endpointState) {
        startEndpointDrag(endpointState);
        pointerDownRef.current = null;
        return;
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
        setPointerOwnerTelemetry('model-select');
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
        endEndpointDrag();
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
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointerup', onCanvasPointerUp);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('contextmenu', onCanvasContextMenu);
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

      updateSelectionOverlays(selectionOverlaysRef.current);

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
      updateOrthoCameras(orthoCameraRefs.current, boundsRef.current);
      const specs = buildViewportSpecs(
        w,
        h,
        layoutRef.current,
        boundsRef.current,
        camera,
        orthoCameraRefs.current,
        perspectiveEnabled,
      );
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
      canvas.removeEventListener('contextmenu', onCanvasContextMenu);
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
      clearSkinPointOverlays();
      restoreOriginalMaterials();
      disposeLegacyShaderMaterials();
      wireframeMaterialRef.current?.dispose();
      wireframeMaterialRef.current = null;
      renderer.dispose();
    };
    // Note: intentionally no deps on playback props; RAF always runs, control via effects below.
    // onTimeUpdate (and onSelectBone/skeleton) kept via refs to avoid re-creating renderer/scene/RAF/ listeners on every parent render.
  }, []);

  useEffect(() => {
    applyViewportLayout(viewportLayout);
  }, [viewportLayout, perspectiveEnabled]);

  useEffect(() => {
    wireframeEnabledRef.current = wireframeEnabled;
  }, [wireframeEnabled]);

  useEffect(() => {
    const grid = gridRef.current;
    if (grid) {
      grid.visible = gridEnabled;
    }
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
  useEffect(() => { onSelectObjectRef.current = onSelectObject; }, [onSelectObject]);
  useEffect(() => { onClearObjectSelectionRef.current = onClearObjectSelection; }, [onClearObjectSelection]);
  useEffect(() => { onObjectContextMenuRef.current = onObjectContextMenu; }, [onObjectContextMenu]);
  useEffect(() => { onBoneTransformEditRef.current = onBoneTransformEdit; }, [onBoneTransformEdit]);
  useEffect(() => { onSetTransformModeRef.current = onSetTransformMode; }, [onSetTransformMode]);
  useEffect(() => {
    boneTransformOwnerRef.current = boneTransformOwner;
    setTransformOwnerTelemetry(!!transformTargetRef.current);
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
      const tc = transformControlsRef.current;
      const scene = sceneRef.current;
      clearSkinPointOverlays();
      clearSelectionOverlays();
      if (tc) {
        tc.detach();
        if (scene && isObject3D(tc)) scene.remove(tc);
        tc.dispose?.();
        transformControlsRef.current = null;
        transformTargetRef.current = null;
      }
      if (scene) {
        [boneHighlightRef.current, boneEndpointHandleRef.current, boneHoverMarkerRef.current, skinBrushMarkerRef.current].forEach(marker => {
          if (!marker) return;
          scene.remove(marker);
          disposeThreeObject(marker);
        });
      }
      boneHighlightRef.current = null;
      boneEndpointHandleRef.current = null;
      boneHoverMarkerRef.current = null;
      skinBrushMarkerRef.current = null;
    };
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
  }, [skinPointOverlayEnabled, root, selectedBoneName]);

  useEffect(() => {
    rebuildSelectionOverlays();
  }, [root, selectedObjectIdKey, selectionOverlayRevision]);

  // Bone labels management (extracted hook for modularity)
  const markerScale = isPrecisionMode ? 2 : 1;
  useBoneLabelsWithScale(boneLabelsEnabled, skeleton, boneLabelScale, boneIndexLabelsEnabled);

  useEffect(() => {
    applyTextureEnabled(textureEnabled);
  }, [textureEnabled, root]);

  useEffect(() => {
    applyShaderEnabled(shaderEnabled);
  }, [shaderEnabled, root]);

  useEffect(() => {
    applyModelOpacity(modelOpacity);
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
      transformControlsDraggingRef.current = false;
    }

    if (boneTransformOwner === 'disabled' || !selectedBoneName || !skeleton) {
      transformTargetRef.current = null;
      transformControlsRef.current?.detach();
      setTransformOwnerTelemetry(false);
      return;
    }

    const bone = findBoneByName(skeleton, selectedBoneName);
    if (!bone) {
      transformTargetRef.current = null;
      transformControlsRef.current?.detach();
      setTransformOwnerTelemetry(false);
      return;
    }
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
          if (transformControlsDraggingRef.current) {
            emitBoneTransformEdit('change', 'transform-controls', activeBone);
          }
        }
        if (activeSkeleton) {
          activeSkeleton.update();
        }
      });
      tc.addEventListener('dragging-changed', (event) => {
        if (isDraggingEvent(event)) {
          transformControlsDraggingRef.current = event.value;
          orbitRef.current.enabled = !event.value;
          setTransformOwnerTelemetry(!!transformTargetRef.current);
          emitBoneTransformEdit(event.value ? 'start' : 'end', 'transform-controls', transformTargetRef.current);
        }
      });
      try {
        scene.add(transformControlsAsObject3D(tc));
      } catch (e) {
        // Benign in some dev bundler scenarios with jsm controls + multiple three copies (dedupe helps but not always in Playwright workers).
        // The gizmo logic is still wired; in clean single-bundle runs (tauri build / prod) attach works.
        // Non-fatal: selection + marker + Inspector controls continue to provide transform UX.
        console.warn('[three] TransformControls scene.add skipped (likely three instance skew in dev server):', e);
      }
      transformControlsRef.current = tc;
    }

    try {
      tc.attach(bone);
      setTransformOwnerTelemetry(true);
    } catch (e) {
      // same benign skew case
    }
  }, [boneTransformOwner, selectedBoneName, skeleton]);

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
      restoreOriginalMaterials();
      disposeLegacyShaderMaterials();
      scene.remove(prev);
      disposeThreeObject(prev);
      attachedModelRef.current = null;
    }
    materialTextureBackupRef.current.clear();
    materialOpacityBackupRef.current.clear();
    materialTransparentBackupRef.current.clear();
    meshMaterialsRef.current.clear();
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
    captureTextureMaterials(root);
    rebuildSkinPointOverlays();
    if (!textureEnabled) {
      applyTextureEnabled(false);
    }
    applyShaderEnabled(shaderEnabled);
    applyModelOpacity(modelOpacity);

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
      helper.setOpacity(rigOpacity);
      helper.setThicknessScale(rigThicknessScale);
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
  }, [root, skeleton]);  // <-- ONLY scene objects; playback/clips handled by other effects to prevent re-attach loops on every edit/tick

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        data-testid="three-canvas"
        data-editor-mode={editorMode}
        data-viewport-layout={viewportLayout}
        data-wireframe-enabled={wireframeEnabled ? 'true' : 'false'}
        data-grid-enabled={gridEnabled ? 'true' : 'false'}
        data-axes-enabled={axesEnabled ? 'true' : 'false'}
        data-texture-enabled={textureEnabled ? 'true' : 'false'}
        data-shader-enabled={shaderEnabled ? 'true' : 'false'}
        data-shader-mode={shaderEnabled ? 'legacy-smf' : 'standard'}
        data-perspective-enabled={perspectiveEnabled ? 'true' : 'false'}
        data-bone-index-labels-enabled={boneIndexLabelsEnabled ? 'true' : 'false'}
        data-rig-opacity={rigOpacity}
        data-model-opacity={modelOpacity}
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

