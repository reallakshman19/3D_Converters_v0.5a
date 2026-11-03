import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareXmlCiiParityAuthorityEntries,
  digestXmlCiiParityText,
} from '../tabs/xml-cii-2019-standalone/xml-cii-run-parity-evidence.js';
import { runXmlCii2019WorkflowService } from '../tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js';

function entry(overrides = {}) {
  return {
    scope: 'node',
    branchName: '/LINE-A/B1',
    nodeNumber: '20',
    path: ['WallThickness'],
    field: 'wallThickness',
    expected: '3.048',
    kind: 'number',
    source: 'standalone-preview',
    ...overrides,
  };
}

test('parity evidence passes numerically equivalent propagated values', () => {
  const expected = [entry(), entry({ path: ['Rating'], field: 'rating', expected: '150', kind: 'text' })];
  const actual = [
    { ...expected[0], actual: '3.0480', found: true },
    { ...expected[1], actual: '150', found: true },
  ];
  const report = compareXmlCiiParityAuthorityEntries(expected, actual, [], '<xml/>');
  assert.equal(report.ok, true);
  assert.equal(report.status, 'PASS');
  assert.equal(report.comparisons, 2);
  assert.equal(report.mismatchCount, 0);
  assert.equal(report.engineInputDigest, digestXmlCiiParityText('<xml/>'));
});

test('parity evidence blocks a stale class-dependent value', () => {
  const expected = [entry()];
  const actual = [{ ...expected[0], actual: '6.0198', found: true }];
  const report = compareXmlCiiParityAuthorityEntries(expected, actual, [], '<xml/>');
  assert.equal(report.ok, false);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.mismatchCount, 1);
  assert.equal(report.mismatches[0].expected, '3.048');
  assert.equal(report.mismatches[0].actual, '6.0198');
});

test('workflow fails closed and never calls the engine when parity is unverified', async () => {
  let engineCalls = 0;
  const result = await runXmlCii2019WorkflowService({
    sourceKind: 'xml',
    sourceName: 'input.xml',
    sourceText: '<Root/>',
    supportConfigJson: '{}',
    options: { outputMode: 'cii-only' },
  }, {
    runParityEnricher: async () => ({
      applied: false,
      xmlText: '<Root/>',
      evidence: { schema: 'xml-cii-standalone-run-parity-evidence/v1', ok: false, mismatchCount: 1 },
      stats: { parityMismatches: 1 },
      logs: ['parity blocked'],
      error: 'Injected parity mismatch.',
    }),
    engineRunner: async () => {
      engineCalls += 1;
      throw new Error('engine must not be called');
    },
  });

  assert.equal(engineCalls, 0);
  assert.equal(result.ok, false);
  assert.match(result.error, /Injected parity mismatch/);
  assert.equal(result.diagnostics.converterInputReleased, false);
  assert.equal(result.ciiText, null);
});

test('workflow sends the verified browser-enriched XML to the engine unchanged', async (t) => {
  const priorDOMParser = globalThis.DOMParser;
  if (typeof globalThis.DOMParser === 'undefined') {
    try {
      const { JSDOM } = await import('jsdom');
      globalThis.DOMParser = new JSDOM('<!doctype html><html></html>').window.DOMParser;
    } catch {
      t.skip('XML parser not available outside browser/CI DOM environment');
      return;
    }
  }
  t.after(() => {
    if (priorDOMParser === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = priorDOMParser;
  });
  const verifiedXml = '<Root><Branch><Branchname>/LINE-A/B1</Branchname></Branch></Root>';
  const digest = digestXmlCiiParityText(verifiedXml);
  let engineCalls = 0;
  const result = await runXmlCii2019WorkflowService({
    sourceKind: 'xml',
    sourceName: 'input.xml',
    sourceText: '<Root/>',
    supportConfigJson: '{}',
    options: { outputMode: 'cii-only' },
  }, {
    runParityEnricher: async () => ({
      applied: true,
      xmlText: verifiedXml,
      evidence: {
        schema: 'xml-cii-standalone-run-parity-evidence/v1',
        status: 'PASS',
        ok: true,
        comparisons: 2,
        mismatchCount: 0,
        mismatches: [],
        engineInputDigest: digest,
      },
      stats: { parityComparisons: 2, parityMismatches: 0 },
      logs: ['parity pass'],
      error: null,
    }),
    engineRunner: async (job) => {
      engineCalls += 1;
      assert.equal(job.sourceText, verifiedXml);
      return {
        ok: true,
        sourceKind: 'xml',
        outputKind: 'enrichedXML',
        enrichedText: '',
        enrichedName: '',
        ciiText: 'CII FROM VERIFIED XML',
        ciiName: 'input.cii',
        diagnostics: { warnings: [] },
        logs: ['engine pass'],
        error: null,
      };
    },
  });

  assert.equal(engineCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.ciiText, 'CII FROM VERIFIED XML');
  assert.equal(result.diagnostics.converterInputReleased, true);
  assert.equal(result.diagnostics.converterInputDigest, digest);
  assert.equal(result.diagnostics.runParityEvidence.ok, true);
});
