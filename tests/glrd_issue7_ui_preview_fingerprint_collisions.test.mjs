/**
 * Issue #7 audit-only collision probes of the REAL (non-exported) UI Preview
 * cache fingerprint source. A PASS in these tests exposes an unsafe collision,
 * not an endorsement of the current UI cache.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const productionFile = new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js', import.meta.url);
const productionSource = await readFile(productionFile, 'utf8');
const start = productionSource.indexOf('function pvCacheFingerprint(');
const end = productionSource.indexOf('\nfunction readCache(', start);
assert.ok(start >= 0 && end > start, 'Extract the production fingerprint function, not a reimplementation');
const productionFunctionSource = productionSource.slice(start, end).trim();
const productionFingerprint = vm.runInNewContext('(' + productionFunctionSource + ')', { JSON });
const cfg = () => ({
  linelist: { masterRows: [{ 'Line Number': 'P01001' }], fieldMap: { lineSeqNo: 'Line Number' } },
  pipingClass: { masterRows: [{ 'Piping Class': '91261', Rating: '900' }] },
  weight: { masterRows: [{ bore: 50, rating: 150, length: 100, weight: 10 }] },
  processDefaults: { p1: '700', density: '100' },
  overrides: { rating: {}, rigidWeight: {}, wallThickness: {} },
});
const xml = '<Root>' + 'x'.repeat(110) + '</Root>';
function collision(id, detail) { console.log('UI_CACHE_COLLISION ' + JSON.stringify({ id, ...detail })); }

test('UI-01: XML contents change after character 80 without changing input length', () => {
  const other = xml.slice(0, -9) + 'y' + xml.slice(-8);
  assert.notEqual(xml, other);
  assert.equal(xml.length, other.length);
  assert.equal(xml.slice(0, 80), other.slice(0, 80));
  assert.equal(productionFingerprint(xml, cfg()), productionFingerprint(other, cfg()));
  collision('UI-01', { modified: 'sourceXmlAfterPrefix', matchedFingerprint: true });
});

test('UI-02: weight master value changes with constant row count', () => {
  const config = cfg();
  const original = productionFingerprint(xml, config);
  config.weight.masterRows[0].weight = 77;
  assert.equal(productionFingerprint(xml, config), original);
  collision('UI-02', { changedMasterRowWeight: [10, 77], matchedFingerprint: true });
});

test('UI-03: piping class master rating changes with constant row count', () => {
  const config = cfg();
  const original = productionFingerprint(xml, config);
  config.pipingClass.masterRows[0].Rating = '1500';
  assert.equal(productionFingerprint(xml, config), original);
  collision('UI-03', { changedPipingClassRating: ['900', '1500'], matchedFingerprint: true });
});

test('UI-04: truncated overrides can collide even with materially different end values', () => {
  const config = cfg();
  config.overrides.rigidWeight['K' + 'x'.repeat(360)] = 1;
  config.overrides.rigidWeight.tailNode = 12;
  assert.ok(JSON.stringify(config.overrides).length > 300);
  const original = productionFingerprint(xml, config);
  config.overrides.rigidWeight.tailNode = 77;
  assert.equal(productionFingerprint(xml, config), original);
  collision('UI-04', {changedTailOverride: [12, 77], matchedFingerprint: true});
});

test('UI-05: staged JSON and config weight-rule changes are absent from fingerprint', () => {
  const config = cfg();
  const original = productionFingerprint(xml, config);
  const beforeStage = '{"branch":"A","DTXR":"SCH 80"}';
  const afterStage = '{"branch":"A","DTXR":"SCH 160"}';
  assert.notEqual(beforeStage, afterStage);
  assert.equal(productionFingerprint.length, 2, 'fingerprint has no staged argument');
  config.weight.valveHintLengthToleranceMm = 900;
  config.weight.semanticKeywordRules = [{ code: 'GATE', patterns: ['ZZZ'] }];
  assert.equal(productionFingerprint(xml, config), original);
  collision('UI-05', {changedStagedAndWeightRules: true, matchedFingerprint: true,
    stagedArgumentIncluded: false});
});

test('UI control: fingerprint does distinguish visible changes to early overrides', () => {
  const config = cfg();
  const before = productionFingerprint(xml, config);
  config.overrides.rating['P01001'] = '900';
  assert.notEqual(productionFingerprint(xml, config), before);
  assert.match(productionSource, /_pvCached\?\.fp === _pvFp/);
  assert.match(productionSource, /readCache\(PV_CACHE_KEY\)/);
});
