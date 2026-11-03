import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewPerBuildCache } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-per-build-cache.js';
import { rankXmlCiiWeightCandidates } from '../converters/xml-cii2019-core/weight-valve-hints.js';

function masterRows() {
  return [
    { bore: 50, rating: 150, length: 100, valveType: 'GATE VALVE', weight: 10, Type: 'GV', DN: 50, Rating: 150 },
    { bore: 50, rating: 150, length: 120, valveType: 'GATE VALVE', weight: 12, Type: 'GV', DN: 50, Rating: 150 },
  ];
}
const context = {
  boreMm: 50, rating: 150, lengthMm: 100, nodeName: 'GATE VALVE',
  componentType: 'VALV', componentRefNo: '=G1', dtxr: 'GATE VALVE',
};

test('one Preview build memoizes only structurally identical ranking inputs and config', () => {
  const config = { weight: { masterRows: masterRows() } };
  const cache = createPreviewPerBuildCache();
  const first = cache.rankWeight(context, config, { includeRejected: true });
  assert.deepStrictEqual(first, rankXmlCiiWeightCandidates(context, config, { includeRejected: true }));
  const again = cache.rankWeight({ ...context }, config, { includeRejected: true });
  assert.deepStrictEqual(first, again);
  assert.notStrictEqual(first, again, 'ranking object identity must not leak between nodes');
  assert.equal(cache.stats.rankHits, 1);
  assert.equal(cache.stats.rankComputes, 1);

  cache.rankWeight({ ...context, nodeName: 'CHECK VALVE' }, config, { includeRejected: true });
  cache.rankWeight({ ...context, dtxr: 'UNKNOWN COMPONENT' }, config, { includeRejected: true });
  cache.rankWeight(context, config, { includeRejected: false });
  cache.rankWeight(context, { ...config }, { includeRejected: true });
  assert.equal(cache.stats.rankHits, 1);
  assert.equal(cache.stats.rankComputes, 5);
});

test('cached ranking snapshots are independent of the first caller mutable result', () => {
  const config = { weight: { masterRows: masterRows() } };
  const cache = createPreviewPerBuildCache();
  const first = cache.rankWeight(context, config, { includeRejected: true });
  const expected = structuredClone(first);
  first.candidates.push({ invented: true });
  const second = cache.rankWeight(context, config, { includeRejected: true });
  assert.deepStrictEqual(second, expected);
  assert.equal(cache.stats.rankHits, 1);
});

test('class index is shared only for identical master-row array identity per build', () => {
  const cache = createPreviewPerBuildCache();
  const rows = [{ 'Piping Class': '93833', DN: 50, Rating: 900 }];
  const first = cache.getPipingClassIndex(rows);
  const second = cache.getPipingClassIndex(rows);
  const third = cache.getPipingClassIndex(rows.map((row) => ({ ...row })));
  assert.strictEqual(first, second);
  assert.notStrictEqual(first, third);
  assert.deepStrictEqual(
    { classBuilds: cache.stats.classBuilds, classHits: cache.stats.classHits },
    { classBuilds: 2, classHits: 1 },
  );
});

test('a new Preview invocation does not reuse stale rankings or mutated master indices', () => {
  const rows = masterRows();
  const config = { weight: { masterRows: rows } };
  const firstBuild = createPreviewPerBuildCache();
  firstBuild.rankWeight(context, config, { includeRejected: true });
  rows[0].weight = 22;
  const newBuild = createPreviewPerBuildCache();
  const fresh = newBuild.rankWeight(context, config, { includeRejected: true });
  assert.deepStrictEqual(fresh, rankXmlCiiWeightCandidates(context, config, { includeRejected: true }));
  assert.equal(newBuild.stats.rankHits, 0);
  assert.equal(newBuild.stats.rankComputes, 1);
});
