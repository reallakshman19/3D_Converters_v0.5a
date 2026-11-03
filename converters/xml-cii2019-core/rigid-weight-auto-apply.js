import { applyXmlCiiRigidWeightOverrides } from './weight-match-model.js';
import { createEmpiricalWeightValidator } from '../empirical-weight/empirical-weight-validation.js';
import {
  XML_CII_EMPIRICAL_REVIEW_THRESHOLD_PCT,
  xmlCiiEmpiricalWeightValidationInput,
} from './rigid-weight-final-validation.js';

function text(value) { return value == null ? '' : String(value).trim(); }
function weightOf(candidate = {}) {
  const value = Number(candidate.selectedWeight ?? candidate.suggestedWeight ?? candidate.weight);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function confidenceOf(candidate = {}) {
  const raw = Number(candidate.totalScore ?? candidate.score);
  if (!Number.isFinite(raw)) return null;
  const score = raw > 1 ? raw / 100 : raw;
  return score >= 0 && score <= 1 ? score : null;
}
function bestCandidate(issue = {}) {
  return issue?.ranking?.best || (Array.isArray(issue?.candidates) ? issue.candidates[0] : null) || null;
}

/**
 * Preview autofill is qualified by the existing empirical A1/A2 API.
 * No arbitrary 60% confidence, 1mm bore, or short/heavy size gate.
 */
export function qualifiedXmlCiiRigidAutoWeightCandidate(issue = {}, options = {}) {
  const candidate = bestCandidate(issue);
  const proposedWeightKg = weightOf(candidate);
  if (!candidate || proposedWeightKg === null || candidate.zeroFallback || issue.ratingConflict || issue.pipingClassNeedsReview) return null;
  const masters = Array.isArray(options.masterRows) && options.masterRows.length
    ? { masterRows: options.masterRows } : {};
  const validator = options.validator || createEmpiricalWeightValidator(masters);
  const empiricalInput = xmlCiiEmpiricalWeightValidationInput({
    branchName: issue.branchName,
    toNode: issue.nodeNumber,
    componentRefNo: issue.componentRefNo,
    boreMm: issue.boreMm, rating: issue.rating, massKg: proposedWeightKg,
    weightOrigin: candidate.weightMethod || 'weight-master-candidate',
  }, { ...issue, candidates: [candidate], candidate });
  const empiricalEvidence = validator.validate(empiricalInput, {
    abnormalityThresholdPct: XML_CII_EMPIRICAL_REVIEW_THRESHOLD_PCT,
  });
  if (empiricalEvidence.status === 'UNVALIDATED' || empiricalEvidence.reportableAbnormality) return null;
  return { candidate, weightKg: proposedWeightKg, confidence: confidenceOf(candidate), empiricalEvidence };
}
export function collectXmlCiiAutoRigidWeightsFromIssues(issues = [], options = {}) {
  const weightsByKey = {}, appliedRows = [], remainingIssues = [];
  const validator = options.validator || createEmpiricalWeightValidator(
    Array.isArray(options.masterRows) && options.masterRows.length ? { masterRows: options.masterRows } : {},
  );
  for (const issue of Array.isArray(issues) ? issues : []) {
    const qualified = qualifiedXmlCiiRigidAutoWeightCandidate(issue, { ...options, validator });
    const key = text(issue?.key);
    if (!qualified || !key) { remainingIssues.push(issue); continue; }
    const { candidate, weightKg, confidence } = qualified;
    weightsByKey[key] = weightKg;
    appliedRows.push({
      type: 'rigid-weight-auto-applied', branchName: issue.branchName || '', nodeNumber: issue.nodeNumber || '',
      componentType: issue.componentType || '', componentRefNo: issue.componentRefNo || '', boreMm: issue.boreMm,
      rating: issue.rating, lengthMm: issue.lengthMm, weight: weightKg, confidence,
      method: 'empirically-validated-a1-a2-within-50-percent',
      candidateType: candidate.type || candidate.valveType || '', candidateTypeDesc: candidate.typeDesc || '',
      weightMethod: candidate.weightMethod || '', lengthDelta: candidate.lengthDelta,
      semanticSource: candidate.semanticSource || '', semanticReason: candidate.semanticReason || '',
      message: `Auto-applied ${weightKg} kg; available empirical A1/A2 estimates are within ±50%.`,
    });
  }
  return { weightsByKey, appliedRows, remainingIssues, appliedCount: appliedRows.length };
}
export function applyXmlCiiAutoRigidWeightsFromIssues(xmlText, issues = [], options = {}) {
  const plan = collectXmlCiiAutoRigidWeightsFromIssues(issues, options);
  if (!plan.appliedCount) return { xmlText, ...plan };
  const applied = applyXmlCiiRigidWeightOverrides(xmlText, plan.weightsByKey);
  return { ...plan, xmlText: applied.xmlText, appliedCount: applied.appliedCount, appliedRows: plan.appliedRows };
}
