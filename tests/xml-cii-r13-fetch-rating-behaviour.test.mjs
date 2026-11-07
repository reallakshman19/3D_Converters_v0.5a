import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { installDtxrRatingAction } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js';

test('G1: Fetch notice and live Rating are committed before config save or rebuild', async () => {
  const previousDocument = globalThis.document;
  const seen = [];
  const value = { textContent: '150' };
  const cell = {
    dataset: {},
    querySelector(selector) { return selector === '.mc-preview-editable-val' ? value : null; },
  };
  let fetchButton;
  const actionBar = {
    querySelector() { return null; },
    appendChild(button) { fetchButton = button; },
  };
  const host = {
    dataset: { mcPreviewBuildCompleted: 'true' },
    isConnected: true,
    __xmlCiiPreviewGeneration: 1,
    querySelector(selector) {
      if (selector === '[data-mc-preview-build]') return { parentElement: actionBar };
      if (selector === '[data-mc-edit-type="rating"][data-mc-edit-row="0"]') return cell;
      return null;
    },
    insertAdjacentHTML(_position, html) { seen.push(html); },
  };
  const rootEl = {
    isConnected: true,
    querySelector(selector) { return selector === '#mc-preview-table-host' ? host : null; },
  };
  globalThis.document = {
    createElement() {
      return {
        dataset: {}, style: {}, disabled: false,
        addEventListener(name, callback) {
          if (name === 'click') this.click = callback;
        },
      };
    },
  };
  let saveCalls = 0;
  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const config = { overrides: { rating: {}, __dtxrRatingKeys: {} } };
  const rows = [{
    branchName: '/A/B1', lineKey: 'L1',
    rating: '150', ratingDerived: '150',
    ratingDtxr: '900', ratingDtxrRatings: ['900'],
  }];
  try {
    installDtxrRatingAction({
      host, rootEl, xmlText: '<xml/>', config, branchRows: rows,
      options: { onSaveConfig: () => { saveCalls++; return saveGate; } },
    });
    assert.ok(fetchButton?.click, 'production Fetch listener was installed');
    fetchButton.click();
    assert.equal(config.overrides.rating['/A/B1'], '900');
    assert.equal(rows[0].rating, '900');
    assert.equal(value.textContent, '900');
    assert.equal(host.dataset.mcPreviewBuildCompleted, 'true');
    assert.ok(seen.some(html => html.includes('Fetched DTXR Rating for 1 branch')));
    assert.equal(saveCalls, 0, 'save cannot run in the user-visible click handler');
    assert.ok(performance.getEntriesByName('xml-cii:popup:fetch-click-to-notice', 'measure').length);
    await new Promise(ok => setTimeout(ok, 20));
    assert.equal(saveCalls, 1, 'exactly one deferred persistence call is scheduled');
    assert.equal(host.dataset.mcPreviewBuildCompleted, 'true');
  } finally {
    releaseSave?.();
    globalThis.document = previousDocument;
  }
  // Behavior mutant: waiting for onSaveConfig before notice would fail the
  // immediate DOM/mark assertions; reintroducing rebuild changes completed flag.
});
