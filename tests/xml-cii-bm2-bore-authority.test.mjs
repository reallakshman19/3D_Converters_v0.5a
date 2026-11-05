import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveXmlCiiDnFromOutsideDiameter, resolveXmlCiiNodeBoreFromOutsideDiameter }
  from '../converters/xml-cii2019-core/od-bore-resolver.js';
import { resolveXmlCiiBoreMmFromNps } from '../converters/xml-cii2019-core/nps-bore-resolver.js';

const B6 = '/GLRD-1000-6"-P4110001-93833-01/B6';
const observations = [
  // Observed groups from the Oracle's real BM2, not invented NodeNumber IDs.
  { od: 168.3, before: 200, after: 150, count: 86 },
  { od: 114.3, before: 400, after: 100, count: 8 },
  { od: 219.1, before: 400, after: 200, count: 2 },
  { od: 88.9, before: 50, after: 80, count: 60 },
];

test('F1 BM2 B6: 6in branch means DN150, and 168.3mm OD defeats stale DN200', () => {
  assert.equal(resolveXmlCiiBoreMmFromNps(B6.split('/')[1].split('-')[2]), 150);
  assert.equal(resolveXmlCiiDnFromOutsideDiameter('168.3'), 150);
  assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter('168.3', 200), 150);
});

test('F1 real reported OD groups override stale branch size at final Run writer', () => {
  for (const observation of observations) {
    assert.equal(resolveXmlCiiNodeBoreFromOutsideDiameter(
      String(observation.od), observation.before), observation.after);
  }
});

test('F1 production Preview and Run both prefer physical node OD', async () => {
  const [preview, run, adapted] = await Promise.all([
    readFile(new URL('../tabs/model-converters/converters/xmltocii2019_helper/preview-renderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/model-converters/converters/xmltocii2019_helper/enrichment-run-parity.js', import.meta.url), 'utf8'),
    readFile(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js', import.meta.url), 'utf8'),
  ]);
  assert.match(preview, /const physicalBoreMm = _physicalBranchBoreMm\(branch\)/);
  assert.match(preview, /boreConflict, size:/);
  assert.match(run, /const nodeBore = resolveXmlCiiNodeBoreFromOutsideDiameter\(/);
  assert.doesNotMatch(run, /setText\(document, node, 'BoreMm', Number\(boreMm\)\.toFixed\(3\)\)/);
  assert.ok(adapted.indexOf('const od = Number(') < adapted.indexOf("const b = Number(_xmlText(n, 'BoreMm')"), 'OD loop before stored bore fallback');
});
