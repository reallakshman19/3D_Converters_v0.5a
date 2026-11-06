import test from 'node:test';
import assert from 'node:assert/strict';
import { saveStoredState } from '../tabs/model-converters/core/config-store.js';

function captureWrites() {
  const entries = [];
  const storage = {
    setItem(key, value) {
      const bytes = Buffer.byteLength(value, 'utf8');
      entries.push({ key, bytes, value });
      if (bytes > 1_000_000) throw new Error('localStorage write exceeds budget');
    },
    getItem(key) { return entries.find((row) => row.key === key)?.value ?? null; },
  };
  return { entries, storage };
}
function fullConfig() {
  return {
    linelist: { fieldMap: { material: 'Material' }, masterRows: Array.from({ length: 1800 }, (_, i) =>
      ({ row: i, material: 'DSS', payload: 'L'.repeat(1600) })) },
    pipingClass: { fieldMap: {}, masterRows: Array.from({ length: 800 }, (_, i) =>
      ({ row: i, rating: 150, payload: 'P'.repeat(1600) })) },
    weight: { masterRows: [{ payload: 'W'.repeat(30000) }] },
    material: { mapRows: [{ payload: 'M'.repeat(30000) }] },
    overrides: { rating: { B6: '150' } },
    pipingClassMaterialCodeMap: { enabled: true, rows: [{ pipingClass: '91261', materialCode: '106', confidence: 90 }] },
  };
}

test('R10 P1: large live master config never attempts a >1MB browser storage write', () => {
  const config = fullConfig();
  const before = JSON.stringify(config);
  const defaults = { xml_to_cii: { supportConfigJson: before }, other: { enabled: true } };
  const { entries, storage } = captureWrites();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    assert.equal(saveStoredState('xml_to_cii', defaults), 'trimmed');
    assert.equal(entries.length, 1, 'must not attempt the full-size payload before trimming');
    assert.ok(entries[0].bytes < 1_000_000, 'storage payload must stay below 1MB');
    assert.equal(entries[0].key, 'model-converters.defaults.v1');
    const written = JSON.parse(entries[0].value).defaultsByConverter.xml_to_cii;
    const trimmed = JSON.parse(written.supportConfigJson);
    for (const [section, field] of [['linelist', 'masterRows'], ['pipingClass', 'masterRows'],
      ['material', 'mapRows'], ['weight', 'masterRows']]) {
      assert.deepEqual(trimmed[section][field], []);
    }
    assert.deepEqual(trimmed.overrides, config.overrides);
    assert.deepEqual(trimmed.pipingClassMaterialCodeMap, config.pipingClassMaterialCodeMap);
    assert.equal(defaults.xml_to_cii.supportConfigJson, before, 'live config must remain byte-identical');
  } finally {
    globalThis.window = previousWindow;
  }
});

test('R10 P1: small configuration persists unchanged, without a storage rewrite', () => {
  const defaults = { xml_to_cii: { supportConfigJson: JSON.stringify({ overrides: { rating: { B6: '150' } } }) } };
  const { entries, storage } = captureWrites();
  const prev = globalThis.window; globalThis.window = { localStorage: storage };
  try {
    assert.equal(saveStoredState('xml_to_cii', defaults), 'full');
    assert.equal(entries.length, 1);
    assert.deepEqual(JSON.parse(entries[0].value).defaultsByConverter, defaults);
  } finally { globalThis.window = prev; }
});

test('R11 D1: a small config with 15 line-list and 2 piping-class rows survives reload intact', () => {
  const config = {
    linelist: { masterRows: Array.from({ length: 15 }, (_, i) =>
      ({ lineNo: 'BM2-L' + i, material: i % 2 ? 'DSS' : 'LTCS' })), fieldMap: { material: 'Material' } },
    pipingClass: { masterRows: [{ pipingClass: 'P4110001', rating: 150 },
      { pipingClass: 'P4110002', rating: 300 }] },
    overrides: { rating: { B6: '150' } },
  };
  const defaults = { xml_to_cii: { supportConfigJson: JSON.stringify(config) } };
  const { entries, storage } = captureWrites();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    assert.equal(saveStoredState('xml_to_cii', defaults), 'full',
      'small imported masters must persist in full, not trigger the too-large warning');
    assert.equal(entries.length, 1);
    assert.ok(entries[0].bytes < 1_000_000);
    const reloaded = JSON.parse(storage.getItem('model-converters.defaults.v1'));
    const restored = JSON.parse(reloaded.defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.deepEqual(restored.linelist.masterRows, config.linelist.masterRows);
    assert.deepEqual(restored.pipingClass.masterRows, config.pipingClass.masterRows);
    assert.equal(restored._mastersStrippedForStorage, undefined);
  } finally {
    globalThis.window = previousWindow;
  }
});
