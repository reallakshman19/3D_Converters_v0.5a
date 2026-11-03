import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { run } from '../tabs/model-converters/converters/xmltocii2019_runner.js';

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
  workerRunner: { runJob: async () => { workerCalls++; return { outputs: [{ name: 'ok.cii', text: '' }] }; } },
});
await assert.rejects(run(job(source(15,15))), /Direct Python export blocked: unresolved RIGID split mass ownership/);
assert.equal(workerCalls, 0, 'duplicate physical mass must never reach Python worker');
await run(job(source(0,15)));
assert.equal(workerCalls, 1, 'a single positive owner candidate must remain compatible while strict ownership review is being implemented');
const invalid = source('oops',15);
await assert.rejects(run(job(invalid)), /Direct Python export blocked: unresolved RIGID split mass ownership/);
assert.equal(workerCalls,1);
console.log('RIGID_DIRECT_WORKER_GATE_PASS');
