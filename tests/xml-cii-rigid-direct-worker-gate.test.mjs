import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { run } from '../tabs/model-converters/converters/xmltocii2019_runner.js';
import { collectRigidSplitOwnershipDecisions } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-split-rigid-ownership-popup.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const source = (w1,w2) => `<PipeStressExport><Pipe><Branch><Branchname>B-TEST</Branchname>
<Node><NodeNumber>100</NodeNumber><ComponentRefNo>=FL-1</ComponentRefNo><ComponentType>FLAN</ComponentType><Endpoint>1</Endpoint><Position>0 0 0</Position><Weight>${w1}</Weight></Node>
<Node><NodeNumber>110</NodeNumber><ComponentRefNo>=FL-1</ComponentRefNo><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><Position>19.1 0 0</Position><Weight>${w2}</Weight></Node>
</Branch></Pipe></PipeStressExport>`;
let workerCalls = 0;
const job = (xml) => ({
  inputFiles: [{ role: 'primary', name: 'rigid-direct.xml', bytes: new TextEncoder().encode(xml) }],
  options: { createEnrichedXml: false, supportConfigJson: '{}' },
  converterId: 'xml-to-cii',
  setStatus: () => {},
  workerRunner: { runJob: async () => {
    workerCalls++;
    const cii = '#$ RIGID\n150 0\n#$ EXPJT\n';
    const ledger = {
      schema:'xml-cii-rigid-python-emission-ledger/v1',
      authority:'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII',
      ciiSha256:createHash('sha256').update(cii).digest('hex'),
      weightScale:10,summary:{rigidAuxCount:1,positiveCount:1,zeroCount:0},
      rows:[{
        rigidAuxIndex:1,branchName:'B-TEST',branchOccurrence:0,
        fromNode:100,toNode:110,fromNodeOccurrence:0,toNodeOccurrence:1,
        fromComponentType:'FLAN',toComponentType:'RIGID',
        fromPosition:[0,0,0],toPosition:[19.1,0,0],
        componentRefNo:'=FL-1',toEndpoint:2,
        massKg:15,expectedCiiMass:150,emittedCiiMass:150,weightState:'POSITIVE',
      }],
    };
    return { outputs: [{name:'ok.cii',text:cii},{name:'ok.rigid_ledger.json',text:JSON.stringify(ledger)}] };
  } },
});
await assert.rejects(run(job(source(15,15))), /Model Converters RIGID ownership not approved/);
assert.equal(workerCalls, 0, 'duplicate physical mass must never reach Python worker');
await assert.rejects(run(job(source(0,15))), /Model Converters RIGID ownership not approved/);
assert.equal(workerCalls, 0, 'a single positive mass cannot bypass explicit engineer ownership approval');
const invalid = source('oops',15);
await assert.rejects(run(job(invalid)), /Model Converters RIGID ownership not approved/);
assert.equal(workerCalls,0);
let saved = {};
let reviewCalls = 0;
const approved = job(source(0,15));
approved.options.openXmlCiiSplitRigidOwnershipPopup = async (groups,meta) => {
  reviewCalls++;
  assert.equal(groups.length,1);
  return collectRigidSplitOwnershipDecisions(groups,meta,
    (part)=>({type:'COMPONENT_LUMPED',mass:'15',owner:'1',confirm:true})[part]);
};
approved.options.saveXmlCiiRigidOwnershipAllocations = async ({allocationsById}) => {
  saved = {...allocationsById};
};
await run(approved);
assert.equal(workerCalls,1);
assert.equal(reviewCalls,1);
assert.equal(Object.keys(saved).length,1);
const same = job(source(0,15));
same.options.supportConfigJson=JSON.stringify({rigidOwnership:{allocations:saved}});
await run(same);
assert.equal(workerCalls,2,'persisted identical source and config reuse engineer allocation without another dialog');
const stale = job(source(0,16));
stale.options.supportConfigJson=JSON.stringify({rigidOwnership:{allocations:saved}});
await assert.rejects(run(stale),/Model Converters RIGID ownership not approved/);
assert.equal(workerCalls,2,'changed source cannot reuse stale allocation');
console.log('RIGID_DIRECT_WORKER_GATE_PASS');
