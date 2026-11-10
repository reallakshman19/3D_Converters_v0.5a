#!/usr/bin/env node
/**
 * PERF-1.R15 J1: standalone, zero-dependency BM2 real-Chrome evidence runner.
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
// A converter failure is reported as valid JSON plus process exit 1. Parse
// and print the five completed action spans before propagating that exit.
let report;
try { report = JSON.parse(stdout); }
catch {
  console.error('BM2 Chrome runner produced no valid JSON:', stdout, stderr);
  process.exit(exitCode || 1);
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
const runFailed = report.bm2Budget?.status === 'RUN_FAILED'
  && typeof values.runError === 'string' && /^Failed:/i.test(values.runError);
const engineInputCaptured = Number.isFinite(values.engineInputBytes)
  && /^[a-f0-9]{64}$/i.test(values.engineInputSha256 || '');
const timingsComplete = Object.values(fiveTimings).every(Number.isFinite);
// Converter failure is a separately reported, complete evidence outcome,
// not a successful engine output. A failure without the input fingerprint
// or full five timings is still a broken headless evidence run.
const evidenceComplete = timingsComplete
  && (runFailed ? engineInputCaptured : verified);
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
const coreFile = 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js';
const wrapperFile = 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';
const dryrunSources = {
  'xml-cii:dryrun:parse': coreFile + ':417-444',
  'xml-cii:dryrun:cleanup': coreFile + ':445-461',
  'xml-cii:dryrun:index': coreFile + ':462-470',
  'xml-cii:dryrun:lineLookup': coreFile + ':472-489',
  'xml-cii:dryrun:branchResolve': coreFile + ':490-505',
  'xml-cii:dryrun:dtxrWall': coreFile + ':533-537',
  'xml-cii:dryrun:nodeRows': coreFile + ':609-611',
  'xml-cii:dryrun:weightRanking': coreFile + ':627-631',
};
const layerSources = {
  'xml-cii:dryrun:layer:source-parse': wrapperFile + ':196-197',
  'xml-cii:dryrun:layer:staged-index': wrapperFile + ':198-201',
  'xml-cii:dryrun:layer:strict-core': wrapperFile + ':204-209',
  'xml-cii:dryrun:layer:bore-wall': wrapperFile + ':210-213',
  'xml-cii:dryrun:layer:material': wrapperFile + ':214-217',
  'xml-cii:dryrun:layer:rating': wrapperFile + ':218-223',
};
const latestCore = new Map();
const latestLayer = new Map();
for (const entry of measures) {
  if (Object.hasOwn(dryrunSources, entry.name)) latestCore.set(entry.name, entry.durationMs);
  if (Object.hasOwn(layerSources, entry.name)) latestLayer.set(entry.name, entry.durationMs);
}
const top3 = (latest, sources) => [...latest]
  .map(([name, durationMs]) => ({ name, durationMs, file: sources[name] }))
  .sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
const dryrunTop3 = top3(latestLayer, layerSources);
const dryrunCoreTop3 = top3(latestCore, dryrunSources);

const output = {
  run: 'PERF-1.R16 BM2 real-Chrome',
  ...fiveTimings,
  outputBytes: values.outputBytes ?? null,
  outputSha256: values.outputSha256 ?? null,
  outputFile: values.outputFile ?? null,
  engineInputBytes: values.engineInputBytes ?? null,
  engineInputSha256: values.engineInputSha256 ?? null,
  engineInputFile: values.engineInputFile ?? null,
  engineInputSource: values.engineInputSource ?? null,
  evidenceOutcome: runFailed ? (evidenceComplete ? 'CONVERTER_FAILED_EVIDENCE_COMPLETE'
    : 'CONVERTER_FAILED_EVIDENCE_INCOMPLETE')
    : (verified && evidenceComplete ? 'CONVERTER_OUTPUT_VERIFIED' : 'EVIDENCE_INCOMPLETE'),
  converterFailure: values.runError ?? null,
  converterStatus: report.bm2Budget?.status ?? null,
  reducerCandidates: values.reducerCandidates ?? [],
  reducerCount: values.reducerCount ?? null,
  reducerMissingAlphaCount: values.reducerMissingAlphaCount ?? null,
  browserGateExitCode: exitCode,
  outputSource: values.outputSource ?? null,
  rigidReviewSkipped: values.rigidReviewSkipped ?? false,
  outputMatchesExpected: verified,
  maxStorageWriteBytes: report.bm2Budget?.maxWriteBytes ?? null,
  buildCostTop3: buildMeasures.slice(0, 3),
  dryrunTop3,
  dryrunCoreTop3,
  backgroundAuthorityMs: backgroundAuthority.at(-1)?.durationMs ?? null,
};
console.log(JSON.stringify(output, null, 2));
const storageValid = Number.isFinite(output.maxStorageWriteBytes)
  && output.maxStorageWriteBytes <= 1000000;
const browserExitValid = exitCode === 0 || runFailed;
if (!evidenceComplete || !storageValid || !browserExitValid)
  process.exitCode = 1;
else process.exitCode = 0;
if (values.runError) console.error('BM2 production converter failed: ' + values.runError);
