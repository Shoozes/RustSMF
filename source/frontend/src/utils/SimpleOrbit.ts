import * as THREE from 'three';

/**
 * SimpleOrbit: self-contained orbit controls (yaw/pitch/distance) extracted for reuse.
 * Used by ThreeViewport. No React, pure event + math.
 * R reset, drag, wheel, basic touch.
 */
export class SimpleOrbit {
  yaw = 0.6;
  pitch = 0.4;
  distance = 4.5;
  target = new THREE.Vector3(0, 0.8, 0);

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  attach(canvas: HTMLCanvasElement, onChange: () => void) {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const onUp = () => { this.dragging = false; };
    const onMove = (e: MouseEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.yaw -= dx * 0.0035;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.0035));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      onChange();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.distance = Math.max(1.2, Math.min(18, this.distance + e.deltaY * 0.003));
      onChange();
    };
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch support (basic)
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.dragging = true;
        this.lastX = e.touches[0].clientX;
        this.lastY = e.touches[0].clientY;
      }
    });
    canvas.addEventListener('touchend', () => { this.dragging = false; });
    canvas.addEventListener('touchmove', (e) => {
      if (!this.dragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this.lastX;
      const dy = e.touches[0].clientY - this.lastY;
      this.yaw -= dx * 0.004;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.004));
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
      onChange();
    });
  }

  reset() {
    this.yaw = 0.6;
    this.pitch = 0.4;
    this.distance = 4.5;
  }

  getPosition(): THREE.Vector3 {
    const x = Math.cos(this.pitch) * Math.sin(this.yaw) * this.distance;
    const y = Math.sin(this.pitch) * this.distance;
    const z = Math.cos(this.pitch) * Math.cos(this.yaw) * this.distance;
    return new THREE.Vector3(x, y, z).add(this.target);
  }
}

export default SimpleOrbit;
