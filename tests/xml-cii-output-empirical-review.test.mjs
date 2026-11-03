import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  preferredEmpiricalWeightForIssue,
  openStandaloneFinalRigidWeightReviewPopup,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-weight-popup.js';
import {
  inspectOutputEmpiricalSource,
  runOutputEmpiricalReviewFromUi,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-empirical-review.js';
import {
  renderStandaloneOutputRunPanel,
  outputEmpiricalReviewFingerprint,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-run.js';
import { createXmlCiiAdaptedWorkflowState } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js';
import { enforceStandaloneFinalRigidWeightReview } from '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-review-gate.js';
import { runXmlCii2019Workflow } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-api-atta-default.js';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.test/3d-converters'});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.DOMParser=dom.window.DOMParser;
globalThis.XMLSerializer=dom.window.XMLSerializer;
globalThis.CustomEvent=dom.window.CustomEvent;
globalThis.Event=dom.window.Event;

function sourceXml() {
  return `<Root><Pipe><Branch><Branchname>B-939</Branchname>
    <Node><NodeNumber>930</NodeNumber><ComponentType>FLAN</ComponentType><Endpoint>1</Endpoint><ComponentRefNo>=FLANGE-1</ComponentRefNo><Position>0 0 0</Position></Node>
    <Node><NodeNumber>939</NodeNumber><ComponentType>PIPE</ComponentType><Position>89.9 0 0</Position></Node>
  </Branch></Pipe></Root>`;
}
function enriched(weight=150, typeDesc='Weldneck Flange') {
  return `<Root><Pipe><Branch><Branchname>B-939</Branchname>
    <Node><NodeNumber>930</NodeNumber><ComponentType>FLAN</ComponentType><Endpoint>1</Endpoint><ComponentRefNo>=FLANGE-1</ComponentRefNo><Position>0 0 0</Position></Node>
    <Node><NodeNumber>939</NodeNumber><ComponentType>PIPE</ComponentType><Position>89.9 0 0</Position></Node>
    <Node><NodeNumber>10020</NodeNumber><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><ComponentRefNo>=FLANGE-1</ComponentRefNo><Position>109 0 0</Position><NodeName>${typeDesc}</NodeName><Weight>${weight}</Weight><BoreMm>50</BoreMm><Rating>900</Rating></Node>
  </Branch></Pipe></Root>`;
}
function state() {
  const xml=sourceXml();
  const out=createXmlCiiAdaptedWorkflowState();
  return {
    ...out,sourceKind:'xml',activePhaseId:'run',sourceText:xml,sourceFile:null,
    stagedJsonText:'',supportConfigJson:JSON.stringify({weight:{masterRows:[]}}),
    options:{...out.options,outputMode:'both',kgToNewton:true},
    branchScope:{filteredSourceText:xml,filteredStagedJsonText:'',
      manifest:{selectedBranchNames:['B-939']},blocked:false},
  };
}
function parity(xml) { return {
  applied:true,xmlText:xml,reviewProposals:[],nodeRows:[],stats:{},logs:[],
  evidence:{ok:true,engineInputDigest:'before-review'},diagnostics:[],
};}
function injected(weight=150, typeDesc='Weldneck Flange') {
  return {runParityEnricher:async(job)=>{
    assert.ok(job.sourceText.includes('<NodeNumber>939</NodeNumber>'));
    assert.ok(!job.sourceText.includes('<NodeNumber>10020</NodeNumber>'),
      '19.1mm RIGID must originate in enriched, not source XML');
    return parity(enriched(weight,typeDesc));
  }};
}
const tested=await inspectOutputEmpiricalSource(state(),injected(150));
assert.equal(tested.mandatory.issues.length,1,'150kg is outside ±50%');
assert.equal(tested.all.issues.length,1);
assert.equal(tested.all.issues[0].fromNode,'939');
assert.equal(tested.all.issues[0].toNode,'10020');
assert.ok(Math.abs(tested.all.issues[0].elementLengthMm-19.1)<1e-7);
assert.ok(tested.mandatory.issues[0].empiricalEvidence.reportableAbnormality);
const normal=await inspectOutputEmpiricalSource(state(),injected(15));
assert.equal(normal.mandatory.issues.length,0,'15kg inside ±50% is not forced for approval');
assert.equal(normal.all.issues.length,1,'manual inspector still shows normal physical 19.1mm edge');
const issue=normal.all.issues[0];
const a1=preferredEmpiricalWeightForIssue(issue);
const a2=preferredEmpiricalWeightForIssue(issue,'A2_FIRST');
assert.equal(a1.source,'A1 size-band');
assert.equal(a2.source,'A2 matrix');
assert.ok(Math.abs(a1.massKg-13.795)<0.002);
assert.ok(Math.abs(a2.massKg-13.494)<0.002);
assert.equal(preferredEmpiricalWeightForIssue({empiricalEvidence:{}}),null);
assert.equal(preferredEmpiricalWeightForIssue({
 empiricalEvidence:{approach1:{available:false,estimatedWeightKg:10},
 approach2:{available:true,estimatedWeightKg:14.5}},
}).source,'A2 matrix');

const pending=openStandaloneFinalRigidWeightReviewPopup(tested.all.issues,{
  manualInspection:true,sourceName:'inspect-19mm.xml',kgToNewton:true,
});
let overlay=document.querySelector('.mc-rigid-review-overlay');
assert.ok(overlay,'manual popup actually appears');
assert.match(overlay.textContent,/939.*10020/s);
assert.match(overlay.textContent,/19.1 mm/);
assert.match(overlay.textContent,/Apply All Empirical Based/);
assert.match(overlay.textContent,/A1 size-band, fallback to A2 matrix/);
const search=overlay.querySelector('[data-final-rigid-search]');
search.value='19.1 mm';
search.dispatchEvent(new Event('input',{bubbles:true}));
assert.notEqual(overlay.querySelector('[data-final-rigid-review-row]').style.display,'none');
overlay.querySelector('[data-final-rigid-empirical-fill]').click();
const massInput=overlay.querySelector('[data-final-rigid-mass="0"]');
assert.ok(Math.abs(Number(massInput.value)-a1.massKg)<0.002);
assert.equal(overlay.querySelector('[data-final-rigid-approve="0"]').checked,false,
  'bulk empirical fill must NOT silently approve');
assert.match(overlay.querySelector('[data-final-rigid-estimate-source="0"]').textContent,/A1 size-band/);
overlay.querySelector('[data-final-rigid-empirical-strategy]').value='A2_FIRST';
overlay.querySelector('[data-final-rigid-empirical-fill]').click();
assert.ok(Math.abs(Number(massInput.value)-a2.massKg)<0.002,
  'user-controlled A2 estimate priority must be honored');
overlay.querySelector('[data-final-rigid-approve="0"]').checked=true;
overlay.querySelector('[data-final-rigid-confirm]').click();
const response=await pending;
assert.equal(response.cancelled,false);
assert.ok(Math.abs(response.weightsByKey[tested.all.issues[0].key]-a2.massKg)<0.002);
assert.equal(document.querySelector('.mc-rigid-review-overlay'),null);

const manualRef={current:state()};
let manualCalls=0;
const manualResult=await runOutputEmpiricalReviewFromUi(manualRef,{
  ...injected(150),manualInspection:true,
  reviewPopup:async(issues,opts)=>{
    manualCalls++;
    assert.equal(opts.manualInspection,true);
    assert.equal(issues[0].elementLengthMm,19.099999999999994);
    assert.equal(issues[0].currentWeightKg,150);
    return {cancelled:false,approvedKeys:[issues[0].key],weightsByKey:{[issues[0].key]:15}};
  },
});
assert.equal(manualCalls,1);
assert.equal(manualResult.approved,1);
const config=JSON.parse(manualRef.current.supportConfigJson);
assert.equal(Object.values(config.overrides.rigidWeight)[0],15);
const afterApproval=await enforceStandaloneFinalRigidWeightReview(
  parity(enriched(150)),
  {supportConfigJson:manualRef.current.supportConfigJson,sourceName:'inspect-19mm.xml',
    options:{kgToNewton:true}},
  {},
);
assert.equal(afterApproval.ok,true,'saved manual correction is effective on the real export gate');
assert.equal(afterApproval.issues.length,0,'new empirical audit sees corrected mass, not stale 150kg');
const fixedDoc=new DOMParser().parseFromString(afterApproval.xmlText,'application/xml');
const node=[...fixedDoc.getElementsByTagName('Node')]
  .find(x=>x.getElementsByTagName('NodeNumber')[0]?.textContent==='10020');
assert.equal(node.getElementsByTagName('Weight')[0].textContent,'15');

const autoRef={current:state()};
let autoCalls=0;
const autoResult=await runOutputEmpiricalReviewFromUi(autoRef,{
  ...injected(150),manualInspection:false,
  reviewPopup:async(issues,opts)=>{
    autoCalls++;assert.equal(opts.manualInspection,false);
    assert.equal(issues.length,1);
    return {cancelled:true};
  },
});
assert.equal(autoCalls,1,'automatic ±50% exception opens the real review workflow');
assert.equal(autoResult.cancelled,true);
assert.equal(JSON.parse(autoRef.current.supportConfigJson).overrides?.rigidWeight,undefined);
let normalAutoCalls=0;
const normalAuto=await runOutputEmpiricalReviewFromUi({current:state()},{
  ...injected(15),manualInspection:false,
  reviewPopup:async()=>{normalAutoCalls++;return {cancelled:true};},
});
assert.equal(normalAutoCalls,0,'empirically compliant 19mm element must not trigger automatic popup');
assert.equal(normalAuto.flagged,0);
const missing=await inspectOutputEmpiricalSource(state(),injected(15,'NOT_A_MODEL_FAMILY'));
assert.equal(missing.mandatory.issues.length,1,'unvalidated positive masses also require review');
assert.equal(preferredEmpiricalWeightForIssue(missing.mandatory.issues[0]),null);

const renderRoot=document.createElement('div');
const renderState=createXmlCiiAdaptedWorkflowState();
renderState.activePhaseId='run';
renderState.sourceText='';
renderState.sourceKind='xml';
renderStandaloneOutputRunPanel(renderRoot,{current:renderState},()=>{});
const uiButton=renderRoot.querySelector('[data-action="review-output-empirical-weights"]');
assert.ok(uiButton,'Output / Run contains optional manual empirical inspection button');
assert.match(uiButton.textContent,/Review Empirical Weights.*Inspect All RIGID/);
assert.match(renderRoot.textContent,/Automatic A1\/A2 check/);
assert.match(renderRoot.textContent,/19.1 mm/);
assert.equal(typeof outputEmpiricalReviewFingerprint(renderState),'string');

console.log('PASS Output/Run ±50% automatic post-enrichment exception; optional 19.1mm inspector; A1/A2 Apply All Empirical Based; explicit approval; corrected final CII input.');
dom.window.close();
