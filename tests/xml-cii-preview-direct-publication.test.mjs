import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { XML_CII_PREVIEW_CACHE_KEY } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js';

import { xmlCiiDryRunPreview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';
import { xmlCiiBuildAndRenderPreview as buildLegacyPreview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js';
import { xmlCiiBuildAndRenderPreview as buildV7Preview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js';
import {
  clearXmlCiiPreviewRatingSnapshot,
  publishXmlCiiPreviewRatingSnapshot,
  readXmlCiiPreviewRatingSnapshot,
  resolveXmlCiiWeightMatchRating,
} from '../converters/xml-cii2019-core/preview-rating-snapshot.js';

const require = createRequire(import.meta.url);
const { installMiniDom, MiniElement } = require('./helpers/mini-dom.js');

// The test uses the existing lightweight DOM helper, but loads the REAL
// production renderers and engineering calculator (no substituted modules).
// Only the XML DOM API needed by a deterministic two-branch fixture is adapted.
installMiniDom();
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const xmlNames = {
  ROOT: 'Root', BRANCH: 'Branch', BRANCHNAME: 'Branchname',
  NODE: 'Node', NODENUMBER: 'NodeNumber', NODENAME: 'NodeName',
  COMPONENTTYPE: 'ComponentType', COMPONENTREFNO: 'ComponentRefNo',
  BOREMM: 'BoreMm', ELEMENTLENGTHMM: 'ElementLengthMm',
  DTXR: 'DTXR', POSITION: 'Position',
};
Object.defineProperty(MiniElement.prototype, 'nodeType', { configurable: true, get() { return 1; } });
Object.defineProperty(MiniElement.prototype, 'localName', {
  configurable: true, get() { return xmlNames[this.tagName] || this.tagName; },
});
Object.defineProperty(MiniElement.prototype, 'nodeName', {
  configurable: true, get() { return this.localName; },
});
Object.defineProperty(MiniElement.prototype, 'parentElement', {
  configurable: true, get() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; },
});
MiniElement.prototype.getElementsByTagName = function (name) { return this.querySelectorAll(name); };
MiniElement.prototype.insertAdjacentHTML = function (position, html) {
  const fragment = new MiniElement('fragment');
  fragment.innerHTML = html;
  const nodes = [...fragment.childNodes];
  for (const child of nodes) child.parentNode = this;
  if (position === 'afterbegin') this.childNodes.unshift(...nodes);
  else if (position === 'beforeend') this.childNodes.push(...nodes);
  else throw new Error('Unsupported mini-DOM insertion position: ' + position);
};
MiniElement.prototype.closest = function (selector) {
  let current = this;
  while (current?.nodeType === 1) {
    if (selector[0] === '#' && current.id === selector.slice(1)) return current;
    if (selector[0] === '.' && current.classList.contains(selector.slice(1))) return current;
    if (selector[0] === '[' && current.hasAttribute(selector.slice(1, -1))) return current;
    current = current.parentElement;
  }
  return null;
};
globalThis.DOMParser = class {
  parseFromString(xmlText) {
    const parsed = new MiniElement('document');
    parsed.innerHTML = String(xmlText);
    return parsed;
  }
};

const XML = '<Root>' +
  '<Branch><Branchname>/REG/B1</Branchname>' +
  '<Node><NodeNumber>101</NodeNumber><NodeName>VGT-101</NodeName><ComponentType>VALV</ComponentType><ComponentRefNo>=VALVE1</ComponentRefNo><BoreMm>100</BoreMm><ElementLengthMm>250</ElementLengthMm><DTXR>GATE VALVE 900#</DTXR></Node>' +
  '<Node><NodeNumber>102</NodeNumber><NodeName>VGT-102</NodeName><ComponentType>VALV</ComponentType><BoreMm>100</BoreMm><ElementLengthMm>250</ElementLengthMm></Node>' +
  '</Branch>' +
  '<Branch><Branchname>/REG/B2</Branchname>' +
  '<Node><NodeNumber>201</NodeNumber><NodeName>VGT-201</NodeName><ComponentType>VALV</ComponentType><BoreMm>100</BoreMm><ElementLengthMm>250</ElementLengthMm><DTXR>GATE VALVE 900#</DTXR></Node>' +
  '</Branch></Root>';

function makeConfig() {
  return {
    linelist: { masterRows: [] },
    pipingClass: { masterRows: [] },
    material: { mapRows: [] },
    weight: { masterRows: [] },
    overrides: { rating: { '/REG/B1': '150', '/REG/B2': '300' } },
  };
}

function makeRoot() {
  const root = new MiniElement('section');
  root.innerHTML = '<div id="mc-preview-table-host"></div>';
  const host = root.querySelector('#mc-preview-table-host');
  assert.ok(host, 'Preview host fixture must exist');
  return { root, host };
}

function options(extra = {}) {
  return {
    forceBuild: true,
    stagedJsonText: '{}',
    stagedSourceLabel: 'test-stage',
    ensureOverrides: (config) => (config.overrides ||= {}),
    onSaveConfig: async () => {},
    openOverridePopup: () => {},
    ...extra,
  };
}

function resetSnapshot() {
  clearXmlCiiPreviewRatingSnapshot();
  assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 0);
}

async function waitFor(predicate) {
  const end = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error('Timed out waiting for an actual Preview action');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('A — successful legacy build delivers real calculated branch and node rows in original order', async () => {
  resetSnapshot();
  const config = makeConfig();
  const expected = xmlCiiDryRunPreview(XML, structuredClone(config), '{}');
  assert.deepEqual(expected.branchRows.map((r) => r.branchName), ['/REG/B1', '/REG/B2']);
  assert.ok(expected.nodeRows.length >= 2, 'must exercise nonempty calculated node ordering');
  const { root, host } = makeRoot();
  const received = [];
  await buildLegacyPreview(root, XML, config, options({
    onPreviewCommitted: (result) => {
      assert.ok(host.querySelector('[data-resizable-table="branch-preview"]'), 'commit after render');
      received.push(result);
    },
  }));
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].branchRows, expected.branchRows);
  assert.deepEqual(received[0].nodeRows, expected.nodeRows);
  assert.deepEqual(received[0].nodeRows.map((r) => r.nodeNumber), expected.nodeRows.map((r) => r.nodeNumber));
  assert.equal(received[0].stagedJsonText, '{}');
});

test('B — manual idle never restores persisted engineering rows or snapshots', async () => {
  resetSnapshot();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([
    ['xml-cii-pv-cache-v8-dtxr', JSON.stringify({ data: { branchRows: [{ branchName: '/OLD', rating: '900' }] } })],
    ['xml-cii-pv-cache-v8-rating-policy', JSON.stringify({ authority: { digest: 'sha256:old' }, legacyPayload: { data: { branchRows: [{ branchName: '/OLD', rating: '900' }] } } })],
    ['xml-cii-preview-rating-snapshot-v2', JSON.stringify({ schema: 'xml-cii-preview-rating-snapshot/v2', records: [{ branchName: '/OLD', rating: '900' }] })],
  ]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  } });
  try {
    const { root, host } = makeRoot();
    let published = 0;
    await buildV7Preview(root, XML, makeConfig(), options({
      forceBuild: false, onPreviewCommitted: () => { published++; },
    }));
    assert.ok(host.querySelector('[data-mc-preview-build]'));
    assert.match(host.textContent, /Preview has not been built/);
    assert.equal(host.querySelector('[data-resizable-table="branch-preview"]'), null);
    assert.equal(published, 0);
    assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 0);
  } finally {
    clearXmlCiiPreviewRatingSnapshot();
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete globalThis.localStorage;
  }
});

test('C — throwing storage accessor cannot prevent a fresh v7 Preview or current Weight Match rating', async () => {
  resetSnapshot();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw new Error('blocked storage'); },
  });
  try {
    const { root, host } = makeRoot();
    const results = [];
    await buildV7Preview(root, XML, makeConfig(), options({ onPreviewCommitted: (r) => results.push(r) }));
    assert.equal(results.length, 1);
    assert.ok(host.querySelector('[data-resizable-table="branch-preview"]'));
    assert.ok(host.querySelector('[data-mc-dtxr-rating-fetch]'));
    assert.equal(host.dataset.mcPreviewBuildCompleted, 'true');
    assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 2);
    assert.equal(resolveXmlCiiWeightMatchRating({ branchName: '/REG/B1' }).rating, '150');
  } finally {
    clearXmlCiiPreviewRatingSnapshot();
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete globalThis.localStorage;
  }
});

test('D — rebuild publishes the updated manual Rating, not the previous snapshot', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const config = makeConfig();
  const committed = [];
  const opts = options({ onPreviewCommitted: (r) => committed.push(r) });
  await buildV7Preview(root, XML, config, opts);
  assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '150');
  config.overrides.rating['/REG/B1'] = '600';
  await buildV7Preview(root, XML, config, opts);
  assert.equal(committed.length, 2);
  assert.equal(committed[1].branchRows[0].rating, '600');
  assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '600');
  assert.equal(resolveXmlCiiWeightMatchRating({ branchName: '/REG/B1' }).rating, '600');
  assert.equal(host.dataset.mcPreviewBuildCompleted, 'true');
});

test('E — delayed source for A cannot overwrite the newer B result', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const config = makeConfig();
  const aGate = deferred();
  let aCommits = 0;
  const buildA = buildV7Preview(root, XML, config, options({
    resolveStagedJsonText: () => aGate.promise,
    onPreviewCommitted: () => { aCommits++; },
  }));
  const bResults = [];
  await buildV7Preview(root, XML, config, options({
    resolveStagedJsonText: async () => ({ text: '{"source":"B"}', label: 'source-B' }),
    onPreviewCommitted: (r) => bResults.push(r),
  }));
  assert.equal(bResults.length, 1);
  const bGeneration = host.__xmlCiiPreviewGeneration;
  const bRevision = readXmlCiiPreviewRatingSnapshot().revision;
  aGate.resolve({ text: '{"source":"A"}', label: 'source-A' });
  await buildA;
  assert.equal(aCommits, 0);
  assert.equal(host.__xmlCiiPreviewGeneration, bGeneration);
  assert.equal(host.dataset.mcPreviewBuildCompleted, 'true');
  assert.equal(readXmlCiiPreviewRatingSnapshot().revision, bRevision);
  assert.match(host.textContent, /source-B/);
  assert.doesNotMatch(host.textContent, /source-A/);
  assert.equal(bResults[0].stagedJsonText, '{"source":"B"}');
});

test('F — Fetch Rating as per DTXR uses the latest branch rows and rebuilds', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const config = makeConfig();
  const commits = [];
  await buildV7Preview(root, XML, config, options({ onPreviewCommitted: (r) => commits.push(r) }));
  const first = commits.at(-1);
  assert.equal(first.branchRows[0].branchName, '/REG/B1');
  assert.equal(first.branchRows[0].ratingDtxr, '900', 'real DTXR evidence must resolve');
  const button = host.querySelector('[data-mc-dtxr-rating-fetch]');
  assert.ok(button);
  button.click();
  await waitFor(() => commits.length >= 2 && host.dataset.mcPreviewBuildCompleted === 'true');
  assert.equal(config.overrides.rating['/REG/B1'], '900');
  assert.equal(commits.at(-1).branchRows[0].rating, '900');
  assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '900');
  assert.ok(host.querySelector('[data-mc-dtxr-rating-fetch]'));
});

test('manual Build retains the original direct completion callback', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const commits = [];
  await buildV7Preview(root, XML, makeConfig(), options({
    forceBuild: false,
    onPreviewCommitted: (r) => commits.push(r),
  }));
  assert.equal(commits.length, 0);
  const button = host.querySelector('[data-mc-preview-build]');
  assert.ok(button);
  button.click();
  await waitFor(() => commits.length === 1 && host.dataset.mcPreviewBuildCompleted === 'true');
  assert.equal(commits[0].branchRows.length, 2);
  assert.ok(host.querySelector('[data-resizable-table="branch-preview"]'));
});

test('failed calculation never publishes a rating or completion status', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  let commits = 0;
  await assert.rejects(
    buildV7Preview(root, XML, null, options({ onPreviewCommitted: () => { commits++; } })),
    TypeError,
  );
  assert.equal(commits, 0);
  assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 0);
  assert.equal(host.dataset.mcPreviewBuildCompleted, 'false');
});

test('discarded host cannot publish when asynchronous source resolution completes', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const gate = deferred();
  let commits = 0;
  const running = buildV7Preview(root, XML, makeConfig(), options({
    resolveStagedJsonText: () => gate.promise,
    onPreviewCommitted: () => { commits++; },
  }));
  host.isConnected = false;
  gate.resolve({ text: '{}', label: 'discarded' });
  await running;
  assert.equal(commits, 0);
  assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 0);
  assert.equal(host.dataset.mcPreviewBuildCompleted, 'false');
});


test('generation :257 — stale A finishing after B must not recalculate or publish', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const staleSource = deferred();
  const aConfig = makeConfig();
  let aCalculations = 0;
  Object.defineProperty(aConfig, 'shortElementLengthDropThresholdMm', {
    get() {
      // The real dry-run reads this field during calculation. An obsolete
      // source must be rejected at :257 before any recalculation can occur.
      aCalculations += 1;
      return 6;
    },
  });
  const oldResults = [];
  const aJob = buildLegacyPreview(root, XML, aConfig, options({
    resolveStagedJsonText: () => staleSource.promise,
    onPreviewCommitted: (result) => {
      oldResults.push(result);
      publishXmlCiiPreviewRatingSnapshot(result.branchRows);
    },
  }));

  const newResults = [];
  const bConfig = makeConfig();
  bConfig.overrides.rating['/REG/B1'] = '600';
  await buildLegacyPreview(root, XML, bConfig, options({
    stagedSourceLabel: 'newer-B',
    onPreviewCommitted: (result) => {
      newResults.push(result);
      publishXmlCiiPreviewRatingSnapshot(result.branchRows);
    },
  }));
  assert.equal(newResults.length, 1, 'newer B must actually commit first');
  assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '600');
  const revisionB = readXmlCiiPreviewRatingSnapshot().revision;

  staleSource.resolve({ text: '{}', label: 'older-A' });
  await aJob; // A finishes AFTER B, exercising the real legacy :257 guard.
  assert.equal(aCalculations, 0, 'superseded A must not enter the calculator');
  assert.equal(oldResults.length, 0, 'superseded A must not publish');
  assert.equal(readXmlCiiPreviewRatingSnapshot().revision, revisionB);
  assert.match(host.textContent, /newer-B/);
  assert.doesNotMatch(host.textContent, /older-A/);
});

test('generation :259 — a newer request during the synchronous dry-run blocks obsolete rendering', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const newSource = deferred();
  const aConfig = makeConfig();
  const bConfig = makeConfig();
  bConfig.overrides.rating['/REG/B1'] = '600';
  let bJob;
  let bRequested = 0;
  const oldResults = [];
  const newResults = [];

  Object.defineProperty(aConfig, 'shortElementLengthDropThresholdMm', {
    get() {
      if (bRequested++ === 0) {
        // This getter runs inside the production calculation, after :257
        // and before :259. Request B while A is still calculating.
        bJob = buildLegacyPreview(root, XML, bConfig, options({
          resolveStagedJsonText: () => newSource.promise,
          onPreviewCommitted: (result) => {
            newResults.push(result);
            publishXmlCiiPreviewRatingSnapshot(result.branchRows);
          },
        }));
      }
      return 6;
    },
  });
  await buildLegacyPreview(root, XML, aConfig, options({
    stagedSourceLabel: 'obsolete-A',
    onPreviewCommitted: (result) => { oldResults.push(result); },
  }));
  assert.ok(bRequested > 0, 'B must have been requested from inside the real calculator');
  assert.ok(bJob, 'B must be an actual pending Preview generation');
  assert.equal(
    host.querySelector('[data-resizable-table="branch-preview"]'),
    null,
    'A must not render an obsolete table while B waits for source resolution',
  );
  assert.equal(oldResults.length, 0);

  newSource.resolve({ text: '{}', label: 'newer-B' });
  await bJob;
  assert.equal(newResults.length, 1);
  assert.equal(newResults[0].branchRows[0].rating, '600');
  assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '600');
  assert.match(host.textContent, /newer-B/);
});

test('generation :421 — a newer request during table binding blocks obsolete callback publication', async () => {
  resetSnapshot();
  const { root, host } = makeRoot();
  const newSource = deferred();
  const originalQueryAll = host.querySelectorAll.bind(host);
  const bConfig = makeConfig();
  bConfig.overrides.rating['/REG/B1'] = '600';
  let bJob;
  let startedB = false;
  const oldResults = [];
  const newResults = [];

  host.querySelectorAll = (selector) => {
    // The production editable table calls this selector from table.bind().
    // That occurs AFTER :259 and BEFORE the final commit guard at :421.
    if (selector === '[data-mc-edit-type]' && !startedB) {
      startedB = true;
      bJob = buildLegacyPreview(root, XML, bConfig, options({
        resolveStagedJsonText: () => newSource.promise,
        onPreviewCommitted: (result) => {
          newResults.push(result);
          publishXmlCiiPreviewRatingSnapshot(result.branchRows);
        },
      }));
    }
    return originalQueryAll(selector);
  };

  await buildLegacyPreview(root, XML, makeConfig(), options({
    stagedSourceLabel: 'obsolete-A',
    onPreviewCommitted: (result) => {
      oldResults.push(result);
      publishXmlCiiPreviewRatingSnapshot(result.branchRows);
    },
  }));
  assert.equal(startedB, true, 'new generation must start inside real table binding');
  assert.ok(bJob, 'B must be an actual pending Preview generation');
  assert.equal(oldResults.length, 0, 'obsolete A must not invoke the publication callback at :421');
  assert.equal(readXmlCiiPreviewRatingSnapshot().records.length, 0);

  newSource.resolve({ text: '{}', label: 'newer-B' });
  await bJob;
  assert.equal(newResults.length, 1);
  assert.equal(newResults[0].branchRows[0].rating, '600');
  assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '600');
  assert.match(host.textContent, /newer-B/);
});


test('R5 successful Build and Rebuild never write the v7 envelope key', async () => {
  resetSnapshot();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  const written = [];
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { written.push(key); values.set(key, String(value)); },
    removeItem: (key) => values.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const { root, host } = makeRoot();
    const config = makeConfig();
    const results = [];
    const callbacks = options({ onPreviewCommitted: (result) => results.push(result) });
    await buildV7Preview(root, XML, config, callbacks);
    assert.equal(results.length, 1);
    assert.equal(host.dataset.mcPreviewBuildCompleted, 'true');
    assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '150');
    assert.equal(values.has(XML_CII_PREVIEW_CACHE_KEY), false, 'Build cannot leave a persisted envelope');
    assert.equal(written.includes(XML_CII_PREVIEW_CACHE_KEY), false, 'Build cannot write an envelope');

    config.overrides.rating['/REG/B1'] = '600';
    await buildV7Preview(root, XML, config, callbacks);
    assert.equal(results.length, 2);
    assert.equal(results[1].branchRows[0].rating, '600');
    assert.equal(readXmlCiiPreviewRatingSnapshot().records[0].rating, '600');
    assert.equal(values.has(XML_CII_PREVIEW_CACHE_KEY), false, 'Rebuild cannot leave a persisted envelope');
    assert.equal(written.includes(XML_CII_PREVIEW_CACHE_KEY), false, 'Rebuild cannot write an envelope');
  } finally {
    clearXmlCiiPreviewRatingSnapshot();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
