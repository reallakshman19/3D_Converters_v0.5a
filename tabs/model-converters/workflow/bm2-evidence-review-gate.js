/**
 * Evidence-only wait for the actual converter output. The production rigid
 * review dialog is explicitly skippable: Skip Review keeps unresolved weights
 * at zero and lets the engine run. Never synthesize a Preview/output payload.
 */
export async function waitForXmlCiiEngineOutput({
  hasOutput,
  reviewSkipButton,
  now = () => performance.now(),
  delay = ms => new Promise(ok => setTimeout(ok, ms)),
  maxMs = 420000,
} = {}) {
  if (typeof hasOutput !== 'function' || typeof reviewSkipButton !== 'function')
    throw new TypeError('Real converter output and review selectors are required');
  const started = now();
  let skipped = false;
  while (!hasOutput()) {
    const skip = reviewSkipButton();
    if (skip && !skipped) {
      skip.click();
      skipped = true;
    }
    if (now() - started > maxMs) {
      throw Error('BM2 engine output timed out after ' + Math.round(now() - started) +
        ' ms' + (skipped ? ' (rigid review skipped)' : ''));
    }
    await delay(150);
  }
  return { skipped, outputSource: 'production converter output Download' };
}
