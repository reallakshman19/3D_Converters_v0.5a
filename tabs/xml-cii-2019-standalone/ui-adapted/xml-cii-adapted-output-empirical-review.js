/**
 * Output / Run preflight. Uses the SAME post-enrichment standalone parity
 * and empirical gate as Python CII export, but never invokes the Python engine.
 * Manual inspection displays every positive physical RIGID owner, not only
 * empirically abnormal rows, so a normal 19.1 mm edge can be found.
 */
import { buildXmlCiiWorkflowJobFromUiState } from '../xml-cii-workflow-ui-adapter.js';
import { enrichStandaloneXmlForRun } from '../xml-cii-standalone-run-parity.js';
import { applyEffectiveFactsToJob } from '../xml-cii-workflow-service.js';
import { buildStandaloneFinalRigidReview } from '../xml-cii-final-rigid-weight-review-gate.js';
import { applyXmlCiiRigidWeightOverrides } from '../../../converters/xml-cii2019-core/weight-match-model.js';
import { modeAExecutionRows } from './xml-cii-adapted-mode-a-propagation.js';
import { applyModeAConsolidatedRigidReviewUpdates } from './xml-cii-adapted-rigid-review-mode-a-state.js';
import { normalizeModeABatchState, syncActiveModeASource } from '../xml-cii-mode-a-batch.js';
import { replaceModeAState } from './xml-cii-adapted-mode-a-state.js';
import { saveMasterContextToLocalStorage } from './xml-cii-adapted-state.js';
import { openStandaloneFinalRigidWeightReviewPopup } from './xml-cii-adapted-final-rigid-weight-popup.js';

const str = (value) => String(value ?? '');
const obj = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const parse = (value) => { try { return obj(JSON.parse(str(value) || '{}')); } catch { return {}; } };

export function outputReviewRawRef(stateRef) {
  return stateRef?.modeABaseRef?.modeABaseRef || stateRef?.modeABaseRef || stateRef;
}

export function outputReviewSourceRows(stateRef) {
  const ref = outputReviewRawRef(stateRef);
  const state = ref.current;
  if (Array.isArray(state.sourceBatch?.sources) && state.sourceBatch.sources.length) {
    return modeAExecutionRows(ref).map(({source, state: execution}) => ({
      sourceId: source.sourceId,
      sourceName: source.fileName || source.sourceId,
      state: execution,
    }));
  }
  return [{ sourceId: null, sourceName: state.sourceNameOverride || state.sourceFile?.name || 'Current XML', state }];
}

export async function inspectOutputEmpiricalSource(sourceState, options = {}) {
  const original = await buildXmlCiiWorkflowJobFromUiState(sourceState);
  if (original.sourceKind === 'inputxml') {
    return { skipped: true, reason: 'Empirical rigid-element review applies to PSI116 XML, not InputXML.' };
  }
  const job = applyEffectiveFactsToJob(original);
  const parity = await (options.runParityEnricher || enrichStandaloneXmlForRun)(job);
  if (!parity?.applied || parity.error || parity.evidence?.ok !== true) {
    throw new Error('Post-enrichment empirical inspection failed closed: ' +
      str(parity?.error || 'No verified standalone parity XML was produced.'));
  }
  const config = parse(job.supportConfigJson);
  const reviewOptions = {
    stagedJsonText: job.stagedJsonText || '',
    kgToNewton: job.options?.kgToNewton !== false,
    sourceId: job.sourceId || job.sourceName || '',
  };
  // Inspect the same resolved manual overrides that the export gate will use.
  const overrides = obj(config.overrides?.rigidWeight);
  const applied = Object.keys(overrides).length
    ? applyXmlCiiRigidWeightOverrides(parity.xmlText, overrides)
    : { xmlText: parity.xmlText, appliedCount: 0 };
  const inspectedParity = { ...parity, xmlText: applied.xmlText };
  const mandatory = buildStandaloneFinalRigidReview(inspectedParity, config, reviewOptions);
  const all = buildStandaloneFinalRigidReview(inspectedParity, config, {
    ...reviewOptions, includeAllPositiveMasses: true,
  });
  return { job, parity: inspectedParity, mandatory, all };
}

function saveReviewedWeights(stateRef, sourceId, weightsByKey) {
  if (!Object.keys(weightsByKey).length) return;
  const ref = outputReviewRawRef(stateRef);
  const state = ref.current;
  if (sourceId !== null) {
    const updated = applyModeAConsolidatedRigidReviewUpdates(state, {
      [sourceId]: { ratingsByKey: {}, weightsByKey },
    });
    replaceModeAState(ref, syncActiveModeASource(normalizeModeABatchState(updated)));
    return;
  }
  const cfg = parse(state.supportConfigJson);
  cfg.overrides = {
    ...obj(cfg.overrides),
    rigidWeight: { ...obj(cfg.overrides?.rigidWeight), ...weightsByKey },
  };
  const next = { ...state, supportConfigJson: JSON.stringify(cfg, null, 2) };
  if (next.masterContext) {
    next.masterContext = { ...next.masterContext, config: cfg };
    saveMasterContextToLocalStorage(next.masterContext);
  }
  ref.current = next;
}

function approvedWeights(response, issues, xmlText) {
  if (!response || response.cancelled) return null;
  const selected = new Set(Array.isArray(response.approvedKeys) ? response.approvedKeys : []);
  const keys = new Set(issues.map((issue) => issue.key));
  const weightMap = {};
  for (const key of selected) {
    const mass = Number(response.weightsByKey?.[key]);
    if (!keys.has(key) || !Number.isFinite(mass) || mass <= 0) {
      throw new Error('Unqualified review target or non-positive mass. No overrides were saved.');
    }
    weightMap[key] = mass;
  }
  const count = Object.keys(weightMap).length;
  if (count) {
    const applied = applyXmlCiiRigidWeightOverrides(xmlText, weightMap);
    if (applied.appliedCount !== count) {
      throw new Error('Manual weight targets were missing or ambiguous in post-enrichment XML; no overrides saved.');
    }
  }
  return weightMap;
}

export async function runOutputEmpiricalReviewFromUi(stateRef, options = {}) {
  const notify = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  const manual = options.manualInspection === true;
  const reviewPopup = options.reviewPopup || openStandaloneFinalRigidWeightReviewPopup;
  const sources = outputReviewSourceRows(stateRef);
  const summary = { scanned: 0, flagged: 0, visible: 0, approved: 0, opened: 0, cancelled: false };
  for (const source of sources) {
    if (!source.state?.sourceText && !source.state?.sourceFile) continue;
    notify('Checking post-enrichment empirical A1/A2 weights in ' + source.sourceName + '…');
    const result = await inspectOutputEmpiricalSource(source.state, options);
    if (result.skipped) { notify(result.reason); continue; }
    summary.scanned++;
    const mandatory = result.mandatory.issues;
    const issues = manual ? result.all.issues : mandatory;
    summary.flagged += mandatory.length;
    summary.visible += issues.length;
    if (!issues.length) continue;
    // Manual inspection uses selective approval: compliant edges are visible
    // without forcing the user to approve every RIGID in the model.
    const answer = await reviewPopup(issues, {
      sourceName: source.sourceName,
      kgToNewton: result.job.options?.kgToNewton !== false,
      manualInspection: manual,
    });
    summary.opened++;
    if (!answer || answer.cancelled) {
      summary.cancelled = true;
      notify(manual ? 'Manual inspection closed without changes.' :
        'Empirical review cancelled. Conversion remains subject to the mandatory final-export gate.');
      return summary;
    }
    const weights = approvedWeights(answer, issues, result.parity.xmlText);
    if (!manual && Object.keys(weights).length !== issues.length) {
      throw new Error('An empirically abnormal rigid weight was not explicitly approved.');
    }
    saveReviewedWeights(stateRef, source.sourceId, weights);
    summary.approved += Object.keys(weights).length;
  }
  notify(summary.scanned
    ? 'Post-enrichment empirical check: ' + summary.flagged + ' review-required edge(s), ' +
      summary.visible + ' shown, ' + summary.approved + ' reviewed weight(s) saved. ' +
      'Python export still runs its own mandatory final gate.'
    : 'No PSI116 XML sources available for empirical rigid-weight review.');
  return summary;
}
