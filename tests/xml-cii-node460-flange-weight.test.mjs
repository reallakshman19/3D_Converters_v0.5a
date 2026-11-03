import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { xmlCiiPhysicalComponentSpanLengthMm } from '../converters/xml-cii2019-core/weight-match-model.js';
import { buildXmlCiiFlangeWeightFallback } from '../converters/xml-cii2019-core/flange-weight-fallback.js';

function mockNode(values) {
  return { childNodes: Object.entries(values).map(([localName, value]) => ({
    nodeType: 1, localName, textContent: String(value),
  })) };
}
const nodes = [
  mockNode({ ComponentType: 'PIPE', Endpoint: 2, ComponentRefNo: '=pipe', Position: '111042.13 107965.46 101701.77' }),
  mockNode({ ComponentType: 'FLAN', Endpoint: 1, ComponentRefNo: '=134234934/27950', Position: '111042.13 108464.75 101699.27' }),
  mockNode({ ComponentType: 'RIGID', Endpoint: 2, ComponentRefNo: '=134234934/27950', Position: '111042.13 108573.75 101698.73' }),
];
const span = xmlCiiPhysicalComponentSpanLengthMm(nodes, 2);
assert.ok(Math.abs(span - 109.0013376) < 0.01, 'Node 460 must use physical FLAN/RIGID span, not route gap');
assert.equal(xmlCiiPhysicalComponentSpanLengthMm(nodes, 0), null, 'ordinary pipe cannot receive flange span');
const wrongRef = [nodes[0], mockNode({ComponentType: 'FLAN', Endpoint: 1, ComponentRefNo: '=different', Position: '111042.13 108464.75 101699.27'}), nodes[2]];
assert.equal(xmlCiiPhysicalComponentSpanLengthMm(wrongRef, 2), null, 'cross-component pairing prohibited');
const masterRows = [
  { bore: 50, rating: 900, length: 109, weight: 15, type: 'Flg', typeDesc: 'Weldneck Flange' },
  { bore: 50, rating: 1500, length: 109, weight: 14, type: 'Flg', typeDesc: 'Weldneck Flange' },
];
const config = { weight: { masterRows } };
const base = { boreMm: 50, rating: 900 };
const candidate = buildXmlCiiFlangeWeightFallback({ ...base, lengthMm: span }, config);
assert.equal(candidate?.suggestedWeight, 15, 'correct 900# flange suggestion is approximately 15 kg');
assert.equal(buildXmlCiiFlangeWeightFallback({ ...base, lengthMm: 608.3 }, config), null,
  '608.3 mm route distance must not amplify a 109 mm flange weight');
assert.equal(buildXmlCiiFlangeWeightFallback({ ...base, rating: 1500, lengthMm: span }, config)?.suggestedWeight, 14,
  'correct 1500# flange suggestion is approximately 14 kg');
if (process.env.GLRD_WEIGHT_MASTER_PATH) {
  const rows = JSON.parse(readFileSync(process.env.GLRD_WEIGHT_MASTER_PATH, 'utf8'));
  const actual = { weight: { masterRows: rows } };
  for (const [rating, weight] of [[900, 15], [1500, 14]]) {
    const matched = buildXmlCiiFlangeWeightFallback({ ...base, rating, lengthMm: span }, actual);
    assert.equal(matched?.suggestedWeight, weight, `historical master flange weight for rating ${rating}`);
    assert.equal(buildXmlCiiFlangeWeightFallback({ ...base, rating, lengthMm: 608.3 }, actual), null,
      'real master must not extrapolate through an unrelated pipe span');
  }
}
console.log('Node 460 component span and flange fallback tests: PASS');
