import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { applyXmlCiiSplitRigidWeightPropagation } from '../converters/xml-cii2019-core/split-rigid-weight-propagation.js';
import { enforceStandaloneFinalRigidWeightReview } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-review-gate.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const parser = new DOMParser();

function localName(node) { return String(node?.localName || node?.nodeName || '').replace(/^.*:/, ''); }
function child(parent, name) { return [...(parent?.childNodes || [])].find(node => node.nodeType === 1 && localName(node) === name); }
function value(parent, name) { return String(child(parent, name)?.textContent || '').trim(); }
function nodesForRef(xml, branchName, ref) {
  const doc = parser.parseFromString(xml, 'application/xml');
  const branch = [...doc.getElementsByTagName('Branch')].find(b => value(b, 'Branchname') === branchName);
  assert.ok(branch, 'expected GLRD branch in XML');
  return [...branch.getElementsByTagName('Node')].filter(n => value(n, 'ComponentRefNo') === ref);
}
function hash(xml) { return createHash('sha256').update(xml).digest('hex'); }
function injectOwnerMass(xml, ownerNodeNumber, massKg) {
  const document = parser.parseFromString(xml, 'application/xml');
  const owner = [...document.getElementsByTagName('Node')].find(n => value(n, 'NodeNumber') === String(ownerNodeNumber));
  assert.ok(owner, 'GLRD owner node missing');
  assert.equal(Number(value(owner, 'Weight')), 0, 'baseline source owner must start at zero');
  child(owner, 'Weight').textContent = String(massKg);
  return { xml: new XMLSerializer().serializeToString(document),
    ref: value(owner, 'ComponentRefNo'),
    branchName: value(owner.parentNode, 'Branchname'),
    ownerNodeNumber: String(ownerNodeNumber) };
}
function weights(xml, branchName, ref) {
  return nodesForRef(xml, branchName, ref).map(n => ({
    nodeNumber: value(n, 'NodeNumber'),
    componentType: value(n, 'ComponentType'),
    endpoint: value(n, 'Endpoint'),
    weightKg: Number(value(n, 'Weight') || 0),
  }));
}
const sample = `<Root><Branch><Branchname>B-X</Branchname>
  <Node><NodeNumber>1</NodeNumber><ComponentRefNo>=F</ComponentRefNo><ComponentType>FLAN</ComponentType><Endpoint>1</Endpoint><Weight>0</Weight></Node>
  <Node><NodeNumber>2</NodeNumber><ComponentRefNo>=F</ComponentRefNo><ComponentType>RIGID</ComponentType><Endpoint>2</Endpoint><Weight>15</Weight></Node>
  </Branch></Root>`;
const intact = applyXmlCiiSplitRigidWeightPropagation(sample);
assert.equal(intact.xmlText, sample, 'split custody must be byte-preserving');
assert.equal(intact.appliedCount, 0);
assert.equal(intact.ownershipIssues.length, 0);
assert.equal(intact.stats.splitRigidWeightOwnerCandidatesPreserved, 1);
assert.deepEqual(weights(intact.xmlText, 'B-X', '=F').map(r => r.weightKg), [0, 15]);

for (const pair of [[15, 15], [15, -3]]) {
  const malformed = sample.replace('<Weight>0</Weight>', `<Weight>${pair[0]}</Weight>`).replace('<Weight>15</Weight>', `<Weight>${pair[1]}</Weight>`);
  const result = applyXmlCiiSplitRigidWeightPropagation(malformed);
  assert.equal(result.xmlText, malformed, 'conflicts must not mutate source data');
  assert.equal(result.ownershipIssues.length, 1, 'conflicting ownership must fail the split audit');
  assert.equal(result.ownershipIssues[0].allocationType, 'UNKNOWN');
}
// The separate standalone route must reject the same duplicate ownership
// before any Python converter invocation; empirical review cannot waive it.
const duplicated = sample.replace('<Weight>0</Weight>', '<Weight>15</Weight>');
const rejected = await enforceStandaloneFinalRigidWeightReview(
  { xmlText: duplicated, nodeRows: [], reviewProposals: [] },
  { sourceName: 'split-ownership.xml', supportConfigJson: '{}', options: { kgToNewton: true } },
  {},
);
assert.equal(rejected.ok, false, 'standalone export must fail closed on duplicated split masses');
assert.match(rejected.error, /RIGID split physical ownership approval is required|Structural RIGID mass ownership unresolved/);

// Scope component groups to contiguous physical occurrences, not a reused
// engineering Branchname / ComponentRefNo / NodeNumber combination.
const repeatedRef = sample.replace(
  '</Branch>',
  '<Node><NodeNumber>3</NodeNumber><ComponentType>PIPE</ComponentType><Position>5 0 0</Position></Node>' +
  '<Node><NodeNumber>1</NodeNumber><ComponentRefNo>=F</ComponentRefNo><ComponentType>FLAN</ComponentType><Endpoint>1</Endpoint><Weight>0</Weight></Node>' +
  '<Node><NodeNumber>2</NodeNumber><ComponentRefNo>=F</ComponentRefNo><ComponentType>RIGID</ComponentType><Endpoint>2</Endpoint><Weight>20</Weight></Node></Branch>'
);
const separateOccurrences = applyXmlCiiSplitRigidWeightPropagation(repeatedRef, { sourceId: 'model-A' });
assert.equal(separateOccurrences.componentLedger.length, 2);
assert.equal(separateOccurrences.ownershipIssues.length, 0);
assert.notEqual(separateOccurrences.componentLedger[0].componentOccurrenceId,
  separateOccurrences.componentLedger[1].componentOccurrenceId);
assert.deepEqual(separateOccurrences.componentLedger.map(g => g.nodes.map(n => n.weightKg)), [[0, 15], [0, 20]]);

const repeatedBranchName = sample.replace('</Root>', sample.slice('<Root>'.length, -'</Root>'.length) + '</Root>');
const distinctBranches = applyXmlCiiSplitRigidWeightPropagation(repeatedBranchName, { sourceId: 'model-A' });
assert.equal(distinctBranches.componentLedger.length, 2);
assert.equal(distinctBranches.ownershipIssues.length, 0);
assert.notEqual(distinctBranches.componentLedger[0].componentOccurrenceId,
  distinctBranches.componentLedger[1].componentOccurrenceId);

const scoped = applyXmlCiiSplitRigidWeightPropagation(sample, {
  sourceId: 'model-A', snapshotDigest: 'snapshot-A', requireAllocation: true,
});
assert.equal(scoped.ownershipIssues.length, 1, 'single positive mass without owner proof must block strict approval');
assert.equal(scoped.ownershipIssues[0].allocationType, 'UNKNOWN');
const ownerId = scoped.componentLedger[0].componentOccurrenceId;
const lumped = {
  sourceId: 'model-A', snapshotDigest: 'snapshot-A',
  allocationType: 'COMPONENT_LUMPED', componentMassKg: 15, ownerNodeOrdinal: 1,
};
const approvedLumped = applyXmlCiiSplitRigidWeightPropagation(sample, {
  sourceId: 'model-A', snapshotDigest: 'snapshot-A', requireAllocation: true,
  ownershipAllocations: { [ownerId]: lumped },
});
assert.equal(approvedLumped.ownershipIssues.length, 0);
assert.equal(approvedLumped.componentLedger[0].status, 'VALIDATED');
assert.equal(approvedLumped.componentLedger[0].allocationType, 'COMPONENT_LUMPED');

const wrongOwner = applyXmlCiiSplitRigidWeightPropagation(sample, {
  sourceId: 'model-A', snapshotDigest: 'snapshot-A', requireAllocation: true,
  ownershipAllocations: { [ownerId]: { ...lumped, ownerNodeOrdinal: 0 } },
});
assert.match(wrongOwner.ownershipIssues[0].reason, /owner-or-nonowner-mismatch/);
const stale = applyXmlCiiSplitRigidWeightPropagation(sample, {
  sourceId: 'model-A', snapshotDigest: 'changed-snapshot', requireAllocation: true,
  ownershipAllocations: { [ownerId]: lumped },
});
assert.match(stale.ownershipIssues[0].reason, /snapshot-mismatch/);
const otherModel = applyXmlCiiSplitRigidWeightPropagation(sample, {
  sourceId: 'model-B', snapshotDigest: 'snapshot-A', requireAllocation: true,
  ownershipAllocations: { [ownerId]: lumped },
});
assert.equal(otherModel.ownershipIssues.length, 1, 'Mode A identity must isolate approvals by source ID');
assert.equal(otherModel.ownershipIssues[0].allocationType, 'UNKNOWN');

const distributedXml = sample.replace('<Weight>0</Weight>', '<Weight>5</Weight>');
const distributedId = applyXmlCiiSplitRigidWeightPropagation(distributedXml, { sourceId: 'model-A' })
  .componentLedger[0].componentOccurrenceId;
const authorizedDistribution = applyXmlCiiSplitRigidWeightPropagation(distributedXml, {
  sourceId: 'model-A', snapshotDigest: 'snapshot-A', requireAllocation: true,
  ownershipAllocations: {
    [distributedId]: {
      sourceId: 'model-A', snapshotDigest: 'snapshot-A',
      allocationType: 'SEGMENT_DISTRIBUTED', componentMassKg: 20,
      childMassesKg: [{ nodeOrdinal: 0, massKg: 5 }, { nodeOrdinal: 1, massKg: 15 }],
    },
  },
});
assert.equal(authorizedDistribution.ownershipIssues.length, 0);
assert.equal(authorizedDistribution.componentLedger[0].status, 'VALIDATED');
const invalidDistribution = applyXmlCiiSplitRigidWeightPropagation(distributedXml, {
  sourceId: 'model-A', snapshotDigest: 'snapshot-A', requireAllocation: true,
  ownershipAllocations: {
    [distributedId]: {
      sourceId: 'model-A', snapshotDigest: 'snapshot-A',
      allocationType: 'SEGMENT_DISTRIBUTED', componentMassKg: 25,
      childMassesKg: [{ nodeOrdinal: 0, massKg: 5 }, { nodeOrdinal: 1, massKg: 15 }],
    },
  },
});
assert.match(invalidDistribution.ownershipIssues[0].reason, /mass-not-conserved/);
const invalidWeight = applyXmlCiiSplitRigidWeightPropagation(sample.replace('<Weight>0</Weight>', '<Weight>bad</Weight>'));
assert.match(invalidWeight.ownershipIssues[0].reason, /invalid-node-weight/);

const missing = sample.replace('<Weight>0</Weight>', '');
assert.equal(applyXmlCiiSplitRigidWeightPropagation(missing).xmlText, missing, 'missing weights must not silently receive copied mass');
const zero = sample.replace('<Weight>15</Weight>', '<Weight>0</Weight>');
assert.equal(applyXmlCiiSplitRigidWeightPropagation(zero).xmlText, zero, 'two zero siblings remain zero');

const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, index, arr) => {
  if (arg.startsWith('--')) out.push([arg.slice(2), arr[index + 1]]);
  return out;
}, []));
if (args.enriched) {
  const directory = resolve(args.out || '/tmp/glrd-split-mass');
  mkdirSync(directory, { recursive: true });
  const baselineXml = readFileSync(args.enriched, 'utf8');
  const unmodified = applyXmlCiiSplitRigidWeightPropagation(baselineXml);
  assert.equal(unmodified.xmlText, baselineXml, 'real pre-fix GLRD enriched XML must be unchanged without approvals');
  assert.equal(unmodified.ownershipIssues.length, 0, 'original unweighted GLRD must not trigger false duplicate-owner blocks');
  const recorded = injectOwnerMass(baselineXml, 460, 15);
  const revised = applyXmlCiiSplitRigidWeightPropagation(recorded.xml);
  assert.equal(revised.xmlText, recorded.xml, 'approved mass must never copy onto a zero nonowner');
  assert.equal(revised.ownershipIssues.length, 0, 'legitimate single-owner mass is not duplicate ownership');
  const beforeWeights = weights(recorded.xml, recorded.branchName, recorded.ref);
  const afterWeights = weights(revised.xmlText, recorded.branchName, recorded.ref);
  assert.equal(afterWeights.filter(n => n.weightKg > 0).length, 1);
  assert.equal(afterWeights.reduce((total, n) => total + n.weightKg, 0), 15);
  assert.equal(afterWeights.find(n => n.nodeNumber === '460').weightKg, 15);
  let legacy = null;
  if (args['old-module']) {
    const old = await import(pathToFileURL(resolve(args['old-module'])).href);
    legacy = old.applyXmlCiiSplitRigidWeightPropagation(recorded.xml);
    assert.ok(legacy.appliedCount > 0, 'legacy implementation must reproduce the weight duplication');
    assert.ok(weights(legacy.xmlText, recorded.branchName, recorded.ref).reduce((s, n) => s + n.weightKg, 0) > 15,
      'legacy split must duplicate physical mass before the fix');
  }
  const report = {
    source: 'real GLRD enriched XML with controlled 15 kg assignment at source-derived node 460',
    warning: 'This is a split-weight regression setup, not proof that the original 19.1 mm defect reproduces.',
    owner: { branchName: recorded.branchName, componentRefNo: recorded.ref, nodeNumber: '460', massKg: 15 },
    baselineEnrichedSha256: hash(baselineXml),
    withOwnerBeforeSplitSha256: hash(recorded.xml),
    legacyPreFixSha256: legacy ? hash(legacy.xmlText) : null,
    correctedAfterSplitSha256: hash(revised.xmlText),
    legacyAppliedCount: legacy?.appliedCount ?? null,
    correctedAppliedCount: revised.appliedCount,
    beforeWeightRows: legacy ? weights(legacy.xmlText, recorded.branchName, recorded.ref) : beforeWeights,
    afterWeightRows: afterWeights,
    changedRows: legacy ? weights(legacy.xmlText, recorded.branchName, recorded.ref).filter((row,i)=>row.weightKg !== afterWeights[i]?.weightKg).map((row,i)=>({
      nodeNumber: row.nodeNumber, beforeWeightKg: row.weightKg, afterWeightKg: afterWeights.find(n=>n.nodeNumber===row.nodeNumber)?.weightKg ?? null,
    })) : [],
  };
  writeFileSync(resolve(directory, 'GLRD-weight-split-before-enriched.xml'), legacy?.xmlText || recorded.xml);
  writeFileSync(resolve(directory, 'GLRD-weight-split-after-enriched.xml'), revised.xmlText);
  writeFileSync(resolve(directory, 'GLRD-weight-split-before-after-diff.json'), JSON.stringify(report, null, 2) + '\n');
  const survivingSplit = `<PipeStressExport><Pipe><Branch><Branchname>VALID-SYNTHETIC-SPLIT</Branchname>
  <Node><NodeNumber>930</NodeNumber><ComponentType>PIPE</ComponentType><Position>0 0 0</Position><Weight>0</Weight></Node>
  <Node><NodeNumber>939</NodeNumber><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>1</Endpoint><ComponentRefNo>=TEST-SPLIT</ComponentRefNo><Position>89.9 0 0</Position><Weight>0</Weight></Node>
  <Node><NodeNumber>10020</NodeNumber><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><ComponentRefNo>=TEST-SPLIT</ComponentRefNo><Position>109 0 0</Position><Weight>15</Weight></Node>
  </Branch></Pipe></PipeStressExport>`;
  const syntheticFixed = applyXmlCiiSplitRigidWeightPropagation(survivingSplit);
  assert.equal(syntheticFixed.xmlText, survivingSplit);
  assert.equal(syntheticFixed.appliedCount, 0);
  if (args['old-module']) {
    const old = await import(pathToFileURL(resolve(args['old-module'])).href);
    const syntheticLegacy = old.applyXmlCiiSplitRigidWeightPropagation(survivingSplit);
    assert.equal(syntheticLegacy.appliedCount, 1);
    assert.ok(syntheticLegacy.xmlText.includes('<Weight>15</Weight>'));
    writeFileSync(resolve(directory, 'SYNTHETIC-surviving-rigid-before.xml'), syntheticLegacy.xmlText);
    writeFileSync(resolve(directory, 'SYNTHETIC-surviving-rigid-after.xml'), syntheticFixed.xmlText);
  }
  console.log('GLRD_SPLIT_MASS_REPRO', JSON.stringify(report));
}
console.log('RIGID_SPLIT_MASS_TEST_PASS');
