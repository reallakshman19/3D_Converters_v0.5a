import { applyXmlCiiRigidWeightOverrides } from './weight-match-model.js';

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
 * Confidence >=60% is necessary, not sufficient. Never auto-select an
 * inferred/extrapolated mass, a length mismatch, or an unresolved rating.
 */
export function qualifiedXmlCiiRigidAutoWeightCandidate(issue = {}, options = {}) {
  const candidate = bestCandidate(issue);
  const confidence = confidenceOf(candidate);
  const floor = Number.isFinite(options.minConfidence) ? options.minConfidence : 0.60;
  const method = text(candidate?.weightMethod || candidate?.method);
  if (!candidate || weightOf(candidate) === null || confidence === null || confidence < floor) return null;
  if (issue.ratingConflict || issue.pipingClassNeedsReview || candidate.zeroFallback) return null;
  if (candidate.flangeWeightFallback || candidate.fallbackSuggestion || candidate.inferredWeight || candidate.specialFactorRule) return null;
  if (/fallback|extrapolat|interpolat|inferred|special-factor/i.test(method)) return null;
  if (candidate.lengthQualified !== true || candidate.ratingExact !== true) return null;
  if (!Number.isFinite(Number(candidate.boreDelta)) || Math.abs(Number(candidate.boreDelta)) >= 1) return null;
  return { candidate, weightKg: weightOf(candidate), confidence };
}
export function collectXmlCiiAutoRigidWeightsFromIssues(issues = [], options = {}) {
  const weightsByKey = {}, appliedRows = [], remainingIssues = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const qualified = qualifiedXmlCiiRigidAutoWeightCandidate(issue, options);
    const key = text(issue?.key);
    if (!qualified || !key) { remainingIssues.push(issue); continue; }
    const { candidate, weightKg, confidence } = qualified;
    weightsByKey[key] = weightKg;
    appliedRows.push({
      type: 'rigid-weight-auto-applied', branchName: issue.branchName || '', nodeNumber: issue.nodeNumber || '',
      componentType: issue.componentType || '', componentRefNo: issue.componentRefNo || '', boreMm: issue.boreMm,
      rating: issue.rating, lengthMm: issue.lengthMm, weight: weightKg, confidence,
      method: 'qualified-direct-master-60-to-100-percent',
      candidateType: candidate.type || candidate.valveType || '', candidateTypeDesc: candidate.typeDesc || '',
      weightMethod: candidate.weightMethod || '', lengthDelta: candidate.lengthDelta,
      semanticSource: candidate.semanticSource || '', semanticReason: candidate.semanticReason || '',
      message: `Auto-applied ${weightKg} kg from direct, length-qualified master candidate (${Math.round(confidence * 100)}% confidence).`,
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
