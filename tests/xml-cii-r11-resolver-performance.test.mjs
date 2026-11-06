import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPipingClassIndex, findBestPipingClassRow, resolveApproximatePipingClass,
  scorePipingClassCandidate, readPipingClassIndexCacheStats,
} from '../converters/xml-cii2019-core/piping-class-resolver.js';

test('R11 D2 repeated indexed family lookup is cached without changing the chosen row', () => {
  const rows = Array.from({length: 400}, (_, i) => ({
    pipingClass: 'P' + String(100000 + i), convertedBore: 150,
    rating: i % 2 ? 300 : 150, componentType: 'PIPE',
  }));
  rows.push({ pipingClass: 'P4110001', convertedBore: 150, rating: 150, componentType: 'PIPE' });
  const index = buildPipingClassIndex(rows);
  const first = findBestPipingClassRow({ pipingClass:'P4110001', boreMm:150, componentType:'PIPE', rating:150,
    pipingClassIndex:index, config:{} });
  const second = findBestPipingClassRow({ pipingClass:'P4110001', boreMm:150, componentType:'PIPE', rating:150,
    pipingClassIndex:index, config:{} });
  assert.equal(first.row?.pipingClass, 'P4110001');
  assert.deepEqual(second, first, 'all scoring, confidence, reasons and tie breaks remain identical');
  const stats = readPipingClassIndexCacheStats(index);
  assert.ok(stats.familyCacheHits >= 1, 'removing per-index family memo must make this test RED');
  assert.ok(stats.distinctFamilyLookups >= 1);
});

test('R11 D2 config/override changes are not cached as resolved scores', () => {
  const index = buildPipingClassIndex([{ pipingClass:'P4110001', convertedBore: 150 }]);
  const a = resolveApproximatePipingClass({ requestedClass:'P4110001', pipingClassIndex:index });
  const b = resolveApproximatePipingClass({ requestedClass:'P4110001', pipingClassIndex:index,
    overrides:{ pipingClass:{ P4110001:'P9999999' } } });
  assert.equal(a.method, 'exact');
  assert.equal(b.method, 'override');
  assert.equal(b.pipingClass, 'P9999999');
  assert.equal(scorePipingClassCandidate('A100','A100').method, 'exact');
});

test('R11 D2 timing marks instrument piping-class index, weight hints and Fetch Rating', async () => {
  const { readFile } = await import('node:fs/promises');
  const [piping, hints, wrapper] = await Promise.all([
    readFile(new URL('../converters/xml-cii2019-core/piping-class-resolver.js', import.meta.url), 'utf8'),
    readFile(new URL('../converters/xml-cii2019-core/weight-valve-hints.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js', import.meta.url), 'utf8'),
  ]);
  assert.match(piping, /xml-cii:piping-class:index/);
  assert.match(hints, /xml-cii:weight-hints:rank/);
  assert.match(wrapper, /xml-cii:popup:fetch-rating/);
});
