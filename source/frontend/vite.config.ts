import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const THREE_VENDOR_PATTERNS = [
  '/node_modules/three/',
  '/node_modules/three-stdlib/',
  '/node_modules/three/examples/jsm/'
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'three']
  },
  optimizeDeps: {
    include: ['three', 'three/examples/jsm/controls/TransformControls']
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (THREE_VENDOR_PATTERNS.some(p => normalized.includes(p))) {
            return 'three-vendor';
          }
          if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/')) {
            return 'react-vendor';
          }
          if (normalized.includes('/node_modules/@tauri-apps/')) {
            return 'tauri-vendor';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
