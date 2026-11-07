#!/usr/bin/env node
/**
 * PERF-1.R14 H4: standalone, zero-dependency BM2 real-Chrome evidence runner.
 *
 * node scripts/xml-cii-bm2-headless.mjs --xml /path/BM2.xml \
 *   --staged /path/STF.json --config /path/GLRD-INPUTS\\derived\\bm2-workbench-config.json
 *
 * Optional: --chromium /path/chrome. --config accepts the Oracle path
 * GLRD-INPUTS\\derived\\bm2-workbench-config.json or any explicit file path.
 * Prints five independently measured action spans and SHA-256 of the
 * production downloaded enriched XML (not a synthetic Preview payload).
 * A missing file, failed action, or mismatched SHA exits non-zero.
 */
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const required = ['xml', 'staged', 'config'];
const missing = required.filter(key => !args.get('--' + key) && !process.env['BM2_' + key.toUpperCase()]);
if (missing.length) {
  console.error('Missing BM2 inputs: ' + missing.join(', ') +
    '. Pass --xml BM2.xml --staged STF.json --config bm2-workbench-config.json');
  process.exit(2);
}
const runnerArgs = [
  '--root', root,
  ...required.flatMap(key => ['--' + key,
    resolve(args.get('--' + key) || process.env['BM2_' + key.toUpperCase()])]),
  '--report-all', 'true',
  '--capture-output', 'true',
  '--max-first-visit-ms', args.get('--max-first-visit-ms') || '420000',
  '--max-build-ms', args.get('--max-build-ms') || '120000',
  '--max-rebuild-ms', args.get('--max-rebuild-ms') || '120000',
  '--max-fetch-ms', args.get('--max-fetch-ms') || '120000',
  '--max-run-ms', args.get('--max-run-ms') || '420000',
  '--max-storage-bytes', '1000000',
];
if (args.get('--chromium')) runnerArgs.push('--chromium', args.get('--chromium'));
const child = spawn(process.execPath, [
  join(root, 'tests/xml-cii-workflow-popup-browser.mjs'), ...runnerArgs,
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });
const exitCode = await new Promise((ok, fail) => {
  child.once('exit', (code, signal) => ok(code ?? (signal ? 1 : 0)));
  child.once('error', fail);
});
if (exitCode !== 0) {
  console.error(stderr || stdout || 'BM2 Chrome gate failed');
  process.exit(exitCode || 1);
}
let report;
try { report = JSON.parse(stdout); }
catch {
  console.error('BM2 Chrome runner produced no valid JSON:', stdout, stderr);
  process.exit(1);
}
const values = report.bm2Budget?.phase || {};
const fiveTimings = {
  firstVisitMs: values.firstVisitMs,
  buildMs: values.buildMs,
  buildAfterIdleMs: values.buildAfterIdleMs,
  rebuildMs: values.rebuildMs,
  fetchRatingMs: values.fetchRatingMs,
};
const expected = '5cf2bfbe4cbe88361afcb3374c5230ee4badf42d9f503ec2cb5b2f0b7414e00c';
const verified = values.outputBytes === 687252 && values.outputSha256 === expected;
const measures = report.bm2Budget?.popupPerformanceMeasures || [];
const blockingBuildPhases = new Set([
  'xml-cii:popup:build:dryrun',
  'xml-cii:popup:build:table',
  'xml-cii:popup:build:staged',
]);
const buildMeasures = measures.filter(entry => blockingBuildPhases.has(entry.name))
  .sort((a, b) => b.durationMs - a.durationMs);
const backgroundAuthority = measures.filter(entry =>
  entry.name === 'xml-cii:popup:build:authority');
const output = {
  run: 'PERF-1.R14 BM2 real-Chrome',
  ...fiveTimings,
  outputBytes: values.outputBytes ?? null,
  outputSha256: values.outputSha256 ?? null,
  outputFile: values.outputFile ?? null,
  outputSource: values.outputSource ?? null,
  rigidReviewSkipped: values.rigidReviewSkipped ?? false,
  outputMatchesExpected: verified,
  maxStorageWriteBytes: report.bm2Budget?.maxWriteBytes ?? null,
  buildCostTop3: buildMeasures.slice(0, 3),
  backgroundAuthorityMs: backgroundAuthority.at(-1)?.durationMs ?? null,
};
console.log(JSON.stringify(output, null, 2));
if (Object.values(fiveTimings).some(value => !Number.isFinite(value))
  || !verified || output.maxStorageWriteBytes > 1000000) process.exitCode = 1;
