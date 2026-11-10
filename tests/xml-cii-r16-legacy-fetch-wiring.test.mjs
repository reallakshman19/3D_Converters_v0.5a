import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Execute the actual production popup initialization function with its
// callbacks and generation state, rather than checking source text patterns.
async function popupHarness(saveConfig) {
  const source = await readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');
  const from = source.indexOf('  async function xmlCiiInitializePopupPreviewV7(target) {');
  const to = source.indexOf('  function _xmlCiiOpenPreviewOverridePopup(', from);
  assert.ok(from > 0 && to > from, 'real legacy Preview callback block exists');
  const body = source.slice(from, to);
  const actions = { journal: [], barriers: 0, releases: [], aborted: 0, options: null };
  const invoke = new Function('saveConfig', 'actions',
    'let xmlCiiConfigSaveGeneration = 100;\n' +
    'let xmlCiiAbortFetchWorker = () => { actions.aborted++; };\n' +
    'const xmlCiiCurrentPrimaryFile = () => ({ text: async () => "<Root/>" });\n' +
    'const xmlCiiConfigWithLoadedMasterRows = () => ({ overrides: {} });\n' +
    'const _xmlCiiOpenPreviewOverridePopup = () => {};\\n' +
    'const xmlCiiEnsureOverrides = () => {};\\n' +
    'const xmlCiiCurrentStagedJsonSource = () => ({ text: "{}" });\\n' +
    'const xmlCiiBuildAndRenderPreviewV7 = async (target, xml, config, options) => { actions.options = options; };\n' +
    'const xmlCiiSaveConfig = (...args) => saveConfig(...args);\n' +
    'const stageXmlCiiFetchedRatings = (...args) => actions.journal.push(args);\n' +
    'const xmlCiiStageFetchSaveBarrier = () => { actions.barriers++; };\n' +
    'const xmlCiiCompleteFetchSaveBarrier = (...args) => actions.releases.push(args);\n' +
    body + '\nreturn { init: xmlCiiInitializePopupPreviewV7, generation: () => xmlCiiConfigSaveGeneration };');
  const bridge = invoke(saveConfig, actions);
  const host = { textContent: '' };
  const root = { isConnected: true, querySelector: () => host };
  await bridge.init(root);
  assert.ok(actions.options);
  return { actions, bridge };
}

test('K2/J1/J4a/J4b: real popup stages a rating journal, bumps generation, and aborts older Worker immediately', async () => {
  const { actions, bridge } = await popupHarness(async () => 'full');
  const config = { overrides: { rating: { B1: '900' }, __dtxrRatingKeys: { B1: true } } };
  const generation = bridge.generation();
  actions.options.onStageRatingOverrides(config, { previousFetchedKeys: ['B0'], revision: 1 });
  assert.equal(actions.journal.length, 1, 'J1: stage journal before any Worker save');
  assert.strictEqual(actions.journal[0][0], config.overrides);
  assert.deepEqual(actions.journal[0][1], ['B0']);
  assert.equal(actions.barriers, 1, 'must block Run before the Worker exists');
  assert.equal(bridge.generation(), generation + 1, 'J4a: stage invalidates prior save generation');
  assert.equal(actions.aborted, 1, 'J4b: stage cancels prior Worker, not merely generation check');
  // Mutants J1, J4a, J4b: removing stage / increment / abort makes RED.
});

test('K2/W3/J4e: actual Preview Fetch save requests background Worker and does not release barrier for superseded save', async () => {
  let result = 'superseded';
  const requests = [];
  const { actions } = await popupHarness(async (...args) => {
    requests.push(args);
    return result;
  });
  const config = { overrides: { rating: { B1: '900' } } };
  const stale = await actions.options.onSaveConfig(config, { fetchRating: true });
  assert.equal(stale, 'superseded');
  assert.equal(actions.releases.length, 0, 'J4e: superseded Worker cannot unblock Run');
  result = 'full';
  const latest = await actions.options.onSaveConfig(config, { fetchRating: true });
  assert.equal(latest, 'full');
  assert.deepEqual(requests[0], [config, { compact: true, background: true }],
    'W3: Fetch must route to background worker, not sync serialization');
  assert.equal(actions.releases.length, 1, 'only latest successful save clears barrier');
  // Mutants W3/J4e: false background or unguarded superseded release make RED.
});

test('K2/J4f: actual popup save failure rejects waiting Run barrier and propagates error', async () => {
  const failure = Error('Worker could not serialize');
  const { actions } = await popupHarness(async () => { throw failure; });
  await assert.rejects(actions.options.onSaveConfig({ overrides: {} }, { fetchRating: true }),
    /Worker could not serialize/);
  assert.equal(actions.releases.length, 1);
  assert.strictEqual(actions.releases[0][0], failure);
  // Mutant J4f: swallowing failure or omitting barrier rejection makes RED.
});
