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

test('H1: an early click survives replacing the host during a same-phase rerender', async () => {
  let firstHandler, nextHandler;
  let builds = 0;
  const early = { disabled: false, dataset: {},
    addEventListener(_type, handler) { firstHandler = handler; },
    click() { if (!this.disabled) firstHandler?.(); } };
  const next = { disabled: false, dataset: {},
    addEventListener(_type, handler) { nextHandler = handler; },
    click() { if (!this.disabled) nextHandler?.(); } };
  const bound = { disabled: false, click: () => { builds++; } };
  const oldHost = { isConnected: true, querySelector: () => early };
  const newHost = { isConnected: true, button: next,
    querySelector() { return this.button; } };
  let activeHost = oldHost;
  const root = { isConnected: true, querySelector: () => activeHost };
  let releaseOld, releaseNew;
  const oldGate = new Promise(resolve => { releaseOld = resolve; });
  const newGate = new Promise(resolve => { releaseNew = resolve; });
  const oldReady = armFirstXmlCiiPreviewBuild(root, async () => {
    await oldGate;
  });
  early.click();
  activeHost = newHost;
  oldHost.isConnected = false;
  const newReady = armFirstXmlCiiPreviewBuild(root, async () => {
    await newGate;
    newHost.button = bound;
  });
  releaseOld();
  await oldReady;
  assert.equal(builds, 0, 'obsolete host cannot consume queued click');
  releaseNew();
  await newReady;
  assert.equal(builds, 1, 'replacement host consumes the queued click once');
  // Mutation: storing the queue on host instead of root loses the click.
});

