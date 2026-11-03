import assert from 'node:assert/strict';
import { buildOutputArtifactRows, buildRunManifest } from '../tabs/xml-cii-2019-standalone/xml-cii-output-run-readiness.js';
import { normalizeWorkflowJob, normalizeWorkflowResult } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js';

const ledger={schema:'xml-cii-rigid-python-emission-ledger/v1',authority:'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII',
  summary:{rigidAuxCount:2,positiveCount:1,zeroCount:1},rows:[
    {rigidAuxIndex:1,fromNode:930,toNode:939,weightState:'ZERO',massKg:0,emittedCiiMass:0},
    {rigidAuxIndex:2,fromNode:939,toNode:10020,weightState:'POSITIVE',massKg:15,emittedCiiMass:150},
  ]};
const result = normalizeWorkflowResult({
  ok:true,sourceKind:'xml',ciiText:'#$ RIGID\n0 0\n150 0\n',ciiName:'source.cii',
  rigidLedger:ledger,rigidLedgerText:JSON.stringify(ledger),rigidLedgerName:'source.rigid_ledger.json',
});
assert.deepEqual(result.rigidLedger,ledger);
assert.equal(result.rigidLedgerText,JSON.stringify(ledger));
const input={sourceText:'<PipeStressExport/>',options:{outputMode:'both'},result};
const manifest=buildRunManifest(input);
assert.equal(manifest.artifacts.rigidLedger,true);
const rows=buildOutputArtifactRows(input,manifest);
const item=rows.find(row=>row.kind==='rigid-ledger');
assert.ok(item);
assert.equal(item.available,true);
assert.equal(item.filename,'source.rigid_ledger.json');
assert.equal(item.downloadAction,'download-rigid-ledger');
assert.equal(item.bytes,new TextEncoder().encode(result.rigidLedgerText).length);

const noLedger=buildOutputArtifactRows({sourceText:'<PipeStressExport/>',result:{ciiText:'data',ciiName:'foo.cii'}});
assert.equal(noLedger.find(row=>row.kind==='rigid-ledger').available,false);

const normalized=normalizeWorkflowJob({sourceKind:'xml',sourceName:'source.xml',sourceId:'mode-a-source-4',
  sourceText:'<PipeStressExport/>', branchSelection:{selectedBranchOccurrenceIds:['0']},options:{}});
assert.equal(normalized.ok,true);
assert.equal(normalized.job.sourceId,'mode-a-source-4');
assert.deepEqual(normalized.job.branchSelection,{selectedBranchOccurrenceIds:['0']});
console.log('RIGID_STANDALONE_LEDGER_DOWNLOAD_ARTIFACT_PASS');
