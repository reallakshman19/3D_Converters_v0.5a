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
