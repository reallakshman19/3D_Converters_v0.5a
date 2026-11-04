import assert from 'node:assert/strict';
import test from 'node:test';
import {
  XML_CII_PREVIEW_CACHE_KEY,
  XML_CII_PREVIEW_LEGACY_CACHE_KEY,
  capturePreviewCacheV7,
  discardPreviewCacheV7,
  restorePreviewCacheV7,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js';
import {
  clearXmlCiiPreviewRatingSnapshot,
  readXmlCiiPreviewRatingSnapshot,
  resolveXmlCiiWeightMatchRating,
} from '../converters/xml-cii2019-core/preview-rating-snapshot.js';
import {
  getStoredJson,
  setStoredJson,
  saveMasterContextToLocalStorage,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js';

const authority = { digest: 'sha256:storage-test-current-build' };
const committed = {
  branchRows: [{ branchName: '/STORAGE/B1', lineKey: 'S1', rating: '900', sizeMm: 100 }],
  nodeRows: [{ branchName: '/STORAGE/B1', nodeId: 'N1' }],
};

async function withStorage(descriptor, fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
  try {
    clearXmlCiiPreviewRatingSnapshot();
    await fn();
  } finally {
    clearXmlCiiPreviewRatingSnapshot();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

function assertCurrentRating() {
  const snapshot = readXmlCiiPreviewRatingSnapshot();
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.records[0].rating, '900');
  assert.equal(resolveXmlCiiWeightMatchRating({ branchName: '/STORAGE/B1' }, { mode: 'preview' }).rating, '900');
}

test('unavailable localStorage cannot block fresh Preview rating or clearing', async () => {
  await withStorage({ get() { throw new Error('localStorage unavailable'); } }, () => {
    assert.doesNotThrow(() => discardPreviewCacheV7());
    assert.equal(getStoredJson('any', 'fallback'), 'fallback');
    assert.doesNotThrow(() => setStoredJson('any', { ok: true }));
    assert.doesNotThrow(() => saveMasterContextToLocalStorage({ config: {} }));
    assert.equal(restorePreviewCacheV7(authority).restored, false);
    const captured = capturePreviewCacheV7(authority, undefined, undefined, committed);
    assert.equal(captured.stored, false);
    assert.equal(captured.reason, 'persistence-disabled');
    assertCurrentRating();
  });
});

test('throwing getItem and malformed legacy JSON are never used to publish', async () => {
  const values = new Map([
    [XML_CII_PREVIEW_CACHE_KEY, '{invalid'],
    [XML_CII_PREVIEW_LEGACY_CACHE_KEY, '{invalid'],
  ]);
  let reads = 0;
  const storage = {
    getItem() { reads++; throw new Error('getItem blocked'); },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  await withStorage({ value: storage, writable: true }, () => {
    assert.equal(restorePreviewCacheV7(authority, storage).restored, false);
    assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 0);
    assert.equal(reads, 0, 'old envelope and bridge must never be read');
    const captured = capturePreviewCacheV7(authority, storage, undefined, committed);
    assert.equal(captured.stored, false);
    assert.equal(captured.reason, 'persistence-disabled');
    assert.equal(reads, 0);
    assertCurrentRating();
  });
});

test('QuotaExceededError storage is never written and current calculation remains usable', async () => {
  let writes = 0;
  const storage = {
    getItem() { throw new Error('getItem blocked'); },
    setItem() { writes++; const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e; },
    removeItem() {},
  };
  await withStorage({ value: storage, writable: true }, () => {
    const result = capturePreviewCacheV7(authority, storage, undefined, committed);
    assert.equal(result.stored, false);
    assert.equal(result.reason, 'persistence-disabled');
    assert.equal(writes, 0);
    assertCurrentRating();
  });
});

test('oversized Preview data is never persisted but remains current in memory', async () => {
  let writes = 0;
  const storage = {
    getItem() { return null; },
    setItem() { writes++; },
    removeItem() {},
  };
  await withStorage({ value: storage, writable: true }, () => {
    const result = capturePreviewCacheV7(authority, storage, 8, committed);
    assert.equal(result.stored, false);
    assert.equal(result.reason, 'persistence-disabled');
    assert.equal(writes, 0);
    assertCurrentRating();
  });
});

test('circular Preview rows remain current without optional envelope serialization', async () => {
  const cyclic = { branchName: '/STORAGE/B1', lineKey: 'S1', rating: '900' };
  cyclic.self = cyclic;
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  await withStorage({ value: storage, writable: true }, () => {
    const result = capturePreviewCacheV7(authority, storage, undefined, {
      branchRows: [cyclic], nodeRows: [],
    });
    assert.equal(result.stored, false);
    assert.equal(result.reason, 'persistence-disabled');
    assertCurrentRating();
  });
});
