import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditXmlCiiRigidWeightsFromBranches } from '../converters/xml-cii2019-core/rigid-weight-export-audit.js';
import {
  XML_CII_EMPIRICAL_REVIEW_THRESHOLD_PCT,
  validateXmlCiiFinalRigidWeightAudit,
} from '../converters/xml-cii2019-core/rigid-weight-final-validation.js';
import {
  qualifiedXmlCiiRigidAutoWeightCandidate,
  collectXmlCiiAutoRigidWeightsFromIssues,
} from '../converters/xml-cii2019-core/rigid-weight-auto-apply.js';
import {
  createEmpiricalWeightValidator,
  compareObservedWeightToEmpiricalEstimate,
} from '../converters/empirical-weight/empirical-weight-validation.js';

assert.equal(XML_CII_EMPIRICAL_REVIEW_THRESHOLD_PCT, 50);
// The API defines strict >±50% deviation from the ESTIMATE, not from the
// observed mass; exact endpoints are within threshold.
for (const [observed, abnormal] of [[5,false],[15,false],[4.99,true],[15.01,true]]) {
  const result = compareObservedWeightToEmpiricalEstimate(observed, {
    ok:true,weightKg:10,approach:'A1_SIZE_BAND',
  }, XML_CII_EMPIRICAL_REVIEW_THRESHOLD_PCT);
  assert.equal(result.abnormal,abnormal,`${observed} kg vs estimated 10 kg`);
  assert.equal(result.thresholdPct,50);
}
const fixture = [{
  branchName:'B-939',
  nodes:[
    {nodeNumber:'930',componentType:'FLAN',componentRefNo:'=FLANGE-1',endpoint:'1',position:'0 0 0',weight:0},
    {nodeNumber:'939',componentType:'PIPE',componentRefNo:'=PIPE-1',position:'89.9 0 0',weight:0},
    {nodeNumber:'10020',componentType:'RIGID',componentRefNo:'=FLANGE-1',endpoint:'2',rigid:2,
      position:'109 0 0',weight:15,boreMm:50,rating:'900',nodeName:'Weldneck Flange'},
  ],
}];
const audit = auditXmlCiiRigidWeightsFromBranches(fixture,{
  kgToNewton:true,
  propagationRows:[{branchName:'B-939',nodeNumber:'10020',componentRefNo:'=FLANGE-1',endpoint:'2',weight:15}],
});
assert.equal(audit.summary.positiveRigidEdges,1);
const edge=audit.rows[0];
assert.equal(edge.fromNode,'939');assert.equal(edge.toNode,'10020');
assert.equal(edge.massKg,15);assert.equal(edge.exportedWeight,150);
assert.equal(edge.exportedUnit,'N');assert.ok(Math.abs(edge.elementLengthMm-19.1)<1e-8);
assert.equal(edge.wholeComponentSpanMm,109);
assert.ok(!edge.reviewFlags.includes('FULL_COMPONENT_WEIGHT_ON_SHORT_RIGID_ELEMENT'));
assert.ok(!edge.reviewFlags.includes('SHORT_HEAVY_RIGID_ELEMENT_REQUIRES_REVIEW'));
assert.ok(edge.reviewFlags.includes('POST_REVIEW_WEIGHT_PROPAGATION'));
assert.equal(auditXmlCiiRigidWeightsFromBranches(fixture,{kgToNewton:false}).rows[0].exportedWeight,15);

const mockValidator={buildReport(inputs,opts){
  assert.equal(inputs.length,1);assert.equal(inputs[0].observedWeightKg,15);
  assert.equal(opts.abnormalityThresholdPct,50);
  assert.equal(opts.leaveTargetCellOutOfA2,true);
  return {rows:[{status:'ABNORMAL_A1',reportableAbnormality:true,
    approach1:{available:true,estimatedWeightKg:5,deviationPct:200,abnormal:true},
    approach2:{available:true,estimatedWeightKg:15,deviationPct:0,abnormal:false}}]};
}};
const mockValidated=validateXmlCiiFinalRigidWeightAudit(audit,[],[],{validator:mockValidator});
assert.equal(mockValidated.summary.empiricalAbnormalEdges,1);
assert.equal(mockValidated.rows[0].empiricalStatus,'ABNORMAL_A1');
assert.ok(mockValidated.rows[0].reviewFlags.includes('EMPIRICAL_A1_A2_ABNORMAL_GT_50_PERCENT'));
assert.equal(mockValidated.rows[0].empiricalEvidence.approach1.deviationPct,200);
const unavailable=validateXmlCiiFinalRigidWeightAudit(audit,[],[],{
 validator:{buildReport:()=>({rows:[{status:'UNVALIDATED',reportableAbnormality:false,
  approach1:{available:false},approach2:{available:false}}]})},
});
assert.equal(unavailable.summary.empiricalUnvalidatedEdges,1);
assert.ok(unavailable.rows[0].reviewFlags.includes('EMPIRICAL_VALIDATION_UNAVAILABLE'));

// Test the REAL A1 size-band model and A2 leave-target-cell-out matrix API
// with a known canonical flange family/size/rating, not a mocked formula.
const empirical=createEmpiricalWeightValidator();
const observed={rowId:'GLRD-model-900',componentRefNo:'134234934/27950',
 typeDesc:'Weldneck Flange',ns:2,dn:50,rating:900,target:'RF/RTJ KG',observedWeightKg:15};
const normal=empirical.validate(observed,{abnormalityThresholdPct:50});
assert.equal(normal.approach1.available,true,'real A1 size-band estimate required');
assert.ok(normal.maximumAbsoluteDeviationPct<50,'real 15kg flange must be within ±50%');
assert.equal(normal.reportableAbnormality,false);
const high=empirical.validate({...observed,observedWeightKg:150},{abnormalityThresholdPct:50});
assert.equal(high.reportableAbnormality,true,'real A1/A2 detects 150kg misassignment');
assert.ok(high.maximumAbsoluteDeviationPct>50);
const low=empirical.validate({...observed,observedWeightKg:0.1},{abnormalityThresholdPct:50});
assert.equal(low.reportableAbnormality,true,'real A1/A2 detects underweight outlier');
assert.equal(high.abnormalityThresholdPct,50);
console.log('REAL A1/A2 empirical evidence:',JSON.stringify({
 within:normal.status,above:high.status,below:low.status,
 a1NormalEstimateKg:normal.approach1.estimatedWeightKg,
 a2NormalEstimateKg:normal.approach2.estimatedWeightKg,
 a1HighDeviationPct:high.approach1.deviationPct,
 a2HighDeviationPct:high.approach2.deviationPct,
}));

function issue(weightKg,score=0.10,typeDesc='Weldneck Flange') {
  const candidate={weight:weightKg,selectedWeight:weightKg,score,weightMethod:'length-extrapolated',
    typeDesc,rowData:{TypeDesc:typeDesc,NS:2,DN:50,Rating:900,'RF/RTJ KG':15}};
  return {key:'B-939::10020',branchName:'B-939',nodeNumber:'10020',
    boreMm:50,rating:900,componentRefNo:'=FLANGE-1',
    ranking:{best:candidate},candidates:[candidate]};
}
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(15,0.10))?.weightKg,15,
  'low match score is not a hard-coded empirical exclusion');
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(150,0.99)),null,
  'high score must not override a ±50% empirical failure');
assert.equal(qualifiedXmlCiiRigidAutoWeightCandidate(issue(15,0.99,'NOT_A_MODEL_FAMILY')),null,
  'unknown empirical family must fail closed');
const plan=collectXmlCiiAutoRigidWeightsFromIssues([issue(15,0.10),issue(150,0.99)]);
assert.equal(plan.appliedCount,1);assert.equal(plan.weightsByKey['B-939::10020'],15);
assert.equal(plan.remainingIssues.length,1);
assert.equal(plan.appliedRows[0].method,'empirically-validated-a1-a2-within-50-percent');

const modelSource=readFileSync(new URL('../converters/xml-cii2019-core/weight-match-model.js',import.meta.url),'utf8');
assert.ok(modelSource.includes('(!reviewEndpoint && !isMapped)'));
const runner=readFileSync(new URL('../tabs/model-converters/converters/xmltocii2019_runner.js',import.meta.url),'utf8');
assert.ok(runner.includes('validateXmlCiiFinalRigidWeightAudit('));
assert.ok(runner.includes('_rigid_weight_export_audit.json'));
console.log('Empirical A1/A2 ±50% final rigid audit and auto-fill contract: PASS');
