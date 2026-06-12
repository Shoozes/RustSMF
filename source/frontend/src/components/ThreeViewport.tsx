import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SimpleOrbit } from '../utils/SimpleOrbit';
import { disposeThreeObject } from '../utils/threeDisposal';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// Self-contained ThreeViewport.
// Owns: renderer, scene (base lights+grid+axes), camera, SimpleOrbit controls, RAF loop, model attach,
// SkeletonHelper, AnimationMixer + action management, time reporting.
// Receives declarative props from App (or future store) for the loaded model and playback intent.
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef(new SimpleOrbit());
  const frameRef = useRef<number | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const clockRef = useRef(new THREE.Clock());

  // TransformControls for selected bone (Cycle 3 editor polish). Attached to the live THREE.Bone when selectedBoneName changes.
  // Change events mutate the bone in place (position/rot/scale); works with existing marker + Inspector controls + RAF.
  const transformControlsRef = useRef<TransformControls | null>(null);

  // Local mixer + action owned here (viewport is the source of truth for three playback)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const attachedModelRef = useRef<THREE.Object3D | null>(null);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);

  // For raycast bone picking (3D click-to-select complementing Inspector list)
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const onSelectBoneRef = useRef(onSelectBone);
  const skeletonRefForPick = useRef(skeleton);

  // For selected bone 3D highlight marker (visual feedback when list or raycast selects a bone)
  const selectedBoneNameRef = useRef(selectedBoneName);
  const boneHighlightRef = useRef<THREE.Object3D | null>(null);

  // Ref for onTimeUpdate to decouple RAF reporting from setup effect deps (timing/robustness: avoids re-init of scene/RAF if fn identity ever shifts; mirrors bone pick ref pattern)
  const onTimeUpdateRef = useRef(onTimeUpdate);

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

    const orbit = orbitRef.current;
    const updateCamera = () => {
      camera.position.copy(orbit.getPosition());
      camera.lookAt(orbit.target);
      camera.updateMatrixWorld();
    };
    updateCamera();
    orbit.attach(canvas, updateCamera);

    // Internal key handler for view reset (R) + Cycle 3 gizmo modes (T=translate, R=rotate, S=scale when bone selected/gizmo attached).
    // Modes take precedence on 'r' for editor UX when active. Space handled by App.
    const onKey = (e: KeyboardEvent) => {
      const tc = transformControlsRef.current;
      if (tc) {
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

    // Raycast-based bone selection on canvas click (non-drag clicks).
    // Complements list selection in Inspector. Uses bone world positions + ray distance.
    // Threshold in world units; works for typical rigged models. No scene mods.
    const onCanvasClick = (event: MouseEvent) => {
      const cb = onSelectBoneRef.current;
      const skel = skeletonRefForPick.current;
      const cam = cameraRef.current;
      if (!cb || !skel || !cam || !sceneRef.current) return;
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cam);
      let closest: any = null;
      let minDist = Infinity;
      const maxDist = 1.5; // tuned for typical model scale; increase for distant clicks
      skel.bones.forEach((bone: any) => {
        if (!bone) return;
        const pos = bone.getWorldPosition(new THREE.Vector3());
        const dist = raycasterRef.current.ray.distanceToPoint(pos);
        if (dist < minDist && dist < maxDist) {
          minDist = dist;
          closest = bone;
        }
      });
      if (closest && closest.name) {
        cb(closest.name);
      }
    };
    canvas.addEventListener('click', onCanvasClick);

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

      // keep bone highlight marker following the (possibly animated) selected bone
      const hl = boneHighlightRef.current;
      const skel = skeletonRefForPick.current;
      const sel = selectedBoneNameRef.current;
      if (hl && skel && sel) {
        const bone = skel.bones.find((b: any) => b.name === sel);
        if (bone) {
          const wp = new THREE.Vector3();
          bone.getWorldPosition(wp);
          hl.position.copy(wp);
        }
      }

      renderer.render(scene, camera);
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
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    resizeObsRef.current = ro;
    setTimeout(onResize, 50);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      resizeObsRef.current?.disconnect();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('click', onCanvasClick);
      if (boneHighlightRef.current) {
        scene.remove(boneHighlightRef.current);
        boneHighlightRef.current = null;
      }
      renderer.dispose();
    };
    // Note: intentionally no deps on playback props; RAF always runs, control via effects below.
    // onTimeUpdate (and onSelectBone/skeleton) kept via refs to avoid re-creating renderer/scene/RAF/ listeners on every parent render.
  }, []);

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
      const tc = transformControlsRef.current;
      const scene = sceneRef.current;
      if (tc) {
        tc.detach();
        if (scene) scene.remove(tc);
        tc.dispose?.();
        transformControlsRef.current = null;
      }
    };
  }, []);
  // Sync onTimeUpdate ref (for stable RAF time reporting without setup effect re-runs)
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  // Sync selected bone name ref (for animate loop + highlight without stale closures)
  useEffect(() => { selectedBoneNameRef.current = selectedBoneName; }, [selectedBoneName]);

  // Bone selection 3D highlight marker (small sphere+axes that follows the selected bone's world position).
  // Provides visual editor feedback (clickable list or raycast selection now "lights up" in viewport).
  // Reuses existing skeleton/bone refs; cheap, no skin affect.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // remove old marker
    if (boneHighlightRef.current) {
      scene.remove(boneHighlightRef.current);
      boneHighlightRef.current = null;
    }
    if (!selectedBoneName || !skeleton) return;

    const bone = skeleton.bones.find((b: any) => b.name === selectedBoneName);
    if (!bone) return;

    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.08),
      new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.85 })
    );
    group.add(sphere);
    const axes = new THREE.AxesHelper(0.25);
    (axes.material as any).depthTest = false;
    group.add(axes);
    scene.add(group);
    boneHighlightRef.current = group;

    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp);
    group.position.copy(wp);
  }, [selectedBoneName, skeleton]);

  // Weight preview viz for selected bone (Cycle 3 rigging polish follow-up).
  // Simple per-bone influence viz using existing skin attrs (from SMF/GLB/FBX loaders).
  // Colors: blue (0 influence) to red (full weight on selected bone).
  // Toggles cleanly; restores original vertex colors when disabled.
  // Uses attached root for skinned meshes; non-destructive to skinning/anim.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const restoreMeshes = () => {
      const meshes: any[] = [];
      if (attachedModelRef.current) {
        attachedModelRef.current.traverse((obj: any) => {
          if (obj.isSkinnedMesh) meshes.push(obj);
        });
      }
      meshes.forEach((mesh) => {
        const geo = mesh.geometry;
        if (!geo) return;
        const orig = (mesh as any)._origColorAttr;
        if (orig) {
          geo.setAttribute('color', orig);
          delete (mesh as any)._origColorAttr;
        } else if (geo.attributes.color) {
          geo.deleteAttribute('color');
        }
        if (mesh.material) {
          (mesh.material as any).vertexColors = false;
          (mesh.material as any).needsUpdate = true;
        }
      });
    };

    if (!weightPreviewEnabled || !selectedBoneName || !skeleton) {
      restoreMeshes();
      return;
    }

    const boneIndex = skeleton.bones.findIndex((b: any) => b.name === selectedBoneName);
    if (boneIndex < 0) {
      restoreMeshes();
      return;
    }

    const meshes: any[] = [];
    if (attachedModelRef.current) {
      attachedModelRef.current.traverse((obj: any) => {
        if (obj.isSkinnedMesh) meshes.push(obj);
      });
    }

    meshes.forEach((mesh) => {
      const geo = mesh.geometry;
      if (!geo) return;
      const posAttr = geo.attributes.position;
      if (!posAttr) return;
      const count = posAttr.count;
      const skinIndices = geo.attributes.skinIndex?.array as any;
      const skinWeights = geo.attributes.skinWeight?.array as any;
      if (!skinIndices || !skinWeights) return;

      // backup original color once per mesh
      if (!(mesh as any)._origColorAttr && geo.attributes.color) {
        (mesh as any)._origColorAttr = geo.attributes.color.clone();
      }

      const colors = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        let w = 0;
        for (let i = 0; i < 4; i++) {
          const idx = skinIndices[v * 4 + i];
          if (idx === boneIndex) {
            w = Math.max(w, skinWeights[v * 4 + i]);
          }
        }
        // blue (low) -> red (high)
        colors[v * 3 + 0] = w;     // r
        colors[v * 3 + 1] = 0;     // g
        colors[v * 3 + 2] = 1 - w; // b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (mesh.material) {
        (mesh.material as any).vertexColors = true;
        (mesh.material as any).needsUpdate = true;
      }
    });
  }, [weightPreviewEnabled, selectedBoneName, skeleton]);

  // Apply transform mode from prop (for UI buttons) or default.
  // useEffect to react to prop changes and set on tc.
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (tc && transformMode) {
      tc.setMode(transformMode);
    }
  }, [transformMode]);

  // Cycle 3: Transform gizmo for selected bone (basic rigging polish).
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
      return;
    }

    const bone = skeleton.bones.find((b: any) => b.name === selectedBoneName);
    if (!bone) return;

    let tc = transformControlsRef.current;
    if (!tc) {
      tc = new TransformControls(cam, dom);
      tc.setMode(transformMode || 'translate'); // controlled by prop from Inspector buttons (or default)
      tc.addEventListener('change', () => {
        // Ensure world matrices propagate for skinning + marker follow
        bone.updateMatrixWorld(true);
        if (skeleton) {
          skeleton.update();
        }
      });
      tc.addEventListener('dragging-changed', (event: any) => {
        const o = orbitRef.current as any;
        if (o && 'enabled' in o) {
          o.enabled = !event.value;
        }
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
      // cleared
      return;
    }

    // Attach the provided root directly (loaders produce unbound-to-scene instances; preserve skin binds)
    // Avoid clone here to keep skeleton bone refs and skinning correct.
    scene.add(root);
    attachedModelRef.current = root;

    // SkeletonHelper for rig viz (use provided skeleton if any)
    if (skeleton) {
      const helper = new THREE.SkeletonHelper(root);
      (helper.material as THREE.LineBasicMaterial).linewidth = 2;
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

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} data-testid="three-canvas" />;
};

export default ThreeViewport;