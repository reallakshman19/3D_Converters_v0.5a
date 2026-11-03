import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { runXmlCii2019Workflow } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-api-atta-default.js';
import { mappedNodeWeights } from '../tabs/xml-cii-2019-standalone/xml-cii-standalone-run-parity.js';
import { openStandaloneFinalRigidWeightReviewPopup } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-weight-popup.js';
import { collectModeARigidWeightReviewIssues } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-review-mode-a.js';
import { createEmpiricalWeightValidator } from '../converters/empirical-weight/empirical-weight-validation.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://example.test/3d-converters'});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.DOMParser=dom.window.DOMParser;
globalThis.XMLSerializer=dom.window.XMLSerializer;
globalThis.CustomEvent=dom.window.CustomEvent;

function enriched(weight=150, nodeName='Weldneck Flange') {
  return `<?xml version="1.0"?><Root><Pipe><Branch>
    <Branchname>B-939</Branchname>
    <Node><NodeNumber>930</NodeNumber><ComponentType>FLAN</ComponentType><ComponentRefNo>=FLANGE-1</ComponentRefNo><Endpoint>1</Endpoint><Position>0 0 0</Position><Weight>0</Weight></Node>
    <Node><NodeNumber>939</NodeNumber><ComponentType>PIPE</ComponentType><ComponentRefNo>=PIPE-939</ComponentRefNo><Position>89.9 0 0</Position></Node>
    <Node><NodeNumber>10020</NodeNumber><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><ComponentRefNo>=FLANGE-1</ComponentRefNo><Position>109 0 0</Position><NodeName>${nodeName}</NodeName><Weight>${weight}</Weight><BoreMm>50</BoreMm><Rating>900</Rating></Node>
  </Branch></Pipe></Root>`;
}
function fixtureJob(xml=enriched(),kgToNewton=true) {
 return {sourceKind:'xml',sourceText:xml,sourceName:'fixture-939-to-10020.xml',
   supportConfigJson:JSON.stringify({weight:{masterRows:[]}}),
   options:{outputMode:'both',kgToNewton}};
}
function parity(xml,proposals=[]) {
  return {applied:true,xmlText:xml,evidence:{ok:true,engineInputDigest:'input-before-review'},
    logs:['stubbed browser parity'],stats:{},diagnostics:[],nodeRows:[],
    branchRows:[],expectedEntries:[],reviewProposals:proposals};
}
async function runWith(xml,options={}) {
  const captured={engineCalls:0,engineXml:null,dialogCalls:0,issues:null,modalHtml:null};
  const runtime={
    runParityEnricher:async()=>parity(xml,options.proposals || []),
    engineRunner:async (job)=>{
      captured.engineCalls+=1;
      captured.engineXml=job.sourceText;
      return {ok:true,sourceKind:'xml',outputKind:'enrichedXML',
        enrichedText:job.sourceText,enrichedName:'enriched.xml',
        ciiText:'CII_ENGINE_CALLED',ciiName:'model.cii',logs:[],diagnostics:{}};
    },
  };
  if(options.dialog) runtime.reviewFinalRigidWeights=async(rows,meta)=>{
    captured.dialogCalls++;
    captured.issues=rows;
    const popup=openStandaloneFinalRigidWeightReviewPopup(rows,meta);
    const overlay=document.querySelector('.mc-rigid-review-overlay');
    assert.ok(overlay,'real DOM empirical review modal is displayed');
    captured.modalHtml=overlay.textContent;
    assert.match(captured.modalHtml,/939.*10020/s);
    assert.match(captured.modalHtml,/19\.1 mm/);
    assert.match(captured.modalHtml,/Empirical Weight Deviation Review/);
    assert.match(captured.modalHtml,/A1 estimate.*deviation/s);
    assert.match(captured.modalHtml,/A2 estimate.*deviation/s);
    if(options.dialog==='cancel') overlay.querySelector('[data-final-rigid-cancel]').click();
    else {
      if(options.dialog==='confirm-empty') {
        overlay.querySelector('[data-final-rigid-confirm]').click();
        assert.match(overlay.querySelector('[data-final-rigid-status]').textContent,/Reviewed checkbox required/);
        assert.equal(captured.engineCalls,0);
      }
      const input=overlay.querySelector('[data-final-rigid-mass="0"]');
      if(options.correctedKg!==undefined) input.value=String(options.correctedKg);
      overlay.querySelector('[data-final-rigid-approve="0"]').checked=true;
      overlay.querySelector('[data-final-rigid-confirm]').click();
    }
    return popup;
  };
  const result=await runXmlCii2019Workflow(fixtureJob(xml,options.kgToNewton!==false),runtime);
  return {result,captured};
}

const validator=createEmpiricalWeightValidator();
const empiricalInput={typeDesc:'Weldneck Flange',ns:2,dn:50,rating:900,target:'RF/RTJ KG',observedWeightKg:15};
const within=validator.validate(empiricalInput,{abnormalityThresholdPct:50});
assert.equal(within.reportableAbnormality,false);
assert.equal(within.approach1.available,true);

const valid=await runWith(enriched(15));
assert.equal(valid.result.ok,true,`empirically normal 15kg must run without popup: ${valid.result.error}; audit=${JSON.stringify(valid.result.diagnostics?.finalRigidWeightAudit?.rows || [])}`);
assert.equal(valid.captured.engineCalls,1);
assert.equal(valid.result.diagnostics.finalRigidWeightReview.reviewRequiredCount,0);

const absent=await runWith(enriched(150));
assert.equal(absent.result.ok,false,'empirical >50% must fail closed without popup');
assert.equal(absent.captured.engineCalls,0);
assert.match(absent.result.error,/939.*10020/);

const cancelled=await runWith(enriched(150),{dialog:'cancel'});
assert.equal(cancelled.result.ok,false);
assert.equal(cancelled.captured.dialogCalls,1);
assert.equal(cancelled.captured.engineCalls,0);
assert.ok(cancelled.captured.issues[0].empiricalEvidence.reportableAbnormality);
assert.ok(cancelled.captured.issues[0].empiricalEvidence.maximumAbsoluteDeviationPct>50);

const approved=await runWith(enriched(150),{dialog:'confirm-empty'});
assert.equal(approved.result.ok,true);
assert.equal(approved.captured.engineCalls,1,'engine runs only after explicit approval');
assert.match(approved.captured.modalHtml,/150\.000 kg/);
assert.match(approved.captured.modalHtml,/1500\.00 N/,'CII output converts kg to N exactly once');
assert.match(approved.captured.modalHtml,/\+\d+\.\d%/,'signed empirical deviation is shown');
assert.ok(approved.captured.issues[0].reviewFlags.includes('EMPIRICAL_A1_A2_ABNORMAL_GT_50_PERCENT'));
assert.equal(approved.result.diagnostics.finalRigidWeightReview.reviewRequiredCount,1);
assert.equal(approved.result.diagnostics.finalRigidWeightReview.reviewedRows[0].approvedWeightKg,150);
assert.notEqual(approved.result.diagnostics.converterInputDigest,'input-before-review');

const corrected=await runWith(enriched(150),{dialog:'confirm',correctedKg:15});
assert.equal(corrected.result.ok,true);
const correctedDoc=new DOMParser().parseFromString(corrected.captured.engineXml,'application/xml');
const correctedNode=[...correctedDoc.getElementsByTagName('Node')]
  .find((node)=>node.getElementsByTagName('NodeNumber')[0]?.textContent==='10020');
assert.equal(correctedNode?.getElementsByTagName('Weight')[0]?.textContent,'15',
  'reviewed correction reaches actual Python engine input');
assert.equal(corrected.result.diagnostics.finalRigidWeightReview.reviewedRows[0].previousWeightKg,150);

const low=await runWith(enriched(0.1));
assert.equal(low.result.ok,false,'empirical below −50% must require review');
assert.equal(low.captured.engineCalls,0);

const unavailable=await runWith(enriched(15,'NOT_A_MODEL_FAMILY'));
assert.equal(unavailable.result.ok,false,'no empirical family must not silently pass');
assert.equal(unavailable.captured.engineCalls,0);
assert.match(unavailable.result.error,/EMPIRICAL_VALIDATION_UNAVAILABLE/);

const candidate={weight:15,selectedWeight:15,score:0.65,weightMethod:'length-extrapolated',
  typeDesc:'Weldneck Flange',rowData:{TypeDesc:'Weldneck Flange',NS:2,DN:50,Rating:900,'RF/RTJ KG':15}};
const previewRow={key:'B-939::10020',branchName:'B-939',nodeNumber:'10020',
  componentRefNo:'=FLANGE-1',componentType:'RIGID',endpoint:'2',lengthMm:19.1,
  boreMm:50,rating:900,weightMatch:{...candidate},weightCandidates:[candidate]};
const mapped=mappedNodeWeights([previewRow],{});
assert.equal(mapped.weights.get('B-939|10020'),15,'65% confidence and ±50% empirical approval auto-apply independent of edge length');
assert.equal(mapped.reviewProposals.length,0);
const atSixty=mappedNodeWeights([{...previewRow,weightMatch:{...candidate,score:0.60},
  weightCandidates:[{...candidate,score:0.60}]}],{});
assert.equal(atSixty.weights.get('B-939|10020'),15,'exactly 60% confidence auto-applies when empirically valid');
const atHundred=mappedNodeWeights([{...previewRow,weightMatch:{...candidate,score:100},
  weightCandidates:[{...candidate,score:100}]}],{});
assert.equal(atHundred.weights.get('B-939|10020'),15,'100% confidence is included');
const belowSixty=mappedNodeWeights([{...previewRow,weightMatch:{...candidate,score:0.599},
  weightCandidates:[{...candidate,score:0.599}]}],{});
assert.equal(belowSixty.weights.size,0,'59.9% cannot silently auto-apply despite valid empirical estimate');
assert.equal(belowSixty.reviewProposals.length,1);
assert.ok(belowSixty.reviewProposals[0].reviewFlags.includes('AUTO_SUGGESTION_CONFIDENCE_OUTSIDE_60_TO_100_PERCENT'));
const highProposal=mappedNodeWeights([{
  ...previewRow,weightMatch:{...candidate,weight:150,selectedWeight:150},
  weightCandidates:[{...candidate,weight:150,selectedWeight:150,score:0.99}],
}],{});
assert.equal(highProposal.weights.size,0,'high-confidence empirical outlier must not silently auto-apply');
assert.equal(highProposal.reviewProposals.length,1);
assert.equal(highProposal.reviewProposals[0].empiricalEvidence.reportableAbnormality,true);
const unknownProposal=mappedNodeWeights([{
  ...previewRow,weightCandidates:[{...candidate,typeDesc:'NOT_A_MODEL_FAMILY',
    rowData:{...candidate.rowData,TypeDesc:'NOT_A_MODEL_FAMILY'}}],
}],{});
assert.equal(unknownProposal.weights.size,0,'unvalidated Preview fallback requires review');

const proposal={
  ...highProposal.reviewProposals[0],fromNode:'939',proposedWeightKg:150,
  key:'B-939::10020',
};
const unapprovedProposal=await runWith(enriched(0),{proposals:[proposal]});
assert.equal(unapprovedProposal.result.ok,false);
assert.equal(unapprovedProposal.captured.engineCalls,0);
const proposalApproved=await runWith(enriched(0),{proposals:[proposal],dialog:'confirm',correctedKg:15});
assert.equal(proposalApproved.result.ok,true);
const proposedDoc=new DOMParser().parseFromString(proposalApproved.captured.engineXml,'application/xml');
const proposedNode=[...proposedDoc.getElementsByTagName('Node')]
  .find((node)=>node.getElementsByTagName('NodeNumber')[0]?.textContent==='10020');
assert.equal(proposedNode.getElementsByTagName('Weight')[0].textContent,'15');

const earlyBad=await collectModeARigidWeightReviewIssues(
  {sourceText:enriched(150),stagedJsonText:'',options:{kgToNewton:true}},
  {weight:{masterRows:[]}},
);
const earlyIssue=earlyBad.find((row)=>row.fromNode==='939' && row.toNode==='10020');
assert.ok(earlyIssue,'Mode A early consolidated review must surface empirical 150kg outlier');
assert.ok(earlyIssue.reviewFlags.includes('EMPIRICAL_A1_A2_ABNORMAL_GT_50_PERCENT'));
const earlyGood=await collectModeARigidWeightReviewIssues(
  {sourceText:enriched(15),stagedJsonText:'',options:{kgToNewton:true}},
  {weight:{masterRows:[]}},
);
assert.ok(!earlyGood.some((row)=>row.fromNode==='939' && row.toNode==='10020'),
  'normal 15kg rigid edge must not be flagged merely because it is 19.1 mm');

console.log('PASS actual standalone: 60–100% confidence auto-apply + ±50% A1/A2 dialog, normal, high/low, cancel, correction, fallback, Mode A.');
