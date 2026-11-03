import { auditXmlCiiRigidWeightsForExport } from '../../converters/xml-cii2019-core/rigid-weight-export-audit.js';
import { validateXmlCiiFinalRigidWeightAudit } from '../../converters/xml-cii2019-core/rigid-weight-final-validation.js';
import {
  applyXmlCiiRigidWeightOverrides,
  collectXmlCiiWeightMatchRows,
  xmlCiiRigidWeightOverrideKey,
} from '../../converters/xml-cii2019-core/weight-match-model.js';

const text = (value) => value == null ? '' : String(value).trim();
const reference = (value) => text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
function isReviewRequired(row) {
  // The single release gate is the empirical A1/A2 deviation API (±50%).
  // When neither approach can estimate a weight, require manual review rather
  // than silently interpreting "unvalidated" as acceptable.
  return row?.empiricalEvidence?.reportableAbnormality === true
    || row?.empiricalStatus === 'UNVALIDATED';
}
function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function matchingPreviewRow(row, nodeRows = []) {
  return (nodeRows || []).find((node) => text(node.branchName) === text(row.branchName)
    && text(node.nodeNumber) === text(row.toNode)
    && reference(node.componentRefNo) === reference(row.componentRefNo)
    && (!text(row.endpoint) || text(node.endpoint) === text(row.endpoint))) || null;
}
function edgeReviewIssue(row, nodeRows) {
  const preview = matchingPreviewRow(row, nodeRows);
  return {
    key: text(preview?.key || row.overrideKey || xmlCiiRigidWeightOverrideKey(row.branchName, row.toNode)),
    branchName: row.branchName,
    fromNode: row.fromNode,
    toNode: row.toNode,
    endpoint: row.endpoint,
    componentType: row.componentType,
    componentRefNo: row.componentRefNo,
    elementLengthMm: row.elementLengthMm,
    wholeComponentSpanMm: row.wholeComponentSpanMm,
    currentWeightKg: row.massKg,
    proposedWeightKg: positive(preview?.weightMatch?.weight),
    exportedWeight: row.exportedWeight,
    exportedUnit: row.exportedUnit,
    rating: row.rating || preview?.rating || '',
    dtxr: preview?.dtxr || '',
    empiricalStatus: row.empiricalStatus,
    empiricalA1DeviationPct: row.empiricalA1DeviationPct,
    empiricalA2DeviationPct: row.empiricalA2DeviationPct,
    empiricalEvidence: row.empiricalEvidence || null,
    empiricalThresholdPct: row.empiricalThresholdPct,
    weightOrigin: row.weightOrigin,
    reviewFlags: row.reviewFlags.filter((flag) => flag.startsWith('EMPIRICAL_')),
    diagnosticFlags: row.reviewFlags.filter((flag) => !flag.startsWith('EMPIRICAL_')),
  };
}
function proposalIssue(row, nodeRows) {
  const preview = (nodeRows || []).find((item) => text(item.key) === text(row.key)) || null;
  return {
    ...row,
    key: text(row.key),
    fromNode: text(row.fromNode || ''),
    toNode: text(row.toNode),
    rating: preview?.rating || row.rating || '',
    dtxr: preview?.dtxr || '',
    currentWeightKg: positive(row.currentWeightKg) || 0,
    proposedWeightKg: positive(row.proposedWeightKg),
    exportedWeight: 0,
    exportedUnit: 'N',
    reviewFlags: [...(row.reviewFlags || [])],
  };
}

/**
 * Gate the exact standalone CII engine input, NOT the separate Model Converters runner.
 * Every positive rigid mass is validated by the empirical A1/A2 API.
 * Values beyond ±50% or with no available estimate, plus unresolved proposed
 * masses, must receive explicit approval before the Python engine is invoked.
 */
export function buildStandaloneFinalRigidReview(parity, config = {}, options = {}) {
  if (typeof DOMParser === 'undefined') throw new Error('XML parser unavailable: final rigid weight review cannot be verified.');
  const xmlText = text(parity?.xmlText);
  if (!xmlText) throw new Error('Final enriched XML missing: cannot audit rigid weights.');
  const audit = validateXmlCiiFinalRigidWeightAudit(
    auditXmlCiiRigidWeightsForExport(xmlText, { kgToNewton: options.kgToNewton !== false }),
    [...collectXmlCiiWeightMatchRows(xmlText, options.stagedJsonText || '', config), ...(parity?.nodeRows || [])],
    config?.weight?.masterRows || [],
  );
  const issues = audit.rows.filter(isReviewRequired).map((row) => edgeReviewIssue(row, parity?.nodeRows));
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  for (const row of parity?.reviewProposals || []) {
    const proposal = proposalIssue(row, parity?.nodeRows);
    if (!proposal.key || !proposal.proposedWeightKg) continue;
    if (byKey.has(proposal.key)) {
      const existing = byKey.get(proposal.key);
      existing.reviewFlags = [...new Set([...existing.reviewFlags, ...proposal.reviewFlags])];
      existing.proposedWeightKg = proposal.proposedWeightKg;
      existing.empiricalEvidence ||= proposal.empiricalEvidence || null;
    } else {
      issues.push(proposal);
      byKey.set(proposal.key, proposal);
    }
  }
  if (issues.some((issue) => !issue.key)) throw new Error('Cannot review weight with missing component override identity.');
  // A key must correspond to exactly one component owner; do not let one
  // manual value unknowingly overwrite several differently flagged elements.
  const seen = new Map();
  for (const issue of issues) {
    const identity = [issue.branchName, issue.toNode, reference(issue.componentRefNo), issue.endpoint].join('|');
    if (seen.has(issue.key) && seen.get(issue.key) !== identity) {
      throw new Error(`Ambiguous rigid weight review key ${issue.key}: multiple component owners.`);
    }
    seen.set(issue.key, identity);
  }
  return { audit, issues, xmlText };
}

export async function enforceStandaloneFinalRigidWeightReview(parity, job, runtime = {}) {
  const config = JSON.parse(text(job?.supportConfigJson) || '{}');
  const gate = buildStandaloneFinalRigidReview(parity, config, {
    kgToNewton: job?.options?.kgToNewton !== false,
    stagedJsonText: job?.stagedJsonText || '',
  });
  if (!gate.issues.length) return { ok: true, xmlText: gate.xmlText, audit: gate.audit, reviewedRows: [], issues: [] };
  const identification = gate.issues.map((item) => `${item.fromNode || '?'} → ${item.toNode}: ${item.reviewFlags.join('/')}`).join('; ');
  if (typeof runtime.reviewFinalRigidWeights !== 'function') {
    return { ok: false, error: `Final rigid weight review required before CII export: ${identification}. No review dialog is connected.`, ...gate };
  }
  const response = await runtime.reviewFinalRigidWeights(gate.issues, {
    sourceName: job?.sourceName || '',
    kgToNewton: job?.options?.kgToNewton !== false,
  });
  if (!response || response.cancelled) {
    return { ok: false, error: `Final rigid weight review cancelled; CII conversion blocked: ${identification}`, ...gate };
  }
  const approved = new Set(Array.isArray(response.approvedKeys) ? response.approvedKeys : []);
  const weights = response.weightsByKey || {};
  for (const issue of gate.issues) {
    if (!approved.has(issue.key) || positive(weights[issue.key]) === null) {
      return { ok: false, error: `Final rigid weight ${issue.fromNode || '?'} → ${issue.toNode} was not explicitly approved. CII export blocked.`, ...gate };
    }
  }
  const permitted = Object.fromEntries(gate.issues.map((issue) => [issue.key, Number(weights[issue.key])]));
  const applied = applyXmlCiiRigidWeightOverrides(gate.xmlText, permitted);
  if (applied.appliedCount !== gate.issues.length) {
    return { ok: false, error: `Final rigid weight changes affected ${applied.appliedCount} node(s); expected ${gate.issues.length}. Ambiguous target or missing node: CII export blocked.`, ...gate };
  }
  const reviewedRows = gate.issues.map((issue) => ({
    branchName: issue.branchName, fromNode: issue.fromNode, toNode: issue.toNode,
    componentRefNo: issue.componentRefNo, key: issue.key,
    previousWeightKg: issue.currentWeightKg, approvedWeightKg: permitted[issue.key],
    reviewFlags: issue.reviewFlags, status: 'EXPLICITLY_REVIEWED',
  }));
  if (typeof runtime.onFinalRigidWeightsApplied === 'function') {
    await runtime.onFinalRigidWeightsApplied({ weightsByKey: permitted, reviewedRows });
  }
  return { ok: true, xmlText: applied.xmlText, audit: gate.audit, reviewedRows, issues: gate.issues };
}
