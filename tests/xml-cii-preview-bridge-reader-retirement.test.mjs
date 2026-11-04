import assert from 'node:assert/strict';
import test from 'node:test';
import { invalidatePreviewCaches } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-diagnostics-audit.js';

const OLD_KEY = 'xml-cii-pv-cache-v8-dtxr';
const ENVELOPE_KEY = 'xml-cii-pv-cache-v8-rating-policy';
const OLD_RESULT = JSON.stringify({ data: { branchRows: [{ branchName: '/STALE/B1', rating: '900' }] } });

async function withStorage(callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([
    [OLD_KEY, OLD_RESULT],
    [ENVELOPE_KEY, OLD_RESULT],
    ['xml-cii-wm-cache-v1', 'prior-weight-cache'],
  ]);
  const calls = { reads: [], writes: [], deletes: [] };
  const storage = {
    getItem(key) { calls.reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { calls.writes.push(key); values.set(key, String(value)); },
    removeItem(key) { calls.deletes.push(key); values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { await callback({ calls, values }); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

test('R4 dryrun reader retirement: importing strict-line authority never consumes or deletes old Preview rows', async () => {
  await withStorage(async ({ calls, values }) => {
    // Query-qualified import executes the real production module initialization
    // even if another test imported its unqualified module earlier.
    const preview = await import('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js?r4-no-bridge-read');
    assert.equal(typeof preview.xmlCiiDryRunPreview, 'function');
    assert.deepEqual(calls.reads, [], 'strict-line import may not consult the obsolete bridge or cache marker');
    assert.deepEqual(calls.deletes, [], 'strict-line import must preserve existing persisted Preview data');
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
    assert.equal(values.get(ENVELOPE_KEY), OLD_RESULT);
  });
});

test('R4 diagnostics reader retirement: config-save invalidation does not read or delete old Preview rows', async () => {
  await withStorage(async ({ calls, values }) => {
    invalidatePreviewCaches();
    assert.deepEqual(calls.reads, [], 'config save must not read obsolete engineering results');
    assert.deepEqual(calls.deletes, ['xml-cii-wm-cache-v1'], 'existing Weight Match invalidation remains intact');
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
    assert.equal(values.get(ENVELOPE_KEY), OLD_RESULT);
  });
});
