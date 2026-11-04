import assert from 'node:assert/strict';
import test from 'node:test';
import { invalidatePreviewCaches } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-diagnostics-audit.js';

const OLD_KEY = 'xml-cii-pv-cache-v8-dtxr';
const ENVELOPE_KEY = 'xml-cii-pv-cache-v8-rating-policy';
const OLD_RESULT = JSON.stringify({ data: { branchRows: [{ branchName: '/STALE/B1', rating: '900' }] } });

async function withStorage(callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([
    [OLD_KEY, OLD_RESULT],
    [ENVELOPE_KEY, OLD_RESULT],
    ['xml-cii-wm-cache-v1', 'prior-weight-cache'],
  ]);
  const calls = { reads: [], writes: [], deletes: [] };
  const storage = {
    getItem(key) { calls.reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { calls.writes.push(key); values.set(key, String(value)); },
    removeItem(key) { calls.deletes.push(key); values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { await callback({ calls, values }); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

test('R4 dryrun reader retirement: importing strict-line authority never consumes or deletes old Preview rows', async () => {
  await withStorage(async ({ calls, values }) => {
    // Query-qualified import executes the real production module initialization
    // even if another test imported its unqualified module earlier.
    const preview = await import('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js?r4-no-bridge-read');
    assert.equal(typeof preview.xmlCiiDryRunPreview, 'function');
    assert.deepEqual(calls.reads, [], 'strict-line import may not consult the obsolete bridge or cache marker');
    assert.deepEqual(calls.deletes, [], 'strict-line import must preserve existing persisted Preview data');
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
    assert.equal(values.get(ENVELOPE_KEY), OLD_RESULT);
  });
});

test('R4 diagnostics reader retirement: config-save invalidation does not read or delete old Preview rows', async () => {
  await withStorage(async ({ calls, values }) => {
    invalidatePreviewCaches();
    assert.deepEqual(calls.reads, [], 'config save must not read obsolete engineering results');
    assert.deepEqual(calls.deletes, ['xml-cii-wm-cache-v1'], 'existing Weight Match invalidation remains intact');
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
    assert.equal(values.get(ENVELOPE_KEY), OLD_RESULT);
  });
});


test('R4 B31.3 wall-update reader: old bridge cannot supply Preview rows without a current commit', async () => {
  const { readCommittedPreviewB313Rows, installPreviewB313WallUpdateController } =
    await import('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js');
  await withStorage(async ({ calls, values }) => {
    assert.deepEqual(readCommittedPreviewB313Rows(), [], 'no implicit persistence fallback');
    const actionBar = { querySelector: () => null, appendChild() { throw new Error('stale wall action created'); } };
    const host = { querySelector: (selector) => selector === '[data-mc-preview-build]' ? { parentElement: actionBar } : null };
    installPreviewB313WallUpdateController({ host, config: {}, xmlText: '<Root/>', options: {} });
    await Promise.resolve(); // the real controller queues its installation
    assert.deepEqual(calls.reads, [], 'controller must not read obsolete engineering rows');
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
    const fresh = [{ branchName: '/CURRENT/B1', material: '', rating: '600' }];
    assert.deepEqual(readCommittedPreviewB313Rows({ getCommittedPreviewRows: () => fresh }), fresh);
    assert.deepEqual(readCommittedPreviewB313Rows({ getCommittedPreviewRows: () => [] }), []);
  });
});

test('R4 B31.3 audit reader: zero input without current commit, not stale persisted rows', async () => {
  const { installPreviewB313WallUpdateAuditController } =
    await import('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js');
  await withStorage(async ({ calls, values }) => {
    const clickListeners = [];
    const button = {
      dataset: {},
      addEventListener(event, callback) {
        if (event === 'click') clickListeners.push(callback);
      },
      disabled: false,
    };
    const host = {
      querySelector: (selector) => selector === '[data-mc-b313-wall-update]' ? button : null,
    };
    const reports = [];
    let currentRows = [];
    const options = {
      getCommittedPreviewRows: () => currentRows,
      onSaveConfig: () => {},
      onB313WallUpdateReport: (report) => { reports.push(report); },
    };
    installPreviewB313WallUpdateAuditController({ host, config: {}, xmlText: '<Root/>', options });
    await Promise.resolve(); // queued installation in the underlying controller
    assert.equal(clickListeners.length, 1, 'real audit action must bind its click handler');
    const click = () => clickListeners[0]({
      preventDefault() {},
      stopImmediatePropagation() {},
    });
    await click();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].summary.inputRows, 0);
    assert.equal(reports[0].rows[0]?.diagnostics, undefined);
    assert.equal(reports[0].diagnostics?.[0]?.code, 'B313_PREVIEW_ROWS_UNAVAILABLE');

    currentRows = [{ branchName: '/CURRENT/B1', rating: '600' }];
    await click();
    assert.equal(reports.length, 2);
    assert.equal(reports[1].summary.inputRows, 1);
    assert.equal(reports[1].rows[0]?.branchName, '/CURRENT/B1');
    assert.deepEqual(calls.reads, [], 'audit must not read prior-session bridge values');
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
  });
});


test('R4 direct handoff: a newly reserved generation cannot expose the previous B31.3 rows', async () => {
  const { createCurrentPreviewB313Handoff } =
    await import('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-diagnostics-audit-v7.js');
  await withStorage(async ({ calls, values }) => {
    const host = { dataset: { mcPreviewBuildCompleted: 'false' }, __xmlCiiPreviewGeneration: 4 };
    const handoff = createCurrentPreviewB313Handoff(host);
    const oldRows = [{ branchName: '/PREVIOUS/B1', rating: '150' }];
    handoff.onPreviewCommitted({ branchRows: oldRows, generation: 4 });
    assert.deepEqual(handoff.getCommittedPreviewRows(), [], 'callback before completion is not current');
    host.dataset.mcPreviewBuildCompleted = 'true';
    assert.deepEqual(handoff.getCommittedPreviewRows(), oldRows);

    // Manual Build reserves generation 5 before onPreviewStarted is invoked.
    host.__xmlCiiPreviewGeneration = 5;
    assert.deepEqual(handoff.getCommittedPreviewRows(), [], 'old result must disappear immediately on reservation');
    handoff.onPreviewCommitted({ branchRows: oldRows, generation: 4 });
    assert.deepEqual(handoff.getCommittedPreviewRows(), [], 'stale callback cannot republish generation 4');
    handoff.onPreviewStarted();
    const newRows = [{ branchName: '/CURRENT/B1', rating: '900' }];
    handoff.onPreviewCommitted({ branchRows: newRows, generation: 5 });
    assert.deepEqual(handoff.getCommittedPreviewRows(), [], 'new result is hidden until successful completion');
    host.dataset.mcPreviewBuildCompleted = 'true';
    assert.deepEqual(handoff.getCommittedPreviewRows(), newRows);
    assert.deepEqual(calls.reads, []);
    assert.equal(values.get(OLD_KEY), OLD_RESULT);
  });
});
