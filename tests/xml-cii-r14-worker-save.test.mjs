import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareStoredStatePayload, saveStoredState, loadStoredState,
  stageXmlCiiFetchedRatings, clearXmlCiiFetchedRatingsJournal,
} from '../tabs/model-converters/core/config-store.js';

test('H2: worker-prepared payload matches synchronous storage, retains Owner masters and excludes reproducible defaults', () => {
  const config = {
    linelist: { masterRows: [{ lineNo: 'L1' }] },
    pipingClass: { masterRows: [{ pipingClass: 'P4110001' }] },
    material: { _autoloadedRows: 383, _autoloadedFrom: 'default-url',
      mapRows: Array.from({ length: 383 }, (_, i) => ({ id: i, padding: 'M'.repeat(500) })) },
    weight: { _autoloadedRows: 1595, _autoloadedFrom: 'default-url',
      masterRows: Array.from({ length: 1595 }, (_, i) => ({ id: i, padding: 'W'.repeat(500) })) },
    overrides: { rating: { B1: '900' } },
  };
  const defaults = { xml_to_cii: { supportConfigJson: JSON.stringify(config) },
    other: { enabled: true } };
  const prepared = prepareStoredStatePayload('xml_to_cii', defaults);
  const writes = [];
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    setItem(key, payload) { writes.push({ key, payload }); },
    getItem() { return null; },
  } };
  try {
    const result = saveStoredState('xml_to_cii', defaults);
    assert.equal(result, prepared.status);
    assert.equal(writes[0].payload, prepared.payload, 'worker and main must serialize identical storage bytes');
    const stored = JSON.parse(JSON.parse(prepared.payload).defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.deepEqual(stored.linelist.masterRows, config.linelist.masterRows);
    assert.deepEqual(stored.pipingClass.masterRows, config.pipingClass.masterRows);
    assert.deepEqual(stored.material.mapRows, []);
    assert.deepEqual(stored.weight.masterRows, []);
    assert.ok(Buffer.byteLength(prepared.payload) < 1_000_000);
  } finally { globalThis.window = previous; }
  // Mutation: unconditional Owner-master stripping or unbounded worker payload fails parity.
});

test('H2: a reload before deferred worker completion replays the rating journal', () => {
  const disk = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: key => disk.get(key) || null,
    setItem: (key, v) => disk.set(key, v),
    removeItem: key => disk.delete(key),
  } };
  try {
    const saved = { linelist: { masterRows: [{ lineNo: 'L1' }] },
      overrides: { rating: { B1: '150' } } };
    saveStoredState('xml_to_cii', { xml_to_cii: { supportConfigJson: JSON.stringify(saved) } });
    stageXmlCiiFetchedRatings({ rating: { B1: '900' }, __dtxrRatingKeys: { B1: true } });
    const restored = JSON.parse(loadStoredState().defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.equal(restored.overrides.rating.B1, '900');
    assert.equal(restored.overrides.__dtxrRatingKeys.B1, true);
    assert.deepEqual(restored.linelist.masterRows, saved.linelist.masterRows);
    clearXmlCiiFetchedRatingsJournal();
    const after = JSON.parse(loadStoredState().defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.equal(after.overrides.rating.B1, '150');
  } finally { globalThis.window = previous; }
});
