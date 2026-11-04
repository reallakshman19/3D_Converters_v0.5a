import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { runXmlCii2019WorkflowService } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser=dom.window.DOMParser;
globalThis.XMLSerializer=dom.window.XMLSerializer;
const xml='<PipeStressExport><Pipe><Branch><Branchname>B-CUSTODY</Branchname>' +
 '<Node><NodeNumber>10</NodeNumber><Position>0 0 0</Position><ComponentType>PIPE</ComponentType><Weight>0</Weight></Node>' +
 '<Node><NodeNumber>20</NodeNumber><Position>100 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><ComponentRefNo>=R-1</ComponentRefNo><Weight>0</Weight></Node>' +
 '</Branch></Pipe></PipeStressExport>';
const job=(outputMode)=>({sourceKind:'xml',sourceName:'test.xml',sourceText:xml,
 supportConfigJson:'{}',options:{outputMode,kgToNewton:true}});
let calls=0;
const runtime={
 runParityEnricher:async()=>({
   applied:true,xmlText:xml,evidence:{ok:true},stats:{},logs:[],nodeRows:[],reviewProposals:[],
 }),
 engineRunner:async()=>{ calls++;return {
   ok:true,sourceKind:'xml',outputKind:'enrichedXML',enrichedText:xml,enrichedName:'test_enriched.xml',
   ciiText:null,ciiName:null,diagnostics:{},logs:[]
 };},
};
for(const mode of ['both','cii-only']){
 const answer=await runXmlCii2019WorkflowService(job(mode),runtime);
 assert.equal(answer.ok,false,'missing CII must fail closed for '+mode);
 assert.match(answer.error,/returned no CII to reconcile/);
}
assert.equal(calls,2);
const enriched=await runXmlCii2019WorkflowService(job('enriched-only'),runtime);
assert.equal(enriched.ok,true,'enriched XML output must not require a CII auxiliary manifest');
console.log('RIGID_MISSING_CII_EXPORT_FAIL_CLOSED_PASS');
