import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForAppOrigin } from './xml-cii-workflow-popup-browser.mjs';

test('G3: a complete about:blank page is not ready to import /tabs modules', async () => {
  const origin = 'http://127.0.0.1:49371';
  const states = [
    { origin: 'null', href: 'about:blank', ready: 'complete', hasBody: true },
    { origin: 'http://localhost:1234', href: 'http://localhost:1234/', ready: 'complete', hasBody: true },
    { origin, href: origin + '/', ready: 'loading', hasBody: true },
    { origin, href: origin + '/', ready: 'complete', hasBody: false },
    { origin, href: origin + '/', ready: 'complete', hasBody: true },
  ];
  let calls = 0;
  const ready = await waitForAppOrigin(async () => states[calls++], origin,
    { attempts: 6, pause: async () => {} });
  assert.equal(calls, 5, 'must wait for origin, complete document and body');
  assert.equal(new URL('/tabs/model-converters/ModelConvertersTab.js', ready.href).origin, origin);
  // Behavior mutant: the old readyState-only check returns on about:blank
  // and the next new URL(...) throws Invalid URL.
});

test('G3: wrong-origin Chrome document fails closed', async () => {
  await assert.rejects(() => waitForAppOrigin(async () => ({
    origin: 'null', href: 'about:blank', ready: 'complete', hasBody: true,
  }), 'http://127.0.0.1:49371', {
    attempts: 2, pause: async () => {},
  }), /app origin never became ready/);
});
