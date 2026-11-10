import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  stageXmlCiiFetchedRatings, applyStagedXmlCiiFetchedRatings,
} from '../tabs/model-converters/core/config-store.js';
import { commitXmlCiiPreparedSave } from '../tabs/model-converters/core/fetch-worker-commit.js';

/**
 * Execute the actual legacy-adapter xmlCiiSaveConfig function. A fake Worker
 * replies with a prepared payload, then a NEW Fetch bumps the generation
 * before the first deferred write. This pins the isCurrent argument passed
 * at legacy-adapter.js (not the separate commit helper's implementation).
 */
async function createLegacySaveRace(source = null) {
  const src = source ?? await readFile(
    new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');
  const begin = src.indexOf('  function xmlCiiSaveConfig(config, { compact = false, background = false } = {}) {');
  const end = src.indexOf('\n  function xmlCiiSpecwiseMasterPaths(', begin);
  assert.ok(begin > 0 && end > begin, 'production legacy config-save function found');
  const actualSave = src.slice(begin, end)
    .replaceAll('import.meta.url', "'file:///tmp/legacy-adapter.js'");
  const deferredTasks = [];
  const writes = [];
  const workers = [];
  const live = { supportConfigJson: 'previous' };
  let journalClears = 0;
  class ControlledWorker {
    constructor() { workers.push(this); }
    postMessage(message) { this.sent = message; }
    terminate() {}
  }
  const make = new Function(
    'Worker', 'commitXmlCiiPreparedSave', 'writePreparedStoredState',
    'clearXmlCiiFetchedRatingsJournal', 'activeValues',
    'defaultsByConverter', 'selectedConverter', 'notify',
    'xmlCiiRenderAdvancedWhenConfigFits', '_xmlCiiSyncConfigTextarea',
    'setTimeout', 'clearTimeout', 'requestAnimationFrame',
    'return (() => {\n' +
    'let xmlCiiConfigSaveGeneration = 0;\n' +
    'let xmlCiiPendingFetchSave = null;\n' +
    'let xmlCiiAbortFetchWorker = null;\n' +
    'let xmlCiiMasterStorageWarningShown = false;\n' +
    actualSave + '\nreturn { save: xmlCiiSaveConfig, ' +
    'stageAnotherFetch: () => { xmlCiiConfigSaveGeneration++; } }; })()',
  );
  const impl = make(
    ControlledWorker,
    args => commitXmlCiiPreparedSave({ ...args,
      defer: callback => deferredTasks.push(callback) }),
    payload => { writes.push(payload); },
    () => { journalClears++; },
    () => live,
    { xml_to_cii: { supportConfigJson: 'previous' } },
    'xml_to_cii', () => {}, () => {}, () => {},
    () => 1, () => {}, undefined,
  );
  return {
    ...impl, deferredTasks, writes, workers, live,
    journalClears: () => journalClears,
  };
}

test('R17/J4a: actual legacy isCurrent prevents an old Worker commit after a new Fetch', async () => {
  const race = await createLegacySaveRace();
  const pending = race.save({ overrides: { rating: { B1: '150' } } },
    { compact: true, background: true });
  assert.equal(race.workers.length, 1);
  const worker = race.workers[0];
  assert.equal(worker.sent.generation, 1, 'old save generation');
  worker.onmessage({
    data: { generation: worker.sent.generation, payload: 'STALE-PAYLOAD',
      fullJson: '{"overrides":{"rating":{"B1":"150"}}}', status: 'full' },
  });
  assert.equal(race.deferredTasks.length, 1,
    'Worker must have scheduled real prepared commit, not written inline');
  race.stageAnotherFetch(); // the newer Fetch starts BEFORE old commit runs
  while (race.deferredTasks.length) {
    race.deferredTasks.shift()();
    await Promise.resolve();
  }
  assert.equal(await pending, 'superseded');
  assert.deepEqual(race.writes, [], 'obsolete Worker must never write saved config');
  assert.equal(race.live.supportConfigJson, 'previous',
    'obsolete Worker must never replace the current active config');
  assert.equal(race.journalClears(), 0, 'obsolete Worker must not clear the newer journal');
  // Exact J4a mutation at legacy-adapter.js:6834:
  //   isCurrent: () => generation === xmlCiiConfigSaveGeneration
  // -> isCurrent: () => true
  // The real commit helper then writes STALE-PAYLOAD and makes this test RED.
});

test('R17/J4f: old fetched Rating keys are removed on reload even when absent from new Fetch overrides', () => {
  const previousWindow = globalThis.window;
  const disk = new Map();
  globalThis.window = { localStorage: {
    setItem(key, value) { disk.set(key, value); },
    getItem(key) { return disk.get(key) ?? null; },
    removeItem(key) { disk.delete(key); },
  } };
  try {
    // Persisted before the new Fetch: B1's 150 Rating is a stale auto-fetch.
    const persisted = { overrides: {
      rating: { B1: '150', MANUAL: '300' },
      processData: { B1: { rating: '150', p1: '750' }, B2: { p1: '800' } },
      corrosion: { 'PC:X': '3' },
      __dtxrRatingKeys: { B1: true },
    } };
    // A newer Fetch clears B1 and adds B2. B1 has already been removed
    // from the *new* overrides; only previousFetchedKeys remembers it.
    const next = {
      rating: { B2: '900', MANUAL: '300' },
      processData: { B1: { p1: '750' }, B2: { p1: '800' } },
      __dtxrRatingKeys: { B2: true },
    };
    stageXmlCiiFetchedRatings(next, ['B1']);
    const reloaded = applyStagedXmlCiiFetchedRatings(persisted);
    assert.equal(reloaded.overrides.rating.B1, undefined,
      'old fetched B1 Rating must be explicitly removed on reload');
    assert.equal(reloaded.overrides.processData.B1.rating, undefined,
      'old auto-fetch process Rating must also be removed');
    assert.equal(reloaded.overrides.processData.B1.p1, '750',
      'unrelated process override must survive');
    assert.equal(reloaded.overrides.rating.B2, '900');
    assert.equal(reloaded.overrides.rating.MANUAL, '300');
    assert.equal(reloaded.overrides.corrosion['PC:X'], '3');
    assert.deepEqual(reloaded.overrides.__dtxrRatingKeys, { B2: true });
    // Exact J4f mutation at core/config-store.js:12:
    //   ...previousFetchedKeys,
    // -> (delete that spread). B1 is no longer in touchedKeys => test RED.
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
