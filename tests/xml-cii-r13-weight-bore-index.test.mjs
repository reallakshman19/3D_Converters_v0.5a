import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createXmlCiiWeightBoreIndex, rankXmlCiiWeightCandidates,
} from '../converters/xml-cii2019-core/weight-valve-hints.js';

test('G2: scoped bore index preserves ranked candidates and master order', () => {
  const sameA = { boreMm: '150', lengthMm: '300', valveWeight: '42',
    ratingClass: '150', type: 'GATE VALVE', typeDesc: 'GATE' };
  const excluded = { boreMm: '250', lengthMm: '300', valveWeight: '60',
    ratingClass: '150', type: 'GATE VALVE' };
  const sameB = { boreMm: '150', lengthMm: '315', valveWeight: '44',
    ratingClass: '150', type: 'GATE VALVE' };
  const config = { weight: { masterRows: [sameA, excluded, sameB],
    useNodeNameValveHints: false } };
  const index = createXmlCiiWeightBoreIndex(config);
  assert.deepEqual(index.forBore(150), [sameA, sameB]);
  assert.strictEqual(index.forBore(150), index.forBore(150), 'per-bore index must reuse rows');
  const context = { boreMm: 150, lengthMm: 300, rating: '150', nodeName: 'VALVE' };
  const unindexed = rankXmlCiiWeightCandidates(context, config, { includeRejected: true });
  const indexed = rankXmlCiiWeightCandidates(context, config, {
    includeRejected: true, candidateRows: index.forBore(context.boreMm),
  });
  assert.deepEqual(indexed, unindexed, 'selected weight, rejected rows and tie-breaks unchanged');
  assert.equal(indexed.best?.weight, 42);
  const empty = rankXmlCiiWeightCandidates(context, config, {
    includeRejected: true, candidateRows: [],
  });
  assert.equal(empty.best?.zeroFallback, true, 'empty candidate scope returns the explicit zero-weight review fallback');
  assert.notEqual(empty.best?.weight, indexed.best?.weight,
    'ignoring candidateRows would wrongly return the 42 kg master candidate');
  // Behavior mutants: ignoring candidateRows breaks the empty-index assertion;
  // wrong bore filtering breaks the selected weight and parity assertions.
});
