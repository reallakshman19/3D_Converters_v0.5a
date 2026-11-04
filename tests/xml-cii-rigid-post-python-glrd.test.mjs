import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { reconcileFinalPythonRigidWeights } from '../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';
import { applyXmlCiiSplitRigidWeightPropagation } from '../converters/xml-cii2019-core/split-rigid-weight-propagation.js';
import { digestRigidOwnershipSnapshot } from '../converters/xml-cii2019-core/rigid-weight-snapshot.js';

const args=Object.fromEntries(process.argv.slice(2).reduce((result,arg,i,list)=>{
 if(arg.startsWith('--'))result.push([arg.slice(2),list[i+1]]);
 return result;
},[]));
const directory=resolve(args.directory || '/tmp/glrd-preview/results');
const dom = new JSDOM('<html/>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const cases=[
 ['GLRD-enriched.xml','GLRD.cii','GLRD.rigid_ledger.json',0],
 ['GLRD-weight-split-after-enriched.xml','GLRD-weight-split-after.cii','GLRD-weight-split-after.rigid_ledger.json',1],
 ['SYNTHETIC-surviving-rigid-after.xml','SYNTHETIC-surviving-rigid-after.cii','SYNTHETIC-surviving-rigid-after.rigid_ledger.json',1],
];
for(const [xmlFile,ciiFile,ledgerFile,expectedPositives] of cases){
 const load=(name)=>readFileSync(resolve(directory,name),'utf8');
 const xmlText=load(xmlFile);
 const sourceId='glrd-ci:'+xmlFile;
 const snapshotDigest=await digestRigidOwnershipSnapshot({
   sourceId,sourceName:xmlFile,sourceText:xmlText,
   supportConfigJson:'{}',options:{kgToNewton:true},preparedXmlText:xmlText,
 });
 const initial=applyXmlCiiSplitRigidWeightPropagation(xmlText,{sourceId,snapshotDigest});
 const allocations={};
 for(const group of initial.componentLedger.filter(row=>row.positiveNodes>0)){
   assert.equal(group.positiveNodes,1,'controlled owner-only GLRD/synthetic must have exactly one positive sibling');
   const owner=group.nodes.find(node=>node.weightKg>0);
   assert.ok(owner);
   allocations[group.componentOccurrenceId]={
     sourceId,snapshotDigest,approvedByEngineer:true,
     approvalKind:'EXPLICIT_PHYSICAL_COMPONENT_MASS_OWNERSHIP',
     allocationType:'COMPONENT_LUMPED',componentMassKg:owner.weightKg,
     ownerNodeOrdinal:owner.nodeOrdinal,
   };
 }
 const custody=applyXmlCiiSplitRigidWeightPropagation(xmlText,{
   sourceId,snapshotDigest,ownershipAllocations:allocations,requireAllocation:true,
 });
 assert.equal(custody.ownershipIssues.length,0,'approved physical owner custody must be structurally conserved');
 const output=await reconcileFinalPythonRigidWeights({
   reviewedXmlText:xmlText,ciiText:load(ciiFile),rigidLedger:JSON.parse(load(ledgerFile)),
   kgToNewton:true,componentLedger:custody.componentLedger,
 });
 assert.equal(output.componentConservation.approvedGroups,expectedPositives);
 assert.equal(output.componentConservation.authorizedMassKg,expectedPositives*15);
 assert.equal(output.componentConservation.emittedMassKg,expectedPositives*15);
 assert.equal(output.ok,true);
 assert.equal(output.positiveEdges,expectedPositives);
 console.log('RIGID_GLDR_POST_PYTHON_CII_OWNER_PASS',JSON.stringify({xmlFile,ciiFile,summary:output}));
}
