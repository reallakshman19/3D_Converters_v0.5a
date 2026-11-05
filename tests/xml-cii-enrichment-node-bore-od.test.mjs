import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  resolveXmlCiiDnFromOutsideDiameter,
  resolveXmlCiiNodeBoreFromOutsideDiameter,
} from '../converters/xml-cii2019-core/od-bore-resolver.js';

// Synthetic node samples from the four OD/incorrect-bore combinations
// observed in BM2. They are NOT claims about BM2 NodeNumber identifiers.
const nodes = Object.freeze([
  { node: 'SYN-N6', outsideDiameter: 168.3, incorrectBranchBore: 200, expectedDn: 150 },
  { node: 'SYN-N4', outsideDiameter: 114.3, incorrectBranchBore: 400, expectedDn: 100 },
  { node: 'SYN-N8', outsideDiameter: 219.1, incorrectBranchBore: 400, expectedDn: 200 },
  { node: 'SYN-N3', outsideDiameter: 88.9, incorrectBranchBore: 50, expectedDn: 80 },
]);

test('D3: node OD determines nominal bore before branch Size mapping', () => {
  for (const { node, outsideDiameter, incorrectBranchBore, expectedDn } of nodes) {
    assert.equal(resolveXmlCiiDnFromOutsideDiameter(String(outsideDiameter)),
      expectedDn, node + ' table mapping');
    assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter(
      String(outsideDiameter), incorrectBranchBore), expectedDn, node + ' node mapping');
  }
});

test('D3: no recognized node OD preserves the existing branch fallback', () => {
  assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter('', 200), 200);
  assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter('not an OD', 400), 400);
  assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter('168.3', 400), 150);
  assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter(null, null), null);
});

test('D3: production enrichment writes node-specific OD mapping, not one bore for the branch', async () => {
  const path = fileURLToPath(new URL('../tabs/model-converters/converters/xmltocii2019_helper/enrichment-core.js', import.meta.url));
  const source = await readFile(path, 'utf8');
  assert.match(source, /resolveXmlCiiNodeBoreFromOutsideDiameter\(\s*xmlText\(node, 'OutsideDiameter'\), branchBore\)/);
  assert.match(source, /xmlSetText\(document, node, 'BoreMm', nodeBore\.toFixed\(3\)\)/);
  assert.doesNotMatch(source, /xmlSetText\(document, node, 'BoreMm', branchBore\.toFixed\(3\)\)/);
});
