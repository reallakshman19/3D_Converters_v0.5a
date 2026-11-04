import assert from 'node:assert/strict';
import { digestRigidOwnershipSnapshot } from '../converters/xml-cii2019-core/rigid-weight-snapshot.js';

const example = {
  sourceId: 'mode-A-model-1',
  sourceName: 'GLRD-1000-PSI-02.xml',
  sourceText: '<Source><Branch name="X"/></Source>',
  stagedJsonText: '{"children":[{"type":"FLAN"}]}',
  supportConfigJson: JSON.stringify({
    weight: { masterRows: [{ bore: 50, rating: 900, weight: 15 }] },
    rigidOwnership: { requireAllocation: true },
  }),
  branchSelection: { selectedBranchOccurrenceIds: ['BR-1'] },
  options: { outputMode: 'both', kgToNewton: true },
  preparedXmlText: '<Prepared><NodeNumber>460</NodeNumber><Weight>15</Weight></Prepared>',
};
const original = await digestRigidOwnershipSnapshot(example);
assert.match(original, /^sha256:[a-f0-9]{64}$/);
assert.equal(original, await digestRigidOwnershipSnapshot(example),
  'same exact snapshot must be deterministic');
const overrides = [
  { sourceId: 'mode-A-model-2' },
  { sourceText: example.sourceText.replace('X', 'Y') },
  { stagedJsonText: example.stagedJsonText.replace('FLAN', 'VALV') },
  { branchSelection: { selectedBranchOccurrenceIds: ['BR-2'] } },
  { supportConfigJson: JSON.stringify({ weight: { masterRows: [{ bore: 50, rating: 900, weight: 14 }] }, rigidOwnership: { requireAllocation: true } }) },
  { options: { outputMode: 'both', kgToNewton: false } },
  { preparedXmlText: example.preparedXmlText.replace('15', '150') },
];
for (const changed of overrides) {
  assert.notEqual(await digestRigidOwnershipSnapshot({ ...example, ...changed }), original,
    'source/master/selection/options/enriched geometry/weight changes invalidate ownership');
}
const withApproval = {
  ...example,
  supportConfigJson: JSON.stringify({
    weight: { masterRows: [{ bore: 50, rating: 900, weight: 15 }] },
    rigidOwnership: {
      requireAllocation: true,
      allocations: { 'rigid-split:example': { allocationType: 'COMPONENT_LUMPED', ownerNodeOrdinal: 1 } },
      approvedSnapshotDigest: original,
    },
  }),
};
assert.equal(await digestRigidOwnershipSnapshot(withApproval), original,
  'ownership approval record must not recursively alter its own snapshot');
console.log('RIGID_OWNERSHIP_SNAPSHOT_PASS', original);
