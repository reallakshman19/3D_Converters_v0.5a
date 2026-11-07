import assert from 'node:assert/strict';
import test from 'node:test';
import { saveStoredState, loadStoredState } from '../tabs/model-converters/core/config-store.js';
import { installXmlCiiDefaultMasterAutoloadLite } from '../tabs/xml-cii-master-autoload-lite.js';

test('R12 E1: real lite autoload then save/reload preserves 15 Owner line rows and 6 class rows', async () => {
  const globalKeys = ['window', 'document', 'location', 'fetch', 'requestIdleCallback', 'requestAnimationFrame'];
  const original = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousDefaults = {
    linelist: { masterRows: Array.from({ length: 15 }, (_, i) =>
      ({ lineNo: 'L' + i, material: i % 2 ? 'LTCS' : 'DSS' })) },
    pipingClass: { masterRows: Array.from({ length: 6 }, (_, i) =>
      ({ pipingClass: 'PC' + i, bore: 150, rating: 150 })) },
  };
  const disk = new Map();
  let dispatched = 0;
  const input = {
    value: JSON.stringify(previousDefaults),
    dispatchEvent(evt) {
      if (evt.type === 'change') {
        dispatched++;
        saveStoredState('xml_to_cii', { xml_to_cii: { supportConfigJson: this.value } });
      }
      return true;
    },
  };
  const materialRows = Array.from({ length: 383 }, (_, i) =>
    String(300 + i) + ' MATERIAL-' + i + '-A790');
  const weightRows = Array.from({ length: 1595 }, (_, i) => ({
    bore: '150', rating: '150', length: '300', valveWeight: '40',
    payload: 'W'.repeat(520), index: i,
  }));
  const notificationKey = 'Material Map: 383 row(s)|Weights / Valve CA8: 1595 row(s)';
  const response = text => ({ ok: true, text: async () => text });
  try {
    globalThis.window = { localStorage: {
      getItem(key) { return disk.get(key) ?? null; },
      setItem(key, value) {
        assert.ok(Buffer.byteLength(value, 'utf8') <= 1_000_000, 'no oversized write');
        disk.set(key, String(value));
      },
    }, __xmlCiiLiteAutoloadLastNotify: notificationKey };
    globalThis.document = { querySelector: selector => selector === '[data-option-key="supportConfigJson"]' ? input : null };
    globalThis.location = { hostname: 'localhost', pathname: '/', origin: 'http://localhost' };
    globalThis.fetch = async url => response(String(url).includes('PCF_MAT_MAP.TXT')
      ? materialRows.join('\n') : JSON.stringify(weightRows));
    // Deterministically run the actual autoload scheduler's runner.
    globalThis.requestIdleCallback = cb => { void Promise.resolve().then(cb); };
    delete globalThis.requestAnimationFrame;
    installXmlCiiDefaultMasterAutoloadLite();
    for (let i = 0; i < 200 && !dispatched; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(dispatched, 1, 'autoload must exercise the production textbox save path');
    const active = JSON.parse(input.value);
    assert.equal(active.material.mapRows.length, 383);
    assert.equal(active.weight.masterRows.length, 1595);
    assert.equal(active.linelist.masterRows.length, 15);
    assert.equal(active.pipingClass.masterRows.length, 6);
    const restored = JSON.parse(loadStoredState().defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.equal(restored.linelist.masterRows.length, 15,
      'old unconditional trim is RED: small Owner imports must survive defaults autoload');
    assert.equal(restored.pipingClass.masterRows.length, 6);
    assert.deepEqual(restored.material.mapRows, []);
    assert.deepEqual(restored.weight.masterRows, []);
    assert.equal(restored._mastersStrippedForStorage, undefined,
      'auto defaults may be omitted without marking Owner imports as lost');
    assert.deepEqual(restored._autoloadDefaultsOmittedForStorage, ['material', 'weight']);
    assert.deepEqual(restored.linelist.masterRows, previousDefaults.linelist.masterRows);
    assert.deepEqual(restored.pipingClass.masterRows, previousDefaults.pipingClass.masterRows);
  } finally {
    for (const [key, desc] of original) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  }
});

test('R12 E1: actual large imported masters still strip and block after reload', () => {
  const previous = globalThis.window;
  const disk = new Map();
  try {
    globalThis.window = { localStorage: {
      getItem: key => disk.get(key) || null, setItem: (key, value) => disk.set(key, value),
    } };
    const cfg = { linelist: { masterRows: Array.from({ length: 1200 }, (_, i) =>
      ({ lineNo: 'L' + i, padding: 'x'.repeat(1200) })) } };
    assert.equal(saveStoredState('xml_to_cii', { xml_to_cii: { supportConfigJson: JSON.stringify(cfg) } }), 'trimmed');
    const loaded = JSON.parse(loadStoredState().defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.deepEqual(loaded._mastersStrippedSectionsForStorage, ['linelist']);
  } finally { globalThis.window = previous; }
});
