import * as THREE from 'three';

type OrbitEventFilter = (x: number, y: number, button?: number) => boolean;

/**
 * SimpleOrbit: self-contained orbit controls (yaw/pitch/distance) extracted for reuse.
 * Used by ThreeViewport. No React, pure event + math.
 * R reset, drag, wheel, basic touch.
 */
export class SimpleOrbit {
  enabled = true;
  yaw = 0.6;
  pitch = 0.4;
  distance = 4.5;
  target = new THREE.Vector3(0, 0.8, 0);

  private dragging = false;
  private dragButton = 0;
  private lastX = 0;
  private lastY = 0;

  attach(
    canvas: HTMLCanvasElement,
    onChange: () => void,
    shouldHandle: OrbitEventFilter = () => true,
  ): () => void {
    const onDown = (e: MouseEvent) => {
      if (!this.enabled || !shouldHandle(e.clientX, e.clientY, e.button)) return;
      this.dragging = true;
      this.dragButton = e.button;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const onUp = () => { this.dragging = false; };
    const onMove = (e: MouseEvent) => {
      if (!this.enabled || !this.dragging || !shouldHandle(e.clientX, e.clientY, this.dragButton)) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (this.dragButton === 2) {
        // right-drag pan (target move)
        const factor = this.distance * 0.002;
        const c = Math.cos(this.yaw);
        const s = Math.sin(this.yaw);
        this.target.x += dx * factor * c;
        this.target.z += dx * factor * s;
        this.target.y -= dy * factor;
      } else {
        this.yaw -= dx * 0.0035;
        this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.0035));
      }
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      onChange();
    };
    const onWheel = (e: WheelEvent) => {
      if (!this.enabled || !shouldHandle(e.clientX, e.clientY)) return;
      e.preventDefault();
      this.distance = Math.max(1.2, Math.min(18, this.distance + e.deltaY * 0.003));
      onChange();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    // Touch support (basic)
    const onTouchStart = (e: TouchEvent) => {
      if (!this.enabled) return;
      if (e.touches.length !== 1) return;
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      if (!shouldHandle(tx, ty, 0)) return;
      this.dragging = true;
      this.dragButton = 0;
      this.lastX = tx;
      this.lastY = ty;
    };
    const onTouchEnd = () => { this.dragging = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!this.enabled || !this.dragging || e.touches.length !== 1) return;
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      if (!shouldHandle(tx, ty, 0)) return;
      const dx = e.touches[0].clientX - this.lastX;
      const dy = e.touches[0].clientY - this.lastY;
      this.yaw -= dx * 0.004;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.004));
      this.lastX = tx;
      this.lastY = ty;
      onChange();
    };
    canvas.addEventListener('touchstart', onTouchStart);
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchmove', onTouchMove);

    return () => {
      this.dragging = false;
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
  }

  reset() {
    this.yaw = 0.6;
    this.pitch = 0.4;
    this.distance = 4.5;
    this.target.set(0, 0.8, 0);
  }

  getPosition(): THREE.Vector3 {
    const x = Math.cos(this.pitch) * Math.sin(this.yaw) * this.distance;
    const y = Math.sin(this.pitch) * this.distance;
    const z = Math.cos(this.pitch) * Math.cos(this.yaw) * this.distance;
    return new THREE.Vector3(x, y, z).add(this.target);
  }
}

export default SimpleOrbit;
