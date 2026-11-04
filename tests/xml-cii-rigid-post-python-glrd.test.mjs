import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { reconcileFinalPythonRigidWeights } from '../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';

const args=Object.fromEntries(process.argv.slice(2).reduce((result,arg,i,list)=>{
 if(arg.startsWith('--'))result.push([arg.slice(2),list[i+1]]);
 return result;
},[]));
const directory=resolve(args.directory || '/tmp/glrd-preview/results');
globalThis.DOMParser = new JSDOM('<html/>').window.DOMParser;
const cases=[
 ['GLRD-enriched.xml','GLRD.cii','GLRD.rigid_ledger.json',0],
 ['GLRD-weight-split-after-enriched.xml','GLRD-weight-split-after.cii','GLRD-weight-split-after.rigid_ledger.json',1],
 ['SYNTHETIC-surviving-rigid-after.xml','SYNTHETIC-surviving-rigid-after.cii','SYNTHETIC-surviving-rigid-after.rigid_ledger.json',1],
];
for(const [xmlFile,ciiFile,ledgerFile,expectedPositives] of cases){
 const load=(name)=>readFileSync(resolve(directory,name),'utf8');
 const output=await reconcileFinalPythonRigidWeights({
   reviewedXmlText:load(xmlFile),ciiText:load(ciiFile),rigidLedger:JSON.parse(load(ledgerFile)),kgToNewton:true
 });
 assert.equal(output.ok,true);
 assert.equal(output.positiveEdges,expectedPositives);
 console.log('RIGID_GLDR_POST_PYTHON_CII_OWNER_PASS',JSON.stringify({xmlFile,ciiFile,summary:output}));
}
