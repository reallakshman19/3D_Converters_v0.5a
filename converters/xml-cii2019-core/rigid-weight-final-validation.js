import { createEmpiricalWeightValidator } from '../empirical-weight/empirical-weight-validation.js';

function text(value) { return value == null ? '' : String(value).trim(); }
function normalizeRef(value) { return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase(); }
function candidateWeight(candidate = {}) {
  const result = Number(candidate.selectedWeight ?? candidate.suggestedWeight ?? candidate.weight);
  return Number.isFinite(result) && result > 0 ? result : null;
}
function target(candidate = {}) {
  const row = candidate.rowData || {};
  const rf = Number(row['RF/RTJ KG'] ?? row.rfRtjKg);
  const bw = Number(row['BW KG'] ?? row.bwKg);
  const mass = candidateWeight(candidate);
  return Number.isFinite(bw) && bw > 0 && (!Number.isFinite(rf) || rf <= 0 || (mass !== null && Math.abs(bw - mass) < 1e-9 && Math.abs(rf - mass) > 1e-9))
    ? 'BW KG' : 'RF/RTJ KG';
}
function matchingIssue(auditRow, issues) {
  return issues.find((row) => text(row.branchName) === text(auditRow.branchName)
    && text(row.nodeNumber) === text(auditRow.toNode)
    && normalizeRef(row.componentRefNo) === normalizeRef(auditRow.componentRefNo)) || null;
}
function validationInput(auditRow, issue) {
  const candidate = issue?.candidates?.find((item) => item.preferred && item.rowData)
    || issue?.candidates?.find((item) => item.rowData) || null;
  const row = candidate?.rowData || {};
  return {
    rowId: `${auditRow.branchName}::${auditRow.fromNode}->${auditRow.toNode}`,
    source: auditRow.weightOrigin,
    componentRefNo: auditRow.componentRefNo,
    nodeNumber: auditRow.toNode,
    typeDesc: text(row.TypeDesc || row.typeDesc || candidate?.typeDesc),
    ns: row.NS ?? row.ns,
    dn: auditRow.boreMm,
    rating: auditRow.rating || issue?.rating,
    target: target(candidate || {}),
    observedWeightKg: auditRow.massKg,
  };
}
/** Always validate the actual post-propagation CII RIGID owner weights. */
export function validateXmlCiiFinalRigidWeightAudit(audit, weightIssues = [], masterRows = [], options = {}) {
  const rows = Array.isArray(audit?.rows) ? audit.rows : [];
  const inputs = rows.map((row) => validationInput(row, matchingIssue(row, weightIssues)));
  const validator = options.validator || createEmpiricalWeightValidator({ masterRows });
  const empiricalReport = validator.buildReport(inputs, {
    abnormalityThresholdPct: 30,
    leaveTargetCellOutOfA2: true,
  });
  const checked = rows.map((row, index) => {
    const empirical = empiricalReport.rows[index] || null;
    const reviewFlags = [...row.reviewFlags];
    if (empirical?.reportableAbnormality) reviewFlags.push('EMPIRICAL_A1_A2_ABNORMAL_GT_30_PERCENT');
    if (empirical?.status === 'UNVALIDATED') reviewFlags.push('EMPIRICAL_VALIDATION_UNAVAILABLE');
    if (empirical?.status === 'WITHIN_THRESHOLD_PARTIAL') reviewFlags.push('EMPIRICAL_VALIDATION_PARTIAL');
    return {
      ...row, reviewFlags, empiricalStatus: empirical?.status || 'UNVALIDATED',
      empiricalA1DeviationPct: empirical?.approach1?.deviationPct ?? null,
      empiricalA2DeviationPct: empirical?.approach2?.deviationPct ?? null,
      status: reviewFlags.length ? 'REVIEW_REQUIRED' : 'AUDITED',
    };
  });
  const flagged = checked.filter((row) => row.reviewFlags.length);
  return {
    ...audit,
    summary: {
      ...audit.summary,
      flaggedEdges: flagged.length,
      empiricalAbnormalEdges: checked.filter((row) => row.reviewFlags.includes('EMPIRICAL_A1_A2_ABNORMAL_GT_30_PERCENT')).length,
      empiricalUnvalidatedEdges: checked.filter((row) => row.reviewFlags.includes('EMPIRICAL_VALIDATION_UNAVAILABLE')).length,
    },
    rows: checked, flagged, empiricalReport,
  };
}
