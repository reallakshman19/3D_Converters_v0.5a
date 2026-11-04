import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { reconcileFinalPythonRigidWeights } from '../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';

globalThis.DOMParser = new JSDOM('<!doctype html>').window.DOMParser;
const base = process.argv[2] || '/tmp/glrd-preview/results';
const sourceName = process.argv[3] || 'GLRD-enriched.xml';
const outputPrefix = process.argv[4] || 'GLRD-contracted';
const source = readFileSync(base + '/' + sourceName,'utf8');
const cii = readFileSync(base + '/' + outputPrefix + '.cii','utf8');
const ledger = JSON.parse(readFileSync(base + '/' + outputPrefix + '.rigid_ledger.json','utf8'));
assert.equal(ledger.schema,'xml-cii-rigid-python-emission-ledger/v1');
assert.equal(ledger.summary.rigidAuxCount,ledger.rows.length);
const result = await reconcileFinalPythonRigidWeights({
  reviewedXmlText:source,ciiText:cii,rigidLedger:ledger,kgToNewton:true,
});
assert.equal(result.ok,true);
console.log('MODEL_CONVERTERS_CONTRACTED_RIGID_PASS', JSON.stringify({ sourceName, outputPrefix, ...result }));
