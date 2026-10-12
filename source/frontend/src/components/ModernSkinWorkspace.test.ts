import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModernSkinState } from './ModernSkinWorkspace';

test('clean Skin state adds no permanent notice', () => {
  assert.equal(renderToStaticMarkup(createElement(ModernSkinState, { dirty: false, blockReason: null })), '');
});

test('unsaved Skin state has a visible live notice', () => {
  const markup = renderToStaticMarkup(createElement(ModernSkinState, { dirty: true, blockReason: null }));
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Unsaved weights/);
  assert.doesNotMatch(markup, /role="alert"/);
});

test('Skin export blocks remain alerts alongside unsaved state', () => {
  const markup = renderToStaticMarkup(createElement(ModernSkinState, { dirty: true, blockReason: 'Normalize invalid influences before export.' }));
  assert.match(markup, /Unsaved weights/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Normalize invalid influences before export\./);
});
