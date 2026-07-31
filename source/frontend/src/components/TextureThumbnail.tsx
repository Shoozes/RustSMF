import React, { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { drawTextureThumbnail } from '../utils/textureThumbnail';

interface TextureThumbnailProps {
  color: string;
  texture: THREE.Texture | null;
}

const TextureThumbnail: React.FC<TextureThumbnailProps> = ({ color, texture }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rendered = texture ? drawTextureThumbnail(canvas, texture) : false;
    canvas.dataset.previewKind = rendered ? 'texture' : 'color';
  }, [texture]);

  return (
    <canvas
      ref={canvasRef}
      className="outliner-color"
      width={32}
      height={24}
      style={{ backgroundColor: color }}
      data-preview-kind={texture ? 'pending' : 'color'}
      aria-hidden="true"
    />
  );
};

export default TextureThumbnail;
