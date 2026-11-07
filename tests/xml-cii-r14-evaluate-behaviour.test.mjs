import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate } from './xml-cii-workflow-popup-browser.mjs';

test('H3/G3c: CDP evaluation waits for actual origin before executing an import', async () => {
  const origin = 'http://127.0.0.1:45678';
  const states = [
    { origin: 'null', href: 'about:blank', ready: 'complete', hasBody: true },
    { origin, href: origin + '/', ready: 'loading', hasBody: true },
    { origin, href: origin + '/', ready: 'complete', hasBody: true },
  ];
  let checks = 0, imported = 0;
  const result = await evaluate('fake-ws', 'import-real-app()', origin, {
    pause: async () => {},
    readOnce: async (_socket, expression) => {
      if (expression.startsWith('JSON.stringify(')) return JSON.stringify(states[checks++]);
      imported++;
      if (checks < 3) throw new TypeError("Failed to construct 'URL': Invalid URL");
      return 'app module imported';
    },
  });
  assert.equal(result, 'app module imported');
  assert.equal(checks, 3, 'about:blank and loading document must be rejected');
  assert.equal(imported, 1, 'import evaluated only after origin barrier');
  // Mutation: bypassing waitForAppOrigin fails with Invalid URL and zero checks.
});
