import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForXmlCiiEngineOutput } from '../tabs/model-converters/workflow/bm2-evidence-review-gate.js';

test('H4: real rigid review Skip action unblocks production output rather than fabricating it', async () => {
  let skipClicks = 0;
  let output = false;
  const result = await waitForXmlCiiEngineOutput({
    hasOutput: () => output,
    reviewSkipButton: () => ({ click() {
      skipClicks++;
      output = true; // production converter resumes after user skips review
    } }),
    now: () => 1,
    delay: async () => {},
  });
  assert.equal(skipClicks, 1);
  assert.equal(result.skipped, true);
  assert.equal(result.outputSource, 'production converter output Download');
  // Mutant: removing Skip Review produces no output and cannot complete.
});

test('H4: missing engine output fails, never produces a synthetic SHA', async () => {
  let elapsed = 0;
  await assert.rejects(() => waitForXmlCiiEngineOutput({
    hasOutput: () => false, reviewSkipButton: () => null,
    now: () => elapsed, delay: async () => { elapsed += 100; }, maxMs: 150,
  }), /engine output timed out/);
});


test('J1: converter Failed status stops the evidence gate immediately and preserves REDUCERS error', async () => {
  let waits = 0, skips = 0;
  const failure = 'Failed: ValueError: REDUCERS auxiliary edge has no PSI116 reducer component owner/AlphaAngle.';
  const result = await waitForXmlCiiEngineOutput({
    hasOutput: () => false,
    reviewSkipButton: () => ({ click() { skips++; } }),
    reviewVisible: () => false,
    readFailure: () => failure,
    now: () => 0,
    delay: async () => { waits++; },
  });
  assert.equal(result.failed, true);
  assert.equal(result.error, failure);
  assert.equal(waits, 0, 'failure must be read before waiting for output');
  assert.equal(skips, 0);
  // Mutant: failing to inspect Failed status hangs until timeout.
});

test('J1/SR1: removed Skip Review action fails immediately, never waits 420s', async () => {
  let waits = 0;
  await assert.rejects(() => waitForXmlCiiEngineOutput({
    hasOutput: () => false,
    reviewVisible: () => true,
    reviewSkipButton: () => null,
    now: () => 0,
    delay: async () => { waits++; },
  }), /Skip Review action missing/);
  assert.equal(waits, 0, 'visible review with no Skip button must fail fast');
  // Mutant: remove skip.click or the missing-action guard -> no progress.
});
