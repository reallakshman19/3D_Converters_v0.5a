import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  XML_CII_PREVIEW_CACHE_KEY,
  XML_CII_PREVIEW_LEGACY_CACHE_KEY,
  capturePreviewCacheV7,
  createPreviewCacheAuthority,
  restorePreviewCacheV7,
  stablePreviewCacheStringify,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function legacyPayload(value = '150') {
  return {
    fp: `legacy:${value}`,
    data: {
      branchRows: [{ branchName: '/A/B1', rating: value }],
      nodeRows: [],
    },
    ts: 1,
  };
}

test('canonical authority is independent of object key insertion order', async () => {
  const left = await createPreviewCacheAuthority({
    xmlText: '<Root/>',
    stagedJsonText: '{}',
    config: { overrides: { rating: { B: '300', A: '150' } }, processDefaults: { t1: 10, p1: 20 } },
  });
  const right = await createPreviewCacheAuthority({
    xmlText: '<Root/>',
    stagedJsonText: '{}',
    config: { processDefaults: { p1: 20, t1: 10 }, overrides: { rating: { A: '150', B: '300' } } },
  });
  assert.equal(left.digest, right.digest);
  assert.equal(
    stablePreviewCacheStringify({ z: 1, a: 2 }),
    stablePreviewCacheStringify({ a: 2, z: 1 }),
  );
});

test('XML differences beyond the former 80-character sample invalidate authority', async () => {
  const prefix = '<Root>' + 'A'.repeat(120);
  const left = await createPreviewCacheAuthority({ xmlText: `${prefix}<Rating>150</Rating></Root>`, config: {} });
  const right = await createPreviewCacheAuthority({ xmlText: `${prefix}<Rating>900</Rating></Root>`, config: {} });
  assert.notEqual(left.digest, right.digest);
});

test('staged JSON changes invalidate authority even when XML and config are unchanged', async () => {
  const base = { xmlText: '<Root/>', config: { overrides: {} } };
  const left = await createPreviewCacheAuthority({ ...base, stagedJsonText: '{"DTXR":"300#"}' });
  const right = await createPreviewCacheAuthority({ ...base, stagedJsonText: '{"DTXR":"900#"}' });
  assert.notEqual(left.digest, right.digest);
});

test('override changes beyond the former 300-character truncation invalidate authority', async () => {
  const rating = {};
  for (let index = 0; index < 80; index += 1) rating[`LINE_${String(index).padStart(3, '0')}`] = '150';
  const changed = { ...rating, LINE_079: '900' };
  const left = await createPreviewCacheAuthority({ xmlText: '<Root/>', config: { overrides: { rating } } });
  const right = await createPreviewCacheAuthority({ xmlText: '<Root/>', config: { overrides: { rating: changed } } });
  assert.notEqual(left.digest, right.digest);
});

test('persisted Preview rows never restore without a fresh explicit build', async () => {
  const storage = new MemoryStorage();
  const authority = await createPreviewCacheAuthority({ xmlText: '<Rating>150</Rating>', config: {} });

  storage.setItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY, JSON.stringify(legacyPayload('150')));
  const fromBridge = capturePreviewCacheV7(authority, storage);
  assert.equal(fromBridge.stored, false);
  assert.equal(fromBridge.reason, 'explicit-preview-result-required');

  storage.setItem(XML_CII_PREVIEW_CACHE_KEY, JSON.stringify({
    schema: 'xml-cii-preview-cache/v8-rating-policy',
    authority,
    legacyPayload: legacyPayload('150'),
  }));
  assert.equal(restorePreviewCacheV7(authority, storage).restored, false);
  assert.equal(storage.getItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY), null);

  const fresh = capturePreviewCacheV7(authority, storage, undefined, {
    branchRows: [{ branchName: '/A/B1', rating: '900' }], nodeRows: [],
  });
  assert.equal(fresh.stored, true);
  assert.equal(JSON.parse(storage.getItem(XML_CII_PREVIEW_CACHE_KEY)).legacyPayload.data.branchRows[0].rating, '900');
  assert.equal(restorePreviewCacheV7(authority, storage).restored, false);
});

test('phase routing and internal rebuild capture use the cache v7 boundary', () => {
  const phasePanels = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js'), 'utf8');
  const facade = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-diagnostics-audit-v7.js'), 'utf8');

  assert.match(phasePanels, /xml-cii-adapted-preview-diagnostics-audit-v7\.js/);
  assert.match(renderer, /createPreviewCacheAuthority/);
  assert.doesNotMatch(renderer, /MutationObserver/);
  assert.match(renderer, /onPreviewCommitted/);
  assert.match(renderer, /capturePreviewCacheV7/);
  assert.match(renderer, /data-mc-preview-cache-evidence/);
  assert.match(facade, /clearPreviewCachesV7/);
  assert.match(facade, /resolveStagedJsonText/);
});
