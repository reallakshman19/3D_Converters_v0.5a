import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { clearPreviewCachesV7, discardPreviewCacheV7 } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js';

class MapStorage {
  constructor() {
    this.values = new Map();
    this.writes = [];
  }
  getItem(k) { return this.values.get(k) ?? null; }
  setItem(k, v) { this.writes.push(k); this.values.set(k, String(v)); }
  removeItem(k) { this.values.delete(k); }
}

test('F2 popup Step 4 is routed to adapted v7 Build/Rebuild rather than v5', async () => {
  const src = await readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');
  assert.match(src, /xmlCiiBuildAndRenderPreview as xmlCiiBuildAndRenderPreviewV7/);
  assert.match(src, /xmlCiiRenderPreviewPhase as xmlCiiRenderPreviewPhaseV7/);
  assert.match(src, /phaseId === 'preview'\) html = xmlCiiRenderPreviewPhaseV7/);
  assert.match(src, /phaseId === 'preview'\) void armFirstXmlCiiPreviewBuild\(target,/);
  assert.match(src, /await xmlCiiBuildAndRenderPreviewV7\(target, xmlText, config,/);
  assert.doesNotMatch(src, /phaseId === 'preview'\) html = xmlCiiRenderPreviewPhase\(proxyRoot\)/);
  assert.doesNotMatch(src, /phaseId === 'preview'\) bindXmlCiiPreviewPhase\(target\)/);
});

test('F2 v7 cleanup removes v5 and leaves no Preview storage after Build', () => {
  const storage = new MapStorage();
  for (const key of ['xml-cii-pv-cache-v5', 'xml-cii-pv-cache-v7',
    'xml-cii-pv-cache-v8-dtxr', 'xml-cii-pv-cache-v8-rating-policy']) {
    storage.setItem(key, JSON.stringify({ fp: 'stale', data: { branchRows: [{ rating: 'OLD' }] } }));
  }
  storage.writes.length = 0;
  discardPreviewCacheV7(storage);
  for (const key of ['xml-cii-pv-cache-v5', 'xml-cii-pv-cache-v7',
    'xml-cii-pv-cache-v8-dtxr', 'xml-cii-pv-cache-v8-rating-policy']) {
    assert.equal(storage.getItem(key), null, key + ' must be absent after Build');
  }
  assert.deepEqual(storage.writes, [], 'cleanup must never persist a Preview payload');
  storage.setItem('xml-cii-pv-cache-v5', 'older browser visit');
  clearPreviewCachesV7(storage);
  assert.equal(storage.getItem('xml-cii-pv-cache-v5'), null);
});
