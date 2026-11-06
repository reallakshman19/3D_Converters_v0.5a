import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { saveStoredState, loadStoredState } from '../tabs/model-converters/core/config-store.js';
import { missingPersistedXmlCiiMasters, missingPersistedXmlCiiMastersNotice }
  from '../tabs/model-converters/core/imported-master-run-guard.js';

const KEY = 'model-converters.defaults.v1';
function simulateReloadedBrowser(fn) {
  const disk = new Map();
  const prev = globalThis.window;
  globalThis.window = { localStorage: {
    getItem(key) { return disk.get(key) ?? null; },
    setItem(key, value) { disk.set(key, String(value)); },
    removeItem(key) { disk.delete(key); },
  } };
  try { return fn(disk); } finally { globalThis.window = prev; }
}

test('R11 D4: large BM2-style config loses masters on disk but blocks Run after reload', () => {
  simulateReloadedBrowser((disk) => {
    const config = {
      linelist: { masterRows: Array.from({ length: 1500 }, (_, i) =>
        ({ i, source: 'LL_BM2', material: 'DSS', padding: 'A'.repeat(1200) })) },
      pipingClass: { masterRows: Array.from({ length: 850 }, (_, i) =>
        ({ i, pipingClass: 'P4110001', padding: 'B'.repeat(1200) })) },
      material: { mapRows: [{ material: 'A790-S32803', code: '338' }] },
      weight: { masterRows: [{ boreMm: 150, weight: 42 }] },
    };
    const defaults = { xml_to_cii: { supportConfigJson: JSON.stringify(config) } };
    assert.equal(saveStoredState('xml_to_cii', defaults), 'trimmed');
    assert.equal(config.pipingClass.masterRows.length, 850, 'live config retains master');
    const persisted = JSON.parse(disk.get(KEY)).defaultsByConverter.xml_to_cii;
    const stripped = JSON.parse(persisted.supportConfigJson);
    assert.deepEqual(stripped._mastersStrippedSectionsForStorage,
      ['linelist', 'pipingClass', 'material', 'weight']);
    const reload = loadStoredState().defaultsByConverter.xml_to_cii;
    const loaded = JSON.parse(reload.supportConfigJson);
    const missing = missingPersistedXmlCiiMasters(loaded);
    assert.deepEqual(missing, ['Line List', 'Piping Class', 'Material Map', 'Weights / Valve CA8']);
    assert.match(missingPersistedXmlCiiMastersNotice(missing), /Run blocked.*Re-import/);
    // Re-importing every required table permits Run; partial re-import does not.
    loaded.pipingClass.masterRows = [{ pipingClass: 'P4110001' }];
    assert.ok(missingPersistedXmlCiiMasters(loaded).includes('Line List'));
    loaded.linelist.masterRows = [{ lineNo: 'BM2' }];
    loaded.material.mapRows = [{ material: 'DSS', code: '338' }];
    loaded.weight.masterRows = [{ boreMm: 150 }];
    assert.deepEqual(missingPersistedXmlCiiMasters(loaded), []);
  });
});

test('R11 D4: old R10 stripped marker fails closed rather than producing silent wrong output', () => {
  const config = { _mastersStrippedForStorage: true,
    linelist: { masterRows: [] }, pipingClass: { masterRows: [] } };
  assert.ok(missingPersistedXmlCiiMasters(config).includes('Piping Class'));
  assert.equal(missingPersistedXmlCiiMasters({ linelist: { masterRows: [] } }).length, 0);
});

test('R11 D4: real Run button and both Finalise entrypoints enforce missing master guard', async () => {
  const source = await readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');
  assert.match(source, /const runConfig = xmlCiiConfigWithLoadedMasterRows\('XML->CII Run preflight'\)/);
  assert.match(source, /const missing = missingPersistedXmlCiiMasters\(runConfig\)/);
  assert.match(source, /data-xml-cii-missing-masters/);
  assert.match(source, /const _capturedConfig = xmlCiiConfigWithLoadedMasterRows\('XML->CII popup Run preflight'\)/);
  assert.match(source, /const _capturedConfig = xmlCiiConfigWithLoadedMasterRows\('XML->CII finalise preflight'\)/);
});
