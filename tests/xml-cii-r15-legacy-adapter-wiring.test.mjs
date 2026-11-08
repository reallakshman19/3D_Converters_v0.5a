import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { armFirstXmlCiiPreviewBuild } from '../tabs/model-converters/workflow/preview-first-click.js';

const loadAdapter = () => readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');

test('J3/H1b: actual legacy renderPhaseInto first-visible Build is armed and replays once', async () => {
  // Execute the production adapter's phase-selection and arm handoff, not an
  // independently recreated call to the helper. The rest of its binding block
  // is irrelevant to the first-visible-button race.
  const src = await loadAdapter();
  const signature = '    renderPhaseInto(target, phaseId) {';
  const from = src.indexOf(signature);
  const to = src.indexOf('      // Event binding is best-effort:', from);
  assert.ok(from >= 0 && to > from, 'production Preview phase entry exists');
  const body = src.slice(from + signature.length, to);
  let firstListener = null;
  let builds = 0;
  const firstButton = { disabled: false, dataset: {},
    addEventListener(_type, callback) { firstListener = callback; },
    click() { if (!this.disabled) firstListener?.(); },
  };
  const boundButton = { disabled: false, click() { builds++; } };
  const host = { isConnected: true, button: firstButton,
    querySelector() { return this.button; } };
  const target = { dataset: {}, isConnected: true,
    querySelector: () => host, querySelectorAll: () => [],
    set innerHTML(value) { this.lastHtml = value; },
  };
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const initialize = async () => { await gate; host.button = boundButton; };
  const makePhase = new Function(
    'xmlCiiRenderPreviewPhaseV7', 'xmlCiiCurrentPrimaryFile',
    'xmlCiiConfigWithLoadedMasterRows', 'armFirstXmlCiiPreviewBuild',
    'xmlCiiInitializePopupPreviewV7',
    'return function (target, phaseId) {' + body + '\n}',
  );
  const render = makePhase(
    () => '<div id="mc-preview-table-host">Build Preview</div>',
    () => ({ name: 'BM2.xml' }), () => ({ lineList: {} }),
    armFirstXmlCiiPreviewBuild, initialize,
  );
  render.call({ renderPhaseInto: () => {} }, target, 'preview');
  firstButton.click();
  assert.equal(firstButton.disabled, true, 'handler attached in actual legacy phase rendering');
  assert.equal(builds, 0);
  finish();
  await new Promise(done => setImmediate(done));
  assert.equal(builds, 1);
  // H1b mutant: deleting the arm call in legacy leaves firstListener null.
});

test('J3/R1: actual legacy Run click handler cannot pass preflight before staged Fetch is committed', async () => {
  const src = await loadAdapter();
  const signature = "  runBtnEl.addEventListener('click', async () => {";
  const from = src.indexOf(signature);
  const to = src.indexOf("    if (selectedConverter === 'xml_to_cii') {", from + signature.length);
  assert.ok(from >= 0 && to > from, 'production Run preflight exists');
  // Execute the actual preflight before its converter-specific work.
  const early = src.slice(from + signature.length, to);
  const makeRun = new Function('selectedConverter', 'xmlCiiPendingFetchBarrier', 'notify',
    'return async function () {' + early + '\n return "RUN_PROCEEDED"; }');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const run = makeRun('xml_to_cii', { pending }, () => {});
  let proceeded = false;
  const task = run().then(() => { proceeded = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(proceeded, false, 'Run cannot proceed while Fetch is still in rAF/Worker phase');
  release();
  await task;
  assert.equal(proceeded, true);
  // R1 mutant: removing the await in the production handler proceeds early.
});
