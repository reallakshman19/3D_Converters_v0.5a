import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { reconcileFinalPythonRigidWeights } from '../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';

const doc = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = doc.window.DOMParser;
const XML = `<PipeStressExport><Pipe><Branch><Branchname>B-939</Branchname>
<Node><NodeNumber>930</NodeNumber><Position>0 0 0</Position><ComponentType>PIPE</ComponentType><Weight>0</Weight></Node>
<Node><NodeNumber>939</NodeNumber><Position>89.9 0 0</Position><ComponentRefNo>=FL-1</ComponentRefNo><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>1</Endpoint><Weight>0</Weight></Node>
<Node><NodeNumber>10020</NodeNumber><Position>109 0 0</Position><ComponentRefNo>=FL-1</ComponentRefNo><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>15</Weight></Node>
</Branch></Pipe></PipeStressExport>`;
const CII = '#$ VERSION\nX\n#$ RIGID\n0 0\n150 0\n#$ EXPJT\n';
async function digest(value) {
 const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
 return [...new Uint8Array(raw)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const ledger = {
 schema:'xml-cii-rigid-python-emission-ledger/v1',
 authority:'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII',
 weightScale:10, ciiSha256:await digest(CII),
 summary:{rigidAuxCount:2,positiveCount:1,zeroCount:1,missingCount:0,invalidCount:0},
 rows:[
  {rigidAuxIndex:1,edgeIndex:1,branchName:'B-939',fromNode:930,toNode:939,toComponentType:'RIGID',
    componentRefNo:'=FL-1',toEndpoint:1,toPosition:[89.9,0,0],massKg:0,emittedCiiMass:0,weightState:'ZERO'},
  {rigidAuxIndex:2,edgeIndex:2,branchName:'B-939',fromNode:939,toNode:10020,toComponentType:'RIGID',
    componentRefNo:'=FL-1',toEndpoint:2,toPosition:[109,0,0],massKg:15,emittedCiiMass:150,weightState:'POSITIVE'}
 ],
};
const verify=(partial={})=>reconcileFinalPythonRigidWeights({
 reviewedXmlText:XML,ciiText:CII,rigidLedger:ledger,kgToNewton:true,...partial
});
const accepted=await verify();
assert.equal(accepted.ok,true);
assert.deepEqual([accepted.totalEdges, accepted.positiveEdges, accepted.zeroEdges, accepted.sourceOwnersReconciled],[2,1,1,1]);
await assert.rejects(verify({rigidLedger:null}),/emission ledger missing/);
await assert.rejects(verify({ciiText:CII.replace('150','160')}),/SHA-256/);
await assert.rejects(verify({kgToNewton:false}),/unit scale/);
await assert.rejects(verify({reviewedXmlText:XML.replace('<Weight>15</Weight>','<Weight>0</Weight>')}),/exact approved source owner/);
await assert.rejects(verify({reviewedXmlText:XML.replace('<Weight>15</Weight>','<Weight>20</Weight>')}),/exact approved source owner/);
await assert.rejects(verify({reviewedXmlText:XML.replace('<NodeNumber>10020</NodeNumber>','<NodeNumber>10021</NodeNumber>')}),/exact approved source owner/);
await assert.rejects(verify({reviewedXmlText:XML.replace('<Position>109 0 0</Position>','<Position>108 0 0</Position>')}),/exact approved source owner/);
await assert.rejects(verify({rigidLedger:{...ledger,rows:[ledger.rows[1],ledger.rows[0]]}}),/indices/);
await assert.rejects(verify({rigidLedger:{...ledger,rows:[ledger.rows[0],{...ledger.rows[1],rigidAuxIndex:2,massKg:150}]}}),/inconsistent mass/);
const duplicate=XML.replace('</Branch>',XML.match(/<Node><NodeNumber>10020<\/NodeNumber>[\s\S]*?<\/Node>/)?.[0]+'</Branch>');
await assert.rejects(verify({reviewedXmlText:duplicate}),/one exact approved source owner/);
const lost={...ledger,rows:[{...ledger.rows[0],massKg:0,emittedCiiMass:0,weightState:'ZERO'},
  {...ledger.rows[1],massKg:0,emittedCiiMass:0,weightState:'ZERO'}],summary:{...ledger.summary,positiveCount:0,zeroCount:2}};
const CII_ZERO=CII.replace('150','0');
await assert.rejects(verify({ciiText:CII_ZERO,rigidLedger:{...lost,ciiSha256:await digest(CII_ZERO)}}),/mass lost/);
console.log('POST_PYTHON_RIGID_CII_OWNERSHIP_RECONCILE_PASS');
