import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { applyXmlCiiSplitRigidWeightPropagation } from '../converters/xml-cii2019-core/split-rigid-weight-propagation.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const parser = new DOMParser();

function localName(node) { return String(node?.localName || node?.nodeName || '').replace(/^.*:/, ''); }
function child(parent, name) { return [...(parent?.childNodes || [])].find(node => node.nodeType === 1 && localName(node) === name); }
function value(parent, name) { return String(child(parent, name)?.textContent || '').trim(); }
function nodesForRef(xml, branchName, ref) {
  const doc = parser.parseFromString(xml, 'application/xml');
  const branch = [...doc.getElementsByTagName('Branch')].find(b => value(b, 'Branchname') === branchName);
  assert.ok(branch, 'expected GLRD branch in XML');
  return [...branch.getElementsByTagName('Node')].filter(n => value(n, 'ComponentRefNo') === ref);
}
function hash(xml) { return createHash('sha256').update(xml).digest('hex'); }
function injectOwnerMass(xml, ownerNodeNumber, massKg) {
  const document = parser.parseFromString(xml, 'application/xml');
  const owner = [...document.getElementsByTagName('Node')].find(n => value(n, 'NodeNumber') === String(ownerNodeNumber));
  assert.ok(owner, 'GLRD owner node missing');
  assert.equal(Number(value(owner, 'Weight')), 0, 'baseline source owner must start at zero');
  child(owner, 'Weight').textContent = String(massKg);
  return { xml: new XMLSerializer().serializeToString(document),
    ref: value(owner, 'ComponentRefNo'),
    branchName: value(owner.parentNode, 'Branchname'),
    ownerNodeNumber: String(ownerNodeNumber) };
}
function weights(xml, branchName, ref) {
  return nodesForRef(xml, branchName, ref).map(n => ({
    nodeNumber: value(n, 'NodeNumber'),
    componentType: value(n, 'ComponentType'),
    endpoint: value(n, 'Endpoint'),
    weightKg: Number(value(n, 'Weight') || 0),
  }));
}
const sample = `<Root><Branch><Branchname>B-X</Branchname>
  <Node><NodeNumber>1</NodeNumber><ComponentRefNo>=F</ComponentRefNo><ComponentType>FLAN</ComponentType><Endpoint>1</Endpoint><Weight>0</Weight></Node>
  <Node><NodeNumber>2</NodeNumber><ComponentRefNo>=F</ComponentRefNo><ComponentType>RIGID</ComponentType><Endpoint>2</Endpoint><Weight>15</Weight></Node>
  </Branch></Root>`;
const intact = applyXmlCiiSplitRigidWeightPropagation(sample);
assert.equal(intact.xmlText, sample, 'split custody must be byte-preserving');
assert.equal(intact.appliedCount, 0);
assert.equal(intact.ownershipIssues.length, 0);
assert.equal(intact.stats.splitRigidWeightOwnerCandidatesPreserved, 1);
assert.deepEqual(weights(intact.xmlText, 'B-X', '=F').map(r => r.weightKg), [0, 15]);

for (const pair of [[15, 15], [15, -3]]) {
  const malformed = sample.replace('<Weight>0</Weight>', `<Weight>${pair[0]}</Weight>`).replace('<Weight>15</Weight>', `<Weight>${pair[1]}</Weight>`);
  const result = applyXmlCiiSplitRigidWeightPropagation(malformed);
  assert.equal(result.xmlText, malformed, 'conflicts must not mutate source data');
  assert.equal(result.ownershipIssues.length, 1, 'conflicting ownership must fail the split audit');
  assert.equal(result.ownershipIssues[0].allocationType, 'UNKNOWN');
}
const missing = sample.replace('<Weight>0</Weight>', '');
assert.equal(applyXmlCiiSplitRigidWeightPropagation(missing).xmlText, missing, 'missing weights must not silently receive copied mass');
const zero = sample.replace('<Weight>15</Weight>', '<Weight>0</Weight>');
assert.equal(applyXmlCiiSplitRigidWeightPropagation(zero).xmlText, zero, 'two zero siblings remain zero');

const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, index, arr) => {
  if (arg.startsWith('--')) out.push([arg.slice(2), arr[index + 1]]);
  return out;
}, []));
if (args.enriched) {
  const directory = resolve(args.out || '/tmp/glrd-split-mass');
  mkdirSync(directory, { recursive: true });
  const baselineXml = readFileSync(args.enriched, 'utf8');
  const unmodified = applyXmlCiiSplitRigidWeightPropagation(baselineXml);
  assert.equal(unmodified.xmlText, baselineXml, 'real pre-fix GLRD enriched XML must be unchanged without approvals');
  assert.equal(unmodified.ownershipIssues.length, 0, 'original unweighted GLRD must not trigger false duplicate-owner blocks');
  const recorded = injectOwnerMass(baselineXml, 460, 15);
  const revised = applyXmlCiiSplitRigidWeightPropagation(recorded.xml);
  assert.equal(revised.xmlText, recorded.xml, 'approved mass must never copy onto a zero nonowner');
  assert.equal(revised.ownershipIssues.length, 0, 'legitimate single-owner mass is not duplicate ownership');
  const beforeWeights = weights(recorded.xml, recorded.branchName, recorded.ref);
  const afterWeights = weights(revised.xmlText, recorded.branchName, recorded.ref);
  assert.equal(afterWeights.filter(n => n.weightKg > 0).length, 1);
  assert.equal(afterWeights.reduce((total, n) => total + n.weightKg, 0), 15);
  assert.equal(afterWeights.find(n => n.nodeNumber === '460').weightKg, 15);
  let legacy = null;
  if (args['old-module']) {
    const old = await import(pathToFileURL(resolve(args['old-module'])).href);
    legacy = old.applyXmlCiiSplitRigidWeightPropagation(recorded.xml);
    assert.ok(legacy.appliedCount > 0, 'legacy implementation must reproduce the weight duplication');
    assert.ok(weights(legacy.xmlText, recorded.branchName, recorded.ref).reduce((s, n) => s + n.weightKg, 0) > 15,
      'legacy split must duplicate physical mass before the fix');
  }
  const report = {
    source: 'real GLRD enriched XML with controlled 15 kg assignment at source-derived node 460',
    warning: 'This is a split-weight regression setup, not proof that the original 19.1 mm defect reproduces.',
    owner: { branchName: recorded.branchName, componentRefNo: recorded.ref, nodeNumber: '460', massKg: 15 },
    baselineEnrichedSha256: hash(baselineXml),
    withOwnerBeforeSplitSha256: hash(recorded.xml),
    legacyPreFixSha256: legacy ? hash(legacy.xmlText) : null,
    correctedAfterSplitSha256: hash(revised.xmlText),
    legacyAppliedCount: legacy?.appliedCount ?? null,
    correctedAppliedCount: revised.appliedCount,
    beforeWeightRows: legacy ? weights(legacy.xmlText, recorded.branchName, recorded.ref) : beforeWeights,
    afterWeightRows: afterWeights,
    changedRows: legacy ? weights(legacy.xmlText, recorded.branchName, recorded.ref).filter((row,i)=>row.weightKg !== afterWeights[i]?.weightKg).map((row,i)=>({
      nodeNumber: row.nodeNumber, beforeWeightKg: row.weightKg, afterWeightKg: afterWeights.find(n=>n.nodeNumber===row.nodeNumber)?.weightKg ?? null,
    })) : [],
  };
  writeFileSync(resolve(directory, 'GLRD-weight-split-before-enriched.xml'), legacy?.xmlText || recorded.xml);
  writeFileSync(resolve(directory, 'GLRD-weight-split-after-enriched.xml'), revised.xmlText);
  writeFileSync(resolve(directory, 'GLRD-weight-split-before-after-diff.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('GLRD_SPLIT_MASS_REPRO', JSON.stringify(report));
}
console.log('RIGID_SPLIT_MASS_TEST_PASS');
