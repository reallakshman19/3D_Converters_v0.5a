import assert from 'node:assert/strict';
import test from 'node:test';
import { xmlCiiDryRunPreview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';
import { xmlCiiDryRunPreview as corePreview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js';

test('J2: real popup orchestration parses source XML and builds staged DTXR index once, shares identity across authority layers', () => {
  const original = { id: 'unmodified XML' };
  const stagedIndex = { id: '1.8MB staged index' };
  const config = { weight: {} };
  let parses = 0, indexes = 0, coreCalls = 0, wallCalls = 0, ratingCalls = 0;
  const result = xmlCiiDryRunPreview('<Root/>', config, '{"items":[]}', {
    parseDocument: () => { parses++; return original; },
    buildStagedIndex: () => { indexes++; return stagedIndex; },
    buildStrict: (xml, cfg, staged, runtime) => {
      assert.equal(xml, '<Root/>');
      return runtime.buildCorePreview(xml, cfg, staged);
    },
    buildCore: (xml, cfg, staged, resources) => {
      coreCalls++;
      assert.strictEqual(resources.sourceDocument, original);
      assert.strictEqual(resources.stagedIndex, stagedIndex);
      return { branchRows: [{ branchName: 'BR1', rating: '150' }], nodeRows: [] };
    },
    applyWall: ({ sourceDocument, result: rows }) => {
      wallCalls++;
      assert.strictEqual(sourceDocument, original);
      return { ...rows, branchRows: rows.branchRows.map(r => ({ ...r, wallThickness: '6.35' })) };
    },
    applyMaterial: ({ result: rows }) => rows,
    applyRating: ({ sourceDocument, stagedIndex: received, result: rows }) => {
      ratingCalls++;
      assert.strictEqual(sourceDocument, original);
      assert.strictEqual(received, stagedIndex);
      return rows;
    },
  });
  assert.deepEqual([parses, indexes, coreCalls, wallCalls, ratingCalls], [1, 1, 1, 1, 1]);
  assert.equal(result.branchRows[0].wallThickness, '6.35');
  assert.equal(result.branchRows[0].rating, '150');
  // Mutants: reparse XML in either authority or rebuild staged index make identity/call counts RED.
});

test('J2: shared unmodified XML is cloned for core cleanup, preventing short-node mutation from leaking into Rating', () => {
  const previous = globalThis.DOMParser;
  let clones = 0, parses = 0;
  const fakeDocument = {
    cloneNode(deep) { assert.equal(deep, true); clones++; return {
      getElementsByTagName: () => [],
    }; },
    getElementsByTagName: () => [],
  };
  try {
    globalThis.DOMParser = class {
      parseFromString() { parses++; throw Error('must use shared source XML clone'); }
    };
    const out = corePreview('ignored', {}, '{}', { sourceDocument: fakeDocument, stagedIndex: { items: [] } });
    assert.deepEqual(out, { branchRows: [], nodeRows: [] });
    assert.equal(clones, 1, 'core must remove nodes from a copy, not sourceDocument');
    assert.equal(parses, 0, 'core must not parse again when original XML is shared');
  } finally {
    if (previous === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = previous;
  }
});


test('J2: strict-line fallback fragments reuse original parsed DOM without a new XML parse', () => {
  const previousParser = globalThis.DOMParser;
  const previousSerializer = globalThis.XMLSerializer;
  let parserCalls = 0;
  const branch = { childNodes: [
    { nodeType: 1, localName: 'Branchname', textContent: 'BR-1' },
  ] };
  const document = {
    getElementsByTagName(name) {
      return name === 'Branch' ? [branch] : [];
    },
  };
  try {
    globalThis.DOMParser = class {
      parseFromString() { parserCalls++; throw Error('unexpected duplicate XML parse'); }
    };
    globalThis.XMLSerializer = class {
      serializeToString() { return '<Branch><Branchname>BR-1</Branchname></Branch>'; }
    };
    const out = xmlCiiDryRunPreview('<Root><Branch/></Root>', {}, '{}', {
      parseDocument: () => document,
      buildStagedIndex: () => ({ items: [] }),
      buildStrict: (xml, cfg, stage, runtime) => {
        const fragments = runtime.branchFragments(xml);
        assert.equal(fragments.length, 1);
        assert.equal(fragments[0].branchName, 'BR-1');
        return { branchRows: [{ branchName: 'BR-1' }], nodeRows: [] };
      },
      applyWall: ({ result }) => result,
      applyMaterial: ({ result }) => result,
      applyRating: ({ result }) => result,
    });
    assert.equal(out.branchRows.length, 1);
    assert.equal(parserCalls, 0, 'fragment fallback must not parse original XML again');
    // Mutant: removing sourceDocument from browserBranchFragments -> parser call.
  } finally {
    if (previousParser === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = previousParser;
    if (previousSerializer === undefined) delete globalThis.XMLSerializer;
    else globalThis.XMLSerializer = previousSerializer;
  }
});
