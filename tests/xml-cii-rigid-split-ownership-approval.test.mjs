import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { digestRigidOwnershipSnapshot } from '../converters/xml-cii2019-core/rigid-weight-snapshot.js';
import { applyXmlCiiRigidWeightOverrides } from '../converters/xml-cii2019-core/weight-match-model.js';
import { enforceStandaloneRigidSplitOwnership, enforceStandaloneFinalRigidWeightReview } from
  '../tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-review-gate.js';
import {
  openStandaloneRigidSplitOwnershipPopup,
  rigidSplitOwnershipReviewMarkup,
  collectRigidSplitOwnershipDecisions,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-split-rigid-ownership-popup.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser=dom.window.DOMParser;
globalThis.XMLSerializer=dom.window.XMLSerializer;
globalThis.document=dom.window.document;

function source(a=0,b=15){
  return `<PipeStressExport><Pipe><Branch><Branchname>BR-OWNERSHIP</Branchname>
  <Node><NodeNumber>930</NodeNumber><Position>0 0 0</Position><ComponentType>PIPE</ComponentType><Weight>0</Weight></Node>
  <Node><NodeNumber>939</NodeNumber><Position>89.9 0 0</Position><ComponentType>FLAN</ComponentType><ComponentRefNo>=F-1</ComponentRefNo><Endpoint>1</Endpoint><Weight>${a}</Weight></Node>
  <Node><NodeNumber>10020</NodeNumber><Position>109 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=F-1</ComponentRefNo><Endpoint>2</Endpoint><Weight>${b}</Weight><NodeName>Weldneck Flange</NodeName><BoreMm>50</BoreMm><Rating>900</Rating></Node>
  </Branch></Pipe></PipeStressExport>`;
}
const xml = source();
const job = (input=xml)=>({sourceId:'mode-A-source-1',sourceName:'owner.xml',sourceText:input,
  stagedJsonText:'{}',supportConfigJson:'{}',branchSelection:null,
  options:{outputMode:'both',kgToNewton:true}});
const digest = await digestRigidOwnershipSnapshot({
  sourceId:'mode-A-source-1',sourceName:'owner.xml',sourceText:xml,
  stagedJsonText:'{}',supportConfigJson:'{}',
  options:{outputMode:'both',kgToNewton:true},preparedXmlText:xml,
});
assert.match(digest,/^sha256:[a-f0-9]{64}$/);
const missing = await enforceStandaloneRigidSplitOwnership(xml,job(),{}, {},digest);
assert.equal(missing.ok,false);
assert.match(missing.error,/No engineer ownership review dialog/);
assert.equal(missing.splitCustody.componentLedger.length,1);
assert.equal(missing.splitCustody.componentLedger[0].allocationType,'UNKNOWN');
const group=missing.splitCustody.componentLedger[0];
const options={sourceId:'mode-A-source-1',sourceName:'owner.xml',snapshotDigest:digest};
const markup=rigidSplitOwnershipReviewMarkup([group],options);
for(const token of ['COMPONENT_LUMPED','SEGMENT_DISTRIBUTED','ZERO_NONOWNER','UNKNOWN','data-rigid-ownership-confirm']){
 assert.ok(markup.includes(token),token);
}
const fields={type:'COMPONENT_LUMPED',mass:'15',owner:String(group.nodes[1].nodeOrdinal),confirm:true};
const lumped=collectRigidSplitOwnershipDecisions([group],options,(name)=>fields[name]);
const authorized=lumped.allocationsById[group.componentOccurrenceId];
assert.equal(authorized.componentMassKg,15);
assert.equal(authorized.ownerNodeOrdinal,2);
assert.equal(authorized.approvedByEngineer,true);
assert.equal(authorized.snapshotDigest,digest);
assert.throws(()=>collectRigidSplitOwnershipDecisions([group],options,(name)=>({...fields,confirm:false})[name]),/Confirm/);
assert.throws(()=>collectRigidSplitOwnershipDecisions([group],options,(name)=>({...fields,mass:'30'})[name]),/Lumped mass/);
assert.throws(()=>collectRigidSplitOwnershipDecisions([group],options,(name)=>({...fields,type:'UNKNOWN'})[name]),/UNKNOWN/);
const approved = await enforceStandaloneRigidSplitOwnership(xml,job(),{},{
  reviewSplitRigidOwnership:async(groups,meta)=>{
    assert.equal(groups.length,1);
    assert.equal(meta.snapshotDigest,digest);
    return lumped;
  },
},digest);
assert.equal(approved.ok,true);
assert.equal(approved.splitCustody.ownershipIssues.length,0);
assert.equal(approved.splitCustody.componentLedger[0].status,'VALIDATED');

const savedConfig={rigidOwnership:{allocations:lumped.allocationsById}};
const reused=await enforceStandaloneRigidSplitOwnership(xml,job(),savedConfig,{},digest);
assert.equal(reused.ok,true,'same exact SHA-256 snapshot can reuse engineer approval');
assert.deepEqual(reused.approvedAllocations,{});
const changedDigest=await digestRigidOwnershipSnapshot({
 sourceId:'mode-A-source-1',sourceName:'owner.xml',sourceText:source(0,16),
 stagedJsonText:'{}',supportConfigJson:'{}',
 options:{outputMode:'both',kgToNewton:true},preparedXmlText:source(0,16),
});
const stale=await enforceStandaloneRigidSplitOwnership(source(0,16),job(source(0,16)),savedConfig,{},changedDigest);
assert.equal(stale.ok,false);
assert.match(stale.error,/No engineer ownership review dialog/);
assert.equal(stale.splitCustody.ownershipIssues[0].reason,'allocation-snapshot-mismatch');
const differentSource=await enforceStandaloneRigidSplitOwnership(xml,
 {...job(),sourceId:'mode-A-source-2'},savedConfig,{},digest);
assert.equal(differentSource.ok,false,'Mode A source ID change invalidates allocation');

const distributedXml=source(5,10);
const distributedGroup=(await enforceStandaloneRigidSplitOwnership(distributedXml,job(distributedXml),{}, {},digest))
 .splitCustody.componentLedger[0];
const distributed=collectRigidSplitOwnershipDecisions([distributedGroup],options,
 (part)=>({type:'SEGMENT_DISTRIBUTED',mass:'15',owner:'1',confirm:true})[part]);
const distributedVerified=await enforceStandaloneRigidSplitOwnership(distributedXml,job(distributedXml),
 {},{reviewSplitRigidOwnership:async()=>distributed},digest);
assert.equal(distributedVerified.ok,true);
assert.equal(distributedVerified.splitCustody.componentLedger[0].allocationType,'SEGMENT_DISTRIBUTED');
assert.throws(()=>collectRigidSplitOwnershipDecisions([distributedGroup],options,
 (part)=>({type:'SEGMENT_DISTRIBUTED',mass:'30',owner:'1',confirm:true})[part]),
 /conserve/);

const allZero=await enforceStandaloneRigidSplitOwnership(source(0,0),job(source(0,0)),{}, {},digest);
assert.equal(allZero.ok,true,'all-zero split groups require no fabricated component mass');

const popup = openStandaloneRigidSplitOwnershipPopup([group],options);
let overlay=document.querySelector('.mc-rigid-ownership-overlay');
assert.ok(overlay);
overlay.querySelector('[data-rigid-ownership-submit]').click();
assert.match(overlay.querySelector('[data-rigid-ownership-status]').textContent,/Confirm/);
overlay.querySelector('[data-rigid-ownership-type="0"]').value='COMPONENT_LUMPED';
overlay.querySelector('[data-rigid-ownership-mass="0"]').value='15';
overlay.querySelector('[data-rigid-ownership-confirm="0"]').checked=true;
overlay.querySelector('[data-rigid-ownership-submit]').click();
const popupReply=await popup;
assert.equal(popupReply.allocationsById[group.componentOccurrenceId].componentMassKg,15);
assert.equal(document.querySelector('.mc-rigid-ownership-overlay'),null);
const cancelled=openStandaloneRigidSplitOwnershipPopup([group],options);
overlay=document.querySelector('.mc-rigid-ownership-overlay');
overlay.querySelector('[data-rigid-ownership-cancel]').click();
assert.equal((await cancelled).cancelled,true);

// Actual final stand-alone path: plausibly normal A1/A2 mass still requires
// separate physical split ownership, not silently promoted to owner approval.
const noApproval=await enforceStandaloneFinalRigidWeightReview({
 xmlText:xml,nodeRows:[],reviewProposals:[],
},job(),{});
assert.equal(noApproval.ok,false);
assert.match(noApproval.error,/RIGID split physical ownership approval|Final rigid weight review required/);
let prompts=0;
const actual=await enforceStandaloneFinalRigidWeightReview({
 xmlText:xml,nodeRows:[],reviewProposals:[],
},job(),{
 reviewSplitRigidOwnership:async(groups,meta)=>{
   prompts++;
   const item=groups[0];
   return collectRigidSplitOwnershipDecisions(groups,meta,
     (part)=>({type:'COMPONENT_LUMPED',mass:'15',owner:String(item.nodes[1].nodeOrdinal),confirm:true})[part]);
 },
 reviewFinalRigidWeights:async(issues)=>({
   approvedKeys:issues.map(item=>item.key),
   weightsByKey:Object.fromEntries(issues.map(item=>[item.key,15])),
 }),
});
assert.equal(actual.ok,true,actual.error || '');
assert.equal(prompts,1);
assert.equal(actual.splitCustody.componentLedger[0].status,'VALIDATED');

// Full approval lifecycle: an empirical 150 -> 15 kg correction changes both
// the prepared XML and the saved overrides. The ownership snapshot must
// match that *persisted* configuration on a second run, not need reapproval.
const highXml = source(0,150);
let savedWeights={};
let savedAllocations={};
let ownershipDialogCalls=0;
const correctedJob=job(highXml);
const corrected=await enforceStandaloneFinalRigidWeightReview({
 xmlText:highXml,nodeRows:[],reviewProposals:[],
},correctedJob,{
 reviewFinalRigidWeights:async(issues)=>({
   approvedKeys:issues.map(item=>item.key),
   weightsByKey:Object.fromEntries(issues.map(item=>[item.key,15])),
 }),
 reviewSplitRigidOwnership:async(groups,meta)=>{
   ownershipDialogCalls++;
   return collectRigidSplitOwnershipDecisions(groups,meta,
     (part)=>({type:'COMPONENT_LUMPED',mass:'15',owner:String(groups[0].nodes[1].nodeOrdinal),confirm:true})[part]);
 },
 onFinalRigidWeightsApplied:async({weightsByKey})=>{savedWeights={...weightsByKey};},
 onSplitRigidOwnershipApproved:async({allocationsById})=>{savedAllocations={...allocationsById};},
});
assert.equal(corrected.ok,true,corrected.error || '');
assert.equal(ownershipDialogCalls,1);
assert.equal(Object.keys(savedAllocations).length,1);
assert.equal(Object.keys(savedWeights).length,1);
const persistent={
  overrides:{rigidWeight:savedWeights},
  rigidOwnership:{allocations:savedAllocations},
};
const nextPrepared = applyXmlCiiRigidWeightOverrides(highXml, savedWeights).xmlText;
assert.equal(nextPrepared,corrected.xmlText,'reviewed corrected XML must be byte-stable on rerun');
const expectedPersistedDigest = await digestRigidOwnershipSnapshot({
 sourceId:correctedJob.sourceId,sourceName:correctedJob.sourceName,
 sourceText:correctedJob.sourceText,stagedJsonText:correctedJob.stagedJsonText,
 supportConfigJson:JSON.stringify(persistent),
 branchSelection:null,options:correctedJob.options,preparedXmlText:nextPrepared,
});
const withoutAllocationsDigest=await digestRigidOwnershipSnapshot({
 sourceId:correctedJob.sourceId,sourceName:correctedJob.sourceName,
 sourceText:correctedJob.sourceText,stagedJsonText:correctedJob.stagedJsonText,
 supportConfigJson:JSON.stringify({overrides:{rigidWeight:savedWeights}}),
 branchSelection:null,options:correctedJob.options,preparedXmlText:nextPrepared,
});
const withOverrideInSource=await digestRigidOwnershipSnapshot({
 sourceId:correctedJob.sourceId,sourceName:correctedJob.sourceName,
 sourceText:correctedJob.sourceText,stagedJsonText:correctedJob.stagedJsonText,
 supportConfigJson:'{}',
 branchSelection:null,options:correctedJob.options,preparedXmlText:nextPrepared,
});
console.log('RIGID_SNAPSHOT_DEBUG', JSON.stringify({
 corrected: corrected.snapshotDigest,
 persisted: expectedPersistedDigest,
 withoutAllocations: withoutAllocationsDigest,
 noOverrides: withOverrideInSource,
 savedWeights, savedAllocations:Object.keys(savedAllocations),
 samePrepared: nextPrepared===corrected.xmlText,
}));
assert.equal(expectedPersistedDigest,corrected.snapshotDigest,
  'saved numeric overrides and ownership approval must produce the same snapshot SHA-256');
const rerun=await enforceStandaloneFinalRigidWeightReview({
 xmlText:highXml,nodeRows:[],reviewProposals:[],
},{...correctedJob,supportConfigJson:JSON.stringify(persistent)},{
 reviewSplitRigidOwnership:async(groups,meta)=>{
   throw new Error('Unexpected stale approval: '+JSON.stringify({
     expected:corrected.snapshotDigest,current:meta.snapshotDigest,
     groups:groups.map(g=>({id:g.componentOccurrenceId,reason:g.reason,status:g.status})),
   }));
 },
 reviewFinalRigidWeights:async()=>{
   throw new Error('Same corrected weight must remain within empirical approval');
 },
});
assert.equal(rerun.ok,true,rerun.error || '');
assert.equal(rerun.snapshotDigest,corrected.snapshotDigest);
assert.equal(rerun.splitCustody.componentLedger[0].status,'VALIDATED');
assert.equal(rerun.reviewedRows.length,0);
console.log('RIGID_SNAPSHOT_ENGINEER_SPLIT_OWNERSHIP_APPROVAL_PASS');
