/**
 * Issue #7: AUDIT-ONLY RED TESTS.
 * These tests pass when a claimed invariant is *violated* by the currently
 * quarantined experimental cache. Passing is a confirmed counterexample,
 * NOT approval to ship the candidate. Do not add this file to a prod gate
 * without changing its expected-failure semantics.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewPerBuildCache } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-per-build-cache.js';
import { rankXmlCiiWeightCandidates } from '../converters/xml-cii2019-core/weight-valve-hints.js';
import { buildPipingClassIndex } from '../converters/xml-cii2019-core/piping-class-resolver.js';
import { _xmlCiiFindLineListRow, _lineListRowKey } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js';
import { xmlCiiFindLineListRow } from '../tabs/model-converters/converters/xmltocii2019_helper/enrichment-core.js';

const context = Object.freeze({
  boreMm: 50, rating: 150, lengthMm: 100, nodeName: 'VGT',
  componentType: 'VALV', componentRefNo: '=GLRD-V1', dtxr: 'GATE VALVE',
});
const opts = Object.freeze({ includeRejected: true });
function weightConfig() {
  return { weight: { masterRows: [
    { bore: 50, rating: 150, length: 100, valveType: 'GATE VALVE', weight: 10, Type: 'GV', DN: 50, Rating: 150 },
    { bore: 50, rating: 150, length: 120, valveType: 'GATE VALVE', weight: 12, Type: 'GV', DN: 50, Rating: 150 },
  ] } };
}
function report(id, finding, evidence) {
  console.log('AUDIT_COUNTEREXAMPLE ' + JSON.stringify({ id, finding, evidence }));
}

test('CONTROL: same context and unchanged config produce identical ranking', () => {
  const config = weightConfig();
  const cache = createPreviewPerBuildCache();
  const first = cache.rankWeight(context, config, opts);
  const second = cache.rankWeight({ ...context }, config, opts);
  assert.deepStrictEqual(first, second);
  assert.deepStrictEqual(second, rankXmlCiiWeightCandidates(context, config, opts));
  assert.equal(cache.stats.rankHits, 1);
});

test('D-01a: in-place weight master update under same identity returns stale cached ranking', () => {
  const config = weightConfig();
  const cache = createPreviewPerBuildCache();
  const before = cache.rankWeight(context, config, opts);
  const beforeSnapshot = structuredClone(before);
  config.weight.masterRows[0].weight = 77; // same nested rows array, different source engineering value
  const cached = cache.rankWeight(context, config, opts);
  const direct = rankXmlCiiWeightCandidates(context, config, opts);
  assert.notDeepStrictEqual(beforeSnapshot, direct, 'Control mutation must materially change the oracle');
  assert.deepStrictEqual(cached, beforeSnapshot, 'Current cache replays stale pre-mutation snapshot');
  assert.notDeepStrictEqual(cached, direct, 'Current cache must be shown inconsistent with direct ranker');
  report('D-01a', 'STALE_MASTER_ROW', {
    masterWeightAfterMutation: config.weight.masterRows[0].weight,
    cachedEqualPreMutation: true, cachedEqualFresh: false,
    initialResultRetainsSourceRowReferences: before.candidates.some(c=>c.rowData?.weight === 77),
    rankHits: cache.stats.rankHits,
  });
});

test('D-01b: a cache hit fails to restore ranker defaults after in-place config deletion', () => {
  const config = weightConfig();
  const cache = createPreviewPerBuildCache();
  cache.rankWeight(context, config, opts);
  assert.ok(Array.isArray(config.weight.valveHintMapping));
  delete config.weight.valveHintMapping; // simulate in-place normalization-needed config edit
  const cached = cache.rankWeight(context, config, opts);
  assert.ok(cached?.candidates);
  assert.equal(Object.hasOwn(config.weight, 'valveHintMapping'), false,
    'cache hit bypasses ensureValveHintConfig');
  const direct = rankXmlCiiWeightCandidates(context, config, opts);
  assert.ok(direct?.candidates);
  assert.equal(Object.hasOwn(config.weight, 'valveHintMapping'), true,
    'direct ranker normalizes the same input configuration');
  report('D-01b', 'MISSING_CONFIG_SIDE_EFFECT', {
    cachedRestoredDefaults: false, directRestoredDefaults: true,
    rankHits: cache.stats.rankHits,
  });
});

test('D-01c: class master append reuses stale index with same array identity', () => {
  const rows = [
    { 'Piping Class': '91261', 'DN': 50, Rating: 900, ComponentType: 'PIPE' },
  ];
  const cache = createPreviewPerBuildCache();
  const old = cache.getPipingClassIndex(rows);
  rows.push({ 'Piping Class': '91262', 'DN': 50, Rating: 900, ComponentType: 'PIPE' });
  const cached = cache.getPipingClassIndex(rows);
  const direct = buildPipingClassIndex(rows);
  assert.strictEqual(cached, old, 'cache incorrectly identifies changed rows as unchanged');
  assert.notDeepStrictEqual(cached.knownClasses, direct.knownClasses);
  assert.equal(cache.stats.classHits, 1);
  report('D-01c', 'STALE_CLASS_INDEX', {
    cachedClasses: cached.knownClasses, freshClasses: direct.knownClasses,
    sameRowsObject: true, classHits: cache.stats.classHits,
  });
});

test('B-01: literal Line Number workbook header is recognized by Preview but missed by enrichment', () => {
  const row = { Service: 'P', 'Line Number': '01001', 'Piping class': '91261', 'From': 'A', 'To': 'B' };
  const config = { linelist: { masterRows: [row], fieldMap: {} } };
  const rowKey = _lineListRowKey(row, config);
  assert.ok(rowKey, 'Preview must derive the workbook line key');
  const preview = _xmlCiiFindLineListRow(rowKey, config);
  const enrichment = xmlCiiFindLineListRow(rowKey, config);
  assert.equal(preview?.row, row);
  assert.equal(enrichment, null);
  report('B-01', 'MATCHER_FIELD_SCHEMA_DIVERGENCE', {
    rowKey, workbookHeaders: Object.keys(row),
    previewMatched: true, earlyEnrichmentMatched: false,
  });
});
