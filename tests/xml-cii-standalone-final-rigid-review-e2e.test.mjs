import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { runXmlCii2019Workflow } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-api-atta-default.js';
import { mappedNodeWeights } from '../tabs/xml-cii-2019-standalone/xml-cii-standalone-run-parity.js';
import { openStandaloneFinalRigidWeightReviewPopup } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-weight-popup.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/3d-converters' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.CustomEvent = dom.window.CustomEvent;

function enriched(weight = 15) {
  return `<?xml version="1.0"?><Root><Pipe><Branch>
    <Branchname>B-939</Branchname>
    <Node><NodeNumber>930</NodeNumber><ComponentType>FLAN</ComponentType><ComponentRefNo>=FLANGE-1</ComponentRefNo><Endpoint>1</Endpoint><Position>0 0 0</Position><Weight>0</Weight></Node>
    <Node><NodeNumber>939</NodeNumber><ComponentType>PIPE</ComponentType><ComponentRefNo>=PIPE-939</ComponentRefNo><Position>89.9 0 0</Position></Node>
    <Node><NodeNumber>10020</NodeNumber><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><ComponentRefNo>=FLANGE-1</ComponentRefNo><Position>109 0 0</Position><Weight>${weight}</Weight><BoreMm>50</BoreMm><Rating>900</Rating></Node>
  </Branch></Pipe></Root>`;
}
function fixtureJob(xml = enriched(), kgToNewton = true) {
  return { sourceKind: 'xml', sourceText: xml, sourceName: 'actual-939-to-10020.xml',
    supportConfigJson: JSON.stringify({weight:{masterRows:[]}}),
    options: { outputMode: 'both', kgToNewton } };
}
function parity(xml, proposals = []) {
  return {applied:true,xmlText:xml,evidence:{ok:true,engineInputDigest:'input-before-review'},
    logs:['stubbed process parity'],stats:{},diagnostics:[],nodeRows:[],branchRows:[],
    expectedEntries:[],reviewProposals:proposals};
}
async function runWith(xml, options = {}) {
  const captured = {engineCalls:0,engineXml:null,dialogCalls:0,issueRows:null,modalHtml:null};
  const runtime = {
    runParityEnricher: async () => parity(xml, options.proposals || []),
    engineRunner: async (job) => {
      captured.engineCalls += 1;
      captured.engineXml = job.sourceText;
      return {ok:true,sourceKind:'xml',outputKind:'enrichedXML',
        enrichedText:job.sourceText,enrichedName:'enriched.xml',
        ciiText:'CII_ENGINE_CALLED',ciiName:'model.cii',logs:[],diagnostics:{}};
    },
  };
  if (options.dialog) {
    runtime.reviewFinalRigidWeights = async (rows, meta) => {
      captured.dialogCalls += 1;
      captured.issueRows = rows;
      const popup = openStandaloneFinalRigidWeightReviewPopup(rows, meta);
      const overlay = document.querySelector('.mc-rigid-review-overlay');
      assert.ok(overlay, 'Real final review dialog rendered in DOM');
      captured.modalHtml = overlay.textContent;
      assert.match(overlay.textContent, /939.*10020/s, 'actual 939 to 10020 edge shown');
      assert.match(overlay.textContent, /19\.1 mm/, 'actual 19.1 mm element length shown');
      if (options.dialog === 'cancel') {
        overlay.querySelector('[data-final-rigid-cancel]').click();
      } else {
        if (options.dialog === 'confirm-empty') {
          overlay.querySelector('[data-final-rigid-confirm]').click();
          assert.match(overlay.querySelector('[data-final-rigid-status]').textContent, /Reviewed checkbox required/);
          assert.equal(captured.engineCalls, 0, 'engine not called before manual acknowledgement');
        }
        const input = overlay.querySelector('[data-final-rigid-mass="0"]');
        if (options.correctedKg !== undefined) input.value = String(options.correctedKg);
        overlay.querySelector('[data-final-rigid-approve="0"]').checked = true;
        overlay.querySelector('[data-final-rigid-confirm]').click();
      }
      return popup;
    };
  }
  const result = await runXmlCii2019Workflow(fixtureJob(xml, options.kgToNewton !== false),runtime);
  return { result, captured };
}

// Regression of the actual production service gate, not just the standalone audit helper.
const absent = await runWith(enriched());
assert.equal(absent.result.ok, false, 'headless execution must not bypass required review');
assert.equal(absent.captured.engineCalls, 0);
assert.match(absent.result.error, /939.*10020/);

const cancelled = await runWith(enriched(), {dialog:'cancel'});
assert.equal(cancelled.result.ok, false);
assert.equal(cancelled.captured.dialogCalls, 1);
assert.equal(cancelled.captured.engineCalls, 0);

const approved = await runWith(enriched(), {dialog:'confirm-empty'});
assert.equal(approved.result.ok, true);
assert.equal(approved.captured.engineCalls, 1, 'engine must run only after dialog approval');
assert.match(approved.captured.modalHtml, /15\.000 kg/);
assert.match(approved.captured.modalHtml, /150\.00 N/, '15kg -> 150N; never mislabel as 150kg');
assert.ok(approved.captured.issueRows[0].reviewFlags.includes('SHORT_HEAVY_RIGID_ELEMENT_REQUIRES_REVIEW'));
assert.equal(approved.result.diagnostics.finalRigidWeightReview.reviewRequiredCount, 1);
assert.equal(approved.result.diagnostics.finalRigidWeightReview.reviewedRows[0].approvedWeightKg,15);
assert.notEqual(approved.result.diagnostics.converterInputDigest, 'input-before-review');

const corrected = await runWith(enriched(), {dialog:'confirm',correctedKg:1.5});
assert.equal(corrected.result.ok, true);
const correctedDoc = new DOMParser().parseFromString(corrected.captured.engineXml, 'application/xml');
const ns = [...correctedDoc.getElementsByTagName('Node')];
const target = ns.find((node) => node.getElementsByTagName('NodeNumber')[0]?.textContent === '10020');
assert.equal(target?.getElementsByTagName('Weight')[0]?.textContent, '1.5', 'reviewed correction must reach Python input');
assert.equal(corrected.result.diagnostics.finalRigidWeightReview.reviewedRows[0].previousWeightKg,15);

const proposal = {key:'B-939::10020',branchName:'B-939',toNode:'10020',componentRefNo:'=FLANGE-1',
  endpoint:'2',componentType:'RIGID',elementLengthMm:19.1,proposedWeightKg:15,currentWeightKg:0,
  reviewFlags:['SHORT_HEAVY_WEIGHT_CANDIDATE']};
const unapprovedProposal = await runWith(enriched(0),{proposals:[proposal]});
assert.equal(unapprovedProposal.result.ok,false);
assert.equal(unapprovedProposal.captured.engineCalls,0,'inferred Preview fallback blocked without review');
const proposalApproved = await runWith(enriched(0),{dialog:'confirm',proposals:[proposal],correctedKg:2});
assert.equal(proposalApproved.result.ok,true);
assert.equal(proposalApproved.captured.engineCalls,1);
const proposedDocument = new DOMParser().parseFromString(proposalApproved.captured.engineXml,'application/xml');
const proposalNode = [...proposedDocument.getElementsByTagName('Node')].find((n)=>n.getElementsByTagName('NodeNumber')[0]?.textContent==='10020');
assert.equal(proposalNode.getElementsByTagName('Weight')[0].textContent,'2');

const unsafeNode = {key:'B-939::10020',branchName:'B-939',nodeNumber:'10020',componentRefNo:'=FLANGE-1',
  componentType:'RIGID',endpoint:'2',lengthMm:19.1,weightMatch:{weight:15,score:0.95,weightMethod:'length-extrapolated'},
  weightCandidates:[{weight:15,score:0.95,weightMethod:'length-extrapolated',ratingExact:true,lengthQualified:true,boreDelta:0}]};
const unsafe = mappedNodeWeights([unsafeNode],{});
assert.equal(unsafe.weights.size,0,'Preview fallback must not write a real XML mass');
assert.equal(unsafe.reviewProposals.length,1);
const directNode={...unsafeNode,lengthMm:109,weightMatch:{weight:15},
  weightCandidates:[{weight:15,selectedWeight:15,score:0.65,weightMethod:'master',ratingExact:true,lengthQualified:true,boreDelta:0}]};
const direct = mappedNodeWeights([directNode],{});
assert.equal(direct.weights.get('B-939|10020'),15,'length-qualified 65% direct master can auto-fill');
assert.equal(direct.reviewProposals.length,0);
const shortDirect=mappedNodeWeights([{...directNode,lengthMm:19.1}],{});
assert.equal(shortDirect.weights.size,0,'short heavy must require review even when master score is 65%');
assert.equal(shortDirect.reviewProposals.length,1);
const lowDirect=mappedNodeWeights([{...directNode,weightCandidates:[{...directNode.weightCandidates[0],score:0.59}]}],{});
assert.equal(lowDirect.weights.size,0,'below 60% cannot silently auto-fill');

console.log('PASS real standalone service + DOM dialog + engine custody: 939 -> 10020, 19.1 mm, 15kg -> 150N; blocked/approved/corrected/proposed.');
