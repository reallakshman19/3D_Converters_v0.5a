import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { reconcileFinalPythonRigidWeights } from '../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';

globalThis.DOMParser = new JSDOM('<!doctype html>').window.DOMParser;
const base = process.argv[2] || '/tmp/glrd-preview/results';
const source = readFileSync(base + '/GLRD-enriched.xml','utf8');
const cii = readFileSync(base + '/GLRD-contracted.cii','utf8');
const ledger = JSON.parse(readFileSync(base + '/GLRD-contracted.rigid_ledger.json','utf8'));
assert.equal(ledger.schema,'xml-cii-rigid-python-emission-ledger/v1');
assert.equal(ledger.summary.rigidAuxCount,ledger.rows.length);
const result = await reconcileFinalPythonRigidWeights({
  reviewedXmlText:source,ciiText:cii,rigidLedger:ledger,kgToNewton:true,
});
assert.equal(result.ok,true);
console.log('MODEL_CONVERTERS_CONTRACTED_GLDR_RIGID_PASS', JSON.stringify(result));
