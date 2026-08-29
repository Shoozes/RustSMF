import * as THREE from 'three';

interface BoneLabelOptions {
  scale?: number;
  showAxes?: boolean;
  maxCharacters?: number;
  backgroundColor?: string;
  textColor?: string;
  spriteWidth?: number;
  spriteHeight?: number;
  offsetY?: number;
}

interface BoneLabelState {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  maxCharacters: number;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
}

const boneLabelStates = new WeakMap<THREE.Object3D, BoneLabelState>();

function displayBoneLabelText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, Math.max(1, maxCharacters - 3))}...`;
}

function drawBoneLabel(label: THREE.Object3D, text: string): void {
  const state = boneLabelStates.get(label);
  if (!state) return;
  const { canvas, context, texture } = state;
  if (typeof context.clearRect === 'function') {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  context.fillStyle = state.backgroundColor;
  context.fillRect(0, 0, 256, 48);
  context.fillStyle = state.textColor;
  context.font = `bold ${state.fontSize}px monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(displayBoneLabelText(text, state.maxCharacters), 128, 24);
  texture.needsUpdate = true;
  label.userData.labelText = text;
}

/**
 * Creates a per-bone label Group containing a small AxesHelper (visual marker/glyph)
 * and a canvas-based name Sprite. Cheap, no extra deps, follows bone transforms when
 * attached as child. Used by ThreeViewport for the optional labels toggle.
 * Off-by-default for perf; caller manages attach/dispose.
 */
export function makeBoneLabel(text: string, options: BoneLabelOptions = {}): THREE.Group {
  const scale = Math.max(0.25, options.scale ?? 1);
  const group = new THREE.Group();
  group.userData = { isBoneLabel: true };

  if (options.showAxes !== false) {
    const axes = new THREE.AxesHelper(0.08 * scale);
    axes.material.depthTest = false;
    axes.material.transparent = true;
    group.add(axes);
  }

  const canvas = document.createElement('canvas');
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
  canvas.width = 256 * dpr; canvas.height = 48 * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set((options.spriteWidth ?? 0.6) * scale, (options.spriteHeight ?? 0.11) * scale, 1);
  spr.position.set(0, (options.offsetY ?? 0.18) * scale, 0);
  group.add(spr);

  boneLabelStates.set(group, {
    canvas,
    context: ctx,
    texture: tex,
    maxCharacters: Math.max(4, options.maxCharacters ?? 12),
    backgroundColor: options.backgroundColor ?? 'rgba(0,0,0,0.75)',
    textColor: options.textColor ?? '#a5b4fc',
    fontSize: Math.round(20 * scale),
  });
  drawBoneLabel(group, text);

  group.position.set(0, 0.05 * scale, 0);
  return group;
}

export function updateBoneLabelText(label: THREE.Object3D, text: string): void {
  drawBoneLabel(label, text);
}
