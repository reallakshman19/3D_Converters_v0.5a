import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { reconcileModelConvertersPythonRigidResponse } from
  '../tabs/model-converters/converters/xmltocii2019_runner.js';

globalThis.DOMParser = new JSDOM('<!doctype html><html><body></body></html>').window.DOMParser;
const xml = '<PipeStressExport><Pipe><Branch><Branchname>MODEL-1</Branchname>' +
  '<Node><NodeNumber>930</NodeNumber><Position>0 0 0</Position><ComponentType>PIPE</ComponentType><Weight>0</Weight></Node>' +
  '<Node><NodeNumber>939</NodeNumber><Position>89.9 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>1</Endpoint><ComponentRefNo>=F</ComponentRefNo><Weight>0</Weight></Node>' +
  '<Node><NodeNumber>10020</NodeNumber><Position>109 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><ComponentRefNo>=F</ComponentRefNo><Weight>15</Weight></Node>' +
  '</Branch></Pipe></PipeStressExport>';
const cii = '#$ VERSION\nTEST\n#$ RIGID\n0 0\n150 0\n#$ EXPJT\n';
const ledger={
  schema:'xml-cii-rigid-python-emission-ledger/v1',
  authority:'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII',
  ciiSha256:createHash('sha256').update(cii).digest('hex'),
  weightScale:10,
  summary:{rigidAuxCount:2,positiveCount:1,zeroCount:1},
  rows:[
    {rigidAuxIndex:1,branchName:'MODEL-1',branchOccurrence:0,fromNodeOccurrence:0,toNodeOccurrence:1,
      fromNode:930,toNode:939,fromComponentType:'PIPE',toComponentType:'RIGID',
      fromPosition:[0,0,0],toPosition:[89.9,0,0],toEndpoint:1,componentRefNo:'=F',
      massKg:0,expectedCiiMass:0,emittedCiiMass:0,weightState:'ZERO'},
    {rigidAuxIndex:2,branchName:'MODEL-1',branchOccurrence:0,fromNodeOccurrence:1,toNodeOccurrence:2,
      fromNode:939,toNode:10020,fromComponentType:'RIGID',toComponentType:'RIGID',
      fromPosition:[89.9,0,0],toPosition:[109,0,0],toEndpoint:2,componentRefNo:'=F',
      massKg:15,expectedCiiMass:150,emittedCiiMass:150,weightState:'POSITIVE'},
  ],
};
const good={outputs:[
  {name:'model.cii',text:cii},
  {name:'model.rigid_ledger.json',text:JSON.stringify(ledger)},
]};
const verify=(response=good,input=xml,options={kgToNewton:true})=>
  reconcileModelConvertersPythonRigidResponse(input,response,options);
const result=await verify();
assert.equal(result.verification.ok,true);
assert.equal(result.verification.sourceOwnersReconciled,1);
assert.equal(result.verification.totalEdges,2);
await assert.rejects(verify({outputs:[{name:'model.cii',text:cii}]}),/ledger are required/);
await assert.rejects(verify({outputs:[{name:'model.rigid_ledger.json',text:JSON.stringify(ledger)}]}),/CII and Python/);
await assert.rejects(verify({outputs:[...good.outputs,{name:'other.cii',text:cii}]}),/exactly one/);
await assert.rejects(verify({outputs:[good.outputs[0],{name:good.outputs[1].name,text:'not JSON'}]}),/not valid JSON/);
await assert.rejects(verify({outputs:[{name:'model.cii',text:cii.replace('150 0','300 0')},good.outputs[1]]}),/SHA-256/);
await assert.rejects(verify(good,xml.replace('<Weight>15</Weight>','<Weight>150</Weight>')),/source owner/);
await assert.rejects(verify(good,xml,{kgToNewton:false}),/unit scale/);
console.log('MODEL_CONVERTERS_RIGID_WORKER_CII_LEDGER_GATE_PASS');
