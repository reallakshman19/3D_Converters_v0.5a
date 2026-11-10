import assert from 'node:assert/strict';
import test from 'node:test';
import { observeBm2FetchCommit } from '../tabs/model-converters/workflow/bm2-fetch-commit-evidence.js';
import {
  classifyBm2Evidence, BM2_TIMINGS, EXPECTED_OUTPUT_SHA,
} from '../scripts/xml-cii-bm2-evidence-contract.mjs';

const journal = 'model-converters.xml-cii.fetch-rating-journal.v1';
const storage = 'model-converters.defaults.v1';
const phase = Object.fromEntries(BM2_TIMINGS.map((key, i) => [key, 100 + i * 3]));

test('K1: Fetch probe observes real journal/config writes despite no Worker constructor events', () => {
  const disk = new Map();
  const writes = [];
  const observe = () => observeBm2FetchCommit({
    writes, readStorage: key => disk.get(key) ?? null,
    fetchWriteStart: 0, hasWorkerWriteMark: false,
  });
  assert.equal(observe().ready, false);
  disk.set(journal, '{"version":2}');
  writes.push({ key: journal, bytes: 13 });
  assert.equal(observe().ready, false);
  const compact = JSON.stringify({ overrides: { rating: { B1: '900' } } });
  disk.set(storage, JSON.stringify({ defaultsByConverter: {
    xml_to_cii: { supportConfigJson: compact },
  } }));
  writes.push({ key: storage, bytes: 31593 });
  assert.equal(observe().ready, false, 'must wait for journal clearance, not merely Worker postMessage');
  disk.delete(journal);
  assert.deepEqual(observe(), {
    ready: true, journalWrites: 1, configWrites: 1,
    journalCleared: true, compactSaved: true, workerWriteMeasured: false,
  });
  // Mutant: requiring Worker wrapper counters makes this test never complete.
});

test('K1: duplicate storage commit and absent journal are observable, not mistaken for valid Fetch', () => {
  const compact = '{"overrides":{}}';
  const state = JSON.stringify({ defaultsByConverter: { xml_to_cii: { supportConfigJson: compact } } });
  const withoutJournal = observeBm2FetchCommit({
    writes: [{ key: storage }], readStorage: key => key === storage ? state : null,
  });
  assert.equal(withoutJournal.ready, false);
  const duplicate = observeBm2FetchCommit({
    writes: [{ key: journal }, { key: storage }, { key: storage }],
    readStorage: key => key === storage ? state : null,
  });
  assert.equal(duplicate.ready, true);
  assert.equal(duplicate.configWrites, 2, 'browser gate must reject W6');
});

test('K1: failed Python conversion with five timings and real engine INPUT SHA is complete evidence, not output parity', () => {
  const input = { ...phase, runError: 'Failed: ValueError: REDUCERS auxiliary edge has no PSI116 reducer component owner/AlphaAngle.',
    engineInputBytes: 635475,
    engineInputSha256: 'dd541791' + '0'.repeat(56),
    engineInputSource: 'xmltocii2019_runner.js: Python worker primary XML input' };
  const result = classifyBm2Evidence({
    phase: input, status: 'RUN_FAILED', browserExitCode: 1, maxStorageWriteBytes: 31593,
  });
  assert.equal(result.complete, true);
  assert.equal(result.outputVerified, false);
  assert.equal(result.outcome, 'CONVERTER_FAILED_EVIDENCE_COMPLETE');
  // Mutant: checking engine input against 5cf2bfbe or always exiting 1 makes RED.
});

test('K1: incomplete failure report cannot hide missing SHA or failed run status', () => {
  const full = { ...phase, runError: 'Failed: REDUCERS', engineInputBytes: 640097,
    engineInputSha256: '30e7c115' + '0'.repeat(56),
    engineInputSource: 'Python worker primary XML input' };
  const missingHash = classifyBm2Evidence({
    phase: { ...full, engineInputSha256: null }, status: 'RUN_FAILED',
    browserExitCode: 1, maxStorageWriteBytes: 31593,
  });
  assert.equal(missingHash.complete, false);
  const notFailed = classifyBm2Evidence({
    phase: full, status: 'PASS', browserExitCode: 1, maxStorageWriteBytes: 31593,
  });
  assert.equal(notFailed.complete, false);
});

test('K1: actual converted output parity requires production OUTPUT SHA, not an engine INPUT SHA', () => {
  const valid = classifyBm2Evidence({
    phase: { ...phase, outputBytes: 687252, outputSha256: EXPECTED_OUTPUT_SHA },
    status: 'PASS', browserExitCode: 0, maxStorageWriteBytes: 31593,
  });
  assert.equal(valid.complete, true);
  assert.equal(valid.outcome, 'CONVERTER_OUTPUT_VERIFIED');
  const falseOutput = classifyBm2Evidence({
    phase: { ...phase, engineInputBytes: 687252,
      engineInputSha256: EXPECTED_OUTPUT_SHA, engineInputSource: 'Python worker primary XML input' },
    status: 'PASS', browserExitCode: 0, maxStorageWriteBytes: 31593,
  });
  assert.equal(falseOutput.complete, false);
});
