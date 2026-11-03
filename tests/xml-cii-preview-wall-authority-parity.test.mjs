import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

const require = createRequire(import.meta.url);
const { createStaticEsmFixture } = require('./xml-cii-standalone-esm-fixture-helper.js');
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const moduleDir = 'tabs/xml-cii-2019-standalone/ui-adapted';
const boreFile = moduleDir + '/xml-cii-adapted-preview-bore-wall-authority.js';
const wallFile = moduleDir + '/xml-cii-adapted-preview-wall-evidence.js';
const backupDir = '.backups/connector-20261103-preview-wall-index';
const previous = globalThis.DOMParser;

const legacy = createStaticEsmFixture(repoRoot, {
  prefix: 'xml-cii-wall-legacy-', entryFiles: [boreFile],
});
const indexed = createStaticEsmFixture(repoRoot, {
  prefix: 'xml-cii-wall-indexed-', entryFiles: [boreFile],
});
for (const [relative, backupName] of [
  [boreFile, 'tabs_xml-cii-2019-standalone_ui-adapted_xml-cii-adapted-preview-bore-wall-authority.js.bak'],
  [wallFile, 'tabs_xml-cii-2019-standalone_ui-adapted_xml-cii-adapted-preview-wall-evidence.js.bak'],
]) copyFileSync(join(repoRoot, backupDir, backupName), join(legacy.tempRoot, relative));
const before = await import(pathToFileURL(join(legacy.tempRoot, boreFile)).href);
const afterFix = await import(pathToFileURL(join(indexed.tempRoot, boreFile)).href);

after(() => {
  if (previous === undefined) delete globalThis.DOMParser;
  else globalThis.DOMParser = previous;
  for (const fixture of [legacy, indexed]) {
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

function el(name, content = '', children = []) {
  return {
    nodeType: 1, localName: name, nodeName: name, childNodes: children,
    get textContent() {
      return this.childNodes.length
        ? this.childNodes.map((child) => child.textContent).join('')
        : String(content);
    },
  };
}

function documentFor(branches) {
  const root = el('Plant', '', branches);
  return {
    getElementsByTagName(name) {
      const matched = [];
      function visit(node) {
        if (node.localName === name) matched.push(node);
        for (const child of node.childNodes) visit(child);
      }
      visit(root);
      return matched;
    },
  };
}

function sampleBranches(names) {
  return names.map((name, index) => {
    const nps = Number((name.match(/-(\d+(?:\.\d+)?)"/) || [])[1] || 2);
    const outsideDiameter = nps === 10 ? '273' : nps === 4 ? '114.3' : '60.3';
    const nodes = [0, 1].map((slot) => {
      const number = index === 0 && slot === 0 ? 10
        : (index === 1 && slot === 0 ? 460 : index * 20 + slot + 100);
      return el('Node', '', [
        el('NodeNumber', number),
        el('ComponentRefNo', '=P-' + index),
        el('Endpoint', slot + 1),
        el('OutsideDiameter', outsideDiameter),
        el('ComponentType', slot ? 'FLAN' : 'PIPE'),
        el('DTXR', slot ? 'FLANGE SCH 40' : 'PIPE SCH 80'),
      ]);
    });
    return el('Branch', '', [el('Branchname', name), ...nodes]);
  });
}

const syntheticNames = Array.from({ length: 30 }, (_, i) => {
  const nps = [2, 4, 10][i % 3];
  return '/GLRD-1000-' + nps + '"-P41100' + String(i).padStart(3, '0')
    + '-93833-01/B' + (i % 4 + 1);
});

const syntheticStage = JSON.stringify({
  children: syntheticNames.map((name, i) => ({
    type: 'BRANCH', name,
    children: [
      { type: 'OLET', attributes: { REF: '=O-' + i, DTXR: 'BRANCH OUTLET SCH 40S', ABORE: '50' } },
      { type: 'FLAN', attributes: { REF: '=F-' + i, DTXR_POS: 'WELDING NECK FLANGE Wth 40.0 API 6A', ABORE: '250' } },
      { type: 'PIPE', attributes: { REF: '=P-' + i, DTXR: 'PIPE NPS 10 SCH 80', ABORE: '250' } },
      { type: 'PIPE', attributes: { REF: '=P-' + i, DTXR: 'PIPE NPS 10 SCH 80', ABORE: '250' } },
    ],
  })),
});

function previewInput(names, stagedJsonText) {
  const branchRows = names.map((branchName) => ({
    branchName, sizeMm: 50, pipingClass: '93833', wallThickness: '',
    wallThicknessSource: 'none', rating: '900',
  }));
  const nodeRows = names.flatMap((branchName, i) => [
    { branchName, nodeNumber: i === 0 ? 10 : i * 20 + 100,
      componentRefNo: '=P-' + i, endpoint: 1, boreMm: 999, weightKg: 123.974 },
    { branchName, nodeNumber: i * 20 + 101,
      componentRefNo: '=P-' + i, endpoint: 2, boreMm: 999, weightKg: 0 },
  ]);
  return {
    xmlText: '<Plant/>',
    stagedJsonText,
    config: { pipingClass: { masterRows: [] }, overrides: {} },
    result: { branchRows, nodeRows },
  };
}

function evaluate(names, stagedJsonText) {
  const document = documentFor(sampleBranches(names));
  globalThis.DOMParser = class { parseFromString() { return document; } };
  const args = previewInput(names, stagedJsonText);
  const oldResult = before.applyPreviewBoreWallAuthority(args);
  const newResult = afterFix.applyPreviewBoreWallAuthority(args);
  assert.deepStrictEqual(newResult, oldResult,
    'all branch/node values, evidence selection, provenance, diagnostics and counts must match');
  assert.equal(newResult.branchRows.length, names.length);
  assert.equal(newResult.nodeRows.length, names.length * 2);
  return newResult;
}

test('actual original and indexed wall authorities yield equal 30-branch output', () => {
  const result = evaluate(syntheticNames, syntheticStage);
  assert.ok(result.branchRows.some((row) => row.dtxrWallEvidenceCount > 0));
  assert.ok(result.branchRows.some((row) => row.dtxrWallRejectedEvidenceCount > 0));
  assert.equal(result.nodeRows[0].nodeNumber, 10);
  assert.equal(result.nodeRows[2].nodeNumber, 460);
});

test('parse calls change from one per branch to once per invocation', () => {
  const document = documentFor(sampleBranches(syntheticNames));
  globalThis.DOMParser = class { parseFromString() { return document; } };
  const input = previewInput(syntheticNames, syntheticStage);
  const originalParse = JSON.parse;
  function countParses(run) {
    let count = 0;
    JSON.parse = (value, ...args) => {
      if (value === syntheticStage) count += 1;
      return originalParse(value, ...args);
    };
    try { run(input); } finally { JSON.parse = originalParse; }
    return count;
  }
  assert.equal(countParses(before.applyPreviewBoreWallAuthority), syntheticNames.length);
  assert.equal(countParses(afterFix.applyPreviewBoreWallAuthority), 1);
});

test('malformed, empty and null evidence preserve complete row parity', () => {
  for (const stage of ['{broken', '', null, '{}']) evaluate(syntheticNames, stage);
});

test('optional GLRD JSON preserves complete wall-authority row parity', {
  skip: !process.env.GLRD_STAGE_FILE || !process.env.GLRD_BRANCH_NAMES_FILE,
}, () => {
  const stage = readFileSync(process.env.GLRD_STAGE_FILE, 'utf8');
  const names = JSON.parse(readFileSync(process.env.GLRD_BRANCH_NAMES_FILE, 'utf8'));
  assert.equal(names.length, 30);
  const result = evaluate(names, stage);
  assert.equal(result.branchRows.length, 30);
});
