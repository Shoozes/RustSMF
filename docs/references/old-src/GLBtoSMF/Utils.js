import * as THREE from 'three';
import { DebugLogger } from './DebugLogger.js';

// Store logged messages to prevent duplicates
const loggedMessages = new Set();

export const Utils = {
  // Execute a function with error handling
  executeWithErrorHandling(fn, startMessage, errorMessage, defaultReturn = null, cleanup = () => {}) {
    try {
      if (startMessage) DebugLogger.log(startMessage);
      const result = fn();
      return result !== undefined ? result : defaultReturn;
    } catch (err) {
      const fullMessage = `${errorMessage}: ${err.message}`;
      if (!loggedMessages.has(fullMessage)) {
        DebugLogger.error(fullMessage);
        loggedMessages.add(fullMessage);
      }
      return defaultReturn;
    } finally {
      cleanup();
    }
  },

  // Update matrixWorld for an object
  updateMatrixWorld(obj) {
    if (obj && typeof obj.updateMatrixWorld === 'function') {
      obj.updateMatrixWorld(true);
    }
  },

  // Reset position, rotation, and scale of an object
  resetTransform(obj) {
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.updateMatrix();
  },

  // Check for circular references in a scene graph
  checkForCircularReferences(obj, parent = null, visited = new Set()) {
    if (obj.parent === obj) {
      return true;
    }
    visited.add(obj);
    return obj.children.some(child => !visited.has(child) && this.checkForCircularReferences(child, obj, visited));
  },

  // Download a blob as a file
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
};
