import assert from 'node:assert/strict';
import test from 'node:test';
import { armFirstXmlCiiPreviewBuild } from '../tabs/model-converters/workflow/preview-first-click.js';

test('H1: clicking the first visible Build before async initialization replays once on the bound button', async () => {
  let firstHandler;
  let builds = 0;
  const original = {
    dataset: {}, disabled: false,
    addEventListener(type, handler) {
      assert.equal(type, 'click');
      firstHandler = handler;
    },
    click() { if (!this.disabled) firstHandler?.(); },
  };
  const bound = { disabled: false, click() { builds++; } };
  const host = {
    isConnected: true, button: original,
    querySelector(selector) {
      assert.equal(selector, '[data-mc-preview-build]');
      return this.button;
    },
  };
  const root = { isConnected: true,
    querySelector(selector) {
      assert.equal(selector, '#mc-preview-table-host');
      return host;
    },
  };
  let ready;
  const delayedInitialization = new Promise(resolve => { ready = resolve; });
  const handoff = armFirstXmlCiiPreviewBuild(root, async () => {
    await delayedInitialization;
    host.button = bound;
  });
  original.click(); // First possible click; no production listener yet
  assert.equal(original.disabled, true, 'first click must be captured, not lost');
  assert.equal(builds, 0);
  original.click(); // duplicate while initializing
  ready();
  await handoff;
  assert.equal(builds, 1, 'exactly one real Build after source/handler readiness');
  // Mutation: removing the early listener or failing to replay makes this RED.
});

test('H1: an obsolete/disconnected first-visit host cannot build after navigation', async () => {
  let listener;
  const original = { dataset: {}, disabled: false,
    addEventListener(_name, cb) { listener = cb; }, click() { listener?.(); } };
  let builds = 0;
  const host = { isConnected: true, button: original,
    querySelector: () => host.button };
  const root = { isConnected: true, querySelector: () => host };
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  const ready = armFirstXmlCiiPreviewBuild(root, async () => {
    await promise;
    host.button = { disabled: false, click: () => builds++ };
  });
  original.click();
  root.isConnected = false;
  release();
  await ready;
  assert.equal(builds, 0, 'old click must not affect a different popup visit');
});
