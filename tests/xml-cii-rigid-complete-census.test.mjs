import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { auditXmlCiiRigidWeightsForExport } from '../converters/xml-cii2019-core/rigid-weight-export-audit.js';
import { buildStandaloneFinalRigidReview, enforceStandaloneFinalRigidWeightReview } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-review-gate.js';
import { finalRigidWeightReviewMarkup } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-weight-popup.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;

const xml = `<PipeStressExport><Pipe><Branch><Branchname>BR-COUNTS</Branchname>
  <Node><NodeNumber>900</NodeNumber><Position>0 0 0</Position><ComponentType>PIPE</ComponentType><Weight>0</Weight></Node>
  <Node><NodeNumber>910</NodeNumber><Position>10 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=R-1</ComponentRefNo><Weight>0</Weight></Node>
  <Node><NodeNumber>920</NodeNumber><Position>20 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=R-2</ComponentRefNo><Weight>15</Weight></Node>
  <Node><NodeNumber>930</NodeNumber><Position>30 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=R-3</ComponentRefNo></Node>
  <Node><NodeNumber>940</NodeNumber><Position>40 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=R-4</ComponentRefNo><Weight>invalid</Weight></Node>
  <Node><NodeNumber>950</NodeNumber><Position>50 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=R-5</ComponentRefNo><Weight>-4</Weight></Node>
</Branch></Pipe></PipeStressExport>`;
const audit = auditXmlCiiRigidWeightsForExport(xml);
assert.equal(audit.rows.length, 1, 'legacy A1/A2 observed positive mass contract must remain unchanged');
assert.equal(audit.allRows.length, 5, 'all RIGID edges must remain visible in the edge census');
assert.deepEqual(audit.allRows.map(x => x.ownerWeightState),
  ['ZERO','POSITIVE','MISSING','INVALID','NEGATIVE']);
assert.equal(audit.summary.allRigidEdges, 5);
assert.equal(audit.summary.zeroRigidEdges, 1);
assert.equal(audit.summary.positiveRigidEdges, 1);
assert.equal(audit.summary.missingRigidEdges, 1);
assert.equal(audit.summary.invalidRigidEdges, 2);
assert.equal(audit.allRows[0].exportedWeight, 0);
assert.equal(audit.allRows[2].exportedWeight, null);
assert.equal(audit.allRows[3].exportedWeight, null);
assert.ok(audit.allRows[2].reviewFlags.includes('RIGID_OWNER_WEIGHT_MISSING'));
assert.ok(audit.allRows[3].reviewFlags.includes('RIGID_OWNER_WEIGHT_INVALID'));
assert.ok(audit.allRows[4].reviewFlags.includes('RIGID_OWNER_WEIGHT_NEGATIVE'));

const gate = buildStandaloneFinalRigidReview({xmlText:xml,nodeRows:[],reviewProposals:[]}, {}, {includeAllPositiveMasses:true});
assert.equal(gate.issues.length, 5);
assert.deepEqual(gate.issues.map(x=>x.ownerWeightState), ['ZERO','POSITIVE','MISSING','INVALID','NEGATIVE']);
const markup = finalRigidWeightReviewMarkup(gate.issues, {manualInspection:true});
for(const phrase of ['0 kg (zero / non-owner not yet established)', 'MISSING', 'INVALID', 'NEGATIVE (blocked)']) {
  assert.ok(markup.includes(phrase), 'missing explicit edge condition in all-owner UI: '+phrase);
}

const job = {sourceId:'source-1',sourceName:'audit.xml',sourceText:xml,
  supportConfigJson:'{}',options:{kgToNewton:true}};
let reviewCalls=0;
const verdict=await enforceStandaloneFinalRigidWeightReview({xmlText:xml,nodeRows:[],reviewProposals:[]},
  job, {reviewFinalRigidWeights:async()=>{reviewCalls++;return{approvedKeys:[],weightsByKey:{}};}});
assert.equal(verdict.ok,false);
assert.match(verdict.error,/Invalid or missing RIGID mass/);
assert.equal(reviewCalls,0,'structural blocker must precede approval prompt');

const onlyZero = xml.replace(/<Node><NodeNumber>930<\/NodeNumber>[\s\S]*?<\/Node>/, '')
  .replace(/<Node><NodeNumber>940<\/NodeNumber>[\s\S]*?<\/Node>/,'')
  .replace(/<Node><NodeNumber>950<\/NodeNumber>[\s\S]*?<\/Node>/,'');
const validCensus = auditXmlCiiRigidWeightsForExport(onlyZero);
assert.equal(validCensus.summary.missingRigidEdges,0);
assert.equal(validCensus.summary.invalidRigidEdges,0);
console.log('RIGID_PREPYTHON_FULL_EDGE_CENSUS_PASS');
