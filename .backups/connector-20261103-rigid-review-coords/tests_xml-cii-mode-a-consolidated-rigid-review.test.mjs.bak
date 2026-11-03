import assert from 'node:assert/strict';
import {
  buildModeAPreviewFillPlan,
  modeAPreviewFillGroupKey,
  modeAPreviewFillRule,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-bulk-preview.js';
import {
  applyModeAConsolidatedRigidReviewUpdates,
  flattenModeARigidReviewEntries,
  modeARigidReviewIdentity,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-review-mode-a-state.js';

assert.deepEqual(
  modeAPreviewFillRule('materialCode'),
  { field: 'materialCode', scope: 'class-size', label: 'Same Piping Class + Size' },
);

const materialRows = [
  { sourceId: 'A', branchName: '/A/B1', pipingClass: 'PC1', size: '80mm', materialCode: '106', materialCodeMethod: 'piping-class-size' },
  { sourceId: 'A', branchName: '/A/B2', pipingClass: 'PC1', size: '80mm', materialCode: '', materialCodeMethod: 'none' },
  { sourceId: 'B', branchName: '/B/B1', pipingClass: 'PC1', size: '100mm', materialCode: '', materialCodeMethod: 'none' },
];
assert.equal(modeAPreviewFillGroupKey(materialRows[0], 'materialCode'), 'PC:PC1|DN:80');
const materialPlan = buildModeAPreviewFillPlan(materialRows, materialRows[0], 'materialCode');
assert.equal(materialPlan.changes.length, 1, 'Material Code must fill only the same Piping Class + Size group');
assert.equal(materialPlan.changes[0].branchName, '/A/B2');
assert.equal(materialPlan.changes[0].materialCodeKey, 'PC:PC1|DN:80');
assert(!materialPlan.changes.some((row) => row.branchName === '/B/B1'), 'different size must not receive Material Code');

const entries = [
  { sourceId: 'SRC-A', fileName: 'A.xml', issues: [{ key: '/SAME/B1::100', branchName: '/SAME/B1' }] },
  { sourceId: 'SRC-B', fileName: 'B.xml', issues: [{ key: '/SAME/B1::100', branchName: '/SAME/B1' }] },
];
const flat = flattenModeARigidReviewEntries(entries);
assert.equal(flat.length, 2);
assert.notEqual(flat[0].reviewId, flat[1].reviewId, 'same engineering key in different XMLs must remain source-distinct');
assert.equal(flat[0].reviewId, modeARigidReviewIdentity('SRC-A', '/SAME/B1::100'));

const state = {
  supportConfigJson: JSON.stringify({ stale: true }),
  sourceBatch: {
    activeSourceId: 'SRC-A',
    sources: [
      { sourceId: 'SRC-A', supportConfigJson: JSON.stringify({ overrides: { other: { keep: 1 } } }) },
      { sourceId: 'SRC-B', supportConfigJson: '{}' },
    ],
  },
};
const updated = applyModeAConsolidatedRigidReviewUpdates(state, {
  'SRC-A': { ratingsByKey: { '/SAME/B1::100': '900' }, weightsByKey: { '/SAME/B1::100': 24.3 } },
  'SRC-B': { ratingsByKey: { '/SAME/B1::100': '600' }, weightsByKey: { '/SAME/B1::100': 31.7 } },
});
const configA = JSON.parse(updated.sourceBatch.sources[0].supportConfigJson);
const configB = JSON.parse(updated.sourceBatch.sources[1].supportConfigJson);
assert.equal(configA.overrides.rigidWeight['/SAME/B1::100'], 24.3);
assert.equal(configB.overrides.rigidWeight['/SAME/B1::100'], 31.7);
assert.equal(configA.overrides.rating['/SAME/B1::100'], '900');
assert.equal(configB.overrides.rating['/SAME/B1::100'], '600');
assert.equal(configA.overrides.other.keep, 1, 'unrelated source-local config must be preserved');
assert.deepEqual(JSON.parse(updated.supportConfigJson), configA, 'root active-source config must align with reviewed active XML before Mode A sync');

console.log('xml-cii Mode A consolidated rigid review tests: PASS');
