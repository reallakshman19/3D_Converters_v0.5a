import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePipingClass, readPipingClassNormalizerMemoStats,
  buildPipingClassIndex, resolveApproximatePipingClass,
} from '../converters/xml-cii2019-core/piping-class-resolver.js';
import {
  rankXmlCiiWeightCandidates, readXmlCiiWeightNumberMemoStats,
} from '../converters/xml-cii2019-core/weight-valve-hints.js';

test('R12 E2: explicit knownClasses bypasses index memo without dereferencing absent families', () => {
  const idx = buildPipingClassIndex([
    { pipingClass: '13421', convertedBore: 100 },
    { pipingClass: '93842', convertedBore: 100 },
    { pipingClass: '93111', convertedBore: 100 },
    { pipingClass: '90001', convertedBore: 100 },
  ]);
  assert.equal(resolveApproximatePipingClass({ requestedClass: '93833', pipingClassIndex: idx }).pipingClass, '93842');
  assert.equal(resolveApproximatePipingClass({ requestedClass: '93777', knownClasses: ['13421', '93111', '90001'] }).pipingClass, '93111');
  assert.equal(resolveApproximatePipingClass({ requestedClass: '98777', knownClasses: ['13421', '90001'] }).pipingClass, '90001');
});

test('R12 E3: repeated normalization hits actual memo (not merely same normalized result)', () => {
  const before = readPipingClassNormalizerMemoStats().hits;
  const label = ' R12_SPEC_ P4110001- A ';
  assert.equal(normalizePipingClass(label), 'R12_SPEC_P4110001A'.replace(/[^A-Z0-9]/g, ''));
  assert.equal(normalizePipingClass(label), 'R12SPECP4110001A');
  assert.ok(readPipingClassNormalizerMemoStats().hits > before,
    'removing normalizedClassStrings cache must turn this test RED');
});

test('R12 E3: repeated master weight numeric parsing hits memo and row edits invalidate it', () => {
  const row = { boreMm: '150', lengthMm: '300', valveWeight: '42',
    ratingClass: '150', type: 'GATE VALVE', typeDesc: 'Gate Valve' };
  const config = { weight: { masterRows: [row] } };
  const context = { boreMm: 150, lengthMm: 300, rating: '150', nodeName: 'VGT' };
  const first = rankXmlCiiWeightCandidates(context, config);
  const before = readXmlCiiWeightNumberMemoStats().hits;
  const second = rankXmlCiiWeightCandidates(context, config);
  assert.deepEqual(second, first);
  assert.ok(readXmlCiiWeightNumberMemoStats().hits > before,
    'removing WeakMap numeric memo must turn this test RED');
  row.valveWeight = '99';
  const updated = rankXmlCiiWeightCandidates(context, config);
  assert.notDeepEqual(updated.best, first.best,
    'a changed field must invalidate the memo; returning stale weight must turn RED');
});

test('R13 G1 Fetch Rating retains apply and deferred-save marks after removing redundant rebuild', async () => {
  const { readFile } = await import('node:fs/promises');
  const [wrapper, hydrator, adapter] = await Promise.all([
    readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/xml-cii-effective-class-shard-hydrator.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8'),
  ]);
  for (const phase of ['fetch-apply', 'fetch-save'])
    assert.ok(wrapper.includes('xml-cii:popup:' + phase + ':start'));
  assert.match(hydrator, /xml-cii:shard:config-serialize/);
  assert.match(hydrator, /xml-cii:shard:config-dispatch/);
  assert.match(adapter, /if \(Object\.is\(values\[field\.key\], next\)\) return;/,
    'mutant removes duplicate-write suppression: RED');
});

test('R12 E3 v7 Fetch save uses compact but semantically identical config serialization', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url), 'utf8');
  assert.match(src, /function xmlCiiSaveConfig\(config, \{ compact = false \} = \{\}\)/);
  assert.match(src, /JSON\.stringify\(config, null, compact \? 0 : 2\)/);
  assert.match(src, /xmlCiiBuildAndRenderPreviewV7\(target, xmlText, config,[\s\S]{0,170}onSaveConfig: \(newConfig\) => xmlCiiSaveConfig\(newConfig, \{ compact: true \}\)/);
  const sample = { linelist: { masterRows: [{ lineNo: 'L01' }] },
    overrides: { rating: { '/GLRD/B6': '150' } }, pipingClass: { masterRows: [{ class: 'P4110001' }] } };
  assert.deepEqual(JSON.parse(JSON.stringify(sample, null, 0)),
    JSON.parse(JSON.stringify(sample, null, 2)));
});
