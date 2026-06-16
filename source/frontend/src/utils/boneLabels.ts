import * as THREE from 'three';

/**
 * Creates a per-bone label Group containing a small AxesHelper (visual marker/glyph)
 * and a canvas-based name Sprite. Cheap, no extra deps, follows bone transforms when
 * attached as child. Used by ThreeViewport for the optional labels toggle.
 * Off-by-default for perf; caller manages attach/dispose.
 */
export function makeBoneLabel(text: string): THREE.Group {
  const group = new THREE.Group();
  (group as any).userData = { isBoneLabel: true };

  // Small AxesHelper for visual bone marker/glyph (advances editor affordances)
  const axes = new THREE.AxesHelper(0.08);
  (axes.material as any).depthTest = false;
  (axes.material as any).transparent = true;
  group.add(axes);

  // Canvas name sprite (cheap text label, no extra deps)
  const canvas = document.createElement('canvas');
  const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2); // polish for retina/quality, node-safe
  canvas.width = 256 * dpr; canvas.height = 48 * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#a5b4fc';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayText = text.length > 12 ? text.substring(0, 9) + '...' : text; // polish for long names
  ctx.fillText(displayText, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.6, 0.11, 1);
  spr.position.set(0, 0.18, 0); // above the axes
  group.add(spr);

  group.position.set(0, 0.05, 0);
  return group;
}
