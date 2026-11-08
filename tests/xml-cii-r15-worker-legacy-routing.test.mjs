import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareStoredStatePayload } from '../tabs/model-converters/core/config-store.js';
import { commitXmlCiiPreparedSave } from '../tabs/model-converters/core/fetch-worker-commit.js';

// Exercise the real legacy save function, with Worker/storage/UI boundaries
// substituted for deterministic test doubles. Removing Worker routing in the
// adapter now fails even if the Worker unit itself remains correct.
async function makeLegacySave(Worker, { timers = {} } = {}) {
  const src = await readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');
  const start = src.indexOf('  function xmlCiiSaveConfig(config, { compact = false, background = false } = {}) {');
  const end = src.indexOf('\n  function xmlCiiSpecwiseMasterPaths(', start);
  assert.ok(start > 0 && end > start, 'legacy config-save implementation present');
  const body = src.slice(start, end).replaceAll('import.meta.url', "'file:///tmp/legacy-adapter.js'");
  const records = { writes: [], clears: 0, notifications: [] };
  const values = { xml_to_cii: { supportConfigJson: '' } };
  const create = new Function(
    'Worker', 'commitXmlCiiPreparedSave', 'defaultsByConverter', 'selectedConverter',
    'writePreparedStoredState', 'clearXmlCiiFetchedRatingsJournal',
    'activeValues', 'xmlCiiRenderAdvancedWhenConfigFits', '_xmlCiiSyncConfigTextarea',
    'notify', 'setTimeout', 'clearTimeout', 'requestAnimationFrame',
    'return (() => { let xmlCiiConfigSaveGeneration = 0;' +
    'let xmlCiiPendingFetchSave = null; let xmlCiiAbortFetchWorker = null;' +
    'let xmlCiiMasterStorageWarningShown = false;' + body +
    '; return xmlCiiSaveConfig; })()',
  );
  return {
    save: create(Worker, commitXmlCiiPreparedSave, values, 'xml_to_cii',
      payload => records.writes.push(payload),
      () => { records.clears++; },
      () => values.xml_to_cii, () => {}, () => {},
      note => records.notifications.push(note),
      timers.setTimeout || setTimeout, timers.clearTimeout || clearTimeout,
      undefined),
    records, values,
  };
}

test('J3/W3/W6: actual legacy Fetch routing invokes one Worker and commits one payload', async () => {
  let created = 0, sent = 0;
  class FakeWorker {
    constructor(url, options) {
      assert.ok(String(url).includes('config-save-worker.js'));
      assert.equal(options.type, 'module');
      created++;
    }
    postMessage(data) {
      sent++;
      queueMicrotask(() => {
        const fullJson = JSON.stringify(data.config);
        const values = { ...data.defaultsByConverter,
          [data.selectedConverter]: { supportConfigJson: fullJson } };
        const prepared = prepareStoredStatePayload(data.selectedConverter, values);
        this.onmessage?.({ data: { generation: data.generation, fullJson,
          payload: prepared.payload, status: prepared.status } });
      });
    }
    terminate() {}
  }
  const { save, records, values } = await makeLegacySave(FakeWorker);
  const config = { linelist: { masterRows: [{ lineNo: 'L1' }] },
    overrides: { rating: { B1: '900' } } };
  const status = await save(config, { compact: true, background: true });
  assert.equal(status, 'full');
  assert.equal(created, 1, 'W3: Fetch must instantiate the real Worker route');
  assert.equal(sent, 1, 'Worker must receive exactly one prepare message');
  assert.equal(records.writes.length, 1, 'W6: save must commit exactly once');
  assert.equal(records.clears, 1);
  assert.equal(values.xml_to_cii.supportConfigJson, JSON.stringify(config));
  // Mutants: synchronous save, duplicate commit or Worker never invoked fail.
});

test('J4/W4: silent Worker times out with an error and clears current Fetch journal', async () => {
  class SilentWorker {
    constructor() {}
    postMessage() { /* intentionally never replies */ }
    terminate() {}
  }
  const schedule = (fn, ms) => ms === 30000 ? setTimeout(fn, 0) : setTimeout(fn, ms);
  const { save, records } = await makeLegacySave(SilentWorker, {
    timers: { setTimeout: schedule, clearTimeout },
  });
  await assert.rejects(
    Promise.race([
      save({ overrides: { rating: { B1: '900' } } }, { compact: true, background: true }),
      new Promise((_, reject) => setTimeout(() => reject(Error('Worker timeout guard missing')), 250)),
    ]),
    /Fetch config worker did not respond within 30000 ms/,
  );
  assert.equal(records.writes.length, 0);
  assert.equal(records.clears, 1, 'worker error cannot leave a stale Fetch journal');
  // Mutants: no worker timeout or missing error cleanup fail the assertion.
});
