import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { xmlCiiDryRunPreview } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, value, index, all) => {
  if (value.startsWith('--')) out.push([value.slice(2), all[index + 1]]);
  return out;
}, []));
const directory = resolve(args.out || '/tmp/glrd-weight-perf');
mkdirSync(directory, { recursive: true });
const xmlText = readFileSync(args.source, 'utf8');
const stagedJsonText = readFileSync(args.staged, 'utf8');
const masterRows = JSON.parse(readFileSync(args.master, 'utf8'));
const config = JSON.parse(readFileSync(args.config, 'utf8'));
config.weight = { ...(config.weight || {}), masterRows };
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const times = [];
let result;
for (let pass = 0; pass < 2; pass++) {
  const start = performance.now();
  result = xmlCiiDryRunPreview(xmlText, config, stagedJsonText);
  times.push(Math.round((performance.now() - start) * 100) / 100);
}
const branchRows = result.branchRows.map(row => ({
  branchName: row.branchName, lineKey: row.lineKey, rating: row.rating,
  pipingClass: row.pipingClass, boreMm: row.boreMm, sizeMm: row.sizeMm
}));
const nodeRows = result.nodeRows.map(row => ({
  key: row.key, branchName: row.branchName, nodeNumber: row.nodeNumber,
  componentType: row.componentType, componentRefNo: row.componentRefNo,
  endpoint: row.endpoint, boreMm: row.boreMm, rating: row.rating,
  lengthMm: row.lengthMm, weight: row.weightMatch?.selectedWeight ?? row.weightMatch?.weight ?? null,
  candidateType: row.weightMatch?.typeDesc ?? null,
  candidateCount: row.weightCandidates?.length || 0,
  rejectedCount: row.rejectedWeightCandidates?.length || 0,
}));
const snapshot = { branchRows, nodeRows };
const serialized = JSON.stringify(snapshot, null, 2) + '\n';
const sha256 = createHash('sha256').update(serialized).digest('hex');
writeFileSync(resolve(directory, 'weight-preview.json'), serialized);
const summary = {
  label: args.label || 'baseline',
  sourceBytes: Buffer.byteLength(xmlText),
  stageBytes: Buffer.byteLength(stagedJsonText),
  masterRows: masterRows.length,
  branchCount: branchRows.length,
  weightReviewNodeCount: nodeRows.length,
  elapsedMs: times,
  weightPreviewSha256: sha256,
};
writeFileSync(resolve(directory, 'weight-preview-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log('WEIGHT_PREVIEW_PROFILE', JSON.stringify(summary));
if (branchRows.length < 1) throw new Error('Real GLRD preview contained no branches');
