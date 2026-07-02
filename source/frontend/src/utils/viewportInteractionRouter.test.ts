import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolvePointerClickOwner,
  resolvePointerDownOwner,
  type ViewportInteractionContext,
  type ViewportInteractionOwner,
  type ViewportPointerDownSnapshot,
} from './viewportInteractionRouter';

const baseContext: ViewportInteractionContext = {
  editorMode: 'view',
  button: 0,
  hasModel: true,
  hasSkeleton: true,
  hasSelectedBone: false,
  isPrecisionMode: false,
  isPickingViewport: true,
  hitEndpointHandle: false,
};

const owner = (override: Partial<ViewportInteractionContext>): ViewportInteractionOwner => {
  return resolvePointerDownOwner({ ...baseContext, ...override });
};

describe('viewportInteractionRouter', () => {
  it('rejects non-model and non-picking viewport events', () => {
    assert.equal(owner({ hasModel: false }), 'none');
    assert.equal(owner({ isPickingViewport: false }), 'none');
  });

  it('routes non-left buttons to orbit in editable viewports', () => {
    assert.equal(owner({ button: 2, editorMode: 'rig' }), 'orbit');
  });

  it('routes model workspace clicks to model selection', () => {
    assert.equal(owner({ editorMode: 'view' }), 'model-select');
  });

  it('routes rig clicks by endpoint hit before bone selection', () => {
    assert.equal(owner({ editorMode: 'rig', isPrecisionMode: true, hitEndpointHandle: true }), 'rig-endpoint-drag');
    assert.equal(owner({ editorMode: 'rig', isPrecisionMode: false, hitEndpointHandle: true }), 'rig-select');
    assert.equal(owner({ editorMode: 'rig', hasSkeleton: false }), 'none');
  });

  it('routes skin clicks to paint only when a bone is selected', () => {
    assert.equal(owner({ editorMode: 'skin', hasSelectedBone: true }), 'skin-paint');
    assert.equal(owner({ editorMode: 'skin', hasSelectedBone: false }), 'rig-select');
  });

  it('routes animate pointer-downs to selection; TransformControls owns drag events separately', () => {
    assert.equal(owner({ editorMode: 'animate' }), 'animate-select');
    assert.equal(owner({ editorMode: 'animate', hasSkeleton: false }), 'none');
  });

  it('keeps export workspace read-only for left clicks', () => {
    assert.equal(owner({ editorMode: 'export' }), 'none');
  });

  it('accepts only short left-button releases inside the picking viewport as clicks', () => {
    const down: ViewportPointerDownSnapshot = {
      x: 100,
      y: 120,
      time: 1000,
      button: 0,
      owner: 'rig-select',
    };

    assert.equal(resolvePointerClickOwner(down, {
      x: 104,
      y: 123,
      time: 1120,
      button: 0,
      isPickingViewport: true,
    }), 'rig-select');

    assert.equal(resolvePointerClickOwner(down, {
      x: 107,
      y: 120,
      time: 1120,
      button: 0,
      isPickingViewport: true,
    }), null);

    assert.equal(resolvePointerClickOwner(down, {
      x: 100,
      y: 120,
      time: 1400,
      button: 0,
      isPickingViewport: true,
    }), null);

    assert.equal(resolvePointerClickOwner(down, {
      x: 100,
      y: 120,
      time: 1120,
      button: 0,
      isPickingViewport: false,
    }), null);

    assert.equal(resolvePointerClickOwner(down, {
      x: 100,
      y: 120,
      time: 1120,
      button: 2,
      isPickingViewport: true,
    }), null);
  });
});
