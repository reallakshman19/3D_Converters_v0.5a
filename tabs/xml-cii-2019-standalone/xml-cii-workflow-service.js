import { enrichInputXmlDocument } from './xml-cii-inputxml-enrichment.js';
import { runXmlCii2019StandaloneEngineJob } from './xml-cii-workflow-engine-client.js';
import { createWorkflowDiagnostics, normalizeWorkflowResult } from './xml-cii-workflow-types.js';
import { applyStandaloneSifFacts } from './xml-cii-standalone-sif-apply.js';
import { enrichStandaloneXmlForRun } from './xml-cii-standalone-run-parity.js';
import { enforceStandaloneFinalRigidWeightReview } from './xml-cii-final-rigid-weight-review-gate.js';
import { digestXmlCiiParityText } from './xml-cii-run-parity-evidence.js';
import { reconcileFinalPythonRigidWeights } from '../../converters/xml-cii2019-core/rigid-weight-post-python-reconcile.js';

function parseSupportConfig(raw) {
  try {
    const value = JSON.parse(String(raw ?? '') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function applyEffectiveFactsToJob(job) {
  const config = parseSupportConfig(job.supportConfigJson);
  const weightOverrides = job.weightOverrides && typeof job.weightOverrides === 'object' ? job.weightOverrides : {};
  if (Object.keys(weightOverrides).length) {
    config.overrides = { ...(config.overrides || {}), rigidWeight: { ...(config.overrides?.rigidWeight || {}), ...weightOverrides } };
  }
  if (Array.isArray(job.previewFacts) && job.previewFacts.length) config.previewFacts = job.previewFacts;
  if (Array.isArray(job.manualFacts) && job.manualFacts.length) config.manualFacts = job.manualFacts;
  if (Array.isArray(job.supportMapperRules) && job.supportMapperRules.length) config.supportMapperRules = job.supportMapperRules;
  return { ...job, supportConfigJson: JSON.stringify(config, null, 2) };
}

function mergeInputXmlEngineResult(enrichedResult, engineResult, outputMode) {
  const logs = [...(enrichedResult.logs || []), ...(Array.isArray(engineResult.logs) ? engineResult.logs : [])];
  const diagnostics = createWorkflowDiagnostics({
    ...(enrichedResult.diagnostics || {}),
    sourceKind: 'inputxml',
    outputKind: 'enrichedInputXML',
    branch: 'direct-inputxml-enrichment-plus-cii-compatibility',
    engineDiagnostics: engineResult.diagnostics || null,
    warnings: [
      ...((Array.isArray(enrichedResult.diagnostics?.warnings) ? enrichedResult.diagnostics.warnings : [])),
      ...((Array.isArray(engineResult.diagnostics?.warnings) ? engineResult.diagnostics.warnings : [])),
    ],
  });
  if (!engineResult.ok) {
    return normalizeWorkflowResult({ ...enrichedResult, ok: false, diagnostics, logs, error: engineResult.error || 'InputXML CII compatibility route failed.' });
  }
  return normalizeWorkflowResult({
    ...enrichedResult,
    enrichedText: outputMode === 'cii-only' ? '' : enrichedResult.enrichedText,
    enrichedName: outputMode === 'cii-only' ? '' : enrichedResult.enrichedName,
    ciiText: engineResult.ciiText,
    ciiName: engineResult.ciiName,
    diagnostics,
    logs,
  });
}

function normalizeXmlEngineResult(engineResult) {
  const engineDiagnostics = engineResult?.diagnostics && typeof engineResult.diagnostics === 'object' ? engineResult.diagnostics : null;
  const diagnostics = createWorkflowDiagnostics({
    ...(engineDiagnostics || {}),
    sourceKind: 'xml',
    outputKind: 'enrichedXML',
    branch: 'psi116-xml-compatibility-engine',
    engineDiagnostics,
    warnings: Array.isArray(engineDiagnostics?.warnings) ? engineDiagnostics.warnings : [],
  });
  return normalizeWorkflowResult({
    ...engineResult,
    sourceKind: 'xml',
    outputKind: 'enrichedXML',
    diagnostics,
  });
}

function blockedRunParityResult(job, parity) {
  const evidence = parity?.evidence || null;
  const error = parity?.error
    || (!parity?.applied ? 'Standalone run parity did not release a verified converter input.' : '')
    || (!evidence ? 'Standalone run parity evidence is missing.' : '')
    || 'Standalone run parity verification failed.';
  return normalizeXmlEngineResult({
    ok: false,
    sourceKind: 'xml',
    outputKind: 'enrichedXML',
    enrichedText: '',
    enrichedName: '',
    ciiText: null,
    ciiName: null,
    diagnostics: {
      schema: 'xml-cii-2019-workflow-diagnostics/v1',
      sourceKind: 'xml',
      outputMode: job?.options?.outputMode || 'enriched-only',
      warnings: [error],
      runParityStats: parity?.stats || {},
      runParityEvidence: evidence,
      converterInputReleased: false,
    },
    logs: Array.isArray(parity?.logs) ? parity.logs : [],
    error,
  });
}

export async function runXmlCii2019WorkflowService(job, runtime = {}) {
  const factedJob = applyEffectiveFactsToJob(job);
  if (factedJob.sourceKind === 'inputxml') {
    const enrichedResult = enrichInputXmlDocument(factedJob);
    const sif = applyStandaloneSifFacts(enrichedResult.enrichedText, 'inputxml', factedJob.sifFacts);
    const finalEnrichedResult = { ...enrichedResult, enrichedText: sif.text };
    if (factedJob.options.outputMode === 'enriched-only') return normalizeWorkflowResult(finalEnrichedResult);
    const engineJob = { ...factedJob, sourceText: sif.text, sourceName: enrichedResult.enrichedName, options: { ...factedJob.options, outputMode: 'cii-only' } };
    const engineResult = await runXmlCii2019StandaloneEngineJob(engineJob, runtime);
    return mergeInputXmlEngineResult(finalEnrichedResult, engineResult, factedJob.options.outputMode);
  }

  const parityRunner = typeof runtime.runParityEnricher === 'function'
    ? runtime.runParityEnricher
    : enrichStandaloneXmlForRun;
  const parity = await parityRunner(factedJob);
  if (!parity?.applied || parity?.error || !parity?.evidence || parity.evidence.ok !== true) {
    return blockedRunParityResult(factedJob, parity);
  }

  // Final physical node weights must be reviewed on the exact enriched XML
  // handed to Python. The Model Converters runner is NOT on this execution path.
  let finalReview;
  try {
    finalReview = await enforceStandaloneFinalRigidWeightReview(parity, factedJob, runtime);
  } catch (error) {
    return blockedRunParityResult(factedJob, {
      ...parity,
      error: `Final rigid weight audit failed closed: ${error?.message || String(error)}`,
    });
  }
  if (!finalReview.ok) {
    return blockedRunParityResult(factedJob, { ...parity, error: finalReview.error });
  }
  // CII must use the exact XML that passed weight ownership inspection.
  // TopoFix is a separate derived XML; it cannot inherit an approval on
  // different geometry or component occurrence identity.
  if (factedJob.options?.useTopoFixForCii === true) {
    return blockedRunParityResult(factedJob, {
      ...parity,
      error: 'RIGID custody blocked: TopoFix changes the Python input after weight review. Review the committed TopoFix XML as a new source before CII export.',
    });
  }
  const engineJob = { ...factedJob, sourceText: finalReview.xmlText };
  const result = await runXmlCii2019StandaloneEngineJob(engineJob, runtime);
  if (Array.isArray(result?.logs) && parity.logs.length) result.logs = [...parity.logs, ...result.logs];
  const normalized = normalizeXmlEngineResult(result);
  if (normalized.ok && normalized.ciiText) {
    try {
      const verification = await reconcileFinalPythonRigidWeights({
        reviewedXmlText: finalReview.xmlText,
        ciiText: normalized.ciiText,
        rigidLedger: normalized.rigidLedger,
        kgToNewton: factedJob.options?.kgToNewton !== false,
      });
      normalized.diagnostics.rigidPythonOwnershipReconciliation = verification;
    } catch (error) {
      return blockedRunParityResult(factedJob, {
        ...parity,
        error: 'Post-Python RIGID mass ownership reconciliation failed closed: ' +
          (error?.message || String(error)),
      });
    }
  }
  if (normalized.diagnostics) {
    normalized.diagnostics.runParityStats = parity.stats;
    normalized.diagnostics.runParityEvidence = parity.evidence;
    normalized.diagnostics.converterInputReleased = true;
    normalized.diagnostics.converterInputDigest = digestXmlCiiParityText(finalReview.xmlText);
    normalized.diagnostics.finalRigidWeightAudit = finalReview.audit;
    normalized.diagnostics.splitRigidOwnershipLedger = finalReview.splitCustody?.componentLedger || [];
    normalized.diagnostics.rigidOwnershipSnapshotDigest = finalReview.snapshotDigest;
    normalized.diagnostics.splitRigidOwnershipIssues = finalReview.splitCustody?.ownershipIssues || [];
    normalized.diagnostics.finalRigidWeightReview = {
      reviewedRows: finalReview.reviewedRows,
      reviewRequiredCount: finalReview.issues.length,
      status: finalReview.reviewedRows.length ? 'EXPLICITLY_REVIEWED' : 'NOT_REQUIRED',
    };
  }
  return normalized;
}
