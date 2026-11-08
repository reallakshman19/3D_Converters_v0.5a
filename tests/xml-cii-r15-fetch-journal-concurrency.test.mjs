import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stageXmlCiiFetchedRatings, applyStagedXmlCiiFetchedRatings,
  clearXmlCiiFetchedRatingsJournal, loadStoredState, saveStoredState,
} from '../tabs/model-converters/core/config-store.js';
import { commitXmlCiiPreparedSave } from '../tabs/model-converters/core/fetch-worker-commit.js';

function withStorage(run) {
  const prior = globalThis.window;
  const disk = new Map();
  const writes = [];
  globalThis.window = { localStorage: {
    setItem(key, value) { disk.set(key, value); writes.push([key, value]); },
    getItem: key => disk.get(key) ?? null,
    removeItem: key => disk.delete(key),
  } };
  try { return run({ disk, writes }); }
  finally { globalThis.window = prior; }
}

test('J4: reload journal patches only fetched ratings and preserves unrelated process/corrosion overrides', () => {
  withStorage(() => {
    const base = {
      linelist: { masterRows: [{ lineNo: 'L1' }] },
      overrides: {
        rating: { B1: '150', MANUAL: '300' },
        corrosion: { 'PC:X': '3' },
        processData: { B1: { rating: '150', p1: '750' }, MANUAL: { p1: '900' } },
        __dtxrRatingKeys: { B1: true },
      },
    };
    saveStoredState('xml_to_cii', { xml_to_cii: { supportConfigJson: JSON.stringify(base) } });
    const latest = {
      rating: { MANUAL: '300', B1: '900' },
      __dtxrRatingKeys: { B1: true },
      processData: { B1: { p1: '750' } },
    };
    stageXmlCiiFetchedRatings(latest, ['B1']);
    const restored = JSON.parse(loadStoredState().defaultsByConverter.xml_to_cii.supportConfigJson);
    assert.equal(restored.overrides.rating.B1, '900');
    assert.equal(restored.overrides.rating.MANUAL, '300');
    assert.equal(restored.overrides.corrosion['PC:X'], '3');
    assert.equal(restored.overrides.processData.B1.p1, '750');
    assert.equal(restored.overrides.processData.B1.rating, undefined);
    assert.equal(restored.overrides.processData.MANUAL.p1, '900');
    assert.deepEqual(restored.linelist.masterRows, base.linelist.masterRows);
    // Mutant: replacing overrides wholesale loses corrosion/Manual/processData.
  });
});

test('J4/W6: older prepared save cannot write or clear a newer Fetch journal', async () => {
  const prior = globalThis.window;
  const disk = new Map();
  const writes = [];
  globalThis.window = { localStorage: {
    setItem(k, v) { disk.set(k, v); writes.push([k, v]); },
    getItem: k => disk.get(k) ?? null, removeItem: k => disk.delete(k),
  } };
  const tasks = [];
  const defer = fn => tasks.push(fn);
  const drain = async () => {
    while (tasks.length) { tasks.shift()(); await Promise.resolve(); }
  };
  let generation = 1;
  const config = { overrides: { rating: { B1: '150' }, __dtxrRatingKeys: { B1: true } } };
  try {
    stageXmlCiiFetchedRatings(config.overrides, ['B1']);
    const commit = (gen, payload, fullJson) => commitXmlCiiPreparedSave({
      payload, fullJson, status: 'full',
      isCurrent: () => gen === generation,
      writePayload: v => { writes.push(['committed', v]); disk.set('committed', v); },
      setConfig: v => { config.saved = v; },
      clearJournal: clearXmlCiiFetchedRatingsJournal,
      defer,
    });
    const old = commit(generation, 'old-payload', 'old-config');
    generation++;
    config.overrides.rating.B1 = '900';
    stageXmlCiiFetchedRatings(config.overrides, ['B1']);
    const latest = commit(generation, 'new-payload', 'new-config');
    await drain();
    assert.equal(await old, 'superseded');
    assert.equal(await latest, 'full');
    assert.deepEqual(writes.filter(row => row[0] === 'committed').map(row => row[1]), ['new-payload']);
    assert.equal(config.saved, 'new-config');
    assert.equal(disk.has('model-converters.xml-cii.fetch-rating-journal.v1'), false);
    // Mutants: ignoring generation, writing twice, clearing newer journal fail.
  } finally { globalThis.window = prior; }
});

test('J4: failed prepared commit leaves no stale rating journal', async () => {
  const prev = globalThis.window;
  const disk = new Map();
  globalThis.window = { localStorage: {
    setItem(k, v) { disk.set(k, v); }, getItem: k => disk.get(k) ?? null,
    removeItem: k => disk.delete(k),
  } };
  try {
    stageXmlCiiFetchedRatings({
      rating: { B1: '900' }, __dtxrRatingKeys: { B1: true },
    }, ['B1']);
    const run = commitXmlCiiPreparedSave({
      payload: 'x', fullJson: 'y', status: 'full',
      isCurrent: () => true,
      writePayload: () => { throw Error('localStorage is blocked'); },
      setConfig: () => { throw Error('should not execute'); },
      clearJournal: clearXmlCiiFetchedRatingsJournal,
      onFailure: clearXmlCiiFetchedRatingsJournal,
      defer: fn => fn(),
    });
    await assert.rejects(run, /localStorage is blocked/);
    assert.equal(disk.has('model-converters.xml-cii.fetch-rating-journal.v1'), false);
  } finally { globalThis.window = prev; }
});


test('J4: newer Fetch staged between storage write and live-config swap preserves its journal', async () => {
  const prior = globalThis.window;
  const disk = new Map();
  globalThis.window = { localStorage: {
    setItem(k,v) { disk.set(k,v); }, getItem:k => disk.get(k) ?? null,
    removeItem:k => disk.delete(k),
  } };
  try {
    let generation = 1;
    const tasks = [];
    let live = '';
    let clears = 0;
    const make = (gen, label) => commitXmlCiiPreparedSave({
      payload: label, fullJson: label, status: 'full',
      isCurrent: () => gen === generation,
      writePayload: val => disk.set('committed', val),
      setConfig: val => { live = val; },
      clearJournal: () => { clears++; clearXmlCiiFetchedRatingsJournal(); },
      defer: fn => tasks.push(fn),
    });
    stageXmlCiiFetchedRatings({
      rating: { B1: '150' }, __dtxrRatingKeys: { B1: true },
    }, ['B1']);
    const old = make(generation, 'old');
    tasks.shift()(); // Old storage write has just happened
    generation++;
    stageXmlCiiFetchedRatings({
      rating: { B1: '900' }, __dtxrRatingKeys: { B1: true },
    }, ['B1']);
    while (tasks.length) { tasks.shift()(); await Promise.resolve(); }
    assert.equal(await old, 'superseded');
    assert.equal(live, '', 'obsolete commit cannot install old active config');
    assert.equal(clears, 0, 'obsolete commit cannot delete newer journal');
    assert.equal(JSON.parse(disk.get('model-converters.xml-cii.fetch-rating-journal.v1')).rating.B1, '900');
    const latest = make(generation, 'latest');
    while (tasks.length) { tasks.shift()(); await Promise.resolve(); }
    assert.equal(await latest, 'full');
    assert.equal(live, 'latest');
    assert.equal(disk.get('committed'), 'latest');
    assert.equal(clears, 1);
  } finally { globalThis.window = prior; }
});
