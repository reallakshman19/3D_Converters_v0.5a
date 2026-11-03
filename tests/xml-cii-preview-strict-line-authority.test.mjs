import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const tempRoot = await mkdtemp(join(tmpdir(), 'xml-cii-strict-line-authority-'));
const sourcePath = 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';

async function copy(relativePath) {
  const target = join(tempRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(fileURLToPath(new URL(relativePath, root)), target);
}

await writeFile(join(tempRoot, 'package.json'), '{"type":"module"}', 'utf8');
await copy(sourcePath);
const moduleDir = join(tempRoot, 'tabs/xml-cii-2019-standalone/ui-adapted');
await mkdir(moduleDir, { recursive: true });
// The strict-line fixture stubs adjacent modules, including the per-build cache.
await writeFile(join(moduleDir, 'xml-cii-adapted-preview-per-build-cache.js'),
  'export function createPreviewPerBuildCache() { return {}; }\n', 'utf8');
await writeFile(join(moduleDir, 'xml-cii-adapted-preview-dryrun-core.js'), `
export function xmlCiiDryRunPreview() { return { branchRows: [], nodeRows: [] }; }
`, 'utf8');
for (const file of [
  'xml-cii-adapted-preview-bore-wall-authority.js',
  'xml-cii-adapted-preview-material-authority.js',
  'xml-cii-adapted-preview-rating-authority.js',
]) {
  const exportName = file.includes('bore-wall')
    ? 'applyPreviewBoreWallAuthority'
    : (file.includes('material') ? 'applyPreviewMaterialCodeAuthority' : 'applyPreviewRatingAuthority');
  await writeFile(join(moduleDir, file), `export function ${exportName}({ result }) { return result; }\n`, 'utf8');
}

const strict = await import(pathToFileURL(join(tempRoot, sourcePath)).href);
after(() => rm(tempRoot, { recursive: true, force: true }));

test('automatic similar-linekey and similar-lineseq methods are rejected', () => {
  assert.equal(strict.isAutomaticLineNumberMatchMethod('similar-linekey'), true);
  assert.equal(strict.isAutomaticLineNumberMatchMethod('similar-lineseq'), true);
  assert.equal(strict.isAutomaticLineNumberMatchMethod('exact'), false);
  assert.equal(strict.isAutomaticLineNumberMatchMethod('override'), false);
});

test('fuzzy Preview row is rebuilt without Line List master authority', () => {
  const calls = [];
  const buildCorePreview = (xmlText, config) => {
    calls.push({ xmlText, rows: config?.linelist?.masterRows || [] });
    if (calls.length === 1) {
      return {
        branchRows: [
          {
            branchName: '/ASIM-1841-3"-S8810793-91261M7-01/B2',
            lineKey: 'S8810793',
            lineKeyMethod: 'exact',
            lineKeyConfidence: 1,
            lineMiss: false,
            p1: '11600',
          },
          {
            branchName: '/ASIM-1840-3"-S8810XXX-91261M7-09/B1',
            lineKey: 'S8810XXX',
            lineKeyMethod: 'similar-linekey',
            lineKeyConfidence: 0.85,
            lineKeyProposed: 'A8810145',
            lineMiss: false,
            lineFrom: 'PL-2"-G8810027',
            lineTo: '88-UZV-10953',
            p1: '1100',
          },
        ],
        nodeRows: [
          { branchName: '/ASIM-1841-3"-S8810793-91261M7-01/B2', key: 'exact-node' },
          { branchName: '/ASIM-1840-3"-S8810XXX-91261M7-09/B1', key: 'fuzzy-node', rating: '900' },
        ],
      };
    }
    assert.deepEqual(config.linelist.masterRows, []);
    return {
      branchRows: [{
        branchName: '/ASIM-1840-3"-S8810XXX-91261M7-09/B1',
        lineKey: 'S8810XXX',
        lineKeyMethod: 'none',
        lineKeyConfidence: 0,
        lineKeyProposed: '',
        lineMiss: true,
        lineFrom: '',
        lineTo: '',
        p1: '',
      }],
      nodeRows: [{ branchName: '/ASIM-1840-3"-S8810XXX-91261M7-09/B1', key: 'strict-node' }],
    };
  };

  const result = strict.buildStrictLineAuthorityCorePreview('<Plant/>', {
    linelist: { masterRows: [{ lineKey: 'A8810145' }] },
  }, '', {
    buildCorePreview,
    branchFragments: () => [
      { xmlText: '<Root><Branch id="exact"/></Root>' },
      { xmlText: '<Root><Branch id="fuzzy"/></Root>' },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.branchRows[0].lineKeyMethod, 'exact');
  assert.equal(result.branchRows[0].p1, '11600');
  assert.equal(result.branchRows[1].lineKey, 'S8810XXX');
  assert.equal(result.branchRows[1].lineKeyMethod, 'none');
  assert.equal(result.branchRows[1].lineMiss, true);
  assert.equal(result.branchRows[1].lineKeyProposed, '');
  assert.equal(result.branchRows[1].p1, '');
  assert.equal(result.branchRows[1].automaticLineMatchRemoved, true);
  assert.equal(result.strictLineAuthority.automaticMatchesRemoved, 1);
  assert.deepEqual(result.nodeRows.map((row) => row.key).sort(), ['exact-node', 'strict-node']);
});

test('explicit branch mapping that resolves exactly is preserved', () => {
  let calls = 0;
  const result = strict.buildStrictLineAuthorityCorePreview('<Plant/>', {
    linelist: {
      branchLineKeyMap: {
        '/ASIM-1840-3"-S8810XXX-91261M7-08/B1': 'S8810791',
      },
      masterRows: [{ lineKey: 'S8810791' }],
    },
  }, '', {
    buildCorePreview: () => {
      calls += 1;
      return {
        branchRows: [{
          branchName: '/ASIM-1840-3"-S8810XXX-91261M7-08/B1',
          lineKey: 'S8810791',
          lineKeyMethod: 'exact',
          lineKeyConfidence: 1,
          lineMiss: false,
          p1: '11600',
        }],
        nodeRows: [],
      };
    },
    branchFragments: () => [],
  });
  assert.equal(calls, 1);
  assert.equal(result.branchRows[0].lineKey, 'S8810791');
  assert.equal(result.branchRows[0].lineKeyMethod, 'exact');
  assert.equal(result.branchRows[0].p1, '11600');
});

test('deployment invalidates the previous fuzzy Preview cache once', async () => {
  const source = await readFile(fileURLToPath(new URL(`../${sourcePath}`, import.meta.url)), 'utf8');
  assert.match(source, /strict-explicit-or-exact-v1/);
  assert.match(source, /xml-cii-pv-cache-v8-rating-policy/);
  assert.match(source, /automaticMatchesRemoved/);
  assert.doesNotMatch(source, /lineKeyProposed:\s*similar\.proposedKey/);
});
