// Distinguish successful *output* SHA from a failed converter's captured
// *input* SHA. An expected converter failure is a complete evidence report,
// never a successful converter execution.
export const EXPECTED_OUTPUT_SHA = '5cf2bfbe4cbe88361afcb3374c5230ee4badf42d9f503ec2cb5b2f0b7414e00c';
export const BM2_TIMINGS = Object.freeze([
  'firstVisitMs', 'buildMs', 'buildAfterIdleMs', 'rebuildMs', 'fetchRatingMs',
]);

export function classifyBm2Evidence({ phase = {}, status, browserExitCode = 0,
  maxStorageWriteBytes } = {}) {
  const timingsComplete = BM2_TIMINGS.every(key =>
    Number.isFinite(phase[key]) && phase[key] >= 0);
  const outputVerified = phase.outputBytes === 687252
    && phase.outputSha256 === EXPECTED_OUTPUT_SHA;
  const converterFailed = status === 'RUN_FAILED'
    && typeof phase.runError === 'string' && /^Failed:/i.test(phase.runError);
  const engineInputCaptured = Number.isFinite(phase.engineInputBytes)
    && phase.engineInputBytes > 0
    && /^[a-f0-9]{64}$/i.test(phase.engineInputSha256 || '')
    && String(phase.engineInputSource || '').includes('Python worker primary XML input');
  const storageValid = Number.isFinite(maxStorageWriteBytes)
    && maxStorageWriteBytes <= 1000000;
  const browserExitValid = browserExitCode === 0 || converterFailed;
  const complete = timingsComplete && storageValid && browserExitValid
    && (converterFailed ? engineInputCaptured : outputVerified);
  return {
    complete, timingsComplete, outputVerified, converterFailed,
    engineInputCaptured, storageValid, browserExitValid,
    outcome: converterFailed
      ? (complete ? 'CONVERTER_FAILED_EVIDENCE_COMPLETE' : 'CONVERTER_FAILED_EVIDENCE_INCOMPLETE')
      : (complete ? 'CONVERTER_OUTPUT_VERIFIED' : 'EVIDENCE_INCOMPLETE'),
  };
}
