import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  auditXmlCiiRigidWeightsFromBranches,
} from '../converters/xml-cii2019-core/rigid-weight-export-audit.js';
import {
  validateXmlCiiFinalRigidWeightAudit,
} from '../converters/xml-cii2019-core/rigid-weight-final-validation.js';
import {
  qualifiedXmlCiiRigidAutoWeightCandidate,
  collectXmlCiiAutoRigidWeightsFromIssues,
} from '../converters/xml-cii2019-core/rigid-weight-auto-apply.js';
import {
  createEmpiricalWeightValidator,
} from '../converters/empirical-weight/empirical-weight-validation.js';

const fixture = [{
  branchName: 'B-939',
  nodes: [
    { nodeNumber: '930', componentType: 'FLAN', componentRefNo: '=FLANGE-1', endpoint: '1', rigid: '0', position: '0 0 0', weight: 0 },
    { nodeNumber: '939', componentType: 'PIPE', componentRefNo: '=PIPE-1', endpoint: '0', rigid: '0', position: '89.9 0 0', weight: 0 },
    { nodeNumber: '10020', componentType: 'RIGID', componentRefNo: '=FLANGE-1', endpoint: '2', rigid: '2', position: '109 0 0', weight: 15, boreMm: 50, rating: '900' },
  ],
}];
const audit = auditXmlCiiRigidWeightsFromBranches(fixture, {
  kgToNewton: true,
  propagationRows: [{ branchName: 'B-939', nodeNumber: '10020', componentRefNo: '=FLANGE-1', endpoint: '2', weight: 15 }],
});
assert.equal(audit.summary.positiveRigidEdges, 1);
assert.equal(audit.summary.postReviewPropagatedEdges, 1);
assert.equal(audit.summary.flaggedEdges, 1);
const row = audit.rows[0];
assert.equal(row.fromNode, '939');
assert.equal(row.toNode, '10020');
assert.equal(row.massKg, 15);
assert.equal(row.exportedWeight, 150);
assert.equal(row.exportedUnit, 'N');
assert.ok(Math.abs(row.elementLengthMm - 19.1) < 1e-8);
assert.equal(row.wholeComponentSpanMm, 109);
assert.ok(Math.abs(row.lengthRatio - 19.1 / 109) < 1e-9);
assert.ok(row.reviewFlags.includes('FULL_COMPONENT_WEIGHT_ON_SHORT_RIGID_ELEMENT'));
assert.ok(row.reviewFlags.includes('POST_REVIEW_WEIGHT_PROPAGATION'));

const duplicate = structuredClone(fixture);
duplicate[0].nodes.push({
  nodeNumber: '10030', componentType: 'RIGID', componentRefNo: '=FLANGE-1',
  endpoint: '0', rigid: '2', position: '120 0 0', weight: 15,
});
const duplicateAudit = auditXmlCiiRigidWeightsFromBranches(duplicate);
assert.equal(duplicateAudit.summary.repeatedMassEdges, 2);
assert.equal(duplicateAudit.summary.flaggedEdges, 2);
assert.equal(auditXmlCiiRigidWeightsFromBranches(fixture, { kgToNewton: false }).rows[0].exportedWeight, 15);

const validator = { buildReport(inputs, options) {
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].observedWeightKg, 15);
  assert.equal(options.abnormalityThresholdPct, 30);
  assert.equal(options.leaveTargetCellOutOfA2, true);
  return { rows: [{
    reportableAbnormality: true, status: 'ABNORMAL_A1',
    approach1: { deviationPct: 87.5 }, approach2: { deviationPct: null },
  }] };
} };
const validated = validateXmlCiiFinalRigidWeightAudit(audit, [], [], { validator });
assert.equal(validated.summary.empiricalAbnormalEdges, 1);
assert.equal(validated.rows[0].empiricalStatus, 'ABNORMAL_A1');
assert.ok(validated.rows[0].reviewFlags.includes('EMPIRICAL_A1_A2_ABNORMAL_GT_30_PERCENT'));
const unavailable = validateXmlCiiFinalRigidWeightAudit(audit, [], [], {
  validator: { buildReport: () => ({ rows: [{ status: 'UNVALIDATED', reportableAbnormality: false, approach1: {}, approach2: {} }] }) },
});
assert.equal(unavailable.summary.empiricalUnvalidatedEdges, 1);
assert.ok(unavailable.rows[0].reviewFlags.includes('EMPIRICAL_VALIDATION_UNAVAILABLE'));

function issue(score, extra = {}) {
  return { key: 'B-939:10020', boreMm: 50, rating: 900,
    ranking: { best: { selectedWeight: 15, score, ratingExact: true,
      lengthQualified: true, boreDelta: 0, weightMethod: 'direct', ...extra } } };
}
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.599)), null);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.60))?.weightKg, 15);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(60))?.confidence, 0.60);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(1))?.weightKg, 15);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.90, { inferredWeight: true })), null);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.95, { lengthQualified: false })), null);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.95, { fallbackSuggestion: true })), null);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.95, { weightMethod: 'length-extrapolated' })), null);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(0.95, { ratingExact: false })), null);
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate({ ...issue(.95), ratingConflict: true }), null);
const auto = collectXmlCiiAutoRigidWeightsFromIssues([issue(.45), issue(.6), issue(.95, { inferredWeight: true })]);
assert.equal(auto.appliedCount, 1);
assert.equal(auto.weightsByKey['B-939:10020'], 15);
assert.equal(auto.remainingIssues.length, 2);

const weightModelSource = readFileSync(new URL('../converters/xml-cii2019-core/weight-match-model.js', import.meta.url), 'utf8');
assert.ok(weightModelSource.includes('(!reviewEndpoint && !isMapped)'),
  'positive-weight first endpoints must be visible in Weight Match');
const runner = readFileSync(new URL('../tabs/model-converters/converters/xmltocii2019_runner.js', import.meta.url), 'utf8');
assert.ok(runner.includes('validateXmlCiiFinalRigidWeightAudit('));
assert.ok(runner.includes('splitWeightPropagation.appliedRows'));
assert.ok(runner.includes('_rigid_weight_export_audit.json'));

if (process.env.GLRD_WEIGHT_MASTER_PATH) {
  const masterRows = JSON.parse(readFileSync(process.env.GLRD_WEIGHT_MASTER_PATH, 'utf8'));
  const empirical = createEmpiricalWeightValidator({ masterRows });
  const report = empirical.buildReport([{
    rowId: 'GLRD-node460-900-master',
    source: 'master-900-scenario', componentRefNo: '=134234934/27950',
    nodeNumber: '460', typeDesc: 'Weldneck Flange',
    ns: 2, dn: 50, rating: 900, target: 'RF', observedWeightKg: 15,
  }]);
  console.log('REAL GLRD node 460 A1/A2:', JSON.stringify(report.rows[0]));
  if (process.env.GLRD_WEIGHT_REPORT_OUTPUT) {
    writeFileSync(process.env.GLRD_WEIGHT_REPORT_OUTPUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
}
console.log('Final rigid export audit and 60%-100% confidence policy: PASS');
